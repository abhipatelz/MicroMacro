'use client';

/**
 * Compact "Waiting on …" strip shown on the task-detail page, just below
 * the title and status tags. Renders nothing when there is no active
 * confirmed pending state — same render-nothing-when-empty discipline as
 * the dashboard strip.
 *
 * Shares its source of truth (Task.flowPending*) with the dashboard strip;
 * marking resolved here clears the dashboard item too on the next refresh.
 */

import { useState } from 'react';
import { api } from '@/lib/client/api';

const HEADLINE: Record<string, string> = {
  approval:     'Waiting on approval',
  another_team: 'Waiting on another team',
  person:       'Waiting on a person',
  other:        'Waiting',
  decision:     'Decision needed',
  help:         'Help requested',
};

export interface FlowSignalTaskStripProps {
  taskId: string;
  pendingType?: string | null;
  detail?: string;
  confirmedAt?: string | null;
  confirmedByName?: string | null;
  /** True when the viewer is a lead/admin OR the original confirmer. */
  canResolve?: boolean;
  onChanged?: () => void;
}

export function FlowSignalTaskStrip({
  taskId, pendingType, detail, confirmedAt, confirmedByName, canResolve, onChanged,
}: FlowSignalTaskStripProps) {
  const [busy, setBusy] = useState(false);

  if (!pendingType) return null;
  const headline = HEADLINE[pendingType] || 'Needs attention';

  async function resolve() {
    setBusy(true);
    try {
      await api(`/tasks/${taskId}/flow-check`, { method: 'POST', body: { action: 'resolve' } });
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="mt-3 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-amber-200/70 bg-amber-50/60 dark:bg-amber-500/[0.08] dark:border-amber-500/25"
      data-flow-task-strip
    >
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={{ background: '#d97706' }}
      />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-semibold text-amber-900 dark:text-amber-200 leading-tight">
          {headline}
          {detail ? (
            <span className="font-normal text-amber-800/80 dark:text-amber-200/80"> · {detail}</span>
          ) : null}
        </div>
        {(confirmedByName || confirmedAt) && (
          <div className="text-[11px] text-amber-700/70 dark:text-amber-300/60 mt-0.5">
            Confirmed {relTime(confirmedAt)}{confirmedByName ? ` by ${confirmedByName}` : ''}
          </div>
        )}
      </div>
      {canResolve && (
        <button
          type="button"
          onClick={resolve}
          disabled={busy}
          className="shrink-0 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-md px-2 py-0.5 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Mark resolved'}
        </button>
      )}
    </div>
  );
}

function relTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const ms = Date.now() - t;
  const d  = Math.floor(ms / 86_400_000);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString();
}
