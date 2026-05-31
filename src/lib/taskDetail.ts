import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { User } from '@/models/User';
import { task as taskS } from '@/lib/serialize';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

/**
 * Assemble the full task-detail payload for `id`, scoped to the viewer.
 * Mirrors the assembly in GET /api/tasks/[id] so the server-rendered task
 * page paints real content on the first byte. The client still refetches
 * on mount, so anything stale heals on hydration.
 * Returns null when the task is missing or the viewer can't see its project.
 */
export async function getTaskDetail(id: string, userId: string, role?: string | null) {
  if (!mongoose.isValidObjectId(id)) return null;

  await connectDB();

  // Visibility gate: the task's project must fall inside the viewer's scope.
  const ref = await Task.findById(id).select('projectId').lean();
  if (!ref) return null;
  const scope = await getLeadScope(userId, role);
  const proj = await Project.findOne({
    _id: (ref as any).projectId,
    ...projectsVisibleFilter(scope),
  }).select('_id').lean();
  if (!proj) return null;

  const t = await Task.findById(id).lean();
  if (!t) return null;

  const [project, assignee, qa, commentUsers] = await Promise.all([
    Project.findById((t as any).projectId).lean(),
    (t as any).assigneeId ? User.findById((t as any).assigneeId).lean() : Promise.resolve(null),
    (t as any).qaSignoffUserId ? User.findById((t as any).qaSignoffUserId).lean() : Promise.resolve(null),
    User.find({ _id: { $in: ((t as any).comments || []).map((c: any) => c.userId) } }).lean(),
  ]);
  const uMap = new Map(commentUsers.map((u) => [String(u._id), u.name]));
  const comments = ((t as any).comments || []).map((c: any) => ({
    id:        String(c._id),
    userId:    String(c.userId),
    userName:  uMap.get(String(c.userId)) || 'User',
    body:      c.body,
    createdAt: c.createdAt,
  }));

  return {
    ...taskS(t as any, {
      assigneeName:   (assignee as any)?.name || null,
      qaSignoffName:  (qa as any)?.name || null,
      projectCode:    (project as any)?.code,
      projectName:    (project as any)?.name,
    }),
    comments,
  };
}
