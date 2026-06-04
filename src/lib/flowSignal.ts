import { connectDB } from './db';
import { Project } from '@/models/Project';
import { TaskFlowEvent } from '@/models/TaskFlowEvent';
export { computeFlowSignal, FLOW_THRESHOLDS } from './flowSignal.compute';
export type { FlowSignal } from './flowSignal.compute';

/* ── Flow signal computation (fact-based, no ML) ────────────────────────────
 *
 * A "flow signal" describes whether an in-flight task is actively progressing
 * or going quiet. It is derived purely from observable fact: lastActivityAt,
 * task status, pendingWith, and priority-based staleness thresholds.
 *
 * Pure computation lives in flowSignal.compute.ts (zero dependencies) so it
 * is safe to import in client components. This file adds the server-only
 * event recording layer on top.
 */

export type FlowEventType =
  | 'status_changed'
  | 'comment_added'
  | 'effort_logged'
  | 'subtask_toggled'
  | 'qa_signoff'
  | 'assignee_changed';

async function isPersonalOrPrivateProject(projectId: string): Promise<boolean> {
  try {
    const p = await Project.findById(projectId).select('isPersonal personal code').lean();
    if (!p) return false;
    return !!(
      (p as any).isPersonal ||
      (p as any).personal ||
      String((p as any).code || '').startsWith('PRSN-')
    );
  } catch {
    return false;
  }
}

/**
 * Append a TaskFlowEvent entry — FLOW SIGNAL Phase 1 event stream.
 *
 * Fire-and-forget: never throws into the caller. A recording failure must never
 * break the mutation that triggered it.
 *
 * Privacy: tasks in personal projects or private-task overlays are silently
 * dropped. Pass `isPrivate: true` when the caller already knows the task is
 * private (avoids the extra DB round-trip).
 */
export async function recordTaskFlowEvent(opts: {
  taskId:    string;
  projectId: string;
  userId:    string;
  eventType: FlowEventType;
  payload?:  Record<string, unknown>;
  isPrivate?: boolean;
}): Promise<void> {
  try {
    if (opts.isPrivate) return;
    await connectDB();
    if (await isPersonalOrPrivateProject(opts.projectId)) return;
    await TaskFlowEvent.create({
      taskId:     opts.taskId,
      projectId:  opts.projectId,
      userId:     opts.userId,
      eventType:  opts.eventType,
      payload:    opts.payload ?? {},
      recordedAt: new Date(),
    });
  } catch (e) {
    console.error('[flowSignal] failed to record event', e);
  }
}
