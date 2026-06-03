'use client';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/client/api';
import { useCurrentUser } from '@/components/CurrentUserContext';
import {
  Flame, Clock3, CheckCircle2, Target, FolderCheck, CalendarCheck,
  Trophy, Zap, Users, Lightbulb, Award, GraduationCap, Scale, Gauge,
  UserPlus, ShieldCheck, Database, ScrollText,
} from 'lucide-react';

/* Map each achievement id to a lucide icon. Keeps the renderer pure. */
const ACHIEVEMENT_ICON: Record<string, any> = {
  ic_milestone:  Trophy,
  ic_on_time:    Zap,
  ic_collab:     Users,
  ic_ideas:      Lightbulb,
  lead_finisher: Award,
  lead_mentor:   GraduationCap,
  lead_balance:  Scale,
  lead_velocity: Gauge,
  adm_onboard:   UserPlus,
  adm_guardian:  ShieldCheck,
  adm_steward:   Database,
  adm_audit:     ScrollText,
};

/* Tier visual language. 0 = locked grey, 1/2/3 = bronze / silver / gold.
   The colours echo a podium so the progression is unmistakable at a glance. */
const TIER_STYLE: Record<0 | 1 | 2 | 3, { ring: string; fg: string; bg: string; label: string }> = {
  0: { ring: '#e2e8f0', fg: '#94a3b8', bg: '#f8fafc', label: 'Locked' },
  1: { ring: '#b45309', fg: '#92400e', bg: '#fef3c7', label: 'Bronze' },
  2: { ring: '#64748b', fg: '#334155', bg: '#e2e8f0', label: 'Silver' },
  3: { ring: '#b8860b', fg: '#854d0e', bg: '#fef9c3', label: 'Gold'   },
};

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

/* Track the live theme so the heatmap palette can flip with it. The cells use
   inline background styles (can't be themed with a `.dark` selector), so we
   read the `dark` class off <html> and re-render when it toggles. Previously
   the light-mode hexes leaked into dark mode, painting a wall of white cells. */
function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains('dark'));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

// Weighted-score colour scale (a normal task ≈ 5–7 pts/day). Dark mode uses
// GitHub's dark heatmap greens on a faint translucent empty cell.
function cellColor(n: number, dark: boolean): string {
  if (!n) return dark ? 'rgba(255,255,255,0.06)' : '#ebedf0';
  if (dark) {
    if (n <= 5)  return '#0e4429';
    if (n <= 12) return '#006d32';
    if (n <= 22) return '#26a641';
    return '#39d353';
  }
  if (n <= 5) return '#9be9a8';
  if (n <= 12) return '#40c463';
  if (n <= 22) return '#30a14e';
  return '#216e39';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];


const ACTIVITY_GRAPH_CACHE_MS = 2 * 60_000;
const activityGraphCache = new Map<string, { at: number; data: ActivityData }>();
const activityGraphInflight = new Map<string, Promise<ActivityData>>();

function activityKey(who: string, year: number, viewerId?: string) {
  return viewerId ? `${viewerId}:${who}:${year}` : '';
}

function loadActivity(who: string, year: number, viewerId?: string) {
  const key = activityKey(who, year, viewerId);
  if (key) {
    const cached = activityGraphCache.get(key);
    if (cached && Date.now() - cached.at < ACTIVITY_GRAPH_CACHE_MS) return Promise.resolve(cached.data);
    const pending = activityGraphInflight.get(key);
    if (pending) return pending;
  }
  const req = api<ActivityData>(`/${who}?year=${year}`).then((data) => {
    if (key) activityGraphCache.set(key, { at: Date.now(), data });
    return data;
  }).finally(() => { if (key) activityGraphInflight.delete(key); });
  if (key) activityGraphInflight.set(key, req);
  return req;
}

type ContribItem = {
  id: string; title: string; projectName: string; projectCode: string;
  completedAt: string | null; points: number; gxpCritical: boolean; priority: string;
  kind: 'task' | 'subtask' | 'comment' | 'first_day';
};

type Achievement = {
  id: string;
  label: string;
  hint: string;
  value: number;
  target: number | null;
  tier: 0 | 1 | 2 | 3;
  role: 'ic' | 'lead' | 'admin';
};

type ActivityData = {
  year: number;
  firstYear: number;
  days: Record<string, number>;
  total: number;
  streak: number;
  totalTasksDone: number;
  onTimeTasks: number;
  onTimeRate: number;
  projectsCompleted: number;
  projectsOnTime: number;
  badges: string[];
  recent: ContribItem[];
  achievements?: Achievement[];
  role?: 'ic' | 'lead' | 'admin';
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

/* ── Role-based achievement tile ─────────────────────────────────────────
   Renders a single achievement as an outlined medal tile. Bronze / silver /
   gold ring + tint signal earned tier; locked tiles stay neutral with a
   "go-to" target so the path forward is concrete. Every value is a real,
   traceable count from /api/users/:id/activity (see contributions.ts). */
function AchievementTile({ a }: { a: Achievement }) {
  const Icon = ACHIEVEMENT_ICON[a.id] || CheckCircle2;
  const style = TIER_STYLE[a.tier];
  const earned = a.tier > 0;
  const next   = a.target;
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border bg-white dark:bg-white/[0.02] px-3 py-2.5 transition-all hover:shadow-sm"
      style={{ borderColor: earned ? `${style.ring}55` : undefined }}
      title={a.hint}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: earned ? style.bg : '#f1f5f9',
          boxShadow: earned ? `inset 0 0 0 1.5px ${style.ring}` : 'inset 0 0 0 1px #e2e8f0',
        }}
      >
        <Icon size={16} style={{ color: earned ? style.fg : '#94a3b8' }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="text-[12px] font-bold leading-none text-slate-800 dark:text-slate-100 truncate">{a.label}</div>
          {earned && (
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0"
              style={{ color: style.fg, background: style.bg }}
            >
              {style.label}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-400 mt-1 leading-tight tabular-nums">
          {next === null ? `${a.value} · Max tier` : `${a.value} / ${next}`}
        </div>
      </div>
    </div>
  );
}

export function ActivityGraph({ userId, name }: { userId?: string; name?: string }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const dark = useIsDark();
  // Custom heatmap tooltip — replaces the native `title=""` so the hover reads
  // cleanly (formatted date + point count) instead of the OS' slow tooltip.
  const [tip, setTip] = useState<{ x: number; y: number; count: number; date: string } | null>(null);
  const currentUser = useCurrentUser();

  const who = userId ? `users/${userId}/activity` : 'users/me/activity';
  const viewerId = currentUser?.id;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadActivity(who, year, viewerId)
      .then((next) => { if (alive) setData(next); })
      .catch(() => { if (alive) setData({ year, firstYear: year, days: {}, total: 0, streak: 0, totalTasksDone: 0, onTimeTasks: 0, onTimeRate: 0, projectsCompleted: 0, projectsOnTime: 0, badges: [], recent: [], achievements: [], role: 'ic' }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [who, year, viewerId]);

  const days = useMemo(() => data?.days || {}, [data?.days]);

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

  const achievements = data?.achievements || [];
  const role         = data?.role || 'ic';
  const roleLabel    = role === 'admin' ? 'Admin' : role === 'lead' ? 'Team Lead' : 'Individual Contributor';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[210px_1fr] gap-5">
      {/* Floating heatmap tooltip — portalled to <body> so it isn't dragged by a
          transformed ancestor. (When this graph lives inside a modal that uses
          `transform: scale()` for its entrance animation, `position: fixed`
          descendants are positioned relative to the modal, not the viewport,
          which is what was throwing the tooltip "to the far right".) */}
      {tip && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[1000] pointer-events-none -translate-x-1/2 -translate-y-full"
          style={{ left: tip.x, top: tip.y - 8 }}
        >
          <div className="rounded-lg bg-slate-900 text-white px-2.5 py-1.5 shadow-xl text-center whitespace-nowrap">
            <div className="text-[11px] font-bold leading-tight">
              {tip.count} contribution point{tip.count === 1 ? '' : 's'}
            </div>
            <div className="text-[10px] text-white/60 leading-tight">
              {new Date(tip.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          </div>
          <div className="mx-auto w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-slate-900" />
        </div>,
        document.body,
      )}
      {/* ── Milestones rail (left) — role-based achievements ───────────────
          Each tile is a discrete recognition tied to a traceable metric. The
          set adapts to the viewed user's role (IC / TL / Admin) so the
          achievements reflect what each role actually owns. */}
      <aside className="lg:border-r lg:border-slate-100 dark:lg:border-slate-800 lg:pr-4">
        <div className="flex items-center gap-1.5 mb-1">
          <Trophy size={13} className="text-amber-500" />
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Milestones</h4>
        </div>
        <div className="text-[10px] text-slate-400 mb-3">{roleLabel} achievements</div>
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
          {achievements.length === 0 ? (
            <div className="text-[10px] text-slate-300 italic">Loading…</div>
          ) : (
            achievements.map((a) => <AchievementTile key={a.id} a={a} />)
          )}
        </div>
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
                          onMouseEnter={(e) => {
                            const r = (e.target as HTMLElement).getBoundingClientRect();
                            setTip({ x: r.left + r.width / 2, y: r.top, count, date: cell.key });
                          }}
                          onMouseLeave={() => setTip(null)}
                          className="cursor-default transition-transform hover:scale-[1.6] hover:z-10"
                          style={{
                            width: 11, height: 11, borderRadius: 2,
                            background: cellColor(count, dark),
                            outline: count ? '1px solid rgba(0,0,0,0.04)' : 'none',
                          }}
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
                  <div key={n} style={{ width: 10, height: 10, borderRadius: 2, background: cellColor(n, dark) }} />
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
                      {g.items.map((it) => {
                        const verb = it.kind === 'subtask' ? 'Checked off'
                          : it.kind === 'comment' ? 'Commented on'
                          : it.kind === 'first_day' ? '🎉'
                          : 'Completed';
                        const glyph = it.kind === 'subtask' ? '☑️'
                          : it.kind === 'comment' ? '💬'
                          : it.kind === 'first_day' ? '🌱'
                          : '✅';
                        return (
                        <li key={it.id} className="flex items-center gap-2 text-xs">
                          <span className="text-[11px]">{glyph}</span>
                          <span className="text-slate-700 dark:text-slate-300 truncate">
                            {it.kind === 'first_day'
                              ? <span className="font-medium">{it.title}</span>
                              : <>{verb} <span className="font-medium">{it.title}</span></>}
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
                        );
                      })}
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
