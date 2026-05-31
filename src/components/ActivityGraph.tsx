'use client';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/client/api';
import { Flame } from 'lucide-react';

// GitHub-style activity heatmap (#7). Reflects *all* of a user's activity in
// Pragati — every audit-logged action (logging in, opening projects, moving
// tasks, completing work) counts toward a day's contribution. Data comes from
// /api/users/me/activity (own profile) or /api/users/:id/activity (a team
// leader peeking at a teammate). A compact streak counter keeps it encouraging
// without the old badge wall competing with the profile content.

function cellColor(n: number): string {
  if (!n) return '#ebedf0';
  if (n <= 3) return '#9be9a8';
  if (n <= 8) return '#40c463';
  if (n <= 15) return '#30a14e';
  return '#216e39';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type ActivityData = {
  year: number;
  days: Record<string, number>;
  badges: string[];
  streak: number;
  totalTasksDone: number;
};

export function ActivityGraph({ userId }: { userId?: string; name?: string }) {
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
    </div>
  );
}
