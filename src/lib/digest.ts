import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { DigestSetting, type DigestSettingDoc } from '@/models/DigestSetting';
import { sendEmail, mailerConfigured } from '@/lib/mailer';

/**
 * Daily "tasks due today" email digest.
 *
 * This module is a READ-ONLY projection of existing task data into an email —
 * it never creates, edits, or signs a record, so it sits entirely outside the
 * 21 CFR Part 11 e-record scope. "Due" uses the same effective-due rule as the
 * dashboards and calendar (`ccTcd || dueDate`) and "open" means `status !=
 * 'done'`, so the digest agrees with what every other surface shows.
 *
 * The file is split into PURE helpers (timezone window, bucketing, rendering —
 * no DB, unit-tested in tests/unit/daily-digest.test.ts) and a single DB
 * orchestration entry point (`buildAndSendDailyDigests`).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ = 'Asia/Kolkata';

/* ── Pure helpers ─────────────────────────────────────────────────────────── */

/** Resolve the configured digest timezone (default Asia/Kolkata = IST). */
export function digestTimeZone(): string {
  return process.env.DIGEST_TZ?.trim() || DEFAULT_TZ;
}

/** The provider's free daily send allowance. Defaults to Brevo's free tier
 *  (300/day); override with BREVO_DAILY_CAP when on a paid plan or a different
 *  provider. The scheduled run never attempts more than this many sends, so
 *  the digest can't silently eat into quota other emails may need — and the
 *  admin panel can show exactly how close to the ceiling the workspace is. */
export function digestDailyCap(): number {
  const n = parseInt(process.env.BREVO_DAILY_CAP || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 300;
}

/** Absolute base URL for in-email links, or '' when none is configured (links
 *  are then omitted rather than rendered relative-and-broken). */
export function appBaseUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, '')}`;
  return '';
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `tz`. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce<Record<string, string>>((a, p) => {
    if (p.type !== 'literal') a[p.type] = p.value;
    return a;
  }, {});
  // 'en-US' renders midnight as hour "24"; normalise to 00 so Date.UTC is sane.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +hour, +parts.minute, +parts.second);
  return asUTC - date.getTime();
}

/**
 * The [start, end) of "today" in `tz`, expressed as UTC Date instants.
 * India (the default zone) has no DST, so the boundary is exact; for DST zones
 * the offset is sampled at `now`, which is correct except within the rare hour
 * straddling a transition — acceptable for a once-daily digest.
 */
export function dayWindowInTz(now: Date, tz: string): { start: Date; end: Date } {
  const offset = tzOffsetMs(now, tz);
  const localMidnight = new Date(now.getTime() + offset);
  localMidnight.setUTCHours(0, 0, 0, 0);
  const start = new Date(localMidnight.getTime() - offset);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** Effective due date for a task: the Change-Control target date wins over a
 *  plain due date, matching the dashboards/calendar. */
export function effectiveDue(task: { dueDate?: any; ccTcd?: any }): Date | null {
  const v = task.ccTcd || task.dueDate;
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export type Bucket = 'overdue' | 'today' | 'soon';

export interface DigestTask {
  id: string;
  title: string;
  priority: string | null;
  projectId: string | null;
  bucket: Bucket;
  label: string;
  effDue: Date;
}

export interface DigestSections {
  overdue: DigestTask[];
  today: DigestTask[];
  soon: DigestTask[];
  projectUpdates: { name: string; count: number }[];
}

interface RawTask {
  _id: any;
  title: string;
  priority?: string | null;
  dueDate?: any;
  ccTcd?: any;
  projectId?: any;
}

/** Split a user's open, due-bearing tasks into overdue / today / soon buckets
 *  relative to the day window. Pure — no DB, no settings side-effects. */
export function bucketTasks(
  tasks: RawTask[],
  window: { start: Date; end: Date },
  dueSoonDays: number,
): { overdue: DigestTask[]; today: DigestTask[]; soon: DigestTask[] } {
  const soonEnd = window.end.getTime() + Math.max(0, dueSoonDays) * DAY_MS;
  const overdue: DigestTask[] = [];
  const today: DigestTask[] = [];
  const soon: DigestTask[] = [];

  for (const t of tasks) {
    const eff = effectiveDue(t);
    if (!eff) continue;
    const ms = eff.getTime();
    const base: Omit<DigestTask, 'bucket' | 'label'> = {
      id: String(t._id),
      title: t.title,
      priority: t.priority || null,
      projectId: t.projectId ? String(t.projectId) : null,
      effDue: eff,
    };
    if (ms < window.start.getTime()) {
      const d = Math.max(1, Math.ceil((window.start.getTime() - ms) / DAY_MS));
      overdue.push({ ...base, bucket: 'overdue', label: `Overdue ${d}d` });
    } else if (ms < window.end.getTime()) {
      today.push({ ...base, bucket: 'today', label: 'Today' });
    } else if (ms < soonEnd) {
      const d = Math.max(1, Math.round((ms - window.start.getTime()) / DAY_MS));
      soon.push({ ...base, bucket: 'soon', label: d === 1 ? 'Tomorrow' : `in ${d}d` });
    }
  }

  const byPriority = (a: DigestTask, b: DigestTask) => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const pa = rank[a.priority || 'medium'] ?? 2;
    const pb = rank[b.priority || 'medium'] ?? 2;
    return pa - pb || a.effDue.getTime() - b.effDue.getTime();
  };
  overdue.sort((a, b) => a.effDue.getTime() - b.effDue.getTime());
  today.sort(byPriority);
  soon.sort((a, b) => a.effDue.getTime() - b.effDue.getTime());
  return { overdue, today, soon };
}

/** Does a section set contain anything worth emailing? */
export function digestHasContent(s: DigestSections): boolean {
  return s.overdue.length > 0 || s.today.length > 0 || s.soon.length > 0 || s.projectUpdates.length > 0;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#2563eb',
  low: '#64748b',
};

function renderTaskRow(t: DigestTask, projectName: string | null, appUrl: string): string {
  const titleHtml = escapeHtml(t.title);
  const title = appUrl
    ? `<a href="${appUrl}/tasks/${t.id}" style="color:#1d4ed8;text-decoration:none;">${titleHtml}</a>`
    : titleHtml;
  const proj = projectName ? `<span style="color:#64748b;"> · ${escapeHtml(projectName)}</span>` : '';
  const color = PRIORITY_COLOR[t.priority || 'medium'] || '#64748b';
  const chip = `<span style="display:inline-block;font-size:11px;font-weight:700;color:${color};border:1px solid ${color}33;border-radius:9999px;padding:1px 8px;white-space:nowrap;">${escapeHtml(t.label)}</span>`;
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">${title}${proj}</td>
    <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;">${chip}</td>
  </tr>`;
}

function renderSection(title: string, rows: string, accent: string): string {
  if (!rows) return '';
  return `<div style="margin:0 0 22px;">
    <div style="font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${accent};margin:0 0 6px;">${title}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows}</table>
  </div>`;
}

export interface RenderInput {
  name: string;
  sections: DigestSections;
  projectName: (projectId: string | null) => string | null;
  appUrl: string;
  introNote?: string;
  test?: boolean;
  dateLabel: string;
}

/** Render the personal digest to { subject, html, text }. Pure. */
export function renderDigestEmail(input: RenderInput): { subject: string; html: string; text: string } {
  const { name, sections, projectName, appUrl, introNote, test, dateLabel } = input;
  const first = (name || '').trim().split(/\s+/)[0] || 'there';

  const counts: string[] = [];
  if (sections.today.length) counts.push(`${sections.today.length} due today`);
  if (sections.overdue.length) counts.push(`${sections.overdue.length} overdue`);
  if (sections.soon.length) counts.push(`${sections.soon.length} due soon`);
  const subject = `${test ? '[Test] ' : ''}Pragati — ${counts.join(' · ') || 'nothing due today'}`;

  const row = (t: DigestTask) => renderTaskRow(t, projectName(t.projectId), appUrl);
  const sectionsHtml = [
    renderSection('Overdue', sections.overdue.map(row).join(''), '#b91c1c'),
    renderSection('Due today', sections.today.map(row).join(''), '#0f172a'),
    renderSection('Due soon', sections.soon.map(row).join(''), '#2563eb'),
    sections.projectUpdates.length
      ? renderSection(
          'Project updates (last 24h)',
          sections.projectUpdates
            .map(
              (p) =>
                `<tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#0f172a;">${escapeHtml(p.name)}</td><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;text-align:right;color:#16a34a;font-size:13px;font-weight:700;">${p.count} done</td></tr>`,
            )
            .join(''),
          '#16a34a',
        )
      : '',
  ].join('');

  const emptyNote = digestHasContent(sections)
    ? ''
    : `<div style="font-size:15px;color:#16a34a;font-weight:600;margin:6px 0 18px;">You're all clear — nothing due today. 🎉</div>`;

  const intro =
    introNote && introNote.trim()
      ? `<div style="font-size:14px;color:#334155;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 20px;">${escapeHtml(introNote.trim())}</div>`
      : '';

  const openBtn = appUrl
    ? `<a href="${appUrl}/my-day" style="display:inline-block;background:#1565C0;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:10px 18px;border-radius:10px;">Open My Day</a>`
    : '';

  const manage = appUrl
    ? `<a href="${appUrl}/settings" style="color:#64748b;">your profile settings</a>`
    : 'your profile settings';

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:22px 26px;background:#0f172a;">
        <div style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.02em;">Pragati</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:2px;">${escapeHtml(dateLabel)}${test ? ' · test message' : ''}</div>
      </td></tr>
      <tr><td style="padding:26px;">
        <div style="font-size:16px;color:#0f172a;font-weight:700;margin:0 0 14px;">Good morning, ${escapeHtml(first)} 👋</div>
        ${intro}
        ${emptyNote}
        ${sectionsHtml}
        ${openBtn ? `<div style="margin-top:8px;">${openBtn}</div>` : ''}
      </td></tr>
      <tr><td style="padding:16px 26px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        <div style="font-size:12px;color:#94a3b8;line-height:1.5;">
          You're receiving this because the daily task email is on for your account.
          Turn it off any time in ${manage}.
        </div>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  // Plain-text fallback.
  const lines: string[] = [
    `Pragati — ${dateLabel}${test ? ' (test)' : ''}`,
    '',
    `Good morning, ${first}.`,
    '',
  ];
  const textSection = (heading: string, items: DigestTask[]) => {
    if (!items.length) return;
    lines.push(heading.toUpperCase());
    for (const t of items) {
      const pn = projectName(t.projectId);
      lines.push(`  • [${t.label}] ${t.title}${pn ? ` (${pn})` : ''}`);
    }
    lines.push('');
  };
  textSection('Overdue', sections.overdue);
  textSection('Due today', sections.today);
  textSection('Due soon', sections.soon);
  if (sections.projectUpdates.length) {
    lines.push('PROJECT UPDATES (LAST 24H)');
    for (const p of sections.projectUpdates) lines.push(`  • ${p.name} — ${p.count} done`);
    lines.push('');
  }
  if (!digestHasContent(sections)) lines.push("You're all clear — nothing due today.");
  if (appUrl) lines.push('', `Open My Day: ${appUrl}/my-day`);

  return { subject, html, text: lines.join('\n') };
}

/* ── DB orchestration ─────────────────────────────────────────────────────── */

/** Get the singleton digest settings, creating it with defaults on first use. */
export async function loadDigestSettings(): Promise<DigestSettingDoc> {
  const doc = await DigestSetting.findByIdAndUpdate(
    'global',
    { $setOnInsert: { _id: 'global' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  return doc as unknown as DigestSettingDoc;
}

/** The address a digest should be sent to: the admin-set notifyEmail, falling
 *  back to the login `email` when that is a real (non-placeholder) address. */
export function resolveDigestEmail(user: { notifyEmail?: string | null; email?: string | null }): string {
  const notify = (user.notifyEmail || '').trim();
  if (notify) return notify;
  const login = (user.email || '').trim();
  if (login && !login.endsWith('@pragati.local')) return login;
  return '';
}

export interface RunOptions {
  now?: Date;
  /** Test mode: send only to `onlyUserId`, ignoring opt-in / master-switch /
   *  empty-skip, so an admin can verify delivery end to end. */
  test?: boolean;
  onlyUserId?: string;
}

export interface RunSummary {
  ok: boolean;
  disabled?: boolean;
  tz: string;
  dateLabel: string;
  considered: number;
  sent: number;
  skippedNoEmail: number;
  skippedNoTasks: number;
  /** Recipients not attempted because the free daily send cap was reached. */
  skippedCapReached: number;
  failed: number;
  cap: number;
  mailerConfigured: boolean;
}

export async function buildAndSendDailyDigests(opts: RunOptions = {}): Promise<RunSummary> {
  await connectDB();

  const now = opts.now || new Date();
  const tz = digestTimeZone();
  const window = dayWindowInTz(now, tz);
  const settings = await loadDigestSettings();
  const appUrl = appBaseUrl();
  const dateLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(now);

  const summary: RunSummary = {
    ok: true,
    tz,
    dateLabel,
    considered: 0,
    sent: 0,
    skippedNoEmail: 0,
    skippedNoTasks: 0,
    skippedCapReached: 0,
    failed: 0,
    cap: digestDailyCap(),
    mailerConfigured: mailerConfigured(),
  };

  // Master switch — scheduled runs go quiet when disabled; a test still sends.
  if (!settings.enabled && !opts.test) {
    return { ...summary, disabled: true };
  }

  const recipientFilter = opts.onlyUserId
    ? { _id: new mongoose.Types.ObjectId(opts.onlyUserId) }
    : { active: { $ne: false }, notifDailyDigest: true };

  const users = await User.find(recipientFilter).select('_id name email notifyEmail').limit(1000).lean();

  const recipients = users
    .map((u) => ({ user: u, email: resolveDigestEmail(u as any) }))
    .filter((r) => {
      summary.considered += 1;
      if (!r.email) {
        summary.skippedNoEmail += 1;
        return false;
      }
      return true;
    });

  if (recipients.length === 0) return summary;

  const ids = recipients.map((r) => r.user._id);
  const dueSoonDays = settings.dueSoonDays || 0;
  const upper = new Date(window.end.getTime() + dueSoonDays * DAY_MS);

  // One query for everyone's open, due-bearing tasks up to the look-ahead edge.
  const openTasks = await Task.find({
    assigneeId: { $in: ids },
    status: { $ne: 'done' },
    $or: [{ dueDate: { $lt: upper } }, { ccTcd: { $lt: upper } }],
  })
    .select('_id title priority dueDate ccTcd assigneeId projectId')
    .limit(5000)
    .lean();

  const tasksByUser = new Map<string, RawTask[]>();
  for (const t of openTasks as any[]) {
    const k = String(t.assigneeId);
    (tasksByUser.get(k) || tasksByUser.set(k, []).get(k)!).push(t);
  }

  // Optional project-updates section (admin opt-in, off by default).
  const projectUpdatesByUser = settings.projectUpdates
    ? await computeProjectUpdates(ids, now)
    : new Map<string, { projectId: string; count: number }[]>();

  // Resolve every referenced project name in one round-trip.
  const projectIds = new Set<string>();
  for (const t of openTasks as any[]) if (t.projectId) projectIds.add(String(t.projectId));
  for (const list of projectUpdatesByUser.values()) for (const p of list) projectIds.add(p.projectId);
  const projDocs = projectIds.size
    ? await Project.find({ _id: { $in: [...projectIds] } })
        .select('_id name')
        .lean()
    : [];
  const projName = new Map<string, string>(projDocs.map((p: any) => [String(p._id), p.name]));

  const forceSend = !!opts.test;

  for (const r of recipients) {
    const uid = String(r.user._id);
    const raw = tasksByUser.get(uid) || [];
    const buckets = bucketTasks(raw, window, dueSoonDays);
    const sections: DigestSections = {
      overdue: settings.overdue ? buckets.overdue : [],
      today: settings.dueToday ? buckets.today : [],
      soon: buckets.soon, // soon is implicitly gated by dueSoonDays===0 → empty
      projectUpdates: (projectUpdatesByUser.get(uid) || []).map((p) => ({
        name: projName.get(p.projectId) || 'A project',
        count: p.count,
      })),
    };

    if (!digestHasContent(sections) && !settings.sendWhenEmpty && !forceSend) {
      summary.skippedNoTasks += 1;
      continue;
    }

    // Free-tier guard: never attempt more sends than the provider's daily
    // allowance. Whoever is left over is counted (and surfaced to the admin)
    // rather than silently bounced by the provider. Test sends bypass — they
    // are one email to the admin verifying delivery.
    if (!forceSend && summary.sent >= summary.cap) {
      summary.skippedCapReached += 1;
      continue;
    }

    const { subject, html, text } = renderDigestEmail({
      name: (r.user as any).name || '',
      sections,
      projectName: (pid) => (pid ? projName.get(pid) || null : null),
      appUrl,
      introNote: settings.introNote || '',
      test: opts.test,
      dateLabel,
    });

    const res = await sendEmail({ to: r.email, toName: (r.user as any).name, subject, html, text });
    if (res.ok) summary.sent += 1;
    else summary.failed += 1;
  }

  // Operational record of the last real run, surfaced in the admin panel so
  // the operator can see delivery health (and cap headroom) at a glance.
  // Test sends are excluded — they would overwrite the scheduled run's stats.
  if (!opts.test) {
    await DigestSetting.updateOne(
      { _id: 'global' },
      {
        $set: {
          lastRunAt: now,
          lastRunSummary: {
            considered: summary.considered,
            sent: summary.sent,
            failed: summary.failed,
            skippedNoEmail: summary.skippedNoEmail,
            skippedNoTasks: summary.skippedNoTasks,
            skippedCapReached: summary.skippedCapReached,
            cap: summary.cap,
          },
        },
      },
    ).catch(() => {});
  }

  return summary;
}

/**
 * Per-user "project updates": projects the user is involved in (owns, or has a
 * task assigned in) that had one or more tasks completed in the last 24h.
 * Best-effort and admin-opt-in — kept off the default digest path.
 */
async function computeProjectUpdates(
  ids: mongoose.Types.ObjectId[],
  now: Date,
): Promise<Map<string, { projectId: string; count: number }[]>> {
  const dayAgo = new Date(now.getTime() - DAY_MS);

  const [doneTasks, userTasks, owned] = await Promise.all([
    Task.find({ status: 'done', completedAt: { $gte: dayAgo } })
      .select('projectId')
      .limit(10000)
      .lean(),
    Task.find({ assigneeId: { $in: ids } })
      .select('assigneeId projectId')
      .limit(20000)
      .lean(),
    Project.find({ ownerId: { $in: ids } })
      .select('_id ownerId')
      .limit(5000)
      .lean(),
  ]);

  const completionsByProject = new Map<string, number>();
  for (const t of doneTasks as any[]) {
    if (!t.projectId) continue;
    const k = String(t.projectId);
    completionsByProject.set(k, (completionsByProject.get(k) || 0) + 1);
  }

  const involved = new Map<string, Set<string>>();
  const ensure = (uid: string) => involved.get(uid) || involved.set(uid, new Set()).get(uid)!;
  for (const t of userTasks as any[]) {
    if (t.assigneeId && t.projectId) ensure(String(t.assigneeId)).add(String(t.projectId));
  }
  for (const p of owned as any[]) {
    if (p.ownerId) ensure(String(p.ownerId)).add(String(p._id));
  }

  const out = new Map<string, { projectId: string; count: number }[]>();
  for (const [uid, projectSet] of involved) {
    const list: { projectId: string; count: number }[] = [];
    for (const pid of projectSet) {
      const count = completionsByProject.get(pid);
      if (count) list.push({ projectId: pid, count });
    }
    list.sort((a, b) => b.count - a.count);
    if (list.length) out.set(uid, list.slice(0, 8));
  }
  return out;
}
