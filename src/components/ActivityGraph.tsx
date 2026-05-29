'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { Flame } from 'lucide-react';

// GitHub-style activity heatmap (#7). Reflects *all* of a user's activity in
// Pragati — every audit-logged action (logging in, opening projects, moving
// tasks, completing work) counts toward a day's contribution. Data comes from
// /api/users/me/activity (own profile) or /api/users/:id/activity (a team
// leader peeking at a teammate). Badges and a streak counter make it feel
// encouraging rather than surveillant.

function cellColor(n: number): string {
  if (!n) return '#ebedf0';
  if (n <= 3) return '#9be9a8';
  if (n <= 8) return '#40c463';
  if (n <= 15) return '#30a14e';
  return '#216e39';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── Badge catalogue ──────────────────────────────────────────────────────── */
type BadgeDef = { emoji: string; label: string; blurb: string; tint: string };
const BADGES: Record<string, BadgeDef> = {
  first_step:     { emoji: '🌱', label: 'First Step',     blurb: 'Welcome aboard — your journey on Pragati has begun.', tint: '#16a34a' },
  task_rookie:    { emoji: '✅', label: 'Rookie',          blurb: 'Closed your very first task. Onwards!',              tint: '#0ea5e9' },
  task_achiever:  { emoji: '⭐', label: 'Achiever',        blurb: '10 tasks completed. You are building momentum.',     tint: '#f59e0b' },
  task_performer: { emoji: '🏅', label: 'Performer',       blurb: '50 tasks done. A dependable force on the team.',     tint: '#8b5cf6' },
  task_champion:  { emoji: '🏆', label: 'Champion',        blurb: '100 tasks delivered. Truly elite execution.',        tint: '#eab308' },
  project_hero:   { emoji: '🚀', label: 'Project Hero',    blurb: 'Helped carry a whole project to completion.',        tint: '#ef4444' },
  streak_3:       { emoji: '🔥', label: '3-Day Streak',    blurb: 'Active three days running. Consistency pays off.',   tint: '#f97316' },
  streak_7:       { emoji: '⚡', label: '7-Day Streak',    blurb: 'A full week of activity — unstoppable.',             tint: '#d946ef' },
};
const BADGE_ORDER = ['first_step', 'task_rookie', 'task_achiever', 'task_performer', 'task_champion', 'project_hero', 'streak_3', 'streak_7'];

type ActivityData = {
  year: number;
  days: Record<string, number>;
  badges: string[];
  streak: number;
  totalTasksDone: number;
};

export function ActivityGraph({ userId, name }: { userId?: string; name?: string }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  const who = userId ? `users/${userId}/activity` : 'users/me/activity';

  useEffect(() => {
    setLoading(true);
    api<ActivityData>(`/${who}?year=${year}`)
      .then((d) => setData(d))
      .catch(() => setData({ year, days: {}, badges: [], streak: 0, totalTasksDone: 0 }))
      .finally(() => setLoading(false));
  }, [who, year]);

  const days = data?.days || {};

  // Build week columns for the selected calendar year, Sunday-aligned.
  const { weeks, total } = useMemo(() => {
    const start = new Date(`${year}-01-01T00:00:00`);
    start.setDate(start.getDate() - start.getDay()); // back up to Sunday
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
      const d = new Date(firstInYear.key + 'T00:00:00');
      const m = d.getMonth();
      if (m !== lastMonth) { labels.push(MONTHS[m]); lastMonth = m; }
      else labels.push(null);
    }
    return labels;
  }, [weeks]);

  const earned = data?.badges || [];
  const subject = name ? `${name.split(' ')[0]}'s` : 'Your';
  const yearOptions: number[] = [];
  for (let y = currentYear; y >= 2023; y--) yearOptions.push(y);

  return (
    <div>
      {/* Header: total + streak + year picker */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {loading
              ? 'Loading…'
              : <><strong className="text-slate-600 dark:text-slate-300">{total}</strong> contribution{total === 1 ? '' : 's'} in {year}</>}
          </span>
          {!loading && (data?.streak ?? 0) > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600 bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 rounded-full">
              <Flame size={11} className="fill-orange-400 text-orange-500" />
              {data!.streak}-day streak
            </span>
          )}
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="text-[11px] font-semibold text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-400/40"
        >
          {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Heatmap */}
      <div className="overflow-x-auto pb-1">
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
                      title={`${count} ${count === 1 ? 'contribution' : 'contributions'} · ${cell.key}`}
                      style={{ width: 11, height: 11, borderRadius: 2, background: cellColor(count) }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-1.5 mt-2 justify-end">
        <span className="text-[9px] text-slate-400">Less</span>
        {[0, 2, 5, 10, 20].map((n) => (
          <div key={n} style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(n) }} />
        ))}
        <span className="text-[9px] text-slate-400">More</span>
      </div>

      {/* Badges */}
      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Badges earned</h4>
          <span className="text-[11px] text-slate-400">{earned.length} / {BADGE_ORDER.length}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BADGE_ORDER.map((key) => {
            const b = BADGES[key];
            const got = earned.includes(key);
            return (
              <div
                key={key}
                title={got ? b.blurb : `Locked — ${b.blurb}`}
                className="flex flex-col items-center text-center gap-1 rounded-lg px-1.5 py-2.5 transition-all"
                style={{
                  background: got ? `${b.tint}12` : 'transparent',
                  border: `1px solid ${got ? `${b.tint}33` : 'rgba(148,163,184,0.18)'}`,
                  opacity: got ? 1 : 0.4,
                  filter: got ? 'none' : 'grayscale(1)',
                }}
              >
                <span className="text-lg leading-none">{b.emoji}</span>
                <span className="text-[9px] font-bold leading-tight" style={{ color: got ? b.tint : '#94a3b8' }}>{b.label}</span>
              </div>
            );
          })}
        </div>
        {!loading && (
          <p className="text-[11px] text-slate-400 mt-3 leading-snug">
            {earned.length >= BADGE_ORDER.length
              ? `🎉 Every badge unlocked — ${name ? name.split(' ')[0] + ' is' : 'you are'} a Pragati legend!`
              : `${subject} next milestone is just a few contributions away. Keep going!`}
          </p>
        )}
      </div>
    </div>
  );
}
