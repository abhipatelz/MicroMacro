/**
 * Flow Signal — central event + meaningful-activity helpers.
 *
 * Internal codename only. NEVER surface the words "Flow Signal", "AI",
 * "ML", "model", "prediction", "anomaly", "risk score" or "algorithm" in
 * any user-facing string. The visible product feels like an ordinary
 * Pragati capability ("Quick check", "Needs attention", "Waiting on
 * approval"); these helpers and the TaskFlowEvent stream are how that
 * surface stays calm while the foundation for future learning accumulates
 * data quietly underneath.
 *
 * Every meaningful work event that the existing routes already perform —
 * status change, comment, subtask progress, effort log, sign-off — should
 * call recordTaskFlowEvent() and touchMeaningfulActivity() through this
 * module, NOT directly write to Task.lastMeaningfulActivityAt. That gives
 * us exactly one chokepoint to enforce:
 *
 *   1. cosmetic edits (title, dueDate push-out, priority) never
 *      masquerade as progress;
 *   2. the user's "Still moving" attestation is recorded separately from
 *      real movement so the baseline isn't contaminated;
 *   3. event writes are fire-and-forget — a failure here must NEVER
 *      break the original operation that triggered it.
 */
import type mongoose from 'mongoose';
import { Task } from '@/models/Task';
import { TaskFlowEvent } from '@/models/TaskFlowEvent';

type Oid = mongoose.Types.ObjectId | string | null | undefined;

/** Event types we accept. Mirrors the Mongoose enum exactly — keeping it
 *  here as a union lets callers get a compile-time check. */
export type FlowEventType =
  | 'task_created'
  | 'task_assigned'
  | 'task_reassigned'
  | 'status_changed'
  | 'comment_added'
  | 'subtask_created'
  | 'subtask_progressed'
  | 'effort_logged'
  | 'signoff_completed'
  | 'waiting_confirmed'
  | 'waiting_cleared'
  | 'decision_requested'
  | 'help_requested'
  | 'still_moving_confirmed'
  | 'prompt_dismissed'
  | 'prompt_eligible_shadow'
  | 'prompt_shown_live'
  | 'prompt_opened'
  | 'task_completed';

/** Source — see TaskFlowEvent model docs. Default 'live'. */
export type FlowEventSource = 'live' | 'backfill_approx' | 'shadow';

/** Events that genuinely represent work moving (status, comment, subtask,
 *  effort, sign-off, assigned/reassigned, completed). Used to decide
 *  whether the same call should also advance lastMeaningfulActivityAt. */
const MEANINGFUL: ReadonlySet<FlowEventType> = new Set<FlowEventType>([
  'task_created',
  'task_assigned',
  'task_reassigned',
  'status_changed',
  'comment_added',
  'subtask_created',
  'subtask_progressed',
  'effort_logged',
  'signoff_completed',
  'task_completed',
]);

export interface RecordEventArgs {
  taskId: Oid;
  projectId: Oid;
  eventType: FlowEventType;
  actorId?: Oid;
  teamId?: Oid;
  stateBefore?: string | null;
  stateAfter?: string | null;
  taskType?: string | null;
  projectLifecycle?: string | null;
  source?: FlowEventSource;
  /** Bounded reason codes / counts only. Never copy comment/description text here. */
  metadata?: Record<string, unknown> | null;
  /** Override the recorded timestamp (defaults to now). */
  occurredAt?: Date;
  /** If true, also advance Task.lastMeaningfulActivityAt to occurredAt. Defaults
   *  to the inherent meaningfulness of the event type (see MEANINGFUL set). */
  touchActivity?: boolean;
}

/**
 * Append a TaskFlowEvent and (when the event type indicates real movement)
 * advance lastMeaningfulActivityAt on the parent Task in the same call.
 *
 * Fire-and-forget: callers should `await` only when the caller is itself
 * synchronous about the underlying operation; in mutating route handlers,
 * prefer `void recordTaskFlowEvent(...)` so a flow-event write failure can
 * never bubble up and fail the original PATCH / POST.
 */
export async function recordTaskFlowEvent(args: RecordEventArgs): Promise<void> {
  try {
    if (!args.taskId || !args.projectId) return;
    const occurredAt = args.occurredAt || new Date();
    const shouldTouch = args.touchActivity ?? MEANINGFUL.has(args.eventType);

    await TaskFlowEvent.create({
      taskId:    args.taskId,
      projectId: args.projectId,
      teamId:    args.teamId || undefined,
      actorId:   args.actorId || undefined,
      eventType: args.eventType,
      stateBefore:      args.stateBefore || undefined,
      stateAfter:       args.stateAfter || undefined,
      taskType:         args.taskType || undefined,
      projectLifecycle: args.projectLifecycle || undefined,
      occurredAt,
      source:           args.source || 'live',
      metadata:         args.metadata ?? null,
      schemaVersion:    1,
    });

    if (shouldTouch) {
      await Task.updateOne(
        { _id: args.taskId },
        { $max: { lastMeaningfulActivityAt: occurredAt } },
      );
    }
  } catch (e) {
    // Never let analytics failure break the operation it accompanies.
    console.error('[flow] recordTaskFlowEvent failed', e);
  }
}

/**
 * Standalone helper for the rare case where work moved (e.g. a subtask
 * status flipped) but we don't yet want to write a TaskFlowEvent in that
 * path. Use sparingly — prefer recordTaskFlowEvent so the event stream
 * stays the single source of truth.
 */
export async function touchMeaningfulActivity(taskId: Oid, at?: Date): Promise<void> {
  if (!taskId) return;
  try {
    await Task.updateOne(
      { _id: taskId },
      { $max: { lastMeaningfulActivityAt: at || new Date() } },
    );
  } catch (e) {
    console.error('[flow] touchMeaningfulActivity failed', e);
  }
}

/**
 * The set of Task PATCH field names that count as cosmetic — explicitly
 * documented here so that route handlers can compare incoming bodies
 * against it and skip the activity bump. NOT a behavioural enforcement;
 * the route handler still decides. But having the list central means a
 * future audit can grep one place to verify "what we DON'T count as
 * progress".
 */
export const COSMETIC_TASK_FIELDS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'priority',
  'dueDate',
  'ccTcd',
  'ccNo',
  'documentNo',
  'applicableSite',
  'deployStage',
  'remarks',
  'taskType',
  'gxpCritical',
  'requiresQaSignoff',
  'startDate',
  'estimatedHours',
  'position',
  'phaseId',
  'pendingWith',
]);

/** True if any of the patched fields would actually move the work (status,
 *  assigneeId, completedAt). All other fields are considered cosmetic for
 *  the purposes of lastMeaningfulActivityAt. */
export function patchHasMeaningfulField(patchKeys: Iterable<string>): boolean {
  for (const k of patchKeys) {
    if (k === 'status' || k === 'assigneeId' || k === 'completedAt') return true;
  }
  return false;
}
