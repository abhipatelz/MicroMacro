import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { project as projectS, date as toIso } from '@/lib/serialize';
import { LIFECYCLES } from '@/lib/lifecycles';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';


function taskForProjectBoard(t: any, extras: any = {}) {
  const subtasks = (t.subtasks || []) as any[];
  return {
    id: String(t._id),
    projectId: t.projectId ? String(t.projectId) : undefined,
    phaseId: t.phaseId ? String(t.phaseId) : undefined,
    title: t.title,
    description: t.description || '',
    assigneeId: t.assigneeId ? String(t.assigneeId) : undefined,
    status: t.status,
    priority: t.priority,
    taskType: t.taskType,
    gxpCritical: !!t.gxpCritical,
    requiresQaSignoff: !!t.requiresQaSignoff,
    startDate: toIso(t.startDate),
    dueDate: toIso(t.dueDate),
    completedAt: toIso(t.completedAt),
    ccNo: t.ccNo || '',
    ccTcd: toIso(t.ccTcd),
    documentNo: t.documentNo || '',
    applicableSite: t.applicableSite || 'na',
    deployStage: t.deployStage || 'na',
    remarks: t.remarks || '',
    pendingWith: t.pendingWith || '',
    position: t.position ?? 0,
    createdAt: toIso(t.createdAt),
    updatedAt: toIso(t.updatedAt),
    subtaskCount: subtasks.length,
    subtasksDone: subtasks.filter((s) => s.status === 'done').length,
    ...extras,
  };
}

/**
 * Assemble the full project-detail payload for `id`, scoped to the viewer.
 * Single source of truth shared by GET /api/projects/[id] and the
 * server-rendered project page, so the page paints real content on the
 * first byte (no post-hydration fetch waterfall) and both surfaces return
 * byte-identical data. Returns null when the project doesn't exist or the
 * viewer can't see it.
 */
export async function getProjectDetail(id: string, userId: string, role?: string | null) {
  try {
    await connectDB();
    const scope = await getLeadScope(userId, role);
    const p = await Project.findOne({ _id: id, ...projectsVisibleFilter(scope) }).lean();
    if (!p) return null;

    const [team, owner, tasks] = await Promise.all([
      p.teamId ? Team.findById(p.teamId).lean() : Promise.resolve(null),
      p.ownerId ? User.findById(p.ownerId).lean() : Promise.resolve(null),
      Task.find({ projectId: p._id })
        // Project boards/lists only need task summary fields and subtask counts;
        // omit heavy comment/effort/AI arrays that belong on the task detail page.
        .select('projectId phaseId title description assigneeId status priority taskType gxpCritical requiresQaSignoff startDate dueDate completedAt ccNo ccTcd documentNo applicableSite deployStage remarks pendingWith position createdAt updatedAt subtasks.status')
        .sort({ position: 1, createdAt: 1 })
        .lean(),
    ]);
    const assignees = await User.find({
      _id: { $in: tasks.map((t) => t.assigneeId).filter(Boolean) },
    }).lean();
    const uMap = new Map(assignees.map((u) => [String(u._id), u.name]));
    const lc = LIFECYCLES[(p.lifecycle || 'generic') as keyof typeof LIFECYCLES];

    return {
      ...projectS(p, {
        teamName: (team as any)?.name || null,
        ownerName: (owner as any)?.name || null,
      }),
      lifecycleMeta: lc
        ? { label: lc.label, description: lc.description, regulatoryRefs: lc.regulatoryRefs }
        : null,
      tasks: tasks.map((t) =>
        taskForProjectBoard(t, {
          assigneeName: t.assigneeId ? uMap.get(String(t.assigneeId)) : null,
        }),
      ),
    };
  } catch (e) {
    // Bad / stale id → CastError → swallow so the page renders the client
    // shell which can refetch + show a proper error, instead of crashing into
    // the global error boundary.
    console.error('[getProjectDetail] failed', e);
    return null;
  }
}
