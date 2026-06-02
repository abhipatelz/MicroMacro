/**
 * IDP demo seed — a large, realistic dataset for exploring Pragati end-to-end.
 *
 * Source: a real "IDP Action Plan" workbook (an e-logbook / LIMS quality
 * improvement programme), anonymised — every real colleague name has been
 * replaced by a stable synthetic persona (see scripts/idp-dataset.json,
 * generated once and committed). No real personal data ships in the repo.
 *
 * What it creates:
 *   • ONE admin account (your login) that can see the whole programme. Because
 *     project visibility in Pragati is team-scoped for every role — including
 *     admin (see src/lib/leadScope.ts) — the admin is added as a MEMBER of both
 *     seed teams so the entire dataset is visible after login.
 *   • ~11 synthetic contributor/lead personas (assignable, data-only).
 *   • 2 teams grouping those personas.
 *   • 16 projects (the IDP topics A01…A20) with GAMP-style phases.
 *   • ~79 tasks mapped into phases, with status / priority / dates / GxP flags
 *     derived from the source plan.
 *
 * Run:  npm run seed:idp
 * Then log in with the credentials printed at the end.
 *
 * SAFETY: like scripts/seed.ts this CLEARS the User/Team/Project/Task
 * collections first. Never point it at a database you care about.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { User } from '../src/models/User';
import { Team } from '../src/models/Team';
import { Project } from '../src/models/Project';
import { Task } from '../src/models/Task';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface DatasetTask {
  title: string; phase: string; status: 'todo' | 'in_progress' | 'done';
  assignees: string[]; startDate: string | null; dueDate: string | null;
  gxp: boolean; qa: boolean; remarks: string;
}
interface DatasetProject {
  code: string; name: string; lifecycle: string; priority: string;
  status: string; startDate: string | null; dueDate: string | null;
  gxpImpact: string; sizeLabel: string; phases: string[]; tasks: DatasetTask[];
}
interface Dataset { personas: string[]; projects: DatasetProject[]; }

// ── Persona → role/title. Two personas lead the teams; the rest contribute. ──
const PERSONA_META: Record<string, { role: 'lead' | 'contributor'; title: string }> = {
  'Jordan Lee':    { role: 'lead',        title: 'Senior Developer / eLogbook Lead' },
  'Drew Bennett':  { role: 'lead',        title: 'Validation Lead' },
  'Alex Rivera':   { role: 'contributor', title: 'Business Analyst' },
  'Sam Carter':    { role: 'contributor', title: 'Business Analyst' },
  'Taylor Morgan': { role: 'contributor', title: 'Developer' },
  'Casey Brooks':  { role: 'contributor', title: 'Infrastructure Engineer' },
  'Jamie Quinn':   { role: 'contributor', title: 'Developer' },
  'Riley Shaw':    { role: 'contributor', title: 'Test Engineer' },
  'Morgan Ellis':  { role: 'contributor', title: 'Validation Specialist' },
  'Avery Cole':    { role: 'contributor', title: 'Validation Engineer' },
  'Jesse Park':    { role: 'contributor', title: 'Change Control Lead' },
};

const emailFor = (name: string) =>
  name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@pragati.local';
const usernameFor = (name: string) =>
  name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 16);

const toDate = (s: string | null | undefined) => (s ? new Date(s) : undefined);

async function main() {
  const dataset: Dataset = JSON.parse(
    readFileSync(join(__dirname, 'idp-dataset.json'), 'utf8'),
  );

  await connectDB();
  console.log('[seed:idp] clearing collections…');
  await Promise.all([
    User.deleteMany({}), Team.deleteMany({}),
    Project.deleteMany({}), Task.deleteMany({}),
  ]);

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // ── Admin (your login) ────────────────────────────────────────────────
  const ADMIN_PW = 'admin@1234';
  const admin = await User.create({
    email: 'admin@pragati.local',
    username: 'admin',
    name: 'Workspace Admin',
    passwordHash: hash(ADMIN_PW),
    role: 'admin',
    title: 'Workspace Administrator',
    organisation: 'Quality Informatics',
  });

  // ── Personas ──────────────────────────────────────────────────────────
  console.log('[seed:idp] creating personas…');
  const DEFAULT_PW = 'demo@1234';
  const byName: Record<string, any> = {};
  for (const name of dataset.personas) {
    const meta = PERSONA_META[name] || { role: 'contributor', title: 'Team Member' };
    byName[name] = await User.create({
      email: emailFor(name),
      username: usernameFor(name),
      name,
      passwordHash: hash(DEFAULT_PW),
      role: meta.role,
      title: meta.title,
      organisation: 'Quality Informatics',
      department: meta.title.includes('Validation') ? 'Validation & QA'
        : meta.title.includes('Analyst') ? 'Business Analysis'
        : 'Engineering',
    });
  }
  const idOf = (name: string) => byName[name]?._id;

  // ── Teams (admin is a member of each so the whole dataset is visible) ──
  console.log('[seed:idp] creating teams…');
  const engMembers = dataset.personas;                       // everyone
  const valMembers = ['Drew Bennett', 'Morgan Ellis', 'Avery Cole', 'Jesse Park'];
  const engTeam = await Team.create({
    name: 'eLogbook IDP Program',
    description: 'Cross-functional programme delivering the e-logbook improvement plan (A01–A20).',
    leadId: idOf('Jordan Lee'),
    memberIds: [admin._id, ...engMembers.map(idOf)],
    function: 'csv_validation',
  });
  const valTeam = await Team.create({
    name: 'Validation & Quality',
    description: 'Validation, qualification and change-control for the IDP programme.',
    leadId: idOf('Drew Bennett'),
    memberIds: [admin._id, ...valMembers.map(idOf)],
    function: 'data_integrity',
  });

  // Validation-flavoured topics are owned by the Validation team; the rest by
  // the engineering programme team. Either way admin (a member of both) sees all.
  const VAL_CODES = new Set(['A05', 'A09', 'A10']);

  // ── Projects + phases + tasks ─────────────────────────────────────────
  console.log('[seed:idp] creating projects & tasks…');
  let taskCount = 0;
  for (const p of dataset.projects) {
    const team = VAL_CODES.has(p.code) ? valTeam : engTeam;
    const proj = await Project.create({
      code: p.code,
      name: p.name,
      description: `${p.sizeLabel ? p.sizeLabel + ' · ' : ''}Imported from the IDP action plan.`,
      lifecycle: p.lifecycle,
      status: p.status,
      priority: p.priority,
      teamId: team._id,
      ownerId: team.leadId,
      startDate: toDate(p.startDate),
      dueDate: toDate(p.dueDate),
      gxpImpact: p.gxpImpact,
      regulatoryRefs: '21 CFR Part 11; GAMP 5; ALCOA+',
      phases: p.phases.map((name, i) => ({ name, position: i })),
    });

    // Map phase name → the _id Mongoose assigned on save.
    const phaseId: Record<string, any> = {};
    for (const ph of proj.phases as any[]) phaseId[ph.name] = ph._id;

    const docs = p.tasks.map((t, i) => {
      const primary = t.assignees[0] ? idOf(t.assignees[0]) : undefined;
      const others = t.assignees.slice(1);
      const remarkParts = [t.remarks, others.length ? `Also: ${others.join(', ')}` : '']
        .filter(Boolean);
      const isDone = t.status === 'done';
      return {
        projectId: proj._id,
        phaseId: phaseId[t.phase],
        position: i,
        title: t.title,
        description: '',
        assigneeId: primary,
        status: t.status,
        priority: p.priority,
        taskType: t.qa ? 'approval' : t.gxp ? 'test' : 'task',
        gxpCritical: t.gxp,
        requiresQaSignoff: t.qa,
        qaSignoffUserId: isDone && t.qa ? idOf('Drew Bennett') : undefined,
        qaSignoffAt: isDone && t.qa ? toDate(t.dueDate) : undefined,
        startDate: toDate(t.startDate),
        dueDate: toDate(t.dueDate),
        completedAt: isDone ? (toDate(t.dueDate) || new Date()) : undefined,
        remarks: remarkParts.join(' — '),
        lastActivityAt: new Date(),
      };
    });
    if (docs.length) {
      await Task.insertMany(docs);
      taskCount += docs.length;
    }
  }

  console.log('\n[seed:idp] ✓ done');
  console.log(`  users:    ${dataset.personas.length + 1} (1 admin + ${dataset.personas.length} personas)`);
  console.log(`  teams:    2`);
  console.log(`  projects: ${dataset.projects.length}`);
  console.log(`  tasks:    ${taskCount}`);
  console.log('\n  ── Log in as ──────────────────────────────');
  console.log(`  Admin:   admin@pragati.local  /  ${ADMIN_PW}`);
  console.log(`  Persona: <name>@pragati.local /  ${DEFAULT_PW}  (e.g. jordan.lee@pragati.local)`);
  console.log('  ───────────────────────────────────────────\n');

  await mongoose.connection.close();
}

main().catch((e) => {
  console.error('[seed:idp] failed:', e);
  process.exit(1);
});
