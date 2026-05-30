import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { User } from '../src/models/User';
import { Team } from '../src/models/Team';
import { Project } from '../src/models/Project';
import { Task } from '../src/models/Task';
import { LIFECYCLES, type LifecycleKey } from '../src/lib/lifecycles';

async function main() {
  await connectDB();
  console.log('[seed] clearing collections...');
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({})
  ]);

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const mkUser = async (p: {
    email: string;
    name: string;
    role: string;
    title: string;
    pw: string;
  }) =>
    User.create({
      email: p.email.toLowerCase(),
      name: p.name,
      passwordHash: hash(p.pw),
      role: (p.role === 'employee' ? 'contributor' : p.role) as any,
      title: p.title
    });

  console.log('[seed] creating users...');
  const people = [
    { email: 'admin@pragati.local', name: 'Admin', role: 'lead', title: 'Workspace admin', pw: 'admin123' },
    { email: 'priya@pragati.local', name: 'Priya Shah', role: 'lead', title: 'Head of Quality Informatics', pw: 'priya123' },
    { email: 'rahul@pragati.local', name: 'Rahul Mehta', role: 'lead', title: 'CSV Lead', pw: 'rahul123' },
    { email: 'ananya@pragati.local', name: 'Ananya Iyer', role: 'lead', title: 'Data Integrity Lead', pw: 'ananya123' },
    { email: 'dhruv@pragati.local', name: 'Dhruv Kapoor', role: 'lead', title: 'Pharmacovigilance Lead', pw: 'dhruv123' },
    { email: 'karan@pragati.local', name: 'Karan Desai', role: 'contributor', title: 'QA Analyst', pw: 'karan123' },
    { email: 'neha@pragati.local', name: 'Neha Patel', role: 'contributor', title: 'QA Analyst', pw: 'neha123' },
    { email: 'vikram@pragati.local', name: 'Vikram Joshi', role: 'contributor', title: 'CSV Engineer', pw: 'vikram123' },
    { email: 'meera@pragati.local', name: 'Meera Kulkarni', role: 'contributor', title: 'Validation Specialist', pw: 'meera123' },
    { email: 'arjun@pragati.local', name: 'Arjun Reddy', role: 'contributor', title: 'PV Case Processor', pw: 'arjun123' }
  ];
  const users = await Promise.all(people.map(mkUser));
  const U = Object.fromEntries(users.map((u) => [u.email, u]));

  console.log('[seed] creating teams...');
  const teamDefs = [
    {
      name: 'Computerized System Validation',
      description: 'CSV / GAMP 5 lifecycle for GxP computerized systems.',
      lead: 'rahul@pragati.local',
      members: ['rahul@pragati.local', 'vikram@pragati.local', 'meera@pragati.local', 'karan@pragati.local'],
      function: 'csv_validation'
    },
    {
      name: 'Data Integrity & Audit',
      description: 'ALCOA+ assessments, audit trail reviews, inspection readiness.',
      lead: 'ananya@pragati.local',
      members: ['ananya@pragati.local', 'neha@pragati.local', 'arjun@pragati.local', 'karan@pragati.local'],
      function: 'data_integrity'
    },
    {
      name: 'Pharmacovigilance Informatics',
      description: 'ICSR intake, E2B submissions, safety system operations.',
      lead: 'dhruv@pragati.local',
      members: ['dhruv@pragati.local', 'arjun@pragati.local', 'neha@pragati.local'],
      function: 'pharmacovigilance'
    }
  ];
  const teams = await Promise.all(
    teamDefs.map(async (t) =>
      Team.create({
        name: t.name,
        description: t.description,
        leadId: U[t.lead]._id,
        memberIds: t.members.map((m) => U[m]._id),
        function: t.function
      })
    )
  );
  const T = Object.fromEntries(teams.map((x) => [x.name, x]));

  const iso = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  };

  async function createProjectFromTemplate(opts: {
    name: string;
    code: string;
    lifecycle: LifecycleKey;
    teamName: string;
    ownerEmail: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    gxpImpact?: 'none' | 'low' | 'medium' | 'high';
    start: number;
    due: number;
  }) {
    const lc = LIFECYCLES[opts.lifecycle];
    const team = T[opts.teamName];
    const owner = U[opts.ownerEmail];
    const phases = lc.phases.map((ph, i) => ({
      _id: new mongoose.Types.ObjectId(),
      name: ph.name,
      position: i
    }));
    const project = await Project.create({
      code: opts.code,
      name: opts.name,
      description: lc.description,
      lifecycle: opts.lifecycle,
      priority: opts.priority || 'high',
      teamId: team._id,
      ownerId: owner._id,
      startDate: iso(opts.start),
      dueDate: iso(opts.due),
      gxpImpact: opts.gxpImpact || 'high',
      regulatoryRefs: lc.regulatoryRefs,
      status: 'in_progress',
      phases
    });
    const memberIds = (team as any).memberIds;
    const tasks: any[] = [];
    lc.phases.forEach((ph, i) => {
      ph.tasks.forEach((t, j) => {
        const assigneeId = memberIds[(i + j) % memberIds.length];
        const startDate = iso(opts.start + Math.floor((opts.due - opts.start) * (i / lc.phases.length)));
        const dueDate = iso(
          opts.start +
            Math.floor((opts.due - opts.start) * ((i + 1) / lc.phases.length))
        );
        tasks.push({
          projectId: project._id,
          phaseId: phases[i]._id,
          title: t.title,
          taskType: t.type,
          gxpCritical: !!t.gxp,
          requiresQaSignoff: !!t.qa,
          priority: opts.priority || 'high',
          assigneeId,
          startDate,
          dueDate
        });
      });
    });
    await Task.insertMany(tasks);
    return project;
  }

  console.log('[seed] creating projects from lifecycle templates...');
  await createProjectFromTemplate({
    name: 'LIMS Upgrade Validation',
    code: 'CSV-2026-001',
    lifecycle: 'csv',
    teamName: 'Computerized System Validation',
    ownerEmail: 'rahul@pragati.local',
    start: -40,
    due: 30
  });
  await createProjectFromTemplate({
    name: 'Chromatography Data System - Data Integrity Assessment',
    code: 'DI-2026-004',
    lifecycle: 'data_integrity',
    teamName: 'Data Integrity & Audit',
    ownerEmail: 'ananya@pragati.local',
    start: -25,
    due: 40
  });
  await createProjectFromTemplate({
    name: 'USFDA Mock Inspection 2026',
    code: 'AUD-2026-002',
    lifecycle: 'audit',
    teamName: 'Data Integrity & Audit',
    ownerEmail: 'ananya@pragati.local',
    start: -15,
    due: 25,
    priority: 'critical'
  });
  await createProjectFromTemplate({
    name: 'Shared-login Deviation #DEV-AL-2213',
    code: 'DEV-2026-007',
    lifecycle: 'deviation_capa',
    teamName: 'Data Integrity & Audit',
    ownerEmail: 'ananya@pragati.local',
    start: -10,
    due: 18,
    priority: 'critical'
  });
  await createProjectFromTemplate({
    name: 'HVAC Requalification Change Control',
    code: 'CC-2026-003',
    lifecycle: 'change_control',
    teamName: 'Computerized System Validation',
    ownerEmail: 'rahul@pragati.local',
    start: -5,
    due: 45
  });
  await createProjectFromTemplate({
    name: 'ICSR Intake Automation - Safety System',
    code: 'PV-2026-001',
    lifecycle: 'pharmacovigilance',
    teamName: 'Pharmacovigilance Informatics',
    ownerEmail: 'dhruv@pragati.local',
    start: -12,
    due: 32
  });

  console.log('[seed] marking some tasks done (including early completions)...');
  const allProjects = await Project.find({}).lean();
  for (const p of allProjects) {
    const pTasks = await Task.find({ projectId: p._id }).sort({ 'phaseId': 1, createdAt: 1 });
    const n = Math.floor(pTasks.length * 0.4);
    for (let i = 0; i < n; i++) {
      const t = pTasks[i];
      let completedAt = new Date();
      if (t.dueDate && Math.random() < 0.6) {
        // early completion
        const d = new Date(t.dueDate);
        d.setDate(d.getDate() - Math.floor(1 + Math.random() * 6));
        completedAt = d;
      } else if (Math.random() < 0.25 && t.dueDate) {
        // late completion for realistic training signal
        const d = new Date(t.dueDate);
        d.setDate(d.getDate() + Math.floor(1 + Math.random() * 4));
        completedAt = d;
      }
      t.status = 'done';
      t.completedAt = completedAt;
      t.actualHours = Math.round(2 + Math.random() * 20);
      await t.save();
    }
    if (pTasks[n]) {
      const ip = pTasks[n];
      ip.status = 'in_progress';
      await ip.save();
    }
  }

  console.log('[seed] adding subtasks to the deviation project for AI triage similarity...');
  const devProj = await Project.findOne({ code: 'DEV-2026-007' });
  if (devProj) {
    const devTasks = await Task.find({ projectId: devProj._id });
    for (const dt of devTasks.slice(0, 3)) {
      (dt as any).subtasks.push({
        title: 'Collect audit trail evidence from LIMS',
        status: 'done',
        dueDate: iso(2),
        completedAt: iso(-1),
        assigneeId: U['karan@pragati.local']._id,
        position: 0
      });
      (dt as any).subtasks.push({
        title: 'Interview impacted analysts',
        status: 'todo',
        dueDate: iso(4),
        assigneeId: U['neha@pragati.local']._id,
        position: 1
      });
      await dt.save();
    }
    // Add descriptive text to deviation tasks so the AI triage corpus is rich
    await Task.updateOne(
      { projectId: devProj._id, title: /Log deviation/i },
      {
        $set: {
          description:
            'Shared login used on chromatography data system during batch release. Audit trail review shows 3 batches impacted. Possible ALCOA+ violation; potential FDA exposure during next inspection.'
        }
      }
    );
    await Task.updateOne(
      { projectId: devProj._id, title: /Impact assessment/i },
      {
        $set: {
          description:
            'Need to determine if any released batches are impacted and whether a recall should be considered. Review raw data integrity and audit trail gaps.'
        }
      }
    );
  }

  console.log('[seed] backfilling historic completions for yearly view...');
  const anyProject = allProjects[0];
  const historyFor = async (email: string, monthsAgoList: number[]) => {
    const uid = U[email]._id;
    for (const m of monthsAgoList) {
      const d = new Date();
      d.setMonth(d.getMonth() - m);
      const due = new Date(d);
      due.setDate(due.getDate() + Math.floor(1 + Math.random() * 5));
      await Task.create({
        projectId: anyProject._id,
        title: `Historic deliverable ${m}mo ago (${email.split('@')[0]})`,
        assigneeId: uid,
        status: 'done',
        priority: 'medium',
        taskType: 'task',
        gxpCritical: Math.random() < 0.4,
        requiresQaSignoff: Math.random() < 0.3,
        dueDate: due,
        completedAt: d
      });
    }
  };
  await historyFor('karan@pragati.local', [1, 2, 3, 5, 7, 9, 10]);
  await historyFor('neha@pragati.local', [2, 4, 6, 8, 11]);
  await historyFor('vikram@pragati.local', [1, 3, 4, 6, 9]);
  await historyFor('meera@pragati.local', [2, 3, 5, 7, 10]);
  await historyFor('arjun@pragati.local', [1, 2, 4, 5, 8]);

  console.log('[seed] done. Login with:');
  for (const p of people) console.log(`  ${p.email}  /  ${p.pw}`);
  await mongoose.disconnect();
  const g = global as any;
  if (g.__mongoMemoryServer) await g.__mongoMemoryServer.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
