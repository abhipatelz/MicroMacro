'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { Flame, Trophy, Clock3 } from 'lucide-react';

/**
 * GitHub-style contribution graph.
 *
 * A "contribution" here is *delivered work*, scored by a transparent weight
 * table on the server (see src/lib/contributions.ts) — completed tasks and
 * subtasks, with bonuses for on-time, GxP-critical, high-priority, and
 * review/approval work. Logins and record-creation never count.
 *
 * Layout mirrors GitHub: an achievements rail on the left, the heatmap with a
 * full year list on the right, and a grouped "Contribution activity" timeline
 * beneath. Fully responsive — the columns stack on narrow screens.
 */

// Weighted-score colour scale (a normal task ≈ 5–7 pts/day).
function cellColor(n: number): string {
  if (!n) return '#ebedf0';
  if (n <= 5) return '#9be9a8';
  if (n <= 12) return '#40c463';
  if (n <= 22) return '#30a14e';
  return '#216e39';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── Achievement catalogue (GitHub-style medallions) ─────────────────────── */
type BadgeDef = { emoji: string; label: string; blurb: string; from: string; to: string };
const BADGES: Record<string, BadgeDef> = {
  first_step:     { emoji: '🌱', label: 'First Step',  blurb: 'Welcome aboard — your journey on Pragati has begun.',   from: '#34d399', to: '#059669' },
  task_rookie:    { emoji: '✅', label: 'Rookie',       blurb: 'Closed your very first task. Onwards!',                 from: '#38bdf8', to: '#0284c7' },
  task_achiever:  { emoji: '⭐', label: 'Achiever',     blurb: '10 tasks completed — momentum is building.',           from: '#fbbf24', to: '#d97706' },
  task_performer: { emoji: '🏅', label: 'Performer',    blurb: '50 tasks done. A dependable force on the team.',       from: '#a78bfa', to: '#7c3aed' },
  task_champion:  { emoji: '🏆', label: 'Champion',     blurb: '100 tasks delivered. Truly elite execution.',          from: '#fde047', to: '#ca8a04' },
  on_time:        { emoji: '🎯', label: 'On Target',    blurb: '85%+ of your work delivered on or before its date.',   from: '#f472b6', to: '#db2777' },
  streak_3:       { emoji: '🔥', label: '3-Day Streak', blurb: 'Active three days running. Consistency pays off.',     from: '#fb923c', to: '#ea580c' },
  streak_7:       { emoji: '⚡', label: '7-Day Streak', blurb: 'A full week of delivered work — unstoppable.',         from: '#e879f9', to: '#c026d3' },
};
const BADGE_ORDER = ['first_step', 'task_rookie', 'task_achiever', 'task_performer', 'task_champion', 'on_time', 'streak_3', 'streak_7'];

type ContribItem = {
  id: string; title: string; projectName: string; projectCode: string;
  completedAt: string | null; points: number; gxpCritical: boolean; priority: string;
  kind: 'task' | 'subtask';
};

type ActivityData = {
  year: number;
  firstYear: number;
  days: Record<string, number>;
  total: number;
  streak: number;
  totalTasksDone: number;
  onTimeRate: number;
  badges: string[];
  recent: ContribItem[];
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ── Circular achievement medallion ──────────────────────────────────────── */
function Medallion({ def, earned }: { def: BadgeDef; earned: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center w-[58px]" title={earned ? def.blurb : `Locked — ${def.blurb}`}>
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center text-lg shadow-sm transition-transform"
        style={{
          background: earned ? `linear-gradient(135deg, ${def.from}, ${def.to})` : '#f1f5f9',
          boxShadow: earned ? `0 2px 8px ${def.to}40` : 'none',
          filter: earned ? 'none' : 'grayscale(1)',
          opacity: earned ? 1 : 0.45,
          border: earned ? '2px solid rgba(255,255,255,0.7)' : '2px solid #e2e8f0',
        }}
      >
        <span style={{ filter: earned ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.15))' : 'none' }}>{def.emoji}</span>
      </div>
      <span className="text-[9px] font-bold leading-tight" style={{ color: earned ? '#475569' : '#94a3b8' }}>
        {def.label}
      </span>
    </div>
  );
}

export function ActivityGraph({ userId, name }: { userId?: string; name?: string }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  const who = userId ? `users/${userId}/activity` : 'users/me/activity';

  useEffect(() => {
    setLoading(true);
    api<ActivityData>(`/${who}?year=${year}`)
      .then(setData)
      .catch(() => setData({ year, firstYear: year, days: {}, total: 0, streak: 0, totalTasksDone: 0, onTimeRate: 0, badges: [], recent: [] }))
      .finally(() => setLoading(false));
  }, [who, year]);

  const days = data?.days || {};

  // Week columns for the selected calendar year, Sunday-aligned.
  const { weeks, total } = useMemo(() => {
    const start = new Date(`${year}-01-01T00:00:00`);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(`${year}-12-31T00:00:00`);
    const cols: { key: string; inYear: boolean }[][] = [];
    const cur = new Date(start);
    while (cur <= end) {
      const col: { key: string; inYear: boolean }[] = [];
      for (let i = 0; i < 7; i++) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
        col.push({ key, inYear: cur.getFullYear() === year });
        cur.setDate(cur.getDate() + 1);
      }
      cols.push(col);
    }
    let t = 0;
    for (const k in days) t += days[k];
    return { weeks: cols, total: t };
  }, [days, year]);

  const monthLabels = useMemo(() => {
    const labels: (string | null)[] = [];
    let lastMonth = -1;
    for (const col of weeks) {
      const firstInYear = col.find(c => c.inYear) || col[0];
      const m = new Date(firstInYear.key + 'T00:00:00').getMonth();
      if (m !== lastMonth) { labels.push(MONTHS[m]); lastMonth = m; }
      else labels.push(null);
    }
    return labels;
  }, [weeks]);

  // Full year rail: firstYear..currentYear, newest first (GitHub-style).
  const yearOptions = useMemo(() => {
    const first = Math.min(data?.firstYear ?? currentYear, currentYear);
    const out: number[] = [];
    for (let y = currentYear; y >= first; y--) out.push(y);
    return out;
  }, [data?.firstYear, currentYear]);

  // Timeline: group the recent delivered work by day.
  const timeline = useMemo(() => {
    const groups: { date: string; label: string; items: ContribItem[] }[] = [];
    const map = new Map<string, ContribItem[]>();
    for (const it of (data?.recent || [])) {
      const key = (it.completedAt || '').slice(0, 10);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    for (const [date, items] of Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))) {
      const d = new Date(date + 'T00:00:00');
      groups.push({
        date,
        label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        items,
      });
    }
    return groups;
  }, [data?.recent]);

  const earned = data?.badges || [];
  const firstName = name ? name.split(' ')[0] : 'You';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[150px_1fr] gap-5">
      {/* ── Achievements rail (left) ─────────────────────────────────────── */}
      <aside className="lg:border-r lg:border-slate-100 dark:lg:border-slate-800 lg:pr-4">
        <div className="flex items-center gap-1.5 mb-3">
          <Trophy size={13} className="text-amber-500" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Achievements</h4>
          <span className="ml-auto text-[10px] font-bold text-slate-400">{earned.length}/{BADGE_ORDER.length}</span>
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-2 gap-x-1 gap-y-3">
          {BADGE_ORDER.map((key) => (
            <Medallion key={key} def={BADGES[key]} earned={earned.includes(key)} />
          ))}
        </div>
        {!loading && (
          <p className="hidden lg:block text-[10px] text-slate-400 mt-4 leading-snug">
            {earned.length >= BADGE_ORDER.length
              ? `🎉 Every achievement unlocked — ${name ? firstName + ' is' : 'you are'} a Pragati legend!`
              : 'Deliver work to unlock the next one.'}
          </p>
        )}
      </aside>

      {/* ── Graph + year rail + timeline (right) ─────────────────────────── */}
      <div className="min-w-0">
        {/* Stats line */}
        <div className="flex items-center gap-2.5 mb-3 flex-wrap">
          <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            {loading ? 'Loading…' : <>{total} contribution point{total === 1 ? '' : 's'} in {year}</>}
          </span>
          {!loading && (data?.streak ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full">
              <Flame size={11} className="fill-orange-400 text-orange-500" />
              {data!.streak}-day streak
            </span>
          )}
          {!loading && (data?.totalTasksDone ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
              <Clock3 size={11} /> {data!.onTimeRate}% on time
            </span>
          )}
        </div>

        <div className="flex gap-3 items-start">
          {/* Heatmap */}
          <div className="overflow-x-auto pb-1 flex-1 min-w-0">
            <div className="inline-block">
              <div className="flex gap-[3px] mb-1">
                {monthLabels.map((m, i) => (
                  <div key={i} style={{ width: 11 }} className="text-[8px] text-slate-400 leading-none">{m || ''}</div>
                ))}
              </div>
              <div className="flex gap-[3px]">
                {weeks.map((col, ci) => (
                  <div key={ci} className="flex flex-col gap-[3px]">
                    {col.map((cell) => {
                      if (!cell.inYear) return <div key={cell.key} style={{ width: 11, height: 11 }} />;
                      const count = days[cell.key] || 0;
                      return (
                        <div
                          key={cell.key}
                          title={`${count} point${count === 1 ? '' : 's'} · ${cell.key}`}
                          style={{ width: 11, height: 11, borderRadius: 2, background: cellColor(count) }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-1.5 mt-2 justify-end">
                <span className="text-[9px] text-slate-400">Less</span>
                {[0, 4, 10, 18, 28].map((n) => (
                  <div key={n} style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(n) }} />
                ))}
                <span className="text-[9px] text-slate-400">More</span>
              </div>
            </div>
          </div>

          {/* Year rail (GitHub-style) */}
          <div className="shrink-0 flex flex-col gap-1">
            {yearOptions.map((y) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-md text-left transition-colors ${
                  y === year
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* ── Contribution activity timeline ────────────────────────────── */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">Contribution activity</h4>
          {loading ? (
            <div className="text-xs text-slate-400">Loading…</div>
          ) : timeline.length === 0 ? (
            <div className="text-xs text-slate-400">No delivered work recorded in {year} yet.</div>
          ) : (
            <div className="relative pl-4">
              {/* vertical rail */}
              <span className="absolute left-[5px] top-1 bottom-1 w-px dark:bg-slate-800" style={{ background: '#e2e8f0' }} />
              <div className="space-y-4">
                {timeline.map((g) => (
                  <div key={g.date} className="relative">
                    <span className="absolute -left-4 top-1 w-[11px] h-[11px] rounded-full bg-white border-2 border-emerald-400" />
                    <div className="text-[11px] font-bold text-slate-500 mb-1.5">{g.label}</div>
                    <ul className="space-y-1">
                      {g.items.map((it) => (
                        <li key={it.id} className="flex items-center gap-2 text-xs">
                          <span className="text-[11px]">{it.kind === 'subtask' ? '☑️' : '✅'}</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate">
                            {it.kind === 'subtask' ? 'Checked off' : 'Completed'} <span className="font-medium">{it.title}</span>
                          </span>
                          {it.projectCode && (
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">{it.projectCode}</span>
                          )}
                          {it.gxpCritical && (
                            <span className="text-[9px] font-bold text-amber-600 shrink-0">GxP</span>
                          )}
                          <span className="ml-auto text-[10px] font-semibold text-emerald-600 shrink-0">+{it.points}</span>
                          <span className="text-[10px] text-slate-300 shrink-0 w-12 text-right">{timeAgo(it.completedAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
