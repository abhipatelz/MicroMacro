import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';

const hash = (pw: string) => bcrypt.hashSync(pw, 10);
const d = (offset: number) => { const x = new Date(); x.setDate(x.getDate() + offset); return x; };
const fixed = (y: number, m: number, day: number) => new Date(y, m - 1, day);

export async function devSeed() {
  const g = global as any;
  if (!g.__devSeedPromise) g.__devSeedPromise = _devSeed();
  await g.__devSeedPromise;
}

async function _devSeed() {
  const existing = await User.countDocuments();
  if (existing > 0) return;

  console.log('[devSeed] seeding Alembic QI team data…');

  // ── Users ──────────────────────────────────────────────────────────────────
  const people = [
    { email: 'satya@qi.local',       name: 'Satya Rajendran',   role: 'lead',     title: 'DGM – Quality Informatics',   pw: 'satya123' },
    { email: 'bhoomika@qi.local',     name: 'Bhoomika',          role: 'employee', title: 'UI/UX Designer',              pw: 'bhoomika123' },
    { email: 'yash@qi.local',         name: 'Yash Patel',        role: 'employee', title: 'UI/UX Designer',              pw: 'yash123' },
    { email: 'jimil@qi.local',        name: 'Jimil',             role: 'employee', title: 'UI/UX Designer',              pw: 'jimil123' },
    { email: 'dhruva@qi.local',       name: 'Dhruva Chauhan',    role: 'employee', title: 'Developer',                   pw: 'dhruva123' },
    { email: 'ronak@qi.local',        name: 'Ronak Ray',         role: 'employee', title: 'Senior Developer',            pw: 'ronak123' },
    { email: 'nikesh@qi.local',       name: 'Nikesh Modi',       role: 'employee', title: 'Senior Developer',            pw: 'nikesh123' },
    { email: 'rishi@qi.local',        name: 'Rishi Bhatt',       role: 'employee', title: 'Developer',                   pw: 'rishi123' },
    { email: 'subhangini@qi.local',   name: 'Subhangini Shetty', role: 'employee', title: 'QA Specialist',               pw: 'subhangini123' },
  ];

  const users = await Promise.all(
    people.map((p) =>
      User.create({ email: p.email, name: p.name, passwordHash: hash(p.pw), role: p.role as any, title: p.title })
    )
  );
  const U = Object.fromEntries(users.map((u) => [u.email, u]));

  // ── Team ──────────────────────────────────────────────────────────────────
  const team = await Team.create({
    name: 'Quality Informatics',
    description: 'Managing MES, LIMS, TRACKWISE, DOCUMENTUM and IDP Logbook systems at Alembic Pharma.',
    leadId: U['satya@qi.local']._id,
    memberIds: users.map((u) => u._id),
    function: 'general'
  });

  // ── Helper ────────────────────────────────────────────────────────────────
  async function mkProject(opts: {
    code: string; name: string; lifecycle: string;
    start: Date; due: Date; status?: string; priority?: string;
  }) {
    const phaseNames = ['Requirements', 'Design & Development', 'Testing', 'Change Control', 'Val Deployment', 'Qualification', 'PRD Deployment'];
    const phases = phaseNames.map((name, i) => ({ _id: new mongoose.Types.ObjectId(), name, position: i }));
    return Project.create({
      code: opts.code, name: opts.name,
      lifecycle: opts.lifecycle as any,
      priority: (opts.priority || 'high') as any,
      status: (opts.status || 'in_progress') as any,
      teamId: team._id, ownerId: U['satya@qi.local']._id,
      startDate: opts.start, dueDate: opts.due,
      gxpImpact: 'high',
      phases
    });
  }

  // ── Projects from Action Plan ─────────────────────────────────────────────

  // A01: IDP Logbook – Unified Login & Navigation (major ongoing project)
  const p1 = await mkProject({
    code: 'IDP-A01', name: 'IDP Logbook: Unified Login & Navigation',
    lifecycle: 'generic', start: fixed(2026, 4, 10), due: fixed(2026, 6, 30)
  });
  const p1Phases = (p1 as any).phases;
  await Task.insertMany([
    { projectId: p1._id, phaseId: p1Phases[0]._id, title: 'Requirement Finalization',         assigneeId: U['subhangini@qi.local']._id, status: 'done',        completedAt: fixed(2026,4,22), dueDate: fixed(2026,4,22), priority: 'high', taskType: 'task', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p1._id, phaseId: p1Phases[1]._id, title: 'Design & Development',             assigneeId: U['ronak@qi.local']._id,      status: 'in_progress', dueDate: fixed(2026,5,15), priority: 'high', taskType: 'task', gxpCritical: true, requiresQaSignoff: false },
    { projectId: p1._id, phaseId: p1Phases[1]._id, title: 'UI Design – Login & Grouping',    assigneeId: U['bhoomika@qi.local']._id,   status: 'in_progress', dueDate: fixed(2026,5,10), priority: 'high', taskType: 'task', gxpCritical: false, requiresQaSignoff: false },
    { projectId: p1._id, phaseId: p1Phases[2]._id, title: 'Testing (QA + UAT)',               assigneeId: U['rishi@qi.local']._id,      status: 'todo',        dueDate: fixed(2026,5,20), priority: 'high', taskType: 'test', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p1._id, phaseId: p1Phases[3]._id, title: 'Change Control Submission',        assigneeId: U['subhangini@qi.local']._id, status: 'todo',        dueDate: fixed(2026,5,22), priority: 'high', taskType: 'approval', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p1._id, phaseId: p1Phases[4]._id, title: 'Configuration Deployment (Val)',   assigneeId: U['ronak@qi.local']._id,      status: 'todo',        dueDate: fixed(2026,5,22), priority: 'high', taskType: 'task', gxpCritical: true, requiresQaSignoff: false },
    { projectId: p1._id, phaseId: p1Phases[5]._id, title: 'Qualification (IQ/OQ/PQ)',         assigneeId: U['dhruva@qi.local']._id,     status: 'todo',        dueDate: fixed(2026,5,31), priority: 'high', taskType: 'test', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p1._id, phaseId: p1Phases[5]._id, title: 'SOP Revision',                    assigneeId: U['jimil@qi.local']._id,      status: 'todo',        dueDate: fixed(2026,6,25), priority: 'medium', taskType: 'task', gxpCritical: false, requiresQaSignoff: false },
    { projectId: p1._id, phaseId: p1Phases[6]._id, title: 'Configuration Deployment (PRD)',   assigneeId: U['rishi@qi.local']._id,      status: 'todo',        dueDate: fixed(2026,6,28), priority: 'high', taskType: 'task', gxpCritical: true, requiresQaSignoff: false },
  ]);

  // A02: Year Change Numbering Fix (mostly done)
  const p2 = await mkProject({
    code: 'IDP-A02', name: 'Year Change Numbering Fix – eLogbooks',
    lifecycle: 'generic', start: fixed(2026, 4, 10), due: fixed(2026, 5, 4), priority: 'critical'
  });
  const p2Phases = (p2 as any).phases;
  await Task.insertMany([
    { projectId: p2._id, phaseId: p2Phases[0]._id, title: 'List of pending eLogbooks',           assigneeId: U['nikesh@qi.local']._id,  status: 'done', completedAt: fixed(2026,4,16), dueDate: fixed(2026,4,16), priority: 'critical', taskType: 'task', gxpCritical: true },
    { projectId: p2._id, phaseId: p2Phases[1]._id, title: 'Design Updation',                     assigneeId: U['nikesh@qi.local']._id,  status: 'done', completedAt: fixed(2026,4,14), dueDate: fixed(2026,4,30), priority: 'critical', taskType: 'task', gxpCritical: true },
    { projectId: p2._id, phaseId: p2Phases[2]._id, title: 'Testing & UAT',                       assigneeId: U['rishi@qi.local']._id,   status: 'done', completedAt: fixed(2026,4,10), dueDate: fixed(2026,4,10), priority: 'critical', taskType: 'test', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p2._id, phaseId: p2Phases[3]._id, title: 'Change Control',                      assigneeId: U['subhangini@qi.local']._id, status: 'done', completedAt: fixed(2026,4,18), dueDate: fixed(2026,4,18), priority: 'critical', taskType: 'approval', requiresQaSignoff: true, gxpCritical: true },
    { projectId: p2._id, phaseId: p2Phases[4]._id, title: 'Configuration Deployment (Val)',       assigneeId: U['nikesh@qi.local']._id,  status: 'todo', dueDate: fixed(2026,4,30), priority: 'critical', taskType: 'task', gxpCritical: true },
    { projectId: p2._id, phaseId: p2Phases[6]._id, title: 'Configuration Deployment (PRD)',       assigneeId: U['nikesh@qi.local']._id,  status: 'todo', dueDate: fixed(2026,5,2),  priority: 'critical', taskType: 'task', gxpCritical: true },
  ]);

  // A03: Data Loss Fix for all eLogbooks (deviation/capa lifecycle)
  const p3 = await mkProject({
    code: 'IDP-A03', name: 'Data Loss Fix – All eLogbooks (192 nos.)',
    lifecycle: 'deviation_capa', start: fixed(2026, 4, 8), due: fixed(2026, 6, 30), priority: 'critical'
  });
  const p3Phases = (p3 as any).phases;
  await Task.insertMany([
    { projectId: p3._id, phaseId: p3Phases[0]._id, title: 'List & scope all impacted eLogbooks',  assigneeId: U['subhangini@qi.local']._id, status: 'done', completedAt: fixed(2026,4,9), dueDate: fixed(2026,4,9), priority: 'critical', taskType: 'deviation', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p3._id, phaseId: p3Phases[1]._id, title: 'Root Cause Analysis',                  assigneeId: U['ronak@qi.local']._id,      status: 'in_progress', dueDate: d(5), priority: 'critical', taskType: 'review', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p3._id, phaseId: p3Phases[1]._id, title: 'Design Correction',                    assigneeId: U['bhoomika@qi.local']._id,   status: 'todo', dueDate: d(8), priority: 'critical', taskType: 'task', gxpCritical: true },
    { projectId: p3._id, phaseId: p3Phases[2]._id, title: 'Testing & Verification',               assigneeId: U['rishi@qi.local']._id,      status: 'todo', dueDate: d(15), priority: 'critical', taskType: 'test', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p3._id, phaseId: p3Phases[3]._id, title: 'Change Control',                       assigneeId: U['subhangini@qi.local']._id, status: 'done', completedAt: fixed(2026,4,22), dueDate: fixed(2026,4,22), priority: 'critical', taskType: 'capa', gxpCritical: true, requiresQaSignoff: true },
    { projectId: p3._id, phaseId: p3Phases[4]._id, title: 'Val Deployment',                       assigneeId: U['ronak@qi.local']._id,      status: 'todo', dueDate: d(20), priority: 'critical', taskType: 'task', gxpCritical: true },
    { projectId: p3._id, phaseId: p3Phases[6]._id, title: 'PRD Deployment',                       assigneeId: U['nikesh@qi.local']._id,     status: 'todo', dueDate: d(30), priority: 'critical', taskType: 'task', gxpCritical: true },
  ]);

  // A05: Numbering e-Logs – Phase-3 pending
  const p4 = await mkProject({
    code: 'IDP-A05', name: 'Numbering e-Logs: Phase-3 Pending',
    lifecycle: 'sop', start: fixed(2026, 4, 9), due: fixed(2026, 4, 30), priority: 'high'
  });
  const p4Phases = (p4 as any).phases;
  await Task.insertMany([
    { projectId: p4._id, phaseId: p4Phases[1]._id, title: 'Design Correction & UAT Confirmation',  assigneeId: U['bhoomika@qi.local']._id,   status: 'done', completedAt: fixed(2026,4,15), dueDate: fixed(2026,4,15), priority: 'high', taskType: 'task', gxpCritical: false },
    { projectId: p4._id, phaseId: p4Phases[3]._id, title: 'Change Control Approval (OQ/PQ & SOP)', assigneeId: U['subhangini@qi.local']._id, status: 'done', completedAt: fixed(2026,4,18), dueDate: fixed(2026,4,18), priority: 'high', taskType: 'approval', requiresQaSignoff: true },
    { projectId: p4._id, phaseId: p4Phases[0]._id, title: 'Configuration Specification',           assigneeId: U['dhruva@qi.local']._id,     status: 'todo', dueDate: fixed(2026,4,18), priority: 'high', taskType: 'task' },
    { projectId: p4._id, phaseId: p4Phases[4]._id, title: 'Validation Deployment (Val)',           assigneeId: U['yash@qi.local']._id,       status: 'todo', dueDate: fixed(2026,4,20), priority: 'high', taskType: 'task', gxpCritical: true },
    { projectId: p4._id, phaseId: p4Phases[6]._id, title: 'PRD Deployment',                       assigneeId: U['ronak@qi.local']._id,      status: 'todo', dueDate: fixed(2026,4,30), priority: 'high', taskType: 'task', gxpCritical: true },
  ]);

  // Quality Elogbook New – logbook format digitization
  const p5 = await mkProject({
    code: 'ELOG-Q3', name: 'Quality eLogbook Phase-3 New Formats',
    lifecycle: 'validation', start: fixed(2026, 4, 16), due: fixed(2026, 6, 15), priority: 'medium'
  });
  const p5Phases = (p5 as any).phases;
  await Task.insertMany([
    { projectId: p5._id, phaseId: p5Phases[1]._id, title: 'LB Requirement Gathering (BE formats)',    assigneeId: U['bhoomika@qi.local']._id, status: 'in_progress', dueDate: d(10), priority: 'medium', taskType: 'task' },
    { projectId: p5._id, phaseId: p5Phases[1]._id, title: 'UI Design – Quality LB (Redesign)',        assigneeId: U['yash@qi.local']._id,     status: 'todo', dueDate: d(18), priority: 'medium', taskType: 'task' },
    { projectId: p5._id, phaseId: p5Phases[2]._id, title: 'Testing & Documentation',                  assigneeId: U['jimil@qi.local']._id,    status: 'todo', dueDate: d(25), priority: 'medium', taskType: 'test', requiresQaSignoff: true },
    { projectId: p5._id, phaseId: p5Phases[4]._id, title: 'Val Deployment / Package',                 assigneeId: U['rishi@qi.local']._id,    status: 'todo', dueDate: d(35), priority: 'medium', taskType: 'task', gxpCritical: true },
    { projectId: p5._id, phaseId: p5Phases[6]._id, title: 'PRD Deployment & Package',                 assigneeId: U['nikesh@qi.local']._id,   status: 'todo', dueDate: d(45), priority: 'medium', taskType: 'task', gxpCritical: true },
  ]);

  // MES / LIMS ongoing support (VDC Enhancements style)
  const p6 = await mkProject({
    code: 'VDC-001', name: 'VDC Enhancements – SAP Quality LB',
    lifecycle: 'generic', start: fixed(2026, 4, 1), due: fixed(2026, 6, 30), priority: 'medium'
  });
  const p6Phases = (p6 as any).phases;
  await Task.insertMany([
    { projectId: p6._id, phaseId: p6Phases[0]._id, title: 'VDC Enhancement -40 Analysis',          assigneeId: U['ronak@qi.local']._id,  status: 'done', completedAt: d(-10), dueDate: d(-8), priority: 'medium', taskType: 'task' },
    { projectId: p6._id, phaseId: p6Phases[1]._id, title: 'Quality LB Design / Redesign',          assigneeId: U['yash@qi.local']._id,   status: 'in_progress', dueDate: d(7), priority: 'medium', taskType: 'task' },
    { projectId: p6._id, phaseId: p6Phases[2]._id, title: 'Operation Support (Secondary)',          assigneeId: U['bhoomika@qi.local']._id, status: 'todo', dueDate: d(14), priority: 'low', taskType: 'task' },
    { projectId: p6._id, phaseId: p6Phases[2]._id, title: 'Master Data Enhancement WF (Qual LB)', assigneeId: U['jimil@qi.local']._id,   status: 'todo', dueDate: d(21), priority: 'medium', taskType: 'task', gxpCritical: true },
    { projectId: p6._id, phaseId: p6Phases[3]._id, title: 'DEV Server Cloud Migration',            assigneeId: U['nikesh@qi.local']._id, status: 'todo', dueDate: d(30), priority: 'high', taskType: 'task' },
    { projectId: p6._id, phaseId: p6Phases[4]._id, title: 'Fix Verification / Operation Support',  assigneeId: U['rishi@qi.local']._id,  status: 'todo', dueDate: d(35), priority: 'medium', taskType: 'task' },
  ]);

  // ── Add subtasks to A01 Design task ───────────────────────────────────────
  const designTask = await Task.findOne({ projectId: p1._id, title: 'Design & Development' });
  if (designTask) {
    (designTask as any).subtasks.push(
      { title: 'Figma wireframes – login flow',              assigneeId: U['bhoomika@qi.local']._id, status: 'done', dueDate: d(2),  completedAt: d(-2), position: 0 },
      { title: 'Backend API for unified auth',               assigneeId: U['ronak@qi.local']._id,    status: 'in_progress', dueDate: d(5),  position: 1 },
      { title: 'Frontend implementation',                    assigneeId: U['ronak@qi.local']._id,    status: 'todo', dueDate: d(10), position: 2 },
      { title: 'Unit tests',                                 assigneeId: U['rishi@qi.local']._id,    status: 'todo', dueDate: d(12), position: 3 }
    );
    await designTask.save();
  }

  // ── Backfill historic completions for yearly analytics ────────────────────
  const historyFor = async (email: string, months: number[]) => {
    const uid = U[email]._id;
    for (const m of months) {
      const completed = new Date(); completed.setMonth(completed.getMonth() - m);
      const due = new Date(completed); due.setDate(due.getDate() + Math.ceil(1 + Math.random() * 4));
      await Task.create({
        projectId: p1._id,
        title: `Monthly deliverable (${email.split('@')[0]}, ${m}mo ago)`,
        assigneeId: uid, status: 'done',
        priority: 'medium', taskType: 'task',
        gxpCritical: Math.random() < 0.4,
        requiresQaSignoff: Math.random() < 0.3,
        dueDate: due, completedAt: completed
      });
    }
  };
  await historyFor('bhoomika@qi.local',   [1, 2, 3, 4, 6, 8, 10]);
  await historyFor('yash@qi.local',       [1, 3, 5, 7, 9]);
  await historyFor('ronak@qi.local',      [1, 2, 4, 6, 8, 11]);
  await historyFor('nikesh@qi.local',     [2, 3, 5, 7, 10]);
  await historyFor('rishi@qi.local',      [1, 2, 3, 5, 8]);
  await historyFor('dhruva@qi.local',     [1, 4, 6, 9]);
  await historyFor('subhangini@qi.local', [2, 4, 7, 10]);

  console.log('[devSeed] done. Team logins:');
  people.forEach((p) => console.log(`  ${p.email.padEnd(28)} ${p.pw}  (${p.role})`));
}
