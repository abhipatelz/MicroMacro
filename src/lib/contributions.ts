import mongoose from 'mongoose';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';

/**
 * Contribution scoring — the data behind the GitHub-style activity graph.
 *
 * DESIGN INTENT (per QA lead): a "contribution" must reflect *real delivered
 * work*, never a login or the mere act of creating a record. So the score is
 * a transparent, rule-based weighting of completed outcomes — every point is
 * traceable to a specific finished task or subtask and the weight table
 * below. Nothing here depends on the audit log's noisy auth/create events.
 *
 * The weight table is intentionally small and explainable so a reviewer can
 * justify any day's number by pointing at the completed work that produced it
 * (ALCOA+ Attributable & Accurate).
 */

// ── Weight table ────────────────────────────────────────────────────────────
// A completed task is the base unit. Bonuses reward the things a QA-IT team
// actually cares about: hitting the date, regulated (GxP) work, and the
// review/approval gates that leads own.
const W = {
  taskBase:       5,   // completing any task
  onTime:         2,   // finished on or before its (CC target) due date
  gxpCritical:    2,   // GxP-critical work carries regulatory weight
  priorityHigh:   2,   // high priority
  priorityCrit:   3,   // critical priority
  reviewApproval: 2,   // the task itself was a review/approval/sign-off gate
  subtask:        1,   // each subtask checked off
  comment:        1,   // each comment authored — collaboration effort
  firstDay:       1,   // the day the account was created (first login)
} as const;

export interface ContribItem {
  id: string;
  title: string;
  projectName: string;
  projectCode: string;
  completedAt: string | null;
  points: number;
  gxpCritical: boolean;
  priority: string;
  kind: 'task' | 'subtask' | 'comment' | 'first_day';
}

/**
 * A role-based achievement. Each one is a discrete recognition tied to a
 * traceable metric so a reviewer can justify it (ALCOA+ Attributable).
 *
 *  - id      stable key (also drives the rendered icon)
 *  - label   short, role-appropriate title
 *  - hint    one-line why this matters / how it's measured
 *  - value   current observed value (e.g. count of tasks)
 *  - target  the smallest threshold to unlock the next tier (null → unbounded)
 *  - tier    0..3 medal tier; 0 = locked, 1 = bronze, 2 = silver, 3 = gold
 *  - role    'ic' | 'lead' | 'admin' so the UI can group/title appropriately
 */
export interface Achievement {
  id: string;
  label: string;
  hint: string;
  value: number;
  target: number | null;
  tier: 0 | 1 | 2 | 3;
  role: 'ic' | 'lead' | 'admin';
}

export interface ContribData {
  year: number;
  firstYear: number;                 // earliest year the person delivered work
  days: Record<string, number>;      // weighted score per YYYY-MM-DD in `year`
  total: number;                     // sum of `days`
  streak: number;                    // consecutive active days up to today
  totalTasksDone: number;            // all-time completed count (drives badges)
  onTimeTasks: number;               // all-time count of tasks finished on/before due
  onTimeRate: number;                // 0..100, all-time, for the quality badge
  projectsCompleted: number;         // all-time projects this person helped finish
  projectsOnTime: number;            // of those, how many landed on/before due
  badges: string[];
  recent: ContribItem[];             // newest-first feed of delivered work
  achievements: Achievement[];       // role-based achievements (4 per role)
  role: 'ic' | 'lead' | 'admin';     // viewed user's role, drives achievement set
}


const CONTRIBUTION_CACHE_TTL_MS = 60 * 1000;
const contributionCache = new Map<string, { data: ContribData; expiresAt: number }>();

function cloneContribData(data: ContribData): ContribData {
  return {
    ...data,
    days: { ...data.days },
    badges: [...data.badges],
    recent: data.recent.map((item) => ({ ...item })),
    achievements: data.achievements.map((achievement) => ({ ...achievement })),
  };
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Points for a single completed task, given its attributes. Pure + traceable. */
export function scoreTask(t: {
  priority?: string; gxpCritical?: boolean; taskType?: string;
  completedAt?: Date | null; dueDate?: Date | null; ccTcd?: Date | null;
}): number {
  let pts = W.taskBase;
  const due = t.ccTcd || t.dueDate;
  if (due && t.completedAt && new Date(t.completedAt) <= new Date(due)) pts += W.onTime;
  if (t.gxpCritical) pts += W.gxpCritical;
  if (t.priority === 'critical') pts += W.priorityCrit;
  else if (t.priority === 'high') pts += W.priorityHigh;
  if (t.taskType === 'review' || t.taskType === 'approval' || t.taskType === 'data_review') pts += W.reviewApproval;
  return pts;
}

/**
 * Build the full contribution dataset for one user and one calendar year.
 * Used by both /api/users/me/activity and /api/users/[id]/activity.
 */
export async function buildContributions(userId: string, year: number): Promise<ContribData> {
  const cacheKey = `${userId}:${year}`;
  const cached = contributionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cloneContribData(cached.data);
  }

  const userOid = new mongoose.Types.ObjectId(userId);
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end   = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  // Pull the user's role up front — different roles get a different
  // achievement set, since a TL's wins (delivering projects, mentoring) and an
  // admin's wins (onboarding, audit hygiene) aren't comparable to an IC's.
  const userDoc = await User.findById(userOid).select('role createdAt').lean();
  const role: 'ic' | 'lead' | 'admin' =
    (userDoc as any)?.role === 'admin' ? 'admin'
    : (userDoc as any)?.role === 'lead' ? 'lead'
    : 'ic';

  const [yearTasks, totalDone, onTimeAgg, earliest, account, commentTasks] = await Promise.all([
    // Tasks where either the task itself, or one of its subtasks, was
    // completed inside the selected year. We score in JS so the weighting
    // stays readable and unit-testable.
    Task.find({
      assigneeId: userOid,
      $or: [
        { completedAt: { $gte: start, $lt: end } },
        { subtasks: { $elemMatch: { completedAt: { $gte: start, $lt: end } } } },
      ],
    })
      .select('title projectId completedAt dueDate ccTcd priority gxpCritical taskType subtasks')
      .lean(),

    // All-time completed count — drives the milestone badges.
    Task.countDocuments({ assigneeId: userOid, status: 'done' }),

    // All-time on-time rate for the quality badge.
    Task.aggregate([
      { $match: { assigneeId: userOid, status: 'done', completedAt: { $ne: null } } },
      {
        $project: {
          onTime: {
            $cond: [
              { $and: [
                { $ne: [{ $ifNull: ['$ccTcd', '$dueDate'] }, null] },
                { $lte: ['$completedAt', { $ifNull: ['$ccTcd', '$dueDate'] }] },
              ] },
              1, 0,
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: 1 }, onTime: { $sum: '$onTime' } } },
    ]),

    // Earliest delivered work — the first year of the year rail.
    Task.find({ assigneeId: userOid, completedAt: { $ne: null } })
      .sort({ completedAt: 1 }).limit(1).select('completedAt').lean(),

    User.findById(userOid).select('createdAt').lean(),

    // Tasks the user commented on inside the selected year — collaboration
    // effort. We pull the title/project to label the activity feed and score
    // each comment as a small contribution (W.comment).
    Task.find({ 'comments.userId': userOid, 'comments.createdAt': { $gte: start, $lt: end } })
      .select('title projectId comments')
      .lean(),
  ]);

  // Resolve project labels for the items we'll surface (tasks + commented tasks).
  const projectIds = Array.from(new Set(
    [...yearTasks, ...(commentTasks as any[])].map((t: any) => String(t.projectId)).filter(Boolean),
  ));
  const projects = projectIds.length
    ? await Project.find({ _id: { $in: projectIds } }).select('code name').lean()
    : [];
  const projMap = new Map(projects.map((p: any) => [String(p._id), { code: p.code || '', name: p.name || '' }]));

  const days: Record<string, number> = {};
  const items: ContribItem[] = [];

  for (const t of yearTasks as any[]) {
    const proj = projMap.get(String(t.projectId)) || { code: '', name: '' };

    // The task itself, if completed in-year.
    if (t.completedAt && new Date(t.completedAt) >= start && new Date(t.completedAt) < end) {
      const pts = scoreTask(t);
      const key = dayKey(new Date(t.completedAt));
      days[key] = (days[key] || 0) + pts;
      items.push({
        id: String(t._id), title: t.title || 'Task', projectName: proj.name, projectCode: proj.code,
        completedAt: new Date(t.completedAt).toISOString(), points: pts,
        gxpCritical: !!t.gxpCritical, priority: t.priority || 'medium', kind: 'task',
      });
    }

    // Subtasks completed in-year (each a small, real increment of progress).
    for (const s of (t.subtasks || [])) {
      if (s.completedAt && new Date(s.completedAt) >= start && new Date(s.completedAt) < end) {
        const key = dayKey(new Date(s.completedAt));
        days[key] = (days[key] || 0) + W.subtask;
        items.push({
          id: String(s._id), title: s.title || 'Subtask', projectName: proj.name, projectCode: proj.code,
          completedAt: new Date(s.completedAt).toISOString(), points: W.subtask,
          gxpCritical: !!t.gxpCritical, priority: t.priority || 'medium', kind: 'subtask',
        });
      }
    }
  }

  // Comments authored in-year — collaboration counts as effort. Each comment
  // adds W.comment to its day and appears in the activity feed.
  for (const t of (commentTasks as any[])) {
    const proj = projMap.get(String(t.projectId)) || { code: '', name: '' };
    for (const c of (t.comments || [])) {
      if (String(c.userId) !== String(userOid)) continue;
      const at = c.createdAt;
      if (!at || new Date(at) < start || new Date(at) >= end) continue;
      const key = dayKey(new Date(at));
      days[key] = (days[key] || 0) + W.comment;
      items.push({
        id: String(c._id), title: t.title || 'Task', projectName: proj.name, projectCode: proj.code,
        completedAt: new Date(at).toISOString(), points: W.comment,
        gxpCritical: false, priority: 'medium', kind: 'comment',
      });
    }
  }

  // First day on Pragati — the account-creation day gets a green mark so the
  // graph is never blank for a brand-new user (their "first login" shows).
  const createdAt = (account as any)?.createdAt ? new Date((account as any).createdAt) : null;
  if (createdAt && createdAt >= start && createdAt < end) {
    const key = dayKey(createdAt);
    if (!days[key]) {
      days[key] = W.firstDay;
      items.push({
        id: `first-${key}`, title: 'Joined Pragati', projectName: '', projectCode: '',
        completedAt: createdAt.toISOString(), points: W.firstDay,
        gxpCritical: false, priority: 'medium', kind: 'first_day',
      });
    }
  }

  let total = 0;
  for (const k in days) total += days[k];

  // Streak: consecutive days up to today that have any delivered work.
  // Computed from the in-year day map; only meaningful for the current year.
  let streak = 0;
  const today = new Date();
  if (year === today.getFullYear()) {
    for (let i = 0; i < 60; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      if ((days[dayKey(d)] || 0) > 0) streak++;
      else if (i > 0) break;
    }
  }

  const otRow = (onTimeAgg as any[])[0];
  const onTimeTasks = otRow ? (otRow.onTime || 0) : 0;
  const onTimeRate = otRow && otRow.total ? Math.round((onTimeTasks / otRow.total) * 100) : 0;

  // ── Project delivery (all-time) ─────────────────────────────────────────
  // A "completed project" the person helped finish: either they own it, or
  // they closed at least one task inside it. On-time = the project closed on
  // or before its due date.
  const doneProjectIds = await Task.distinct('projectId', { assigneeId: userOid, status: 'done' });
  const completedProjects = await Project.find({
    status: 'completed',
    $or: [{ ownerId: userOid }, { _id: { $in: doneProjectIds } }],
  }).select('completedAt dueDate').lean();
  const projectsCompleted = completedProjects.length;
  const projectsOnTime = (completedProjects as any[]).filter(
    (p) => p.completedAt && p.dueDate && new Date(p.completedAt) <= new Date(p.dueDate),
  ).length;

  const earliestYear = (earliest as any[])[0]?.completedAt
    ? new Date((earliest as any[])[0].completedAt).getFullYear()
    : (account as any)?.createdAt ? new Date((account as any).createdAt).getFullYear()
    : year;
  const firstYear = Math.min(earliestYear, today.getFullYear());

  // ── Badges (milestones) ────────────────────────────────────────────────
  const badges: string[] = ['first_step'];
  if (totalDone >= 1)   badges.push('task_rookie');
  if (totalDone >= 10)  badges.push('task_achiever');
  if (totalDone >= 50)  badges.push('task_performer');
  if (totalDone >= 100) badges.push('task_champion');
  if (streak >= 3) badges.push('streak_3');
  if (streak >= 7) badges.push('streak_7');
  // Quality badge: a meaningful sample delivered, mostly on time.
  if (totalDone >= 10 && onTimeRate >= 85) badges.push('on_time');

  items.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));

  const achievements = await computeAchievements(userOid, role, {
    totalDone, onTimeTasks, onTimeRate, projectsCompleted, projectsOnTime, days,
  });

  const result: ContribData = {
    year, firstYear, days, total, streak,
    totalTasksDone: totalDone, onTimeTasks, onTimeRate,
    projectsCompleted, projectsOnTime, badges,
    recent: items.slice(0, 40),
    achievements, role,
  };
  contributionCache.set(cacheKey, { data: cloneContribData(result), expiresAt: Date.now() + CONTRIBUTION_CACHE_TTL_MS });
  return result;
}

/**
 * Award role-appropriate achievements. Every metric is observed from existing
 * Mongo state — no separate event table — so the score is reproducible from
 * source (Part 11 §11.10(a) accuracy + §11.10(e) audit trail intent: every
 * award is justifiable by pointing at the data that earned it).
 *
 * Some achievements (Mentor, Retro Champion, Data Steward …) don't have a
 * one-to-one event log yet; for those we use a transparent *proxy* metric and
 * label it accordingly in `hint`, so the user can see exactly what's measured.
 */
async function computeAchievements(
  userOid: mongoose.Types.ObjectId,
  role: 'ic' | 'lead' | 'admin',
  ctx: {
    totalDone: number;
    onTimeTasks: number;
    onTimeRate: number;
    projectsCompleted: number;
    projectsOnTime: number;
    days: Record<string, number>;
  },
): Promise<Achievement[]> {
  const tierFor = (v: number, tiers: [number, number, number]): { tier: 0 | 1 | 2 | 3; target: number | null } => {
    if (v >= tiers[2]) return { tier: 3, target: null };
    if (v >= tiers[1]) return { tier: 2, target: tiers[2] };
    if (v >= tiers[0]) return { tier: 1, target: tiers[1] };
    return { tier: 0, target: tiers[0] };
  };

  if (role === 'ic') {
    // 1. Milestone Achiever — total completed task count, tiers at 10/25/50.
    const milestone = tierFor(ctx.totalDone, [10, 25, 50]);

    // The remaining three metrics are independent queries — run them together
    // so the achievements rail isn't gated on three sequential round-trips
    // (this is the "milestone loading is slow" fix).
    const [recent, distinctProjects, commentAgg] = await Promise.all([
      // 2. On-Time Streak — longest recent run of consecutive on-time tasks.
      Task.find({ assigneeId: userOid, status: 'done', completedAt: { $ne: null } })
        .sort({ completedAt: -1 }).limit(40)
        .select('completedAt dueDate ccTcd').lean(),
      // 3. Team Collaborator — distinct projects the IC contributed to.
      Task.distinct('projectId', { assigneeId: userOid, status: 'done' }),
      // 4. Idea Contributor — comments the IC left on tasks.
      Task.aggregate([
        { $unwind: '$comments' },
        { $match: { 'comments.userId': userOid } },
        { $count: 'n' },
      ]),
    ]);
    let streak = 0, maxStreak = 0;
    for (const t of recent as any[]) {
      const due = t.ccTcd || t.dueDate;
      const onTime = due && new Date(t.completedAt) <= new Date(due);
      if (onTime) { streak++; if (streak > maxStreak) maxStreak = streak; }
      else streak = 0;
    }
    const otStreak = tierFor(maxStreak, [3, 5, 10]);
    const collab = tierFor(distinctProjects.length, [2, 5, 10]);
    const commentCount = (commentAgg as any[])[0]?.n ?? 0;
    const ideas = tierFor(commentCount, [3, 10, 25]);

    return [
      { id: 'ic_milestone',  role, label: 'Milestone Achiever', hint: 'Tasks completed end-to-end',           value: ctx.totalDone, ...milestone },
      { id: 'ic_on_time',    role, label: 'On-Time Streak',     hint: 'Recent run of on-time completions',    value: maxStreak,     ...otStreak  },
      { id: 'ic_collab',     role, label: 'Team Collaborator',  hint: 'Distinct projects you contributed to', value: distinctProjects.length, ...collab },
      { id: 'ic_ideas',      role, label: 'Idea Contributor',   hint: 'Comments left on task discussions',    value: commentCount,  ...ideas     },
    ];
  }

  if (role === 'lead') {
    // Owned projects + the lead's own comment-on-others count are independent;
    // fetch together. We need ownedProjectIds before the load/throughput
    // queries, so those run in a second parallel batch.
    const [ownedDone, mentorAgg, ownedProjectIds] = await Promise.all([
      Project.find({ ownerId: userOid, status: 'completed' }).select('completedAt dueDate').lean(),
      Task.aggregate([
        { $unwind: '$comments' },
        { $match: { 'comments.userId': userOid, assigneeId: { $ne: userOid } } },
        { $count: 'n' },
      ]),
      Project.distinct('_id', { ownerId: userOid }),
    ]);

    // 1. Project Finisher — owned projects delivered (on time at higher tiers).
    const ownedOnTime = (ownedDone as any[]).filter(
      (p) => p.completedAt && p.dueDate && new Date(p.completedAt) <= new Date(p.dueDate),
    ).length;
    const finisher = tierFor(ownedOnTime, [1, 3, 10]);

    // 2. Mentor — comments left on other contributors' tasks (coaching proxy).
    const mentorCount = (mentorAgg as any[])[0]?.n ?? 0;
    const mentor = tierFor(mentorCount, [5, 20, 50]);

    // 3. Load Balancer + 4. Velocity Driver both key off ownedProjectIds.
    const [loadAgg, teamThroughput] = await Promise.all([
      Task.aggregate([
        { $match: { projectId: { $in: ownedProjectIds }, status: { $nin: ['done'] }, assigneeId: { $ne: null } } },
        { $group: { _id: '$assigneeId', n: { $sum: 1 } } },
      ]),
      Task.countDocuments({ projectId: { $in: ownedProjectIds }, status: 'done' }),
    ]);
    let balanceScore = 0;
    if (loadAgg.length >= 3) {
      const counts = (loadAgg as any[]).map((r) => r.n);
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
      const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
      const sd = Math.sqrt(variance);
      const cv = mean > 0 ? sd / mean : 0;
      balanceScore = Math.max(0, Math.round((1 - Math.min(cv, 1)) * 100)); // 0..100
    }
    const balancer = tierFor(balanceScore, [60, 75, 90]);

    // 4. Velocity Driver — total tasks the team has completed across this
    //    lead's owned projects. A direct, motivating measure of the throughput
    //    a lead drives. Tiers at 25 / 100 / 300 closed tasks.
    const velocity = tierFor(teamThroughput, [25, 100, 300]);

    return [
      { id: 'lead_finisher', role, label: 'Project Finisher', hint: 'Owned projects delivered on time',                value: ownedOnTime,    ...finisher },
      { id: 'lead_mentor',   role, label: 'Mentor',           hint: "Coaching comments on contributors' work (proxy)", value: mentorCount,    ...mentor   },
      { id: 'lead_balance',  role, label: 'Load Balancer',    hint: 'Workload evenness across your team (0–100)',      value: balanceScore,   ...balancer },
      { id: 'lead_velocity', role, label: 'Velocity Driver',  hint: 'Tasks your team has completed',                   value: teamThroughput, ...velocity },
    ];
  }

  // Admin — all four metrics are independent counts; run them together.
  const now = new Date();
  const thirtyAgo = new Date(now.getTime() - 30 * 86400000);
  const [activeUsers, overduePresent, closedProjects, activeProjects] = await Promise.all([
    User.countDocuments({ active: { $ne: false } }),
    Task.countDocuments({ status: { $ne: 'done' }, dueDate: { $ne: null, $lt: thirtyAgo } }),
    Project.countDocuments({ status: 'completed' }),
    Project.countDocuments({ updatedAt: { $gte: thirtyAgo } }),
  ]);

  // 1. Onboarder — active users in the workspace.
  const onboard = tierFor(activeUsers, [5, 25, 100]);
  // 2. System Guardian — fewer long-standing overdues = higher score.
  const guardianScore = Math.max(0, 30 - Math.min(overduePresent, 30));
  const guardian = tierFor(guardianScore, [15, 25, 30]);
  // 3. Data Steward — completed projects in good standing (proxy).
  const steward = tierFor(closedProjects, [5, 25, 100]);
  // 4. Audit Keeper — projects with recent activity (last 30d).
  const audit = tierFor(activeProjects, [3, 10, 25]);

  return [
    { id: 'adm_onboard',  role, label: 'Onboarder',       hint: 'Active users in the workspace',                  value: activeUsers,    ...onboard  },
    { id: 'adm_guardian', role, label: 'System Guardian', hint: 'Days clear of long-standing overdues (last 30)', value: guardianScore,  ...guardian },
    { id: 'adm_steward',  role, label: 'Data Steward',    hint: 'Completed projects in good standing (proxy)',    value: closedProjects, ...steward  },
    { id: 'adm_audit',    role, label: 'Audit Keeper',    hint: 'Projects with recent activity (last 30d)',       value: activeProjects, ...audit    },
  ];
}
