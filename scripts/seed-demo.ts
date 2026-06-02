/**
 * Demo seed — drops a believable, ready-to-demo workspace into your existing
 * database. No new env vars, no separate cluster, no Vercel changes. One
 * command, runs as long as `MONGODB_URI` is set:
 *
 *   npm run seed:demo
 *
 * Every record this script creates is tagged with the `[DEMO]` prefix on its
 * name (or `demo.…` for user emails / usernames) so it's trivially
 * identifiable. The script is idempotent — re-running deletes *only*
 * previously-tagged demo records and recreates them, so your real data is
 * never touched. To remove the demo workspace cleanly:
 *
 *   npm run seed:demo -- --clean
 *
 * Trade-off you should know about: the workspace admin sees every team and
 * every shared project, so the demo teams/projects WILL show up in your
 * admin dashboard alongside real ones. They're all prefixed `[DEMO]` so
 * they're easy to recognise (or archive later). Personal projects under the
 * demo lead/IC stay private to those accounts.
 *
 * Demo accounts (all share password `Demo@1234`):
 *
 *   demo.lead@pragati.local        — Team Lead (best for screen-recordings)
 *   demo.ic@pragati.local          — Individual Contributor (for IC views)
 *   demo.<first>@pragati.local     — 13 supporting users
 *
 * Pass `--with-admin` to also create demo.admin@pragati.local (off by default
 * to avoid double-admin confusion in your real workspace).
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

// ── CLI flags ───────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const CLEAN_ONLY = args.has('--clean');
const WITH_ADMIN = args.has('--with-admin');

if (!process.env.MONGODB_URI) {
  console.error('[seed:demo] MONGODB_URI is not set. Aborting.');
  process.exit(1);
}

// ── Markers — these are how we identify demo records on re-run / cleanup ─
// Each collection has its own self-contained way to identify demo rows so
// cleanup doesn't depend on any one query.
const DEMO_EMAIL_RX     = /^demo\..*@pragati\.local$/i;
const DEMO_PROJECT_CODE = /^DEMO-/;
const DEMO_PASSWORD     = 'Demo@1234';

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
  title: string; org: string; dept: string; employeeId: string;
  avatarBg?: string; avatarFont?: number;
}

const ORGS = ['Pharma Division', 'Biotech Division', 'Generics Division'];

const PEOPLE: DemoUser[] = [
  { email: 'demo.lead@pragati.local',   username: 'demo.lead',   name: 'Priya Shah (Demo)',     role: 'lead',        title: 'Head of Quality Informatics', org: ORGS[0], dept: 'IT',                  employeeId: 'DEMO-1001', avatarBg: '#EC4899', avatarFont: 0 },
  { email: 'demo.ic@pragati.local',     username: 'demo.ic',     name: 'Karan Desai (Demo)',    role: 'contributor', title: 'QA Analyst',                  org: ORGS[0], dept: 'Quality Assurance',   employeeId: 'DEMO-2001', avatarBg: '#F8BBD9' },
  { email: 'demo.rahul@pragati.local',  username: 'demo.rahul',  name: 'Rahul Mehta (Demo)',    role: 'lead',        title: 'CSV Lead',                    org: ORGS[0], dept: 'Validation',          employeeId: 'DEMO-1002', avatarBg: '#0EA5E9', avatarFont: 0 },
  { email: 'demo.ananya@pragati.local', username: 'demo.ananya', name: 'Ananya Iyer (Demo)',    role: 'lead',        title: 'Data Integrity Lead',         org: ORGS[0], dept: 'QA',                  employeeId: 'DEMO-1003', avatarBg: '#22C55E', avatarFont: 0 },
  { email: 'demo.dhruv@pragati.local',  username: 'demo.dhruv',  name: 'Dhruv Kapoor (Demo)',   role: 'lead',        title: 'Pharmacovigilance Lead',      org: ORGS[1], dept: 'Pharmacovigilance',   employeeId: 'DEMO-1004', avatarBg: '#F59E0B', avatarFont: 0 },
  { email: 'demo.neha@pragati.local',   username: 'demo.neha',   name: 'Neha Patel (Demo)',     role: 'contributor', title: 'QA Analyst',                  org: ORGS[0], dept: 'Quality Assurance',   employeeId: 'DEMO-2002', avatarBg: '#FDBA74' },
  { email: 'demo.vikram@pragati.local', username: 'demo.vikram', name: 'Vikram Joshi (Demo)',   role: 'contributor', title: 'CSV Engineer',                org: ORGS[0], dept: 'Validation',          employeeId: 'DEMO-2003', avatarBg: '#FDE047' },
  { email: 'demo.meera@pragati.local',  username: 'demo.meera',  name: 'Meera Kulkarni (Demo)', role: 'contributor', title: 'Validation Specialist',       org: ORGS[0], dept: 'Validation',          employeeId: 'DEMO-2004', avatarBg: '#86EFAC' },
  { email: 'demo.arjun@pragati.local',  username: 'demo.arjun',  name: 'Arjun Reddy (Demo)',    role: 'contributor', title: 'PV Case Processor',           org: ORGS[1], dept: 'Pharmacovigilance',   employeeId: 'DEMO-2005', avatarBg: '#7DD3FC' },
  { email: 'demo.isha@pragati.local',   username: 'demo.isha',   name: 'Isha Kapadia (Demo)',   role: 'contributor', title: 'Data Steward',                org: ORGS[0], dept: 'QA',                  employeeId: 'DEMO-2006', avatarBg: '#C4B5FD' },
  { email: 'demo.rohit@pragati.local',  username: 'demo.rohit',  name: 'Rohit Singh (Demo)',    role: 'contributor', title: 'IT Specialist',               org: ORGS[0], dept: 'IT',                  employeeId: 'DEMO-2007', avatarBg: '#FCA5A5' },
  { email: 'demo.tara@pragati.local',   username: 'demo.tara',   name: 'Tara Menon (Demo)',     role: 'contributor', title: 'QA Reviewer',                 org: ORGS[1], dept: 'Quality Assurance',   employeeId: 'DEMO-2008', avatarBg: '#A7F3D0' },
  { email: 'demo.aditya@pragati.local', username: 'demo.aditya', name: 'Aditya Bose (Demo)',    role: 'contributor', title: 'Validation Engineer',         org: ORGS[0], dept: 'Validation',          employeeId: 'DEMO-2009', avatarBg: '#FBCFE8' },
  { email: 'demo.kavya@pragati.local',  username: 'demo.kavya',  name: 'Kavya Nair (Demo)',     role: 'contributor', title: 'PV Analyst',                  org: ORGS[1], dept: 'Pharmacovigilance',   employeeId: 'DEMO-2010', avatarBg: '#FED7AA' },
  { email: 'demo.manish@pragati.local', username: 'demo.manish', name: 'Manish Gupta (Demo)',   role: 'contributor', title: 'QC Analyst',                  org: ORGS[2], dept: 'Quality Control',     employeeId: 'DEMO-2011', avatarBg: '#FEF08A' },
  { email: 'demo.pooja@pragati.local',  username: 'demo.pooja',  name: 'Pooja Shetty (Demo)',   role: 'contributor', title: 'Process Engineer',            org: ORGS[2], dept: 'Operations',          employeeId: 'DEMO-2012', avatarBg: '#BAE6FD' },
];

if (WITH_ADMIN) {
  PEOPLE.unshift({
    email: 'demo.admin@pragati.local', username: 'demo.admin', name: 'Demo Admin', role: 'admin',
    title: 'Workspace Admin', org: ORGS[0], dept: 'IT', employeeId: 'DEMO-0001',
    avatarBg: '#1565C0', avatarFont: 1,
  });
}

interface ProjectSpec {
  name: string; code: string; lifecycle: LifecycleKey; team: string; owner: string;
  description: string; daysFromNow: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  gxpImpact?: 'none' | 'low' | 'medium' | 'high';
}

const PROJECTS: ProjectSpec[] = [
  { name: '[DEMO] BOT Automation for MES User Management', code: 'DEMO-CC-2026-0011', lifecycle: 'change_control', team: '[DEMO] MES',                  owner: 'demo.rahul@pragati.local',  description: 'Implementation of BOT-based Automation for Account Unlock, User ID deactivation and Reactivation for the Manufacturing Execution System.', daysFromNow: 35, priority: 'high', gxpImpact: 'high' },
  { name: '[DEMO] LIMS v3.4 Validation',                   code: 'DEMO-CSV-2026-021',  lifecycle: 'csv',            team: '[DEMO] CSV',                  owner: 'demo.rahul@pragati.local',  description: 'Computer System Validation per GAMP 5 Cat 4 for the LIMS v3.4 upgrade.',                                                                       daysFromNow: 60, priority: 'critical', gxpImpact: 'high' },
  { name: '[DEMO] Chromatography Audit Trail Review',      code: 'DEMO-DI-2026-008',   lifecycle: 'deviation',      team: '[DEMO] Data Integrity',       owner: 'demo.ananya@pragati.local', description: 'Shared-login deviation on CDS during batch release — ALCOA+ assessment + CAPA.',                                                              daysFromNow: 14, priority: 'critical', gxpImpact: 'high' },
  { name: '[DEMO] Annual SOP Refresh',                     code: 'DEMO-SOP-2026-014',  lifecycle: 'sop',            team: '[DEMO] QA-IT',                owner: 'demo.lead@pragati.local',   description: 'Author → review → approve → train cycle for QA-IT SOPs.',                                                                                       daysFromNow: 80, priority: 'medium', gxpImpact: 'medium' },
  { name: '[DEMO] PV Case Intake Quality Audit',           code: 'DEMO-AUD-2026-005',  lifecycle: 'audit',          team: '[DEMO] Pharmacovigilance',    owner: 'demo.dhruv@pragati.local',  description: 'Quarterly internal audit of adverse event case intake.',                                                                                       daysFromNow: 20, priority: 'high', gxpImpact: 'high' },
  { name: '[DEMO] eQMS Sprint 14',                         code: 'DEMO-AGI-2026-014',  lifecycle: 'agile_sprint',   team: '[DEMO] QA-IT',                owner: 'demo.lead@pragati.local',   description: 'Two-week sprint delivering the deviation module enhancements.',                                                                                 daysFromNow: 10, priority: 'high' },
  { name: '[DEMO] EBR Print Issue — CAPA',                 code: 'DEMO-CAPA-2026-003', lifecycle: 'capa',           team: '[DEMO] Operations',           owner: 'demo.lead@pragati.local',   description: 'Root cause + corrective action for electronic batch record print failures.',                                                                    daysFromNow: 45, priority: 'high', gxpImpact: 'medium' },
  { name: '[DEMO] Backup & Restore Validation',            code: 'DEMO-VAL-2026-018',  lifecycle: 'validation',     team: '[DEMO] CSV',                  owner: 'demo.rahul@pragati.local',  description: 'Validate the new backup-restore procedure for GxP systems.',                                                                                    daysFromNow: 55, priority: 'medium', gxpImpact: 'high' },
  { name: '[DEMO] Quality Manual v2.1 Release',            code: 'DEMO-REL-2026-002',  lifecycle: 'software_release', team: '[DEMO] QA-IT',              owner: 'demo.lead@pragati.local',   description: 'Coordinated release of the updated Quality Manual.',                                                                                            daysFromNow: -3, priority: 'medium' },
  { name: '[DEMO] Reviewer Onboarding Programme',          code: 'DEMO-PRJ-2026-031',  lifecycle: 'generic',        team: '[DEMO] QA-IT',                owner: 'demo.ananya@pragati.local', description: 'Onboarding curriculum for new QA reviewers.',                                                                                                   daysFromNow: 70, priority: 'low' },
  { name: '[DEMO] HPLC Audit Trail Enhancement',           code: 'DEMO-CC-2026-0012',  lifecycle: 'change_control', team: '[DEMO] CSV',                  owner: 'demo.rahul@pragati.local',  description: 'Change control to enable extended audit trail logging on HPLC systems.',                                                                        daysFromNow: 40, priority: 'medium', gxpImpact: 'high' },
  { name: '[DEMO] Adverse Event Coding QA',                code: 'DEMO-AUD-2026-006',  lifecycle: 'audit',          team: '[DEMO] Pharmacovigilance',    owner: 'demo.dhruv@pragati.local',  description: 'Quality review of MedDRA coding across the last quarter.',                                                                                      daysFromNow: 12, priority: 'high', gxpImpact: 'medium' },
];

interface TeamSpec { name: string; description: string; function: string; lead: string; members: string[]; }
const TEAMS: TeamSpec[] = [
  { name: '[DEMO] QA-IT',             description: 'Quality Informatics — owns the digital quality stack.', function: 'general',
    lead: 'demo.lead@pragati.local',
    members: ['demo.lead@pragati.local','demo.ic@pragati.local','demo.rohit@pragati.local','demo.isha@pragati.local','demo.tara@pragati.local'] },
  { name: '[DEMO] CSV',               description: 'Computer System Validation — GAMP 5 lifecycles.',       function: 'csv_validation',
    lead: 'demo.rahul@pragati.local',
    members: ['demo.rahul@pragati.local','demo.vikram@pragati.local','demo.meera@pragati.local','demo.aditya@pragati.local'] },
  { name: '[DEMO] Data Integrity',    description: 'ALCOA+ enforcement, audit trail review, deviations.',   function: 'general',
    lead: 'demo.ananya@pragati.local',
    members: ['demo.ananya@pragati.local','demo.ic@pragati.local','demo.neha@pragati.local','demo.tara@pragati.local'] },
  { name: '[DEMO] Pharmacovigilance', description: 'Adverse event intake, triage and reporting.',           function: 'general',
    lead: 'demo.dhruv@pragati.local',
    members: ['demo.dhruv@pragati.local','demo.arjun@pragati.local','demo.kavya@pragati.local'] },
  { name: '[DEMO] Operations',        description: 'Manufacturing operations + lab support tools.',         function: 'general',
    lead: 'demo.lead@pragati.local',
    members: ['demo.lead@pragati.local','demo.manish@pragati.local','demo.pooja@pragati.local'] },
  { name: '[DEMO] MES',               description: 'Manufacturing Execution System — shared CC programme.', function: 'general',
    lead: 'demo.rahul@pragati.local',
    members: ['demo.rahul@pragati.local','demo.vikram@pragati.local','demo.ic@pragati.local','demo.meera@pragati.local','demo.rohit@pragati.local'] },
];

/** Wipe everything tagged as demo. Real data is identified by the absence
 *  of demo markers and is never touched. */
async function cleanDemo() {
  console.log('[seed:demo] removing existing demo records…');

  const demoUsers = await User.find({ email: DEMO_EMAIL_RX }, '_id').lean();
  const demoUserIds = demoUsers.map((u: any) => u._id);

  const demoProjects = await Project.find({ code: DEMO_PROJECT_CODE }, '_id').lean();
  const demoProjectIds = demoProjects.map((p: any) => p._id);

  const [tasksDel, projDel, teamsDel, usersDel, auditDel, notifDel] = await Promise.all([
    Task.deleteMany({ $or: [
      { projectId: { $in: demoProjectIds } },
      { assigneeId: { $in: demoUserIds } },
    ] }),
    Project.deleteMany({ code: DEMO_PROJECT_CODE }),
    Team.deleteMany({ name: { $regex: '^\\[DEMO\\]' } }),
    User.deleteMany({ email: DEMO_EMAIL_RX }),
    AuditLog.deleteMany({ $or: [
      { actorId: { $in: demoUserIds } },
      { targetId: { $in: [...demoUserIds, ...demoProjectIds].map(String) } },
    ] }),
    Notification.deleteMany({ userId: { $in: demoUserIds } }),
  ]);

  console.log(`[seed:demo] removed: ${usersDel.deletedCount} users, ${teamsDel.deletedCount} teams, ${projDel.deletedCount} projects, ${tasksDel.deletedCount} tasks, ${auditDel.deletedCount} audit rows, ${notifDel.deletedCount} notifications`);
}

async function buildDemo() {
  console.log(`[seed:demo] creating ${PEOPLE.length} demo users…`);
  const hash = bcrypt.hashSync(DEMO_PASSWORD, 10);
  const userDocs = await User.insertMany(PEOPLE.map((p) => ({
    email: p.email.toLowerCase(),
    username: p.username,
    name: p.name,
    passwordHash: hash,
    role: p.role,
    title: p.title,
    department: p.dept,
    organisation: p.org,
    employeeId: p.employeeId,
    avatarBg: p.avatarBg,
    avatarFont: p.avatarFont ?? 0,
    avatarLetter: p.name.replace(/\s*\(Demo\)\s*/, '').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase(),
    active: true,
  })));
  const usersByEmail = new Map(userDocs.map((u) => [u.email, u]));

  console.log(`[seed:demo] creating ${TEAMS.length} demo teams…`);
  const teamDocs = await Promise.all(TEAMS.map(async (t) => Team.create({
    name: t.name,
    description: t.description,
    function: t.function,
    leadId: usersByEmail.get(t.lead)!._id,
    memberIds: t.members.map((e) => usersByEmail.get(e)?._id).filter(Boolean),
  })));
  const teamByName = new Map(teamDocs.map((t) => [t.name, t]));

  console.log(`[seed:demo] creating ${PROJECTS.length} shared projects + tasks…`);
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
      startDate, dueDate,
      gxpImpact: spec.gxpImpact || 'none',
      phases,
    });

    const pool = ((team as any).memberIds as any[]).filter((m: any) => String(m) !== String(owner._id));
    const tasks: any[] = [];
    let n = 0;
    for (let phIdx = 0; phIdx < phases.length; phIdx++) {
      const phaseTpl = (lc?.phases || [])[phIdx];
      const titles: string[] = ((phaseTpl?.tasks || []) as any[]).map((t: any) => (typeof t === 'string' ? t : t.title));
      for (let i = 0; i < titles.length; i++) {
        const assignee = pool.length ? one(pool) : owner._id;
        const phaseRatio = phIdx / Math.max(1, phases.length - 1);
        let status: string;
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

  // Personal projects on the demo IC + lead — these are owner-private so they
  // don't pollute the workspace admin's views, and they give the personal
  // workflow templates something to render.
  console.log('[seed:demo] adding personal projects on the demo lead and IC…');
  const personalOwners = [usersByEmail.get('demo.ic@pragati.local')!, usersByEmail.get('demo.lead@pragati.local')!];
  const personalLifecycles: LifecycleKey[] = ['personal_career', 'personal_study', 'personal_fitness', 'personal_reading', 'personal_habit'];
  for (const owner of personalOwners) {
    for (const lifecycleKey of pick(personalLifecycles, 3)) {
      const lc = LIFECYCLES[lifecycleKey];
      const phases = (lc?.phases || []).map((ph, i) => ({ name: ph.name, position: i }));
      const proj = await Project.create({
        code: `DEMO-PRSN-${owner._id.toString().slice(-4)}-${lifecycleKey.slice(-4)}`,
        name: `[DEMO] ${lc?.label || 'Personal project'}`,
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
  }

  // A few audit entries so the admin's audit page has content to demo.
  console.log('[seed:demo] seeding a few audit entries…');
  const lead = usersByEmail.get('demo.lead@pragati.local')!;
  await AuditLog.insertMany([
    { action: 'user.update', category: 'user', actorId: lead._id, actorName: lead.name, targetType: 'user', targetId: usersByEmail.get('demo.neha@pragati.local')!._id.toString(), targetLabel: 'Neha Patel (Demo)', summary: 'Updated username, employeeId',
      meta: { changes: { username: { before: 'np', after: 'demo.neha' }, employeeId: { before: '', after: 'DEMO-2002' } }, reason: 'Backfilled identity per AD sync' }, createdAt: days(-14) },
    { action: 'project.create', category: 'project', actorId: lead._id, actorName: lead.name, targetType: 'project', targetLabel: '[DEMO] eQMS Sprint 14', summary: 'Created project', createdAt: days(-9) },
  ]);

  console.log('');
  console.log('  ✓ Demo workspace ready. Sign in with any of these:');
  console.log('');
  console.log('      demo.lead@pragati.local  — Team Lead (best for screen-recordings)');
  console.log('      demo.ic@pragati.local    — Individual Contributor');
  console.log('      …and 13 supporting users (demo.<first>@pragati.local).');
  console.log('');
  console.log(`      Password (all accounts):  ${DEMO_PASSWORD}`);
  console.log('');
  console.log('  Re-run `npm run seed:demo` any time — it replaces only [DEMO]-tagged');
  console.log('  records, never touches your real data.');
  console.log('  Wipe demo data with `npm run seed:demo -- --clean`.');
}

async function main() {
  await connectDB();
  await cleanDemo();
  if (!CLEAN_ONLY) await buildDemo();
  else console.log('[seed:demo] --clean only; not creating new demo records.');
}

main()
  .catch((e) => { console.error('[seed:demo] failed:', e); process.exit(1); })
  .finally(() => mongoose.disconnect());
