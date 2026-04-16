import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { db, migrate } from './db.js';
import { LIFECYCLES } from './lifecycles.js';

migrate();

const run = (sql, ...p) => db.prepare(sql).run(...p);
const row = (sql, ...p) => db.prepare(sql).get(...p);

console.log('[seed] clearing data...');
db.exec(`
  DELETE FROM comments;
  DELETE FROM activity_log;
  DELETE FROM subtasks;
  DELETE FROM tasks;
  DELETE FROM phases;
  DELETE FROM projects;
  DELETE FROM team_members;
  DELETE FROM teams;
  DELETE FROM users;
  DELETE FROM sqlite_sequence;
`);

const hash = (pw) => bcrypt.hashSync(pw, 10);

console.log('[seed] creating users...');
const people = [
  { email: 'admin@alembic.local', name: 'Admin', role: 'admin', title: 'Admin', pw: 'admin123' },
  { email: 'priya@alembic.local', name: 'Priya Shah', role: 'manager', title: 'QA Head', pw: 'priya123' },
  { email: 'rahul@alembic.local', name: 'Rahul Mehta', role: 'lead', title: 'QA Lead - CSV', pw: 'rahul123' },
  { email: 'ananya@alembic.local', name: 'Ananya Iyer', role: 'lead', title: 'QA Lead - SOPs', pw: 'ananya123' },
  { email: 'karan@alembic.local', name: 'Karan Desai', role: 'employee', title: 'QA Analyst', pw: 'karan123' },
  { email: 'neha@alembic.local', name: 'Neha Patel', role: 'employee', title: 'QA Analyst', pw: 'neha123' },
  { email: 'vikram@alembic.local', name: 'Vikram Joshi', role: 'employee', title: 'CSV Engineer', pw: 'vikram123' },
  { email: 'meera@alembic.local', name: 'Meera Kulkarni', role: 'employee', title: 'Validation Specialist', pw: 'meera123' },
  { email: 'arjun@alembic.local', name: 'Arjun Reddy', role: 'employee', title: 'QA Reviewer', pw: 'arjun123' }
];
const userIds = {};
for (const p of people) {
  const r = run(
    'INSERT INTO users (email, name, password_hash, role, title) VALUES (?, ?, ?, ?, ?)',
    p.email,
    p.name,
    hash(p.pw),
    p.role,
    p.title
  );
  userIds[p.email] = r.lastInsertRowid;
}

console.log('[seed] creating teams...');
const teams = [
  {
    name: 'CSV & Validation',
    description: 'Computer system validation, IQ/OQ/PQ, GAMP 5 aligned.',
    lead: 'rahul@alembic.local',
    members: ['rahul@alembic.local', 'vikram@alembic.local', 'meera@alembic.local', 'karan@alembic.local']
  },
  {
    name: 'SOP & Documentation',
    description: 'Authoring, review, approval and periodic review of SOPs.',
    lead: 'ananya@alembic.local',
    members: ['ananya@alembic.local', 'neha@alembic.local', 'arjun@alembic.local']
  },
  {
    name: 'Deviations & CAPA',
    description: 'Deviation management and CAPA closure.',
    lead: 'priya@alembic.local',
    members: ['priya@alembic.local', 'karan@alembic.local', 'arjun@alembic.local', 'neha@alembic.local']
  }
];
const teamIds = {};
for (const t of teams) {
  const tr = run(
    'INSERT INTO teams (name, description, lead_id) VALUES (?, ?, ?)',
    t.name,
    t.description,
    userIds[t.lead]
  );
  teamIds[t.name] = tr.lastInsertRowid;
  for (const m of t.members) {
    run(
      'INSERT OR IGNORE INTO team_members (team_id, user_id, role_in_team) VALUES (?, ?, ?)',
      tr.lastInsertRowid,
      userIds[m],
      m === t.lead ? 'lead' : 'member'
    );
  }
}

console.log('[seed] creating projects from lifecycle templates...');
function createProjectFromTemplate({
  name,
  code,
  lifecycleKey,
  teamId,
  ownerEmail,
  priority = 'high',
  gxp_impact = 'high',
  start_date,
  due_date,
  status = 'in_progress'
}) {
  const lc = LIFECYCLES[lifecycleKey];
  const pr = run(
    `INSERT INTO projects (code, name, description, lifecycle, priority, team_id, owner_id,
       start_date, due_date, gxp_impact, regulatory_refs, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    code,
    name,
    lc.description,
    lifecycleKey,
    priority,
    teamId,
    userIds[ownerEmail],
    start_date,
    due_date,
    gxp_impact,
    lc.regulatory_refs || null,
    status
  );
  const projectId = pr.lastInsertRowid;
  let position = 0;
  for (const phase of lc.phases) {
    const phr = run(
      'INSERT INTO phases (project_id, name, position) VALUES (?, ?, ?)',
      projectId,
      phase.name,
      position++
    );
    for (const t of phase.tasks) {
      run(
        `INSERT INTO tasks (project_id, phase_id, title, task_type, gxp_critical, requires_qa_signoff, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        projectId,
        phr.lastInsertRowid,
        t.title,
        t.type,
        t.gxp ? 1 : 0,
        t.qa ? 1 : 0,
        priority
      );
    }
  }
  return projectId;
}

const today = new Date();
function iso(daysOffset) {
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}

const projA = createProjectFromTemplate({
  name: 'LIMS Upgrade Validation',
  code: 'CSV-2026-001',
  lifecycleKey: 'csv',
  teamId: teamIds['CSV & Validation'],
  ownerEmail: 'rahul@alembic.local',
  start_date: iso(-40),
  due_date: iso(30)
});

const projB = createProjectFromTemplate({
  name: 'Cleaning Validation SOP Revamp',
  code: 'SOP-2026-014',
  lifecycleKey: 'sop',
  teamId: teamIds['SOP & Documentation'],
  ownerEmail: 'ananya@alembic.local',
  start_date: iso(-20),
  due_date: iso(20),
  priority: 'medium',
  gxp_impact: 'medium'
});

const projC = createProjectFromTemplate({
  name: 'OOS Tablet Hardness - Batch #AL-2213',
  code: 'DEV-2026-007',
  lifecycleKey: 'deviation_capa',
  teamId: teamIds['Deviations & CAPA'],
  ownerEmail: 'priya@alembic.local',
  start_date: iso(-10),
  due_date: iso(18),
  priority: 'critical'
});

const projD = createProjectFromTemplate({
  name: 'HVAC Requalification Change Control',
  code: 'CC-2026-003',
  lifecycleKey: 'change_control',
  teamId: teamIds['CSV & Validation'],
  ownerEmail: 'rahul@alembic.local',
  start_date: iso(-5),
  due_date: iso(45)
});

const projE = createProjectFromTemplate({
  name: 'USFDA Mock Inspection 2026',
  code: 'AUD-2026-002',
  lifecycleKey: 'audit',
  teamId: teamIds['Deviations & CAPA'],
  ownerEmail: 'priya@alembic.local',
  start_date: iso(-15),
  due_date: iso(25)
});

console.log('[seed] assigning tasks, setting statuses and completion timestamps...');

// Helper: distribute tasks across team members
function assignTasksEvenly(projectId, memberEmails) {
  const taskIds = db
    .prepare('SELECT id FROM tasks WHERE project_id = ? ORDER BY id')
    .all(projectId)
    .map((r) => r.id);
  taskIds.forEach((tid, idx) => {
    const email = memberEmails[idx % memberEmails.length];
    run('UPDATE tasks SET assignee_id = ? WHERE id = ?', userIds[email], tid);
  });
  return taskIds;
}

const membersA = ['rahul@alembic.local', 'vikram@alembic.local', 'meera@alembic.local', 'karan@alembic.local'];
const membersB = ['ananya@alembic.local', 'neha@alembic.local', 'arjun@alembic.local'];
const membersC = ['priya@alembic.local', 'karan@alembic.local', 'arjun@alembic.local', 'neha@alembic.local'];

const tasksA = assignTasksEvenly(projA, membersA);
const tasksB = assignTasksEvenly(projB, membersB);
const tasksC = assignTasksEvenly(projC, membersC);
const tasksD = assignTasksEvenly(projD, membersA);
const tasksE = assignTasksEvenly(projE, membersC);

// Set due dates across projects and mark some tasks done / in_progress
function spreadDueDates(taskIds, startOffset, span) {
  taskIds.forEach((tid, i) => {
    const off = startOffset + Math.round((span * i) / Math.max(1, taskIds.length - 1));
    run('UPDATE tasks SET due_date = ?, start_date = ? WHERE id = ?', iso(off), iso(off - 7), tid);
  });
}
spreadDueDates(tasksA, -25, 55);
spreadDueDates(tasksB, -15, 35);
spreadDueDates(tasksC, -8, 26);
spreadDueDates(tasksD, -2, 47);
spreadDueDates(tasksE, -12, 37);

// Mark roughly first ~40% of tasks done, some early
function markSomeDone(taskIds, pctDone = 0.4, earlyChance = 0.5) {
  const n = Math.floor(taskIds.length * pctDone);
  for (let i = 0; i < n; i++) {
    const tid = taskIds[i];
    const t = row('SELECT * FROM tasks WHERE id = ?', tid);
    let completedOn;
    if (t.due_date && Math.random() < earlyChance) {
      const d = new Date(t.due_date);
      d.setDate(d.getDate() - Math.floor(1 + Math.random() * 6));
      completedOn = d.toISOString();
    } else {
      completedOn = new Date().toISOString();
    }
    run(
      `UPDATE tasks SET status = 'done', completed_at = ?, actual_hours = ? WHERE id = ?`,
      completedOn,
      Math.round(2 + Math.random() * 20),
      tid
    );
  }
  // mark the next one as in_progress
  if (taskIds[n]) run(`UPDATE tasks SET status = 'in_progress' WHERE id = ?`, taskIds[n]);
}

markSomeDone(tasksA, 0.45);
markSomeDone(tasksB, 0.55);
markSomeDone(tasksC, 0.3);
markSomeDone(tasksD, 0.15);
markSomeDone(tasksE, 0.4);

// Add some subtasks
console.log('[seed] adding subtasks...');
const someTaskIds = [...tasksA.slice(0, 5), ...tasksC.slice(0, 3), ...tasksE.slice(0, 3)];
for (const tid of someTaskIds) {
  const t = row('SELECT * FROM tasks WHERE id = ?', tid);
  const parentDue = t.due_date || iso(10);
  const names = [
    'Gather source documents',
    'Draft section',
    'Peer review',
    'Address review comments',
    'Final proofread'
  ];
  names.forEach((name, i) => {
    const d = new Date(parentDue);
    d.setDate(d.getDate() - (names.length - i));
    const r = run(
      'INSERT INTO subtasks (task_id, title, assignee_id, due_date, position) VALUES (?, ?, ?, ?, ?)',
      tid,
      name,
      t.assignee_id,
      d.toISOString().slice(0, 10),
      i
    );
    if (i < 2 && t.assignee_id) {
      const completedOn = new Date(d);
      completedOn.setDate(completedOn.getDate() - Math.floor(1 + Math.random() * 3));
      run(
        `UPDATE subtasks SET status = 'done', completed_at = ? WHERE id = ?`,
        completedOn.toISOString(),
        r.lastInsertRowid
      );
    }
  });
}

// Add some historic completions earlier in the year for the yearly view
console.log('[seed] backfilling historic completions for yearly view...');
const year = new Date().getFullYear();
function backfillForUser(email, monthsAgoList) {
  const uid = userIds[email];
  for (const m of monthsAgoList) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const due = new Date(d);
    due.setDate(due.getDate() + Math.floor(1 + Math.random() * 5));
    const r = run(
      `INSERT INTO tasks (project_id, title, assignee_id, status, priority, task_type,
         gxp_critical, requires_qa_signoff, due_date, completed_at)
       VALUES (?, ?, ?, 'done', 'medium', 'task', ?, ?, ?, ?)`,
      projA,
      `Historic activity ${m}mo ago (${email.split('@')[0]})`,
      uid,
      Math.random() < 0.4 ? 1 : 0,
      Math.random() < 0.3 ? 1 : 0,
      due.toISOString().slice(0, 10),
      d.toISOString()
    );
  }
}
backfillForUser('karan@alembic.local', [1, 2, 3, 5, 7, 9, 10]);
backfillForUser('neha@alembic.local', [2, 4, 6, 8, 11]);
backfillForUser('vikram@alembic.local', [1, 3, 4, 6, 9]);
backfillForUser('meera@alembic.local', [2, 3, 5, 7, 10]);
backfillForUser('arjun@alembic.local', [1, 2, 4, 5, 8]);

console.log('[seed] done. Login with:');
for (const p of people) console.log(`  ${p.email}  /  ${p.pw}`);
