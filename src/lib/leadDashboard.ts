import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { project as projectS, task as taskS, date as toIso } from '@/lib/serialize';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };

export interface LeadDashboardData {
  user:      { id: string; name: string; email: string; role: string };
  projects:  any[];
  tasks:     any[];
  teamTasks: any[];
  people:    any[];
  teamCount: number;
}

// Pure data fetcher — used by both the API route and the server-rendered
// dashboard page. Centralising it lets the App Router stream the initial HTML
// without a client-side round-trip.
export async function getLeadDashboardData(
  jwtUser: { sub: string; name: string; email: string; role: string },
): Promise<LeadDashboardData> {
  await connectDB();

  const now     = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const scope = await getLeadScope(jwtUser.sub, jwtUser.role);
  // Archived projects stay in the DB for the audit trail but are hidden
  // from the dashboard — operators never want them clouding "what's on".
  const projFilter = { ...projectsVisibleFilter(scope), archived: { $ne: true } };

  const projects = await Project.find(projFilter).sort({ createdAt: -1 }).lean();
  const visibleProjectIds = projects.map(p => p._id);
  const visibleTaskPrivacyFilter = { $or: [{ privateToUserId: null }, { privateToUserId: { $exists: false } }, { privateToUserId: scope.userOid }] };

  const [myTasks, teamTasksRaw, teams, owners, projectTaskAgg, perUserAgg, users] = await Promise.all([
    // "My tasks" stays sorted by status so the IC's side panel keeps its
    // pipeline grouping.
    Task.find({ assigneeId: scope.userOid, ...visibleTaskPrivacyFilter }).sort({ status: 1, dueDate: 1 }).lean(),
    // Project task lists are ordered by CC Target Completion Date (TCD), then
    // due date — the nearest deadline first. The dashboard re-sorts the same
    // way client-side, so the order is deterministic for every viewer and
    // carries no hidden per-user state.
    Task.find({ projectId: { $in: visibleProjectIds }, ...visibleTaskPrivacyFilter })
      .sort({ ccTcd: 1, dueDate: 1, createdAt: 1 })
      .limit(500)
      .lean(),
    Team.find({ _id: { $in: scope.teamOids } }).lean(),
    User.find({ _id: { $in: projects.map(p => p.ownerId).filter(Boolean) } }, '_id name').lean(),
    Task.aggregate([
      { $match: { projectId: { $in: visibleProjectIds }, ...visibleTaskPrivacyFilter } },
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
    Task.aggregate([
      { $match: { projectId: { $in: visibleProjectIds }, assigneeId: { $in: scope.memberOids }, ...visibleTaskPrivacyFilter } },
      {
        $facet: {
          open:     [{ $match: { status: { $ne: 'done' } } }, { $group: { _id: '$assigneeId', c: { $sum: 1 } } }],
          overdue:  [{ $match: { status: { $ne: 'done' }, dueDate: { $ne: null, $lt: now } } }, { $group: { _id: '$assigneeId', c: { $sum: 1 } } }],
          doneWeek: [{ $match: { status: 'done', completedAt: { $gte: weekAgo } } }, { $group: { _id: '$assigneeId', c: { $sum: 1 } } }],
        },
      },
    ]),
    // Exclude the admin — they own the workspace, not assignable work, so
    // they never belong in the contributor-workload list.
    User.find({ _id: { $in: scope.memberOids }, role: { $ne: 'admin' } }).lean(),
  ]);

  const assigneeIds = [...new Set(teamTasksRaw.map(t => t.assigneeId).filter(Boolean).map(String))];
  const assigneeUsers = assigneeIds.length
    ? await User.find({ _id: { $in: assigneeIds } }, '_id name').lean()
    : [];
  const assigneeMap = new Map(assigneeUsers.map(u => [String(u._id), u.name]));

  const teamName  = new Map(teams.map(t => [String(t._id), t.name]));
  const ownerName = new Map(owners.map(u => [String(u._id), u.name]));
  const projStats = new Map(projectTaskAgg.map((s: any) => [String(s._id), s]));

  const projectList = projects.map(p => {
    const s: any = projStats.get(String(p._id)) ?? { total: 0, done: 0, overdue: 0, lastCompletedAt: null };
    const open   = s.total - s.done;
    const pct    = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    const stagnantDays = s.lastCompletedAt
      ? Math.floor((now.getTime() - new Date(s.lastCompletedAt).getTime()) / 86400000)
      : open > 0 ? 999 : 0;
    const daysUntilDue = p.dueDate ? Math.floor((new Date(p.dueDate).getTime() - now.getTime()) / 86400000) : null;

    // ── Schedule pace ──────────────────────────────────────────────────────
    // Compare how far through the project's calendar we are against how much
    // work is actually done. If 80% of the time has elapsed but only 30% is
    // complete, the project is behind pace even with zero overdue tasks yet —
    // this is the early-warning signal a status badge should carry.
    let expectedPct: number | null = null;
    if (p.startDate && p.dueDate) {
      const startMs = new Date(p.startDate).getTime();
      const dueMs   = new Date(p.dueDate).getTime();
      if (dueMs > startMs) {
        const elapsed = (now.getTime() - startMs) / (dueMs - startMs);
        expectedPct = Math.round(Math.min(Math.max(elapsed, 0), 1) * 100);
      }
    }
    const paceGap = expectedPct !== null ? expectedPct - pct : 0; // +ve = behind

    // Health is derived from observable signals; we also surface *why* so a
    // user hovering "At risk" sees the same reasoning a reviewer would. The
    // badge now reflects real progress + schedule pace, not just overdues.
    let health: 'healthy' | 'at_risk' | 'critical' = 'healthy';
    const reasons: string[] = [];

    // A finished project is simply "Complete" — never flag it.
    if (p.status === 'completed' || (s.total > 0 && open === 0)) {
      health = 'healthy';
      reasons.push(s.total > 0 ? `All ${s.total} tasks complete (100%)` : 'Complete');
    } else if (p.status === 'on_hold') {
      health = 'at_risk';
      reasons.push('On hold — work is paused');
    } else {
      if (s.overdue >= 3) reasons.push(`${s.overdue} overdue tasks`);
      else if (s.overdue > 0) reasons.push(`${s.overdue} overdue task${s.overdue === 1 ? '' : 's'}`);
      if (daysUntilDue !== null) {
        if (daysUntilDue < 0 && open > 0) reasons.push(`Past due by ${Math.abs(daysUntilDue)}d, ${pct}% done`);
        else if (daysUntilDue <= 5 && open > 0) reasons.push(`Due in ${daysUntilDue}d, ${pct}% done`);
      }
      if (paceGap >= 25) reasons.push(`Behind pace — ${pct}% done vs ~${expectedPct}% of time elapsed`);
      if (stagnantDays >= 7 && open > 0) reasons.push(`No tasks closed in ${stagnantDays === 999 ? 'a while' : `${stagnantDays}d`}`);

      // Critical: badly past due, a wall of overdues, or severely behind pace.
      if (
        s.overdue >= 3 ||
        (daysUntilDue !== null && daysUntilDue < 0 && open > 0) ||
        paceGap >= 40
      ) health = 'critical';
      // At risk: any overdue, due-soon with open work, stagnant, or behind pace.
      else if (
        s.overdue > 0 ||
        stagnantDays >= 7 ||
        (daysUntilDue !== null && daysUntilDue <= 5 && open > 0) ||
        paceGap >= 25
      ) health = 'at_risk';

      if (health === 'healthy') {
        reasons.push(s.total === 0
          ? 'No tasks yet — nothing at risk'
          : `On track — ${pct}% done, no overdues`);
      }
    }

    return {
      ...projectS(p, {
        teamName:  teamName.get(String(p.teamId)) || null,
        ownerName: ownerName.get(String(p.ownerId)) || null,
        taskCount: s.total,
        tasksDone: s.done,
      }),
      openTasks:    open,
      overdueCount: s.overdue,
      progressPct:  pct,
      health,
      healthReasons: reasons,
    };
  });

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

  const teamTasks = teamTasksRaw.map(t => {
    const p = projMap.get(String(t.projectId));
    return {
      id:           String(t._id),
      title:        t.title,
      status:       t.status,
      priority:     t.priority,
      dueDate:      toIso(t.dueDate),
      ccTcd:        toIso((t as any).ccTcd),
      completedAt:  toIso(t.completedAt),
      projectId:    String(t.projectId),
      projectCode:  p?.code ?? '',
      projectName:  p?.name ?? '',
      lifecycle:    p?.lifecycle ?? null,
      assigneeId:   t.assigneeId ? String(t.assigneeId) : null,
      assigneeName: t.assigneeId ? (assigneeMap.get(String(t.assigneeId)) ?? null) : null,
      subtaskCount: ((t as any).subtasks || []).length,
      subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length,
      subtaskTitles: ((t as any).subtasks || []).slice(0, 3).map((s: any) => s.title),
      gxpCritical:  !!(t as any).gxpCritical,
      lastActivityAt: toIso((t as any).lastActivityAt || t.updatedAt || t.createdAt),
      pendingWith:  (t as any).pendingWith || '',
    };
  });

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
    return { id: uid, name: u.name, title: u.title || '', openTasks, overdueCount, completedThisWeek, loadScore, loadLevel };
  }).sort((a, b) => b.loadScore - a.loadScore);

  return {
    user:     { id: jwtUser.sub, name: jwtUser.name, email: jwtUser.email, role: jwtUser.role },
    projects: projectList,
    tasks:    taskList,
    teamTasks,
    people,
    // Number of teams the viewer belongs to (or all teams, for admin).
    teamCount: scope.teamOids.length,
  };
}
