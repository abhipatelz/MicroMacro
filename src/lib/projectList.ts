/**
 * Shared server-side helpers that mirror the GET handlers of the projects
 * and teams APIs. The (authed)/projects page calls these directly during
 * SSR so the rendered HTML already contains real rows — no client-side
 * waterfall, no skeleton flash, no extra round-trips after hydration.
 */
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Team } from '@/models/Team';
import { User } from '@/models/User';
import { project as projectS } from '@/lib/serialize';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

export interface ProjectListItem {
  id: string;
  code: string;
  name: string;
  description?: string;
  lifecycle: string;
  status: string;
  teamId?: string;
  teamName?: string | null;
  ownerId?: string;
  ownerName?: string | null;
  dueDate?: string | Date | null;
  taskCount: number;
  tasksDone: number;
  tasksOverdue: number;
  archived?: boolean;
}

/**
 * Get the project list visible to `userId`, with the same filtering the
 * GET /api/projects route supports (search, team, lifecycle, status,
 * archived). Returns rows enriched with team/owner names + task counts
 * so the UI doesn't have to make a second pass.
 */
export async function listProjectsForUser(
  userId: string,
  role: string | undefined,
  filters: {
    q?: string;
    teamId?: string;
    lifecycle?: string;
    statuses?: string[];
    archivedOnly?: boolean;
    includeArchived?: boolean;
  } = {},
): Promise<ProjectListItem[]> {
  await connectDB();

  const scope = await getLeadScope(userId, role);
  const visibility = projectsVisibleFilter(scope);
  const q: any = { ...visibility };

  if (filters.archivedOnly)         q.archived = true;
  else if (!filters.includeArchived) q.archived = { $ne: true };

  if (filters.teamId)    q.teamId    = filters.teamId;
  if (filters.lifecycle) q.lifecycle = filters.lifecycle;
  if (filters.statuses?.length) {
    q.status = filters.statuses.length === 1 ? filters.statuses[0] : { $in: filters.statuses };
  }
  if (filters.q) {
    q.$and = [
      visibility,
      { $or: [
        { name:        { $regex: filters.q, $options: 'i' } },
        { code:        { $regex: filters.q, $options: 'i' } },
        { description: { $regex: filters.q, $options: 'i' } },
      ] },
    ];
    delete q.$or;
  }

  const projects = await Project.find(q).sort({ createdAt: -1 }).limit(200).lean();
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p._id);
  const [teams, owners, taskAgg] = await Promise.all([
    Team.find({ _id: { $in: projects.map((p) => p.teamId).filter(Boolean) } }).lean(),
    User.find({ _id: { $in: projects.map((p) => p.ownerId).filter(Boolean) } }).lean(),
    Task.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: '$projectId',
          taskCount:    { $sum: 1 },
          tasksDone:    { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
          tasksOverdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$status', 'done'] },
                    { $ne: ['$dueDate', null] },
                    { $lt: ['$dueDate', new Date()] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const teamMap  = new Map(teams.map((t)  => [String(t._id), t.name]));
  const ownerMap = new Map(owners.map((o) => [String(o._id), o.name]));
  const taskMap  = new Map(taskAgg.map((a: any) => [String(a._id), a]));

  return projects.map((p) => {
    const t = taskMap.get(String(p._id)) || { taskCount: 0, tasksDone: 0, tasksOverdue: 0 };
    return {
      ...projectS(p, {
        teamName:  p.teamId  ? teamMap.get(String(p.teamId))  || null : null,
        ownerName: p.ownerId ? ownerMap.get(String(p.ownerId)) || null : null,
      }),
      taskCount:    t.taskCount,
      tasksDone:    t.tasksDone,
      tasksOverdue: t.tasksOverdue,
    } as ProjectListItem;
  });
}

/** Lightweight team list for filter dropdowns. */
export async function listTeamsForFilter(): Promise<Array<{ id: string; name: string }>> {
  await connectDB();
  const teams = await Team.find({}, '_id name').sort({ name: 1 }).lean();
  return teams.map((t) => ({ id: String(t._id), name: t.name }));
}

/**
 * The distinct project templates (lifecycles) actually in use across the
 * viewer's projects — so the Projects filter lists only relevant templates
 * the user has, not the whole catalog. Labels come from LIFECYCLES.
 */
export async function listTemplatesInUse(
  userId: string,
  role: string | undefined,
): Promise<Array<{ key: string; label: string }>> {
  await connectDB();
  const scope = await getLeadScope(userId, role);
  const keys: string[] = await Project.distinct('lifecycle', projectsVisibleFilter(scope));
  const { LIFECYCLES } = await import('@/lib/lifecycles');
  return keys
    .filter(Boolean)
    .map((k) => ({ key: k, label: (LIFECYCLES as any)[k]?.label || k.replace(/_/g, ' ') }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
