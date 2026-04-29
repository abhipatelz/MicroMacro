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
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const stuckThreshold = new Date(now.getTime() - 5 * 86400000);

    // ── Projects ──────────────────────────────────────────────────────────────
    const projects = await Project.find({ status: { $in: ['planning', 'in_progress', 'on_hold'] } }).lean();
    const completedProjects = await Project.find({ status: 'completed' }).sort({ updatedAt: -1 }).limit(10).lean();

    const projectInsights = await Promise.all(
      projects.map(async (p) => {
        const pid = p._id;
        const [total, overdueCount, completedThisWeek, lastCompleted, gxpOverdue] = await Promise.all([
          Task.countDocuments({ projectId: pid, status: { $ne: 'done' } }),
          Task.countDocuments({ projectId: pid, status: { $ne: 'done' }, dueDate: { $lt: now } }),
          Task.countDocuments({ projectId: pid, status: 'done', completedAt: { $gte: weekAgo } }),
          Task.findOne({ projectId: pid, status: 'done' }).sort({ completedAt: -1 }).select('completedAt').lean(),
          Task.countDocuments({ projectId: pid, status: { $ne: 'done' }, gxpCritical: true, dueDate: { $lt: now } }),
        ]);

        const stagnantDays = lastCompleted?.completedAt
          ? Math.floor((now.getTime() - new Date(lastCompleted.completedAt).getTime()) / 86400000)
          : (total > 0 ? 999 : 0);

        const daysUntilDue = p.dueDate
          ? Math.floor((new Date(p.dueDate).getTime() - now.getTime()) / 86400000)
          : null;

        const score = healthScore(overdueCount, total, stagnantDays, gxpOverdue, daysUntilDue, completedThisWeek);
        const label = healthLabel(score);

        const issues: string[] = [];
        if (gxpOverdue > 0) issues.push(`${gxpOverdue} GxP-critical task${gxpOverdue > 1 ? 's' : ''} overdue`);
        if (overdueCount > 0) issues.push(`${overdueCount} task${overdueCount > 1 ? 's' : ''} overdue`);
        if (stagnantDays >= 7 && total > 0) issues.push(`No progress in ${stagnantDays} days`);
        if (daysUntilDue !== null && daysUntilDue <= 5 && daysUntilDue >= 0 && total > 0) issues.push(`Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`);
        if (daysUntilDue !== null && daysUntilDue < 0) issues.push(`Project deadline passed`);
        if (issues.length === 0 && label === 'healthy') issues.push('On track');

        return {
          id: String(p._id),
          name: p.name,
          code: p.code,
          lifecycle: p.lifecycle,
          score,
          health: label,
          openTasks: total,
          overdueCount,
          completedThisWeek,
          stagnantDays,
          daysUntilDue,
          issues,
        };
      })
    );

    // ── People ────────────────────────────────────────────────────────────────
    const users = await User.find({ role: 'employee' }).lean();

    const peopleInsights = await Promise.all(
      users.map(async (u) => {
        const [openTasks, overdueCount, completedThisWeek] = await Promise.all([
          Task.countDocuments({ assigneeId: u._id, status: { $ne: 'done' } }),
          Task.countDocuments({ assigneeId: u._id, status: { $ne: 'done' }, dueDate: { $lt: now } }),
          Task.countDocuments({ assigneeId: u._id, status: 'done', completedAt: { $gte: weekAgo } }),
        ]);
        const loadScore = openTasks + overdueCount * 3;
        const loadLevel: 'healthy' | 'busy' | 'overloaded' =
          loadScore > 15 ? 'overloaded' : loadScore > 8 ? 'busy' : 'healthy';
        return {
          id: String(u._id),
          name: u.name,
          title: u.title || '',
          openTasks,
          overdueCount,
          completedThisWeek,
          loadScore,
          loadLevel,
        };
      })
    );

    // ── Stuck tasks ───────────────────────────────────────────────────────────
    const stuckRaw = await Task.find({
      status: 'in_progress',
      updatedAt: { $lt: stuckThreshold },
    })
      .sort({ updatedAt: 1 })
      .limit(10)
      .lean();

    const stuckTasks = await Promise.all(
      stuckRaw.map(async (t) => {
        const assignee = t.assigneeId
          ? await User.findById(t.assigneeId).select('name').lean()
          : null;
        const project = await Project.findById(t.projectId).select('name code').lean();
        const daysSince = Math.floor((now.getTime() - new Date((t as any).updatedAt).getTime()) / 86400000);
        return {
          id: String(t._id),
          title: t.title,
          assignee: assignee?.name ?? 'Unassigned',
          projectCode: project?.code ?? '',
          projectName: project?.name ?? '',
          daysSince,
          gxpCritical: t.gxpCritical,
        };
      })
    );

    // ── Velocity (last 4 weeks) ───────────────────────────────────────────────
    const velocity = await Promise.all(
      [3, 2, 1, 0].map(async (weeksAgo) => {
        const start = new Date(now.getTime() - (weeksAgo + 1) * 7 * 86400000);
        const end   = new Date(now.getTime() - weeksAgo * 7 * 86400000);
        const count = await Task.countDocuments({ status: 'done', completedAt: { $gte: start, $lt: end } });
        const label = weeksAgo === 0 ? 'This week' : weeksAgo === 1 ? 'Last week' : `${weeksAgo + 1}w ago`;
        return { label, completed: count };
      })
    );

    // ── Natural language brief ────────────────────────────────────────────────
    const criticalProjects = projectInsights.filter((p) => p.health === 'critical');
    const atRiskProjects   = projectInsights.filter((p) => p.health === 'at_risk');
    const overloadedPeople = peopleInsights.filter((p) => p.loadLevel === 'overloaded');
    const totalGxPOverdue  = projectInsights.reduce((a, p) => a + (p.issues.some((i) => i.includes('GxP')) ? 1 : 0), 0);
    const totalCompletedThisWeek = velocity[3].completed;

    const briefLines: string[] = [];

    if (criticalProjects.length > 0)
      briefLines.push(`🔴 ${criticalProjects.length} project${criticalProjects.length > 1 ? 's are' : ' is'} critical — ${criticalProjects.map((p) => p.code).join(', ')}.`);

    if (atRiskProjects.length > 0)
      briefLines.push(`🟡 ${atRiskProjects.length} project${atRiskProjects.length > 1 ? 's are' : ' is'} at risk — ${atRiskProjects.map((p) => p.code).join(', ')}.`);

    if (totalGxPOverdue > 0)
      briefLines.push(`⚠️ ${totalGxPOverdue} GxP-critical task${totalGxPOverdue > 1 ? 's are' : ' is'} overdue. Insist on the Highest Standards.`);

    if (overloadedPeople.length > 0)
      briefLines.push(`🔥 ${overloadedPeople.map((p) => p.name.split(' ')[0]).join(' & ')} ${overloadedPeople.length === 1 ? 'is' : 'are'} overloaded — consider redistributing.`);

    if (stuckTasks.length > 0)
      briefLines.push(`⏸ ${stuckTasks.length} task${stuckTasks.length > 1 ? 's have' : ' has'} been in-progress for 5+ days without movement.`);

    if (totalCompletedThisWeek > 0 && criticalProjects.length === 0)
      briefLines.push(`✅ Team completed ${totalCompletedThisWeek} task${totalCompletedThisWeek > 1 ? 's' : ''} this week — Deliver Results.`);

    if (briefLines.length === 0)
      briefLines.push('✅ All projects are healthy. Team is delivering. Keep the momentum.');

    // ── Completed project archive ─────────────────────────────────────────
    const archive = await Promise.all(
      completedProjects.map(async (p) => {
        const [total, done] = await Promise.all([
          Task.countDocuments({ projectId: p._id }),
          Task.countDocuments({ projectId: p._id, status: 'done' }),
        ]);
        return {
          id: String(p._id), name: p.name, code: p.code, lifecycle: p.lifecycle,
          taskCount: total, tasksDone: done,
          completedAt: (p as any).updatedAt ? new Date((p as any).updatedAt).toISOString() : null,
        };
      })
    );

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
