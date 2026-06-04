/**
 * Pure, zero-dependency flow signal computation — safe to import in client
 * components and server routes alike.
 *
 * Priority staleness thresholds (hours to first warning / hours to stalled):
 *   critical →  24h /  48h
 *   high     →  48h /  96h
 *   medium   →  72h / 144h
 *   low      → 168h / 336h
 */

export type FlowSignal = 'on_track' | 'slow' | 'stalled' | 'blocked' | 'done';

export const FLOW_THRESHOLDS: Record<string, { warn: number; stall: number }> = {
  critical: { warn:  24, stall:  48 },
  high:     { warn:  48, stall:  96 },
  medium:   { warn:  72, stall: 144 },
  low:      { warn: 168, stall: 336 },
};

export function computeFlowSignal(t: {
  status:          string;
  priority?:       string | null;
  pendingWith?:    string | null;
  lastActivityAt?: string | Date | null;
}): { signal: FlowSignal; daysSinceActivity: number; warnHours: number; stallHours: number } {
  const thr = FLOW_THRESHOLDS[t.priority || 'medium'] ?? FLOW_THRESHOLDS.medium;

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
