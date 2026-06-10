'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Flame, TrendingUp } from 'lucide-react';
import { api } from '@/lib/client/api';

/**
 * Momentum strip — the one-glance progress pulse pinned in the sidebar.
 *
 * The hook is the same one that makes contribution heatmaps work: a number
 * that grows when you show up and resets when you don't. Surfacing the
 * streak + this week's completions on every page (not buried in Settings)
 * means each task someone closes nudges a number they can already see.
 * Links to the user's own profile, where the full activity graph lives.
 *
 * Quiet by design: renders nothing until there is something to celebrate —
 * a zero-streak banner would demotivate rather than hook.
 */

interface Momentum {
  streak: number;
  doneToday: number;
  doneThisWeek: number;
}

// Module-level cache: AppShell persists across soft navigations, but remounts
// do happen (hard reloads). One fetch per session is plenty for a nudge.
let cached: Momentum | null = null;

export function clearMomentumCache() {
  cached = null;
}

export function MomentumStrip({ dark, username }: { dark: boolean; username?: string | null }) {
  const [m, setM] = useState<Momentum | null>(cached);

  useEffect(() => {
    if (cached) return;
    let alive = true;
    api<Momentum & Record<string, number>>('/users/me/stats')
      .then((d) => {
        cached = { streak: d.streak ?? 0, doneToday: d.doneToday ?? 0, doneThisWeek: d.doneThisWeek ?? 0 };
        if (alive) setM(cached);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!m || (m.streak === 0 && m.doneThisWeek === 0)) return null;

  const inner = (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
      title={`${m.doneToday} done today · ${m.doneThisWeek} in the last 7 days${m.streak > 0 ? ` · ${m.streak}-day streak` : ''}`}
    >
      {m.streak > 0 && (
        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <Flame size={12} />
          {m.streak}d streak
        </span>
      )}
      {m.doneThisWeek > 0 && (
        <span
          className="inline-flex items-center gap-1"
          style={{ color: dark ? 'rgba(255,255,255,0.45)' : '#64748b' }}
        >
          <TrendingUp size={12} className="text-green-600" />
          {m.doneThisWeek} this week
        </span>
      )}
    </div>
  );

  // Own profile holds the full activity graph — that's where the click lands.
  return username ? <Link href={`/${username}`}>{inner}</Link> : inner;
}
