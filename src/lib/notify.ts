import { Notification } from '@/models/Notification';

/**
 * Fire-and-forget notification creation, called from API routes after an
 * event (task assigned, task done, …). Never throws into the caller — a
 * failed notification must not fail the action that triggered it.
 *
 * Self-notifications are skipped: there's no point telling you about an
 * action you just took yourself (pass `actorId` to suppress).
 */
export async function notify(opts: {
  userId: string;                 // recipient
  actorId?: string;               // who caused it (skip if same as recipient)
  type?: 'task_assigned' | 'task_done' | 'task_waiting' | 'general';
  title: string;
  body?: string;
  taskId?: string;
  projectId?: string;
}): Promise<void> {
  try {
    if (!opts.userId) return;
    if (opts.actorId && String(opts.actorId) === String(opts.userId)) return;
    await Notification.create({
      userId:    opts.userId,
      type:      opts.type || 'general',
      title:     opts.title,
      body:      opts.body || '',
      taskId:    opts.taskId,
      projectId: opts.projectId,
    });
  } catch {
    // Swallow — notifications are best-effort.
  }
}
