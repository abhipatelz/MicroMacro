import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { project as projectS, task as taskS } from '@/lib/serialize';
import { LIFECYCLES } from '@/lib/lifecycles';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

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
      Task.find({ projectId: p._id, $or: [{ privateToUserId: null }, { privateToUserId: { $exists: false } }, { privateToUserId: scope.userOid }] }).sort({ position: 1, createdAt: 1 }).lean(),
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
        taskS(t, {
          assigneeName: t.assigneeId ? uMap.get(String(t.assigneeId)) : null,
          subtaskCount: ((t as any).subtasks || []).length,
          subtasksDone: ((t as any).subtasks || []).filter((s: any) => s.status === 'done').length,
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
