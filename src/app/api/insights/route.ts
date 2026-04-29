import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

function healthScore(overdue: number, total: number, stagnantDays: number, gxpOverdue: number, daysUntilDue: number | null, completedThisWeek: number): number {
  let score = 100;
  if (total > 0) score -= Math.min(40, Math.round((overdue / total) * 80));
  if (stagnantDays >= 7) score -= 15;
  if (gxpOverdue > 0) score -= 25;
  if (daysUntilDue !== null && daysUntilDue <= 7 && total > 0 && (total - overdue) / total < 0.5) score -= 10;
  if (completedThisWeek >= 3) score += 8;
  return Math.max(0, Math.min(100, score));
}

function healthLabel(score: number): 'healthy' | 'at_risk' | 'critical' {
  if (score >= 70) return 'healthy';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'pm');
    if (error) return error;
    await connectDB();

    const now = new Date();
    const weekAgo      = new Date(now.getTime() - 7 * 86400000);
    const stuckThreshold = new Date(now.getTime() - 5 * 86400000);

    // ── Base data ──────────────────────────────────────────────────────────
    const [activeProjects, completedProjects, users] = await Promise.all([
      Project.find({ status: { $in: ['planning', 'in_progress', 'on_hold'] } }).lean(),
      Project.find({ status: 'completed' }).sort({ updatedAt: -1 }).limit(10).lean(),
      User.find({ role: 'employee' }).lean(),
    ]);

    const projectIds = activeProjects.map(p => p._id);
    const userIds    = users.map(u => u._id);

    // ── Single aggregation replaces N × 5 per-project queries ─────────────
    const [projectAgg, peopleAgg, stuckRaw, velocityAgg, archiveAgg] = await Promise.all([
      Task.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        {
          $group: {
            _id: '$projectId',
            total:            { $sum: 1 },
            openCount:        { $sum: { $cond: [{ $ne: ['$status', 'done'] }, 1, 0] } },
            overdueCount:     { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'done'] }, { $ne: ['$dueDate', null] }, { $lt: ['$dueDate', now] }] }, 1, 0] }},
            completedThisWeek:{ $sum: { $cond: [{ $and: [{ $eq: ['$status', 'done'] }, { $gte: ['$completedAt', weekAgo] }] }, 1, 0] }},
            gxpOverdue:       { $sum: { $cond: [{ $and: [{ $ne: ['$status', 'done'] }, { $eq: ['$gxpCritical', true] }, { $lt: ['$dueDate', now] }] }, 1, 0] }},
            lastCompletedAt:  { $max: { $cond: [{ $eq: ['$status', 'done'] }, '$completedAt', null] } },
          }
        }
      ]),
      // Per-user load — single facet replaces M × 3 queries
      Task.aggregate([
        {
          $facet: {
            open: [
              { $match: { assigneeId: { $in: userIds }, status: { $ne: 'done' } } },
              { $group: { _id: '$assigneeId', count: { $sum: 1 } } }
            ],
            overdue: [
              { $match: { assigneeId: { $in: userIds }, status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } } },
              { $group: { _id: '$assigneeId', count: { $sum: 1 } } }
            ],
            done: [
              { $match: { assigneeId: { $in: userIds }, status: 'done', completedAt: { $gte: weekAgo } } },
              { $group: { _id: '$assigneeId', count: { $sum: 1 } } }
            ],
          }
        }
      ]),
      // Stuck tasks — one query
      Task.find({ status: 'in_progress', updatedAt: { $lt: stuckThreshold } })
        .sort({ updatedAt: 1 }).limit(10).lean(),
      // Velocity last 4 weeks — one aggregation
      Task.aggregate([
        { $match: { status: 'done', completedAt: { $gte: new Date(now.getTime() - 4 * 7 * 86400000) } } },
        {
          $group: {
            _id: {
              $floor: { $divide: [{ $subtract: [now, '$completedAt'] }, 7 * 86400000] }
            },
            completed: { $sum: 1 }
          }
        }
      ]),
      // Archive task counts
      Task.aggregate([
        { $match: { projectId: { $in: completedProjects.map(p => p._id) } } },
        {
          $group: {
            _id: '$projectId',
            taskCount: { $sum: 1 },
            tasksDone: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          }
        }
      ]),
    ]);

    // ── Build lookup maps ──────────────────────────────────────────────────
    const projStatsMap = new Map(projectAgg.map((s: any) => [String(s._id), s]));

    const u = peopleAgg[0];
    const openMap    = new Map((u.open    as any[]).map(r => [String(r._id), r.count]));
    const overdueMap = new Map((u.overdue as any[]).map(r => [String(r._id), r.count]));
    const doneMap    = new Map((u.done    as any[]).map(r => [String(r._id), r.count]));

    const velMap = new Map((velocityAgg as any[]).map(v => [v._id, v.completed]));
    const archiveMap = new Map((archiveAgg as any[]).map(a => [String(a._id), a]));

    // ── Build project insights ─────────────────────────────────────────────
    const projectInsights = activeProjects.map(p => {
      const s: any = projStatsMap.get(String(p._id)) ?? { total: 0, openCount: 0, overdueCount: 0, completedThisWeek: 0, gxpOverdue: 0, lastCompletedAt: null };
      const stagnantDays = s.lastCompletedAt
        ? Math.floor((now.getTime() - new Date(s.lastCompletedAt).getTime()) / 86400000)
        : s.openCount > 0 ? 999 : 0;
      const daysUntilDue = p.dueDate ? Math.floor((new Date(p.dueDate).getTime() - now.getTime()) / 86400000) : null;
      const score = healthScore(s.overdueCount, s.openCount, stagnantDays, s.gxpOverdue, daysUntilDue, s.completedThisWeek);
      const label = healthLabel(score);
      const issues: string[] = [];
      if (s.gxpOverdue > 0) issues.push(`${s.gxpOverdue} GxP-critical task${s.gxpOverdue > 1 ? 's' : ''} overdue`);
      if (s.overdueCount > 0) issues.push(`${s.overdueCount} task${s.overdueCount > 1 ? 's' : ''} overdue`);
      if (stagnantDays >= 7 && s.openCount > 0) issues.push(`No progress in ${stagnantDays} days`);
      if (daysUntilDue !== null && daysUntilDue <= 5 && daysUntilDue >= 0 && s.openCount > 0) issues.push(`Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`);
      if (daysUntilDue !== null && daysUntilDue < 0) issues.push('Project deadline passed');
      if (issues.length === 0 && label === 'healthy') issues.push('On track');
      return { id: String(p._id), name: p.name, code: p.code, lifecycle: p.lifecycle, score, health: label, openTasks: s.openCount, overdueCount: s.overdueCount, completedThisWeek: s.completedThisWeek, stagnantDays, daysUntilDue, issues };
    });

    // ── Build people insights ──────────────────────────────────────────────
    const peopleInsights = users.map(u => {
      const uid = String(u._id);
      const openTasks       = openMap.get(uid)    ?? 0;
      const overdueCount    = overdueMap.get(uid)  ?? 0;
      const completedThisWeek = doneMap.get(uid)   ?? 0;
      const loadScore       = openTasks + overdueCount * 3;
      const loadLevel: 'healthy' | 'busy' | 'overloaded' = loadScore > 15 ? 'overloaded' : loadScore > 8 ? 'busy' : 'healthy';
      return { id: uid, name: u.name, title: u.title || '', openTasks, overdueCount, completedThisWeek, loadScore, loadLevel };
    });

    // ── Stuck tasks (enrich with names) ───────────────────────────────────
    const userLookup = new Map(users.map(u => [String(u._id), u.name]));
    const projectLookup = new Map(activeProjects.map(p => [String(p._id), p]));
    const stuckTasks = (stuckRaw as any[]).map(t => ({
      id: String(t._id), title: t.title,
      assignee: userLookup.get(String(t.assigneeId)) ?? 'Unassigned',
      projectCode: projectLookup.get(String(t.projectId))?.code ?? '',
      projectName: projectLookup.get(String(t.projectId))?.name ?? '',
      daysSince: Math.floor((now.getTime() - new Date(t.updatedAt).getTime()) / 86400000),
      gxpCritical: t.gxpCritical,
    }));

    // ── Velocity ──────────────────────────────────────────────────────────
    const velocity = [3, 2, 1, 0].map(weeksAgo => ({
      label: weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo + 1}w ago`,
      completed: velMap.get(weeksAgo) ?? 0,
    }));

    // ── Archive ───────────────────────────────────────────────────────────
    const archive = completedProjects.map(p => {
      const a: any = archiveMap.get(String(p._id)) ?? { taskCount: 0, tasksDone: 0 };
      return { id: String(p._id), name: p.name, code: p.code, lifecycle: p.lifecycle, taskCount: a.taskCount, tasksDone: a.tasksDone, completedAt: (p as any).updatedAt };
    });

    // ── Brief ─────────────────────────────────────────────────────────────
    const criticalProjects  = projectInsights.filter(p => p.health === 'critical');
    const atRiskProjects    = projectInsights.filter(p => p.health === 'at_risk');
    const overloadedPeople  = peopleInsights.filter(p => p.loadLevel === 'overloaded');
    const totalGxPOverdue   = projectInsights.reduce((a, p) => a + (p.issues.some(i => i.includes('GxP')) ? 1 : 0), 0);
    const totalDoneThisWeek = velocity[3].completed;
    const briefLines: string[] = [];
    if (criticalProjects.length > 0) briefLines.push(`🔴 ${criticalProjects.length} project${criticalProjects.length > 1 ? 's are' : ' is'} critical — ${criticalProjects.map(p => p.code).join(', ')}.`);
    if (atRiskProjects.length > 0)   briefLines.push(`🟡 ${atRiskProjects.length} project${atRiskProjects.length > 1 ? 's are' : ' is'} at risk — ${atRiskProjects.map(p => p.code).join(', ')}.`);
    if (totalGxPOverdue > 0)          briefLines.push(`⚠️ ${totalGxPOverdue} GxP-critical task${totalGxPOverdue > 1 ? 's are' : ' is'} overdue. Insist on the Highest Standards.`);
    if (overloadedPeople.length > 0)  briefLines.push(`🔥 ${overloadedPeople.map(p => p.name.split(' ')[0]).join(' & ')} ${overloadedPeople.length === 1 ? 'is' : 'are'} overloaded — consider redistributing.`);
    if (stuckTasks.length > 0)        briefLines.push(`⏸ ${stuckTasks.length} task${stuckTasks.length > 1 ? 's have' : ' has'} been in-progress for 5+ days without movement.`);
    if (totalDoneThisWeek > 0 && criticalProjects.length === 0) briefLines.push(`✅ Team completed ${totalDoneThisWeek} task${totalDoneThisWeek > 1 ? 's' : ''} this week — Deliver Results.`);
    if (briefLines.length === 0) briefLines.push('✅ All projects are healthy. Team is delivering. Keep the momentum.');

    return NextResponse.json({
      brief: briefLines,
      projects: projectInsights.sort((a, b) => a.score - b.score),
      people: peopleInsights.sort((a, b) => b.loadScore - a.loadScore),
      stuckTasks,
      velocity,
      archive,
    });
  } catch (e) {
    return handleError(e);
  }
}
