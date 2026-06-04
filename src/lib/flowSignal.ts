import { connectDB } from './db';
import { Project } from '@/models/Project';
import { TaskFlowEvent } from '@/models/TaskFlowEvent';

/* ── Flow signal computation (fact-based, no ML) ────────────────────────────
 *
 * A "flow signal" describes whether an in-flight task is actively progressing
 * or going quiet. It is derived purely from observable fact: lastActivityAt,
 * task status, pendingWith, and priority-based staleness thresholds.
 *
 * Priority thresholds (hours to first warning / hours to "stalled"):
 *   critical  →  24h / 48h
 *   high      →  48h / 96h
 *   medium    →  72h / 144h
 *   low       → 168h / 336h
 */

export type FlowSignal = 'on_track' | 'slow' | 'stalled' | 'blocked' | 'done';

const THRESHOLDS: Record<string, { warn: number; stall: number }> = {
  critical: { warn:  24, stall:  48  },
  high:     { warn:  48, stall:  96  },
  medium:   { warn:  72, stall: 144  },
  low:      { warn: 168, stall: 336  },
};

export function computeFlowSignal(t: {
  status:         string;
  priority?:      string | null;
  pendingWith?:   string | null;
  lastActivityAt?: string | Date | null;
}): { signal: FlowSignal; daysSinceActivity: number; warnHours: number; stallHours: number } {
  const thr = THRESHOLDS[t.priority || 'medium'] ?? THRESHOLDS.medium;

  if (t.status === 'done') {
    return { signal: 'done', daysSinceActivity: 0, warnHours: thr.warn, stallHours: thr.stall };
  }
  if (t.status === 'blocked' || (t.pendingWith && t.pendingWith.trim())) {
    return { signal: 'blocked', daysSinceActivity: 0, warnHours: thr.warn, stallHours: thr.stall };
  }

  const last = t.lastActivityAt ? new Date(t.lastActivityAt as string) : null;
  if (!last || isNaN(last.getTime())) {
    return { signal: 'on_track', daysSinceActivity: 0, warnHours: thr.warn, stallHours: thr.stall };
  }

  const hours = (Date.now() - last.getTime()) / 3_600_000;
  const days  = Math.round((hours / 24) * 10) / 10;

  const signal: FlowSignal =
    hours >= thr.stall ? 'stalled' :
    hours >= thr.warn  ? 'slow'    :
    'on_track';

  return { signal, daysSinceActivity: days, warnHours: thr.warn, stallHours: thr.stall };
}

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
