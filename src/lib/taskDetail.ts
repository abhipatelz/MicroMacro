import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { task as taskS, date as toIso } from '@/lib/serialize';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

/**
 * Assemble the full task-detail payload for `id`, scoped to the viewer.
 * Mirrors the assembly in GET /api/tasks/[id] so the server-rendered task
 * page paints real content on the first byte. The client still refetches
 * on mount, so anything stale heals on hydration.
 * Returns null when the task is missing or the viewer can't see its project.
 */
export async function getTaskDetail(id: string, userId: string, role?: string | null) {
  try {
    await connectDB();

    // Fetch the task once, then gate on visibility: its project must fall inside
    // the viewer's scope. A bad/stale id throws a CastError from Mongoose —
    // swallow it (see catch) and return null so the page renders the client
    // shell (which surfaces a graceful error) instead of crashing the boundary.
    const t = await Task.findById(id).lean();
    if (!t) return null;
    const privateOwner = (t as any).privateToUserId;
    if (privateOwner && String(privateOwner) !== String(userId)) return null;
    const scope = await getLeadScope(userId, role);
    const proj = await Project.findOne({
      _id: (t as any).projectId,
      ...projectsVisibleFilter(scope),
    }).select('_id').lean();
    if (!proj) return null;

    const [project, assignee, qa, commentUsers, flowConfirmer] = await Promise.all([
      Project.findById((t as any).projectId).select('code name teamId').lean(),
      (t as any).assigneeId ? User.findById((t as any).assigneeId).lean() : Promise.resolve(null),
      (t as any).qaSignoffUserId ? User.findById((t as any).qaSignoffUserId).lean() : Promise.resolve(null),
      User.find({ _id: { $in: ((t as any).comments || []).map((c: any) => c.userId) } }).lean(),
      (t as any).flowPendingConfirmedByUserId
        ? User.findById((t as any).flowPendingConfirmedByUserId).select('name').lean()
        : Promise.resolve(null),
    ]);
    const uMap = new Map(commentUsers.map((u) => [String(u._id), u.name]));
    const comments = ((t as any).comments || []).map((c: any) => ({
      id:        String(c._id),
      userId:    String(c.userId),
      userName:  uMap.get(String(c.userId)) || 'User',
      body:      c.body,
      createdAt: toIso(c.createdAt),
    }));

    return {
      ...taskS(t as any, {
        assigneeName:   (assignee as any)?.name || null,
        qaSignoffName:  (qa as any)?.name || null,
        projectCode:    (project as any)?.code,
        projectName:    (project as any)?.name,
        projectTeamId:  (project as any)?.teamId ? String((project as any).teamId) : null,
        flowPendingConfirmedByName: (flowConfirmer as any)?.name || null,
      }),
      comments,
    };
  } catch (e) {
    // Never crash the page — log and let the client refetch surface the real
    // error in its own UI.
    console.error('[getTaskDetail] failed', e);
    return null;
  }
}
