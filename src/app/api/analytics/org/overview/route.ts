import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

function calcHealth(done: number, total: number, overdue: number): 'good' | 'at_risk' | 'critical' {
  if (overdue === 0 || total === 0) return 'good';
  return overdue / total > 0.3 ? 'critical' : 'at_risk';
}

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
    const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

    // ── Fetch base data (3 light queries) ────────────────────────────────
    const [allProjects, allUsers, teamDocs] = await Promise.all([
      Project.find({ status: { $ne: 'cancelled' } }).sort({ status: 1, updatedAt: -1 }).lean(),
      User.find({}).sort({ name: 1 }).lean(),
      Team.find({}).lean(),
    ]);

    const teamMap: Record<string, string> = {};
    for (const t of teamDocs) teamMap[String(t._id)] = t.name;

    const projectIds = allProjects.map(p => p._id);

    // ── Single aggregation replaces N × 4 per-project queries ────────────
    const [tasksByProject, globalCounts, userTaskStats] = await Promise.all([
      Task.aggregate([
        { $match: { projectId: { $in: projectIds } } },
        {
          $group: {
            _id: '$projectId',
            taskCount:    { $sum: 1 },
            tasksDone:    { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            tasksOverdue: { $sum: { $cond: [{
              $and: [{ $ne: ['$status', 'done'] }, { $ne: ['$dueDate', null] }, { $lt: ['$dueDate', now] }]
            }, 1, 0] }},
            lastActivity: { $max: '$updatedAt' },
          }
        }
      ]),
      // Global counters (was 9 separate countDocuments)
      Task.aggregate([
        {
          $facet: {
            open:            [{ $match: { status: { $ne: 'done' } } }, { $count: 'n' }],
            overdue:         [{ $match: { status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } } }, { $count: 'n' }],
            gxpOpen:         [{ $match: { status: { $ne: 'done' }, gxpCritical: true } }, { $count: 'n' }],
            qaSignoff:       [{ $match: { requiresQaSignoff: true, qaSignoffAt: null, status: 'done' } }, { $count: 'n' }],
            doneThisMonth:   [{ $match: { status: 'done', completedAt: { $gte: startOfMonth } } }, { $count: 'n' }],
          }
        }
      ]),
      // Per-user stats — single $facet replaces M × 3 queries
      Task.aggregate([
        {
          $facet: {
            open: [
              { $match: { status: { $ne: 'done' }, assigneeId: { $ne: null } } },
              { $group: { _id: '$assigneeId', count: { $sum: 1 } } }
            ],
            overdue: [
              { $match: { status: { $ne: 'done' }, assigneeId: { $ne: null }, dueDate: { $ne: null, $lt: now } } },
              { $group: { _id: '$assigneeId', count: { $sum: 1 } } }
            ],
            doneWeek: [
              { $match: { status: 'done', assigneeId: { $ne: null }, completedAt: { $gte: sevenDaysAgo } } },
              { $group: { _id: '$assigneeId', count: { $sum: 1 } } }
            ],
          }
        }
      ]),
    ]);

    // ── Build lookup maps ─────────────────────────────────────────────────
    const statsMap = new Map(tasksByProject.map((s: any) => [String(s._id), s]));

    const g = globalCounts[0];
    const tasksOpen       = g.open[0]?.n ?? 0;
    const tasksOverdue    = g.overdue[0]?.n ?? 0;
    const gxpCriticalOpen = g.gxpOpen[0]?.n ?? 0;
    const qaSignoffPending = g.qaSignoff[0]?.n ?? 0;
    const doneThisMonth   = g.doneThisMonth[0]?.n ?? 0;

    const uStats = userTaskStats[0];
    const openMap    = new Map((uStats.open    as any[]).map(r => [String(r._id), r.count]));
    const overdueMap = new Map((uStats.overdue as any[]).map(r => [String(r._id), r.count]));
    const weekMap    = new Map((uStats.doneWeek as any[]).map(r => [String(r._id), r.count]));

    // ── Build project list ────────────────────────────────────────────────
    const projects = allProjects.map(p => {
      const s: any = statsMap.get(String(p._id)) ?? { taskCount: 0, tasksDone: 0, tasksOverdue: 0, lastActivity: p.updatedAt };
      const noActivity = s.lastActivity < threeDaysAgo && p.status === 'in_progress';
      return {
        id: String(p._id), name: p.name, code: p.code || '',
        status: p.status, lifecycle: p.lifecycle, dueDate: p.dueDate,
        teamName: teamMap[String(p.teamId)] || 'Unassigned',
        taskCount: s.taskCount, tasksDone: s.tasksDone, tasksOverdue: s.tasksOverdue,
        health: calcHealth(s.tasksDone, s.taskCount, s.tasksOverdue),
        lastActivity: s.lastActivity || p.updatedAt || p.createdAt,
        noActivity,
      };
    });

    // ── Build people list ─────────────────────────────────────────────────
    const people = allUsers.map(u => ({
      id: String(u._id), name: u.name, title: u.title || '', role: u.role,
      openTasks:   openMap.get(String(u._id))    ?? 0,
      overdueTasks: overdueMap.get(String(u._id)) ?? 0,
      doneThisWeek: weekMap.get(String(u._id))    ?? 0,
    }));

    // ── Attention feed ────────────────────────────────────────────────────
    const attention: { severity: 'critical' | 'warn'; label: string; detail: string; href: string }[] = [];
    for (const p of projects) {
      if (p.tasksOverdue > 0)
        attention.push({ severity: p.tasksOverdue >= 3 ? 'critical' : 'warn', label: p.code || p.name, detail: `${p.tasksOverdue} task${p.tasksOverdue > 1 ? 's' : ''} overdue`, href: `/projects/${p.id}` });
      if (p.noActivity)
        attention.push({ severity: 'warn', label: p.code || p.name, detail: 'No activity in 3+ days', href: `/projects/${p.id}` });
    }
    if (gxpCriticalOpen)
      attention.push({ severity: 'critical', label: 'GxP Critical', detail: `${gxpCriticalOpen} open GxP-critical task${gxpCriticalOpen > 1 ? 's' : ''}`, href: '/projects' });
    if (qaSignoffPending)
      attention.push({ severity: 'warn', label: 'QA Sign-off', detail: `${qaSignoffPending} task${qaSignoffPending > 1 ? 's' : ''} awaiting sign-off`, href: '/projects' });
    attention.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));

    return NextResponse.json({
      totals: {
        users: allUsers.length, teams: teamDocs.length,
        projects: allProjects.length,
        activeProjects: allProjects.filter(p => p.status === 'in_progress').length,
        tasksOpen, tasksOverdue, gxpCriticalOpen, qaSignoffPending, doneThisMonth,
        overallHealth: tasksOpen ? Math.round(((tasksOpen - tasksOverdue) / tasksOpen) * 100) : 100,
      },
      projects,
      people,
      attention,
    });
  } catch (e) {
    return handleError(e);
  }
}
