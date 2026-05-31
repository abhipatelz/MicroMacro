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
  kind: 'task' | 'subtask';
}

export interface ContribData {
  year: number;
  firstYear: number;                 // earliest year the person delivered work
  days: Record<string, number>;      // weighted score per YYYY-MM-DD in `year`
  total: number;                     // sum of `days`
  streak: number;                    // consecutive active days up to today
  totalTasksDone: number;            // all-time completed count (drives badges)
  onTimeRate: number;                // 0..100, all-time, for the quality badge
  badges: string[];
  recent: ContribItem[];             // newest-first feed of delivered work
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
  const userOid = new mongoose.Types.ObjectId(userId);
  const start = new Date(`${year}-01-01T00:00:00.000Z`);
  const end   = new Date(`${year + 1}-01-01T00:00:00.000Z`);

  const [yearTasks, totalDone, onTimeAgg, earliest, account] = await Promise.all([
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
  ]);

  // Resolve project labels for the items we'll surface.
  const projectIds = Array.from(new Set(yearTasks.map((t: any) => String(t.projectId)).filter(Boolean)));
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
  const onTimeRate = otRow && otRow.total ? Math.round((otRow.onTime / otRow.total) * 100) : 0;

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

  return {
    year, firstYear, days, total, streak,
    totalTasksDone: totalDone, onTimeRate, badges,
    recent: items.slice(0, 40),
  };
}
