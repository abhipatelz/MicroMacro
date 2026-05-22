import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { project as projectS, task as taskS } from '@/lib/serialize';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

export const runtime = 'nodejs';

const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };

// Single endpoint that backs the entire lead dashboard.
//
// Visibility is strict per lead:
//   • projects   — owned by the lead OR assigned to a team the lead leads.
//   • tasks      — assigned to the lead.
//   • people     — members of the team(s) the lead leads, including the
//                  lead themselves.
//
// Other leads' projects, tasks, and team members never appear in the
// payload, regardless of the lead's role.
export async function GET(req: NextRequest) {
  try {
    const { user: jwtUser, error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const now     = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const scope = await getLeadScope(jwtUser.sub);
    const projFilter = projectsVisibleFilter(scope);

    // Pull the lead's visible projects first — we then scope every other
    // query by these project IDs so nothing leaks across teams.
    const projects = await Project.find(projFilter).sort({ createdAt: -1 }).lean();
    const visibleProjectIds = projects.map(p => p._id);

    // Now everything else in parallel
    const [myTasks, teamTasksRaw, teams, owners, projectTaskAgg, perUserAgg, users] = await Promise.all([
      Task.find({ assigneeId: scope.userOid }).sort({ status: 1, dueDate: 1 }).lean(),

      // All non-done tasks across visible projects for the Tasks table (limit 60)
      Task.find({
        projectId: { $in: visibleProjectIds },
        status: { $ne: 'done' },
      }).sort({ dueDate: 1 }).limit(60).lean(),

      Team.find({ _id: { $in: scope.teamOids } }).lean(),
      User.find({ _id: { $in: projects.map(p => p.ownerId).filter(Boolean) } }, '_id name').lean(),

      // Per-project rollup, restricted to the lead's visible projects
      Task.aggregate([
        { $match: { projectId: { $in: visibleProjectIds } } },
        {
          $group: {
            _id: '$projectId',
            total:           { $sum: 1 },
            done:            { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            overdue:         { $sum: { $cond: [
              { $and: [
                { $ne: ['$status', 'done'] },
                { $ne: ['$dueDate', null] },
                { $lt: ['$dueDate', now] },
              ] }, 1, 0,
            ] } },
            lastCompletedAt: { $max: { $cond: [{ $eq: ['$status', 'done'] }, '$completedAt', null] } },
          },
        },
      ]),

      // Per-assignee workload — restricted to the lead's team members AND
      // the lead's visible projects, so we never count tasks on other
      // teams' projects even if a member happens to be assigned there.
      Task.aggregate([
        { $match: {
          projectId:  { $in: visibleProjectIds },
          assigneeId: { $in: scope.memberOids },
        } },
        {
          $facet: {
            open: [
              { $match: { status: { $ne: 'done' } } },
              { $group: { _id: '$assigneeId', c: { $sum: 1 } } },
            ],
            overdue: [
              { $match: { status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } } },
              { $group: { _id: '$assigneeId', c: { $sum: 1 } } },
            ],
            doneWeek: [
              { $match: { status: 'done', completedAt: { $gte: weekAgo } } },
              { $group: { _id: '$assigneeId', c: { $sum: 1 } } },
            ],
          },
        },
      ]),

      // Only the lead and their team members appear in the workload table
      User.find({ _id: { $in: scope.memberOids } }).lean(),
    ]);

    // Build assignee lookup for team tasks
    const assigneeIds = [...new Set(teamTasksRaw.map(t => t.assigneeId).filter(Boolean).map(String))];
    const assigneeUsers = assigneeIds.length
      ? await User.find({ _id: { $in: assigneeIds } }, '_id name').lean()
      : [];
    const assigneeMap = new Map(assigneeUsers.map(u => [String(u._id), u.name]));

    // ── Lookups ──────────────────────────────────────────────────────────
    const teamName  = new Map(teams.map(t => [String(t._id), t.name]));
    const ownerName = new Map(owners.map(u => [String(u._id), u.name]));
    const projStats = new Map(projectTaskAgg.map((s: any) => [String(s._id), s]));

    // ── Projects payload ─────────────────────────────────────────────────
    const projectList = projects.map(p => {
      const s: any = projStats.get(String(p._id)) ?? { total: 0, done: 0, overdue: 0, lastCompletedAt: null };
      const open   = s.total - s.done;
      const stagnantDays = s.lastCompletedAt
        ? Math.floor((now.getTime() - new Date(s.lastCompletedAt).getTime()) / 86400000)
        : open > 0 ? 999 : 0;
      const daysUntilDue = p.dueDate ? Math.floor((new Date(p.dueDate).getTime() - now.getTime()) / 86400000) : null;

      let health: 'healthy' | 'at_risk' | 'critical' = 'healthy';
      if (s.overdue >= 3 || (daysUntilDue !== null && daysUntilDue < 0 && open > 0)) health = 'critical';
      else if (s.overdue > 0 || stagnantDays >= 7 || (daysUntilDue !== null && daysUntilDue <= 5 && open > 0)) health = 'at_risk';

      return {
        ...projectS(p, {
          teamName:  teamName.get(String(p.teamId)) || null,
          ownerName: ownerName.get(String(p.ownerId)) || null,
          taskCount: s.total,
          tasksDone: s.done,
        }),
        openTasks:    open,
        overdueCount: s.overdue,
        health,
      };
    });

    // ── My tasks (sorted, enriched with project code/name) ───────────────
    const projMap = new Map(projects.map(p => [String(p._id), p]));
    const sortedTasks = myTasks.sort((a, b) => {
      const s = (STATUS_ORDER[a.status || ''] || 9) - (STATUS_ORDER[b.status || ''] || 9);
      if (s !== 0) return s;
      return (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) -
             (b.dueDate ? new Date(b.dueDate).getTime() : Infinity);
    });
    const taskList = sortedTasks.map(t => {
      const p = projMap.get(String(t.projectId));
      return taskS(t, { projectCode: p?.code, projectName: p?.name, lifecycle: p?.lifecycle });
    });

    // ── Team tasks (all non-done across visible projects) ────────────────
    const teamTasks = teamTasksRaw.map(t => {
      const p = projMap.get(String(t.projectId));
      return {
        id:           String(t._id),
        title:        t.title,
        status:       t.status,
        priority:     t.priority,
        dueDate:      t.dueDate ?? null,
        ccTcd:        (t as any).ccTcd ?? null,
        projectId:    String(t.projectId),
        projectCode:  p?.code ?? '',
        projectName:  p?.name ?? '',
        assigneeId:   t.assigneeId ? String(t.assigneeId) : null,
        assigneeName: t.assigneeId ? (assigneeMap.get(String(t.assigneeId)) ?? null) : null,
        subtaskCount: ((t as any).subtasks || []).length,
        subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length,
        gxpCritical:  !!(t as any).gxpCritical,
      };
    });

    // ── People workload (lead + team members only) ───────────────────────
    const f       = perUserAgg[0];
    const openMap = new Map((f.open     as any[]).map(r => [String(r._id), r.c]));
    const ovMap   = new Map((f.overdue  as any[]).map(r => [String(r._id), r.c]));
    const doneMap = new Map((f.doneWeek as any[]).map(r => [String(r._id), r.c]));

    const people = users.map(u => {
      const uid = String(u._id);
      const openTasks         = (openMap.get(uid) as number) ?? 0;
      const overdueCount      = (ovMap.get(uid) as number) ?? 0;
      const completedThisWeek = (doneMap.get(uid) as number) ?? 0;
      const loadScore         = openTasks + overdueCount * 3;
      const loadLevel: 'healthy' | 'busy' | 'overloaded' =
        loadScore > 15 ? 'overloaded' : loadScore > 8 ? 'busy' : 'healthy';
      return {
        id:                uid,
        name:              u.name,
        title:             u.title || '',
        openTasks,
        overdueCount,
        completedThisWeek,
        loadScore,
        loadLevel,
      };
    }).sort((a, b) => b.loadScore - a.loadScore);

    return NextResponse.json(
      {
        user: {
          id:    jwtUser.sub,
          name:  jwtUser.name,
          email: jwtUser.email,
          role:  jwtUser.role,
        },
        projects:  projectList,
        tasks:     taskList,
        teamTasks,
        people,
      },
      {
        headers: {
          'Cache-Control': 'private, max-age=10, stale-while-revalidate=60',
        },
      },
    );
  } catch (e) {
    return handleError(e);
  }
}
