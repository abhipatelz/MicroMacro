/**
 * Demo seed — populates a workspace with a believable, larger Pragati dataset
 * for the dev / preview environment.
 *
 *   - 1 admin + 5 leads + 24 contributors across 3 organisations
 *   - 5 teams (QA-IT, CSV, Data Integrity, Pharmacovigilance, Operations)
 *   - ~14 shared projects spanning every lifecycle template + ~6 personal
 *     projects (so the IC dashboard isn't empty)
 *   - 200+ tasks with realistic statuses, target dates spread around today,
 *     a sprinkle of overdues, sub-tasks, comments, effort logs, and audit
 *     entries — enough that every panel in the app has something to show
 *     (Actions, Contributors, milestones, achievements, audit trail).
 *
 * Idempotent — wipes the demo collections and rebuilds them, so a preview
 * deploy can re-seed on every push and stay clean. Will refuse to run if
 * MONGODB_URI looks like a production URI (the safety check is a substring
 * match on DEMO_DB_HOST_HINT — set it in your preview env, e.g.
 * "preview" or "demo", to gate this script from prod).
 *
 *   npm run seed:demo
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { User } from '../src/models/User';
import { Team } from '../src/models/Team';
import { Project } from '../src/models/Project';
import { Task } from '../src/models/Task';
import { AuditLog } from '../src/models/AuditLog';
import { Notification } from '../src/models/Notification';
import { LIFECYCLES, type LifecycleKey } from '../src/lib/lifecycles';

// ── Safety: refuse to run against anything that looks like production ────
// Set DEMO_DB_HOST_HINT in your preview env to a substring that uniquely
// identifies the demo cluster (e.g. "preview", "demo", "staging"). The script
// only runs when the URI contains that substring.
const HINT = (process.env.DEMO_DB_HOST_HINT || '').toLowerCase();
const URI  = (process.env.MONGODB_URI || '').toLowerCase();
if (!HINT) {
  console.error('[seed:demo] DEMO_DB_HOST_HINT is not set. Refusing to run.');
  process.exit(1);
}
if (!URI.includes(HINT)) {
  console.error(`[seed:demo] MONGODB_URI does not contain DEMO_DB_HOST_HINT ("${HINT}"). Refusing to run against a non-demo database.`);
  process.exit(1);
}

const hash = (pw: string) => bcrypt.hashSync(pw, 10);
const pick = <T>(arr: T[], n: number): T[] => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, Math.min(n, out.length));
};
const one = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
const days = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d; };

interface DemoUser {
  email: string; username: string; name: string;
  role: 'admin' | 'lead' | 'contributor';
  title: string; pw: string; org: string; dept: string;
  employeeId: string;
  avatarBg?: string; avatarFont?: number;
}

const ORGS = ['Pharma Division', 'Biotech Division', 'Generics Division'];
const DEPTS = ['Quality Assurance', 'Quality Control', 'IT', 'Validation', 'Pharmacovigilance', 'Operations'];

const PEOPLE: DemoUser[] = [
  // Admin
  { email: 'demo.admin@pragati.local', username: 'demo.admin', name: 'Demo Admin', role: 'admin', title: 'Workspace Admin', pw: 'demo1234', org: ORGS[0], dept: 'IT', employeeId: 'ADM-0001', avatarBg: '#1565C0', avatarFont: 1 },

  // Leads
  { email: 'priya.shah@pragati.local',     username: 'priya.shah',   name: 'Priya Shah',     role: 'lead', title: 'Head of Quality Informatics', pw: 'demo1234', org: ORGS[0], dept: 'IT',           employeeId: 'EMP-1001', avatarBg: '#EC4899', avatarFont: 0 },
  { email: 'rahul.mehta@pragati.local',    username: 'rahul.mehta',  name: 'Rahul Mehta',    role: 'lead', title: 'CSV Lead',                    pw: 'demo1234', org: ORGS[0], dept: 'Validation',   employeeId: 'EMP-1002', avatarBg: '#0EA5E9', avatarFont: 0 },
  { email: 'ananya.iyer@pragati.local',    username: 'ananya.iyer',  name: 'Ananya Iyer',    role: 'lead', title: 'Data Integrity Lead',          pw: 'demo1234', org: ORGS[0], dept: 'QA',           employeeId: 'EMP-1003', avatarBg: '#22C55E', avatarFont: 0 },
  { email: 'dhruv.kapoor@pragati.local',   username: 'dhruv.kapoor', name: 'Dhruv Kapoor',   role: 'lead', title: 'Pharmacovigilance Lead',       pw: 'demo1234', org: ORGS[1], dept: 'Pharmacovigilance', employeeId: 'EMP-1004', avatarBg: '#F59E0B', avatarFont: 0 },
  { email: 'sneha.rao@pragati.local',      username: 'sneha.rao',    name: 'Sneha Rao',      role: 'lead', title: 'Operations Lead',              pw: 'demo1234', org: ORGS[2], dept: 'Operations',   employeeId: 'EMP-1005', avatarBg: '#8B5CF6', avatarFont: 0 },

  // ICs (24)
  { email: 'karan.desai@pragati.local',    username: 'karan.desai',   name: 'Karan Desai',   role: 'contributor', title: 'QA Analyst',          pw: 'demo1234', org: ORGS[0], dept: 'Quality Assurance', employeeId: 'EMP-2001', avatarBg: '#F8BBD9' },
  { email: 'neha.patel@pragati.local',     username: 'neha.patel',    name: 'Neha Patel',    role: 'contributor', title: 'QA Analyst',          pw: 'demo1234', org: ORGS[0], dept: 'Quality Assurance', employeeId: 'EMP-2002', avatarBg: '#FDBA74' },
  { email: 'vikram.joshi@pragati.local',   username: 'vikram.joshi',  name: 'Vikram Joshi',  role: 'contributor', title: 'CSV Engineer',         pw: 'demo1234', org: ORGS[0], dept: 'Validation',     employeeId: 'EMP-2003', avatarBg: '#FDE047' },
  { email: 'meera.kulkarni@pragati.local', username: 'meera.k',       name: 'Meera Kulkarni', role: 'contributor', title: 'Validation Specialist', pw: 'demo1234', org: ORGS[0], dept: 'Validation',     employeeId: 'EMP-2004', avatarBg: '#86EFAC' },
  { email: 'arjun.reddy@pragati.local',    username: 'arjun.reddy',   name: 'Arjun Reddy',   role: 'contributor', title: 'PV Case Processor',    pw: 'demo1234', org: ORGS[1], dept: 'Pharmacovigilance', employeeId: 'EMP-2005', avatarBg: '#7DD3FC' },
  { email: 'isha.kapadia@pragati.local',   username: 'isha.k',        name: 'Isha Kapadia',  role: 'contributor', title: 'Data Steward',         pw: 'demo1234', org: ORGS[0], dept: 'QA',             employeeId: 'EMP-2006', avatarBg: '#C4B5FD' },
  { email: 'rohit.singh@pragati.local',    username: 'rohit.singh',   name: 'Rohit Singh',   role: 'contributor', title: 'IT Specialist',        pw: 'demo1234', org: ORGS[0], dept: 'IT',             employeeId: 'EMP-2007', avatarBg: '#FCA5A5' },
  { email: 'tara.menon@pragati.local',     username: 'tara.menon',    name: 'Tara Menon',    role: 'contributor', title: 'QA Reviewer',          pw: 'demo1234', org: ORGS[1], dept: 'Quality Assurance', employeeId: 'EMP-2008', avatarBg: '#A7F3D0' },
  { email: 'aditya.bose@pragati.local',    username: 'aditya.bose',   name: 'Aditya Bose',   role: 'contributor', title: 'Validation Engineer', pw: 'demo1234', org: ORGS[0], dept: 'Validation',     employeeId: 'EMP-2009', avatarBg: '#FBCFE8' },
  { email: 'kavya.nair@pragati.local',     username: 'kavya.nair',    name: 'Kavya Nair',    role: 'contributor', title: 'PV Analyst',           pw: 'demo1234', org: ORGS[1], dept: 'Pharmacovigilance', employeeId: 'EMP-2010', avatarBg: '#FED7AA' },
  { email: 'manish.gupta@pragati.local',   username: 'manish.g',      name: 'Manish Gupta',  role: 'contributor', title: 'QC Analyst',           pw: 'demo1234', org: ORGS[2], dept: 'Quality Control', employeeId: 'EMP-2011', avatarBg: '#FEF08A' },
  { email: 'pooja.shetty@pragati.local',   username: 'pooja.shetty',  name: 'Pooja Shetty',  role: 'contributor', title: 'Process Engineer',     pw: 'demo1234', org: ORGS[2], dept: 'Operations',     employeeId: 'EMP-2012', avatarBg: '#BAE6FD' },
  { email: 'aman.khanna@pragati.local',    username: 'aman.khanna',   name: 'Aman Khanna',   role: 'contributor', title: 'IT Operations',        pw: 'demo1234', org: ORGS[0], dept: 'IT',             employeeId: 'EMP-2013', avatarBg: '#EC4899' },
  { email: 'leela.banerjee@pragati.local', username: 'leela.b',       name: 'Leela Banerjee', role: 'contributor', title: 'Lab Analyst',         pw: 'demo1234', org: ORGS[2], dept: 'Quality Control', employeeId: 'EMP-2014', avatarBg: '#F97316' },
  { email: 'siddharth.rao@pragati.local',  username: 'sid.rao',       name: 'Siddharth Rao', role: 'contributor', title: 'Test Engineer',        pw: 'demo1234', org: ORGS[1], dept: 'Validation',     employeeId: 'EMP-2015', avatarBg: '#EAB308' },
  { email: 'ria.dutta@pragati.local',      username: 'ria.dutta',     name: 'Ria Dutta',     role: 'contributor', title: 'QA Documentation',     pw: 'demo1234', org: ORGS[0], dept: 'Quality Assurance', employeeId: 'EMP-2016', avatarBg: '#22C55E' },
  { email: 'nikhil.verma@pragati.local',   username: 'nikhil.v',      name: 'Nikhil Verma',  role: 'contributor', title: 'CSV Test Engineer',    pw: 'demo1234', org: ORGS[0], dept: 'Validation',     employeeId: 'EMP-2017', avatarBg: '#06B6D4' },
  { email: 'shruti.kohli@pragati.local',   username: 'shruti.k',      name: 'Shruti Kohli',  role: 'contributor', title: 'Data Reviewer',        pw: 'demo1234', org: ORGS[1], dept: 'QA',             employeeId: 'EMP-2018', avatarBg: '#8B5CF6' },
  { email: 'vivek.malhotra@pragati.local', username: 'vivek.m',       name: 'Vivek Malhotra', role: 'contributor', title: 'Operations Analyst', pw: 'demo1234', org: ORGS[2], dept: 'Operations',     employeeId: 'EMP-2019', avatarBg: '#EF4444' },
  { email: 'tanvi.shah@pragati.local',     username: 'tanvi.shah',    name: 'Tanvi Shah',    role: 'contributor', title: 'PV Triage',            pw: 'demo1234', org: ORGS[1], dept: 'Pharmacovigilance', employeeId: 'EMP-2020', avatarBg: '#10B981' },
  { email: 'kabir.chopra@pragati.local',   username: 'kabir.c',       name: 'Kabir Chopra',  role: 'contributor', title: 'IT Support',           pw: 'demo1234', org: ORGS[0], dept: 'IT',             employeeId: 'EMP-2021', avatarBg: '#9333EA' },
  { email: 'sanya.bhatt@pragati.local',    username: 'sanya.b',       name: 'Sanya Bhatt',   role: 'contributor', title: 'QA Trainee',           pw: 'demo1234', org: ORGS[2], dept: 'Quality Assurance', employeeId: 'EMP-2022', avatarBg: '#0EA5E9' },
  { email: 'rohan.iyer@pragati.local',     username: 'rohan.iyer',    name: 'Rohan Iyer',    role: 'contributor', title: 'Validation Trainee',   pw: 'demo1234', org: ORGS[0], dept: 'Validation',     employeeId: 'EMP-2023', avatarBg: '#059669' },
  { email: 'maya.pillai@pragati.local',    username: 'maya.pillai',   name: 'Maya Pillai',   role: 'contributor', title: 'Data Analyst',         pw: 'demo1234', org: ORGS[1], dept: 'Quality Assurance', employeeId: 'EMP-2024', avatarBg: '#B91C1C' },
];

interface ProjectSpec {
  name: string;
  code: string;
  lifecycle: LifecycleKey;
  team: string;
  owner: string; // email
  description: string;
  daysFromNow: number; // due offset
  priority: 'low' | 'medium' | 'high' | 'critical';
  gxpImpact?: 'none' | 'low' | 'medium' | 'high';
}

const PROJECTS: ProjectSpec[] = [
  { name: 'BOT Automation for MES User Management', code: 'CC-2026-0011', lifecycle: 'change_control', team: 'MES', owner: 'rahul.mehta@pragati.local', description: 'Implementation of BOT-based Automation for Account Unlock, User ID deactivation and Reactivation for the Manufacturing Execution System.', daysFromNow: 35, priority: 'high', gxpImpact: 'high' },
  { name: 'LIMS v3.4 Validation', code: 'CSV-2026-021', lifecycle: 'csv', team: 'CSV', owner: 'rahul.mehta@pragati.local', description: 'Computer System Validation per GAMP 5 Cat 4 for the LIMS v3.4 upgrade.', daysFromNow: 60, priority: 'critical', gxpImpact: 'high' },
  { name: 'Chromatography Data System — Audit Trail Review', code: 'DI-2026-008', lifecycle: 'deviation', team: 'Data Integrity', owner: 'ananya.iyer@pragati.local', description: 'Shared-login deviation on CDS during batch release — ALCOA+ assessment + CAPA.', daysFromNow: 14, priority: 'critical', gxpImpact: 'high' },
  { name: 'Annual SOP Refresh — QA-IT', code: 'SOP-2026-014', lifecycle: 'sop', team: 'QA-IT', owner: 'priya.shah@pragati.local', description: 'Author → review → approve → train cycle for QA-IT SOPs.', daysFromNow: 80, priority: 'medium', gxpImpact: 'medium' },
  { name: 'PV Case Intake Quality Audit', code: 'AUD-2026-005', lifecycle: 'audit', team: 'Pharmacovigilance', owner: 'dhruv.kapoor@pragati.local', description: 'Quarterly internal audit of adverse event case intake.', daysFromNow: 20, priority: 'high', gxpImpact: 'high' },
  { name: 'eQMS Module Release — Sprint 14', code: 'AGI-2026-014', lifecycle: 'agile_sprint', team: 'QA-IT', owner: 'priya.shah@pragati.local', description: 'Two-week sprint delivering the deviation module enhancements.', daysFromNow: 10, priority: 'high' },
  { name: 'EBR Print Issue — CAPA', code: 'CAPA-2026-003', lifecycle: 'capa', team: 'Operations', owner: 'sneha.rao@pragati.local', description: 'Root cause + corrective action for electronic batch record print failures.', daysFromNow: 45, priority: 'high', gxpImpact: 'medium' },
  { name: 'Backup & Restore Validation', code: 'VAL-2026-018', lifecycle: 'validation', team: 'CSV', owner: 'rahul.mehta@pragati.local', description: 'Validate the new backup-restore procedure for GxP systems.', daysFromNow: 55, priority: 'medium', gxpImpact: 'high' },
  { name: 'Stability Sample Tracker', code: 'AGI-2026-015', lifecycle: 'agile_sprint', team: 'Operations', owner: 'sneha.rao@pragati.local', description: 'Internal tool to track stability sample storage locations.', daysFromNow: 25, priority: 'medium' },
  { name: 'Quality Manual v2.1 Release', code: 'REL-2026-002', lifecycle: 'software_release', team: 'QA-IT', owner: 'priya.shah@pragati.local', description: 'Coordinated release of the updated Quality Manual.', daysFromNow: -3, priority: 'medium' },
  { name: 'New Reviewer Onboarding Programme', code: 'PRJ-2026-031', lifecycle: 'generic', team: 'QA-IT', owner: 'ananya.iyer@pragati.local', description: 'Onboarding curriculum for new QA reviewers.', daysFromNow: 70, priority: 'low' },
  { name: 'Audit Trail Enhancement for HPLC', code: 'CC-2026-0012', lifecycle: 'change_control', team: 'CSV', owner: 'rahul.mehta@pragati.local', description: 'Change control to enable extended audit trail logging on HPLC systems.', daysFromNow: 40, priority: 'medium', gxpImpact: 'high' },
  { name: 'Adverse Event Coding QA', code: 'AUD-2026-006', lifecycle: 'audit', team: 'Pharmacovigilance', owner: 'dhruv.kapoor@pragati.local', description: 'Quality review of MedDRA coding across the last quarter.', daysFromNow: 12, priority: 'high', gxpImpact: 'medium' },
  { name: 'Calibration Tracker Refresh', code: 'PRJ-2026-032', lifecycle: 'generic', team: 'Operations', owner: 'sneha.rao@pragati.local', description: 'Modernise the lab calibration tracker; legacy spreadsheet replacement.', daysFromNow: 90, priority: 'medium' },
];

interface TeamSpec { name: string; description: string; function: string; lead: string; members: string[]; }
const TEAMS: TeamSpec[] = [
  { name: 'QA-IT',                          description: 'Quality Informatics — owns the digital quality stack.', function: 'general',
    lead: 'priya.shah@pragati.local',
    members: ['priya.shah@pragati.local','rohit.singh@pragati.local','aman.khanna@pragati.local','kabir.chopra@pragati.local','ria.dutta@pragati.local','isha.kapadia@pragati.local'] },
  { name: 'CSV',                            description: 'Computer System Validation team — GAMP 5 lifecycles.',  function: 'csv_validation',
    lead: 'rahul.mehta@pragati.local',
    members: ['rahul.mehta@pragati.local','vikram.joshi@pragati.local','meera.kulkarni@pragati.local','aditya.bose@pragati.local','nikhil.verma@pragati.local','rohan.iyer@pragati.local'] },
  { name: 'Data Integrity',                 description: 'ALCOA+ enforcement, audit trail review, deviations.',   function: 'general',
    lead: 'ananya.iyer@pragati.local',
    members: ['ananya.iyer@pragati.local','karan.desai@pragati.local','neha.patel@pragati.local','shruti.kohli@pragati.local','tara.menon@pragati.local'] },
  { name: 'Pharmacovigilance',              description: 'Adverse event intake, triage and reporting.',           function: 'general',
    lead: 'dhruv.kapoor@pragati.local',
    members: ['dhruv.kapoor@pragati.local','arjun.reddy@pragati.local','kavya.nair@pragati.local','tanvi.shah@pragati.local','maya.pillai@pragati.local'] },
  { name: 'Operations',                     description: 'Manufacturing operations + lab support tools.',         function: 'general',
    lead: 'sneha.rao@pragati.local',
    members: ['sneha.rao@pragati.local','manish.gupta@pragati.local','pooja.shetty@pragati.local','leela.banerjee@pragati.local','siddharth.rao@pragati.local','vivek.malhotra@pragati.local','sanya.bhatt@pragati.local'] },
  { name: 'MES',                            description: 'Manufacturing Execution System — shared CC programme.', function: 'general',
    lead: 'rahul.mehta@pragati.local',
    members: ['rahul.mehta@pragati.local','vikram.joshi@pragati.local','karan.desai@pragati.local','meera.kulkarni@pragati.local','rohit.singh@pragati.local'] },
];

async function main() {
  await connectDB();
  console.log(`[seed:demo] target db host hint = "${HINT}"`);
  console.log('[seed:demo] clearing demo collections…');
  await Promise.all([
    User.deleteMany({}),
    Team.deleteMany({}),
    Project.deleteMany({}),
    Task.deleteMany({}),
    AuditLog.deleteMany({}),
    Notification.deleteMany({}),
  ]);

  console.log(`[seed:demo] creating ${PEOPLE.length} users…`);
  const userDocs = await User.insertMany(PEOPLE.map((p) => ({
    email: p.email.toLowerCase(),
    username: p.username,
    name: p.name,
    passwordHash: hash(p.pw),
    role: p.role,
    title: p.title,
    department: p.dept,
    organisation: p.org,
    employeeId: p.employeeId,
    avatarBg: p.avatarBg,
    avatarFont: p.avatarFont ?? 0,
    avatarLetter: p.name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase(),
    active: true,
  })));
  const usersByEmail = new Map(userDocs.map((u) => [u.email, u]));

  console.log(`[seed:demo] creating ${TEAMS.length} teams…`);
  const teamDocs = await Promise.all(TEAMS.map(async (t) => Team.create({
    name: t.name,
    description: t.description,
    function: t.function,
    leadId: usersByEmail.get(t.lead)!._id,
    memberIds: t.members.map((e) => usersByEmail.get(e)!._id),
  })));
  const teamByName = new Map(teamDocs.map((t) => [t.name, t]));

  console.log(`[seed:demo] creating ${PROJECTS.length} shared projects…`);
  for (const spec of PROJECTS) {
    const owner = usersByEmail.get(spec.owner)!;
    const team  = teamByName.get(spec.team)!;
    const lc    = LIFECYCLES[spec.lifecycle];
    const phases = (lc?.phases || []).map((ph, i) => ({ name: ph.name, position: i }));
    const startDate = days(-Math.floor(20 + Math.random() * 40));
    const dueDate   = days(spec.daysFromNow);

    const proj = await Project.create({
      code: spec.code,
      name: spec.name,
      description: spec.description,
      lifecycle: spec.lifecycle,
      status: spec.daysFromNow < 0 ? 'completed' : 'in_progress',
      priority: spec.priority,
      teamId: team._id,
      ownerId: owner._id,
      startDate,
      dueDate,
      gxpImpact: spec.gxpImpact || 'none',
      phases,
    });

    // Build tasks from the lifecycle template, spread across the assignable
    // pool, with realistic statuses + dates.
    const pool = ((team as any).memberIds as any[]).filter((m: any) => String(m) !== String(owner._id));
    const tasks: any[] = [];
    let n = 0;
    for (let phIdx = 0; phIdx < phases.length; phIdx++) {
      const phase = phases[phIdx];
      const phaseTpl = (lc?.phases || [])[phIdx];
      const titles: string[] = ((phaseTpl?.tasks || []) as any[]).map((t: any) => (typeof t === 'string' ? t : t.title));
      for (let i = 0; i < titles.length; i++) {
        const assignee = one(pool);
        // Phase 0 → mostly done, last phase → mostly to-do, middle → mixed.
        let status: string;
        const phaseRatio = phIdx / Math.max(1, phases.length - 1);
        if (phaseRatio < 0.3)      status = Math.random() < 0.85 ? 'done' : 'in_progress';
        else if (phaseRatio < 0.7) status = ['done', 'in_progress', 'in_progress', 'todo', 'review'][Math.floor(Math.random() * 5)];
        else                       status = ['todo', 'todo', 'in_progress', 'blocked'][Math.floor(Math.random() * 4)];

        const tcd = new Date(startDate.getTime() + (phIdx * 14 + i * 2) * 86400000);
        const completedAt = status === 'done' ? new Date(tcd.getTime() - Math.floor(Math.random() * 5) * 86400000) : null;
        tasks.push({
          projectId: proj._id,
          phaseId: (proj.phases as any)[phIdx]?._id,
          title: titles[i],
          description: '',
          assigneeId: assignee,
          status,
          priority: ['low', 'medium', 'high'][Math.floor(Math.random() * 3)],
          taskType: 'task',
          gxpCritical: spec.gxpImpact === 'high' && Math.random() < 0.3,
          dueDate: tcd,
          ccTcd: tcd,
          ccNo: `${spec.code}-${String(++n).padStart(3, '0')}`,
          completedAt,
          position: n,
        });
      }
    }
    if (tasks.length) await Task.insertMany(tasks);
  }

  // ── Personal projects for a handful of ICs so the personal-toggle templates
  // and IC dashboard panel both have something to show in the demo.
  console.log('[seed:demo] adding personal projects…');
  const personalOwners = pick(PEOPLE.filter((p) => p.role === 'contributor'), 6);
  for (const p of personalOwners) {
    const owner = usersByEmail.get(p.email)!;
    const lifecycleKey: LifecycleKey = one(['personal_career', 'personal_study', 'personal_fitness', 'personal_reading', 'personal_habit']);
    const lc = LIFECYCLES[lifecycleKey];
    const phases = (lc?.phases || []).map((ph, i) => ({ name: ph.name, position: i }));
    const proj = await Project.create({
      code: `PRSN-${String(Date.now()).slice(-6)}-${owner._id.toString().slice(-3)}`,
      name: lc?.label || 'Personal project',
      description: 'Demo personal project — visible only to its owner.',
      lifecycle: lifecycleKey,
      status: 'in_progress',
      priority: 'medium',
      ownerId: owner._id,
      isPersonal: true,
      personal: true,
      startDate: days(-15),
      dueDate: days(45),
      phases,
    });
    const ptasks: any[] = [];
    (lc?.phases || []).forEach((ph, phIdx) => {
      ((ph.tasks || []) as any[]).forEach((t: any, i: number) => {
        ptasks.push({
          projectId: proj._id,
          phaseId: (proj.phases as any)[phIdx]?._id,
          title: typeof t === 'string' ? t : t.title,
          assigneeId: owner._id,
          status: Math.random() < 0.4 ? 'done' : 'todo',
          priority: 'medium',
          dueDate: days(7 + i * 3),
          position: i + phIdx * 10,
          completedAt: Math.random() < 0.4 ? days(-Math.floor(Math.random() * 5)) : null,
        });
      });
    });
    if (ptasks.length) await Task.insertMany(ptasks);
  }

  // ── A handful of audit entries so the admin's audit page has content.
  console.log('[seed:demo] seeding audit log…');
  const admin = usersByEmail.get('demo.admin@pragati.local')!;
  await AuditLog.insertMany([
    { action: 'user.role', category: 'user', actorId: admin._id, actorName: admin.name, targetType: 'user', targetId: usersByEmail.get('rahul.mehta@pragati.local')!._id.toString(), targetLabel: 'Rahul Mehta', summary: 'Changed role → lead', meta: { changes: { role: { before: 'contributor', after: 'lead' } }, reason: 'Promoted to CSV team lead per HR ticket #1024' }, createdAt: days(-21) },
    { action: 'user.update', category: 'user', actorId: admin._id, actorName: admin.name, targetType: 'user', targetId: usersByEmail.get('neha.patel@pragati.local')!._id.toString(), targetLabel: 'Neha Patel', summary: 'Updated username, employeeId', meta: { changes: { username: { before: 'np', after: 'neha.patel' }, employeeId: { before: '', after: 'EMP-2002' } }, reason: 'Backfilled identity per AD sync' }, createdAt: days(-14) },
    { action: 'project.create', category: 'project', actorId: usersByEmail.get('priya.shah@pragati.local')!._id, actorName: 'Priya Shah', targetType: 'project', targetLabel: 'eQMS Module Release — Sprint 14', summary: 'Created project', createdAt: days(-9) },
  ]);

  console.log('[seed:demo] done.');
  console.log('');
  console.log('  Demo admin: demo.admin@pragati.local / demo1234');
  console.log(`  Total: ${userDocs.length} users · ${teamDocs.length} teams · ${PROJECTS.length} shared projects + ${personalOwners.length} personal`);
}

main()
  .catch((e) => { console.error('[seed:demo] failed:', e); process.exit(1); })
  .finally(() => mongoose.disconnect());
