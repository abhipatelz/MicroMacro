import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { connectDB } from '@/lib/db';
import { canMutate } from '@/lib/auth';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';

/**
 * Centralised authorisation for everything that hangs off a task
 * (the task itself, its subtasks, its comments).
 *
 * Returns:
 *   - task       : the task doc (lean) or null if it doesn't exist
 *   - visible    : true if the caller's scope can see the task's project
 *                  (lead/member of the team, owner, or admin)
 *   - isAssignee : true if the caller is the task's current assignee
 *   - isLead     : true if the caller is lead/pm/admin (canMutate)
 *
 * Permission model (decided for the IC-access rollout):
 *   - VISIBLE is the floor for any read or write. Not visible ⇒ 404.
 *   - Leads/admin: full edit on anything visible.
 *   - Assignee (employee): may change their own task's STATUS, toggle
 *     SUBTASK status, and ADD COMMENTS. Structural edits (title, due,
 *     assignee, priority, creating/deleting subtasks, deleting the task)
 *     remain lead-only.
 */
export interface TaskAccess {
  task:       any | null;
  visible:    boolean;
  isAssignee: boolean;
  isLead:     boolean;
}

export async function getTaskAccess(
  taskId: string,
  userId: string,
  role?: string | null,
): Promise<TaskAccess> {
  await connectDB();
  const task = await Task.findById(taskId).lean();
  if (!task) return { task: null, visible: false, isAssignee: false, isLead: false };

  const scope = await getLeadScope(userId, role);
  const proj  = await Project.findOne(
    { _id: (task as any).projectId, ...projectsVisibleFilter(scope) },
    '_id',
  ).lean();

  return {
    task,
    visible:    !!proj,
    isAssignee: !!(task as any).assigneeId && String((task as any).assigneeId) === String(userId),
    isLead:     canMutate(role),
  };
}

/** True if the caller may make assignee-level edits (status / subtask toggle
 *  / comment) on this task: a lead/admin, or the task's own assignee. */
export function canActOnOwnTask(access: TaskAccess): boolean {
  return access.isLead || access.isAssignee;
}
