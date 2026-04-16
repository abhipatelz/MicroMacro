import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { User } from '../src/models/User';
import { Team } from '../src/models/Team';
import { Project } from '../src/models/Project';
import { Task } from '../src/models/Task';
import { Application } from '../src/models/Application';
import { LIFECYCLES, type LifecycleKey } from '../src/lib/lifecycles';

async function main() {
  await connectDB();
  console.log('[seed] clearing collections...');
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    Application.deleteMany({})
  ]);

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  const mkUser = async (p: {
    email: string;
    name: string;
    role: 'member' | 'manager' | 'admin';
    title: string;
    pw: string;
  }) =>
    User.create({
      email: p.email.toLowerCase(),
      name: p.name,
      passwordHash: hash(p.pw),
      role: p.role,
      title: p.title
    });

  // --- People ---
  // The structure reflects what the QI team at Alembic described to me:
  //  - Satya: DGM, owns everything except LIMS, and is the user who commissioned
  //    this tool to replace his Excel-based tracker
  //  - LIMS DGM: the second DGM who owns LIMS end-to-end
  //  - A handful of members who execute macro & micro tasks across applications
  // Everyone else is modeled as the generic `member` role. Titles capture the
  // *job* (what someone does on a day-to-day basis); `role` captures only the
  // *permission level* (view my stuff / manage everyone's stuff / admin).
  console.log('[seed] creating users...');
  const people = [
    {
      email: 'admin@qinformx.local',
      name: 'Admin',
      role: 'admin' as const,
      title: 'Platform Admin',
      pw: 'admin123'
    },
    {
      email: 'satya@qinformx.local',
      name: 'Satya',
      role: 'manager' as const,
      title: 'DGM · Quality Informatics',
      pw: 'satya123'
    },
    {
      email: 'lims.dgm@qinformx.local',
      name: 'Ravi Krishnan',
      role: 'manager' as const,
      title: 'DGM · LIMS',
      pw: 'ravi123'
    },
    {
      email: 'karan@qinformx.local',
      name: 'Karan Desai',
      role: 'member' as const,
      title: 'QA Analyst',
      pw: 'karan123'
    },
    {
      email: 'neha@qinformx.local',
      name: 'Neha Patel',
      role: 'member' as const,
      title: 'QA Analyst',
      pw: 'neha123'
    },
    {
      email: 'vikram@qinformx.local',
      name: 'Vikram Joshi',
      role: 'member' as const,
      title: 'CSV Engineer',
      pw: 'vikram123'
    },
    {
      email: 'meera@qinformx.local',
      name: 'Meera Kulkarni',
      role: 'member' as const,
      title: 'Validation Specialist',
      pw: 'meera123'
    }
  ];
  const users = await Promise.all(people.map(mkUser));
  const U = Object.fromEntries(users.map((u) => [u.email, u]));

  // --- Applications ---
  // The five business applications the team owns day to day.
  console.log('[seed] creating applications...');
  const appDefs = [
    {
      key: 'LIMS',
      name: 'Laboratory Information Management System',
      vendor: 'LabWare',
      description:
        'Sample management, chromatography data integration, stability studies. GxP critical.',
      owner: 'lims.dgm@qinformx.local',
      members: [
        'lims.dgm@qinformx.local',
        'vikram@qinformx.local',
        'meera@qinformx.local'
      ],
      defaultLifecycle: 'csv' as LifecycleKey,
      gxp: true,
      tags: ['lab', 'gxp']
    },
    {
      key: 'MES',
      name: 'Manufacturing Execution System',
      vendor: 'POMSnet / Rockwell',
      description:
        'Electronic batch records, weighing, dispensing, in-process checks. GxP critical.',
      owner: 'satya@qinformx.local',
      members: [
        'satya@qinformx.local',
        'vikram@qinformx.local',
        'karan@qinformx.local',
        'meera@qinformx.local'
      ],
      defaultLifecycle: 'csv' as LifecycleKey,
      gxp: true,
      tags: ['manufacturing', 'gxp']
    },
    {
      key: 'TRACKWISE',
      name: 'TrackWise Quality Suite',
      vendor: 'Sparta / Honeywell',
      description:
        'Deviation, CAPA, change control, audit workflows. Source-of-truth for QMS events.',
      owner: 'satya@qinformx.local',
      members: [
        'satya@qinformx.local',
        'karan@qinformx.local',
        'neha@qinformx.local'
      ],
      defaultLifecycle: 'deviation_capa' as LifecycleKey,
      gxp: true,
      tags: ['qms']
    },
    {
      key: 'DOCUMENTUM',
      name: 'Documentum D2 (QDMS)',
      vendor: 'OpenText',
      description: 'Controlled document management — SOPs, policies, records.',
      owner: 'satya@qinformx.local',
      members: ['satya@qinformx.local', 'neha@qinformx.local', 'karan@qinformx.local'],
      defaultLifecycle: 'sop' as LifecycleKey,
      gxp: true,
      tags: ['documents']
    },
    {
      key: 'IDPLOGBOOK',
      name: 'IDP Electronic Logbook',
      vendor: 'In-house',
      description:
        'Instrument, cleaning and area electronic logbooks. Replaces paper logbooks across plants.',
      owner: 'satya@qinformx.local',
      members: ['satya@qinformx.local', 'vikram@qinformx.local', 'meera@qinformx.local'],
      defaultLifecycle: 'data_integrity' as LifecycleKey,
      gxp: true,
      tags: ['data-integrity']
    }
  ];
  const apps = await Promise.all(
    appDefs.map((a) =>
      Application.create({
        key: a.key,
        name: a.name,
        vendor: a.vendor,
        description: a.description,
        ownerId: U[a.owner]._id,
        memberIds: a.members.map((m) => U[m]._id),
        defaultLifecycle: a.defaultLifecycle,
        status: 'operational',
        gxp: a.gxp,
        tags: a.tags
      })
    )
  );
  const A = Object.fromEntries(apps.map((x) => [x.key, x]));

  // --- Teams ---
  // Two teams mirror the DGM split: the LIMS team sits under the LIMS DGM,
  // everything else under Satya.
  console.log('[seed] creating teams...');
  const teamDefs = [
    {
      name: 'LIMS Team',
      description: 'LIMS delivery, qualification and day-to-day support.',
      lead: 'lims.dgm@qinformx.local',
      members: [
        'lims.dgm@qinformx.local',
        'vikram@qinformx.local',
        'meera@qinformx.local'
      ],
      function: 'csv_validation'
    },
    {
      name: 'QI Core (Satya)',
      description: 'MES, TrackWise, Documentum and IDP Logbook delivery.',
      lead: 'satya@qinformx.local',
      members: [
        'satya@qinformx.local',
        'karan@qinformx.local',
        'neha@qinformx.local',
        'vikram@qinformx.local',
        'meera@qinformx.local'
      ],
      function: 'general'
    }
  ];
  const teams = await Promise.all(
    teamDefs.map((t) =>
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

  async function createProject(opts: {
    name: string;
    code: string;
    lifecycle: LifecycleKey;
    applicationKey: string;
    teamName: string;
    ownerEmail: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    gxpImpact?: 'none' | 'low' | 'medium' | 'high';
    start: number;
    due: number;
    members: string[];
    status?: 'planning' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
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
      applicationId: A[opts.applicationKey]._id,
      teamId: team._id,
      ownerId: owner._id,
      startDate: iso(opts.start),
      dueDate: iso(opts.due),
      gxpImpact: opts.gxpImpact || 'high',
      regulatoryRefs: lc.regulatoryRefs,
      status: opts.status || 'in_progress',
      phases
    });
    const memberIds = opts.members.map((e) => U[e]._id);
    const tasks: any[] = [];
    lc.phases.forEach((ph, i) => {
      ph.tasks.forEach((t, j) => {
        const assigneeId = memberIds[(i + j) % memberIds.length];
        const startDate = iso(
          opts.start + Math.floor((opts.due - opts.start) * (i / lc.phases.length))
        );
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

  console.log('[seed] creating projects across applications...');
  // LIMS -- under LIMS DGM
  await createProject({
    name: 'LIMS 7.3 Upgrade Validation',
    code: 'CSV-2026-001',
    lifecycle: 'csv',
    applicationKey: 'LIMS',
    teamName: 'LIMS Team',
    ownerEmail: 'lims.dgm@qinformx.local',
    start: -40,
    due: 30,
    members: ['lims.dgm@qinformx.local', 'vikram@qinformx.local', 'meera@qinformx.local']
  });
  await createProject({
    name: 'Chromatography Data Integrity Assessment',
    code: 'DI-2026-004',
    lifecycle: 'data_integrity',
    applicationKey: 'LIMS',
    teamName: 'LIMS Team',
    ownerEmail: 'lims.dgm@qinformx.local',
    start: -25,
    due: 40,
    priority: 'high',
    members: ['lims.dgm@qinformx.local', 'vikram@qinformx.local', 'meera@qinformx.local']
  });

  // MES -- under Satya
  await createProject({
    name: 'MES EBR Rollout — Oncology Block',
    code: 'CSV-2026-008',
    lifecycle: 'csv',
    applicationKey: 'MES',
    teamName: 'QI Core (Satya)',
    ownerEmail: 'satya@qinformx.local',
    start: -30,
    due: 45,
    members: [
      'satya@qinformx.local',
      'vikram@qinformx.local',
      'karan@qinformx.local',
      'meera@qinformx.local'
    ]
  });

  // TrackWise -- under Satya
  await createProject({
    name: 'Shared-Login Deviation on CDS',
    code: 'DEV-2026-007',
    lifecycle: 'deviation_capa',
    applicationKey: 'TRACKWISE',
    teamName: 'QI Core (Satya)',
    ownerEmail: 'satya@qinformx.local',
    start: -10,
    due: 18,
    priority: 'critical',
    members: ['satya@qinformx.local', 'karan@qinformx.local', 'neha@qinformx.local']
  });
  await createProject({
    name: 'USFDA Mock Inspection 2026',
    code: 'AUD-2026-002',
    lifecycle: 'audit',
    applicationKey: 'TRACKWISE',
    teamName: 'QI Core (Satya)',
    ownerEmail: 'satya@qinformx.local',
    start: -15,
    due: 25,
    priority: 'critical',
    members: ['satya@qinformx.local', 'karan@qinformx.local', 'neha@qinformx.local']
  });

  // Documentum -- under Satya
  await createProject({
    name: 'SOP Revision Wave Q2',
    code: 'SOP-2026-014',
    lifecycle: 'sop',
    applicationKey: 'DOCUMENTUM',
    teamName: 'QI Core (Satya)',
    ownerEmail: 'satya@qinformx.local',
    start: -20,
    due: 20,
    priority: 'medium',
    members: ['satya@qinformx.local', 'neha@qinformx.local', 'karan@qinformx.local']
  });

  // IDP Logbook -- under Satya
  await createProject({
    name: 'IDP Logbook Annual Data Integrity Review',
    code: 'DI-2026-011',
    lifecycle: 'data_integrity',
    applicationKey: 'IDPLOGBOOK',
    teamName: 'QI Core (Satya)',
    ownerEmail: 'satya@qinformx.local',
    start: -8,
    due: 35,
    members: ['satya@qinformx.local', 'vikram@qinformx.local', 'meera@qinformx.local']
  });

  console.log('[seed] marking some tasks done with early/late completions...');
  const allProjects = await Project.find({}).lean();
  for (const p of allProjects) {
    const pTasks = await Task.find({ projectId: p._id }).sort({ phaseId: 1, createdAt: 1 });
    const n = Math.floor(pTasks.length * 0.4);
    for (let i = 0; i < n; i++) {
      const t = pTasks[i];
      let completedAt = new Date();
      if (t.dueDate && Math.random() < 0.6) {
        const d = new Date(t.dueDate);
        d.setDate(d.getDate() - Math.floor(1 + Math.random() * 6));
        completedAt = d;
      } else if (Math.random() < 0.25 && t.dueDate) {
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
      pTasks[n].status = 'in_progress';
      await pTasks[n].save();
    }
    // throw one task into blocked state to exercise the bottleneck view
    if (pTasks[n + 1]) {
      pTasks[n + 1].status = 'blocked';
      await pTasks[n + 1].save();
    }
  }

  console.log('[seed] enriching deviation task descriptions for AI triage corpus...');
  const devProj = await Project.findOne({ code: 'DEV-2026-007' });
  if (devProj) {
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
            'Determine if released batches are impacted and whether a recall should be considered. Review raw data integrity and audit trail gaps.'
        }
      }
    );
    const devTasks = await Task.find({ projectId: devProj._id });
    for (const dt of devTasks.slice(0, 3)) {
      (dt as any).subtasks.push({
        title: 'Collect audit trail evidence from LIMS',
        status: 'done',
        dueDate: iso(2),
        completedAt: iso(-1),
        assigneeId: U['karan@qinformx.local']._id,
        position: 0
      });
      (dt as any).subtasks.push({
        title: 'Interview impacted analysts',
        status: 'todo',
        dueDate: iso(4),
        assigneeId: U['neha@qinformx.local']._id,
        position: 1
      });
      await dt.save();
    }
  }

  console.log('[seed] backfilling historic completions for Yearly View...');
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
  await historyFor('karan@qinformx.local', [1, 2, 3, 5, 7, 9, 10]);
  await historyFor('neha@qinformx.local', [2, 4, 6, 8, 11]);
  await historyFor('vikram@qinformx.local', [1, 3, 4, 6, 9]);
  await historyFor('meera@qinformx.local', [2, 3, 5, 7, 10]);
  await historyFor('satya@qinformx.local', [2, 4, 8]);
  await historyFor('lims.dgm@qinformx.local', [3, 6]);

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
