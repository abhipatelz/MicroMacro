import { Task } from '@/models/Task';

/**
 * Lightweight momentum stats for one user — the numbers that make progress
 * *felt* (sidebar momentum strip, profile stat tiles) without paying for the
 * full contributions build (which loads every task of the year to score and
 * badge it). Day semantics match lib/contributions: a server-local calendar
 * day with at least one completed task counts as active, and today is allowed
 * to be empty — a streak survives until midnight, it isn't broken at 9am.
 */

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface MomentumStats {
  /** Consecutive active days ending today (or yesterday, pre-first-completion). */
  streak: number;
  doneToday: number;
  doneThisWeek: number; // rolling 7 days
}

export async function momentumStats(userId: string): Promise<MomentumStats> {
  // 120 days of completions is plenty to compute any believable streak and
  // keeps the query small. Capped scan; only the timestamp is fetched.
  const since = new Date();
  since.setDate(since.getDate() - 120);
  const completed = await Task.find(
    { assigneeId: userId, status: 'done', completedAt: { $gte: since } },
    'completedAt',
  ).lean();

  const days = new Set<string>();
  let doneToday = 0;
  let doneThisWeek = 0;
  const now = new Date();
  const todayKey = dayKey(now);
  const weekAgo = now.getTime() - 7 * 86400000;
  for (const t of completed as any[]) {
    if (!t.completedAt) continue;
    const d = new Date(t.completedAt);
    days.add(dayKey(d));
    if (dayKey(d) === todayKey) doneToday++;
    if (d.getTime() >= weekAgo) doneThisWeek++;
  }

  let streak = 0;
  for (let i = 0; i < 120; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (days.has(dayKey(d))) streak++;
    else if (i > 0) break; // empty today doesn't break the run; any older gap does
  }

  return { streak, doneToday, doneThisWeek };
}
