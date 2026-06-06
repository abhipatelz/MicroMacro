'use client';

// ── Sidebar mini-calendar ───────────────────────────────────────────────────
// A compact month grid pinned in the sidebar, just above "My Day". Each day
// that has open work due gets a small dot — blue for my own tasks, green for
// my teams' tasks, red when something on that day is overdue. Hovering a day
// raises a floating card listing what's due. The month is navigable so it
// doubles as a quick "what's coming" glance without leaving the page.
//
// Data comes from the read-only /api/me/calendar feed (scoped to the user and
// the teams they lead/belong to). Results are cached per-range in-module so the
// hover-expand sidebar never refetches on remount.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '@/lib/client/api';

interface CalTask {
  id: string;
  title: string;
  status: string;
  due: string;            // ISO
  mine: boolean;
  assigneeName: string | null;
  teamName: string | null;
  projectCode: string | null;
  priority: string | null;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Local YYYY-MM-DD key (avoids UTC drift from toISOString).
function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Per-range cache shared across mounts so the hover-expand sidebar is instant.
const rangeCache = new Map<string, CalTask[]>();

export function SidebarCalendar({ dark }: { dark: boolean }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [tasks, setTasks] = useState<CalTask[]>([]);
  const [hover, setHover] = useState<{ key: string; x: number; y: number; placeLeft: boolean } | null>(null);
  const [headerHovered, setHeaderHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The 6-week (42-cell) grid that covers the visible month, including the
  // spill-over days from the adjacent months so dots there line up too.
  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(first.getDate() - first.getDay()); // back up to Sunday
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const rangeKey = `${dayKey(grid[0])}|${dayKey(grid[41])}`;

  useEffect(() => {
    let alive = true;
    const cached = rangeCache.get(rangeKey);
    if (cached) { setTasks(cached); return; }
    api<{ tasks: CalTask[] }>(`/me/calendar?from=${dayKey(grid[0])}&to=${dayKey(grid[41])}`)
      .then(d => {
        if (!alive) return;
        rangeCache.set(rangeKey, d.tasks);
        setTasks(d.tasks);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [rangeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Group tasks by local day, and pre-compute the dot signals per day.
  const byDay = useMemo(() => {
    const m = new Map<string, CalTask[]>();
    for (const t of tasks) {
      const k = dayKey(new Date(t.due));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [tasks]);

  const todayKey = dayKey(today);

  function signals(list: CalTask[]) {
    let mine = false, team = false, overdue = false;
    for (const t of list) {
      if (t.mine) mine = true; else team = true;
      if (new Date(t.due) < new Date(todayKey) && t.status !== 'done') overdue = true;
    }
    return { mine, team, overdue };
  }

  function openHover(key: string, el: HTMLElement) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const r = el.getBoundingClientRect();
    // Place the card to the right of the day cell, but flip to the left when
    // there isn't room (keeps it from spilling off-screen). Vertically it's
    // centred on the cell, then clamped so a bottom-row day's card never runs
    // past the viewport edges.
    const CARD_W = 248;
    const CARD_H = 240;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const placeLeft = r.right + CARD_W + 16 > vw;
    const x = placeLeft ? r.left - 10 : r.right + 10;
    const half = CARD_H / 2;
    const y = Math.max(half + 8, Math.min(r.top + r.height / 2, vh - half - 8));
    setHover({ key, x, y, placeLeft });
  }
  function closeHover() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHover(null), 80);
  }

  const monthName  = MONTHS[cursor.getMonth()];
  const monthYear  = cursor.getFullYear();
  const monthLabel = `${monthName} ${monthYear}`;
  const isCurrentMonth = cursor.getMonth() === today.getMonth() && cursor.getFullYear() === today.getFullYear();

  const hoverList = hover ? (byDay.get(hover.key) || []) : [];

  // Determine the dominant accent color for the hover card's left-border:
  // overdue → red, mine (no overdue) → blue, team only → green.
  function hoverAccentColor(list: CalTask[]): string {
    const sig = signals(list);
    if (sig.overdue) return '#ef4444';
    if (sig.mine)    return '#1976D2';
    return '#22a565';
  }

  return (
    <div className="mt-2 pt-2.5 border-t" style={{ borderColor: dark ? 'rgba(255,255,255,0.06)' : '#eef2f7' }}>
      {/* Header — month + nav arrows (arrows reveal only on header hover) */}
      <div
        className="flex items-center justify-between px-1 mb-1.5"
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        <button
          onClick={() => !isCurrentMonth && setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
          className={`flex items-baseline gap-1 text-[11px] tracking-tight truncate transition-colors ${
            isCurrentMonth ? 'cursor-default' : 'hover:text-blue-500 cursor-pointer'
          }`}
          title={isCurrentMonth ? undefined : 'Back to this month'}
        >
          <span className={`font-black ${dark ? 'text-white/80' : 'text-slate-700'}`}>{monthName}</span>
          <span className={`font-semibold ${dark ? 'text-white/35' : 'text-slate-400'}`}>{monthYear}</span>
        </button>
        <div
          className="flex items-center gap-0.5 shrink-0 transition-all duration-150"
          style={{ opacity: headerHovered ? 1 : 0, pointerEvents: headerHovered ? 'auto' : 'none' }}
        >
          <button
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            className={`p-0.5 rounded transition-colors ${dark ? 'text-white/35 hover:text-white/70 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            aria-label="Previous month"
          >
            <ChevronLeft size={13} />
          </button>
          <button
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            className={`p-0.5 rounded transition-colors ${dark ? 'text-white/35 hover:text-white/70 hover:bg-white/5' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
            aria-label="Next month"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 mb-0.5">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className={`text-center text-[8px] font-bold ${dark ? 'text-white/25' : 'text-slate-300'}`}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {grid.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = k === todayKey;
          const list = byDay.get(k);
          const sig = list && list.length ? signals(list) : null;
          return (
            <div key={k} className="flex flex-col items-center">
              <button
                onMouseEnter={(e) => list && openHover(k, e.currentTarget)}
                onMouseLeave={closeHover}
                onClick={(e) => list && openHover(k, e.currentTarget)}
                className={`relative rounded-full flex items-center justify-center text-[10px] font-semibold transition-colors ${
                  list ? 'cursor-pointer' : 'cursor-default'
                } ${
                  isToday
                    ? 'text-white'
                    : inMonth
                      ? (dark ? 'text-white/70 hover:bg-white/5' : 'text-slate-600 hover:bg-slate-100')
                      : (dark ? 'text-white/20' : 'text-slate-300')
                }`}
                style={isToday
                  ? { width: 26, height: 26, background: 'linear-gradient(135deg,#0d47a1 0%,#1565C0 45%,#1e88e5 100%)', boxShadow: '0 2px 8px rgba(21,101,192,0.45)' }
                  : { width: 24, height: 24 }}
              >
                {d.getDate()}
              </button>
              {/* Dots — at most two (mine=blue, team=green); overdue paints red */}
              <div className="flex items-center gap-[2px] h-[6px] mt-[1px]">
                {sig?.overdue && <span className="w-[6px] h-[6px] rounded-full" style={{ background: '#ef4444' }} />}
                {!sig?.overdue && sig?.mine && <span className="w-[6px] h-[6px] rounded-full" style={{ background: '#1976D2' }} />}
                {!sig?.overdue && sig?.team && <span className="w-[6px] h-[6px] rounded-full" style={{ background: '#22a565' }} />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating hover card — portalled so the sidebar's overflow never clips it */}
      {hover && hoverList.length > 0 && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[1200] -translate-y-1/2 pointer-events-auto"
          style={{ left: hover.x, top: hover.y, transform: hover.placeLeft ? 'translate(-100%, -50%)' : 'translateY(-50%)' }}
          onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}
          onMouseLeave={closeHover}
        >
          <div
            className="w-[248px] rounded-xl border p-2.5 shadow-2xl"
            style={{
              background: dark ? '#2b2b29' : '#ffffff',
              borderColor: dark ? 'rgba(255,255,255,0.10)' : '#e2e8f0',
              boxShadow: dark ? '0 18px 44px rgba(0,0,0,0.5)' : '0 18px 44px rgba(15,23,42,0.18)',
              borderLeft: `3px solid ${hoverAccentColor(hoverList)}`,
            }}
          >
            <div className={`text-[12px] font-black tracking-tight mb-1.5 ${dark ? 'text-white/85' : 'text-slate-700'}`}>
              {new Date(hover.key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto no-scrollbar">
              {hoverList.slice(0, 6).map(t => {
                const overdue = new Date(t.due) < new Date(todayKey) && t.status !== 'done';
                return (
                  <div key={t.id} className="flex items-start gap-1.5">
                    <span
                      className="w-[6px] h-[6px] rounded-full mt-[5px] shrink-0"
                      style={{ background: overdue ? '#ef4444' : t.mine ? '#1976D2' : '#22a565' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11.5px] font-medium leading-snug truncate ${dark ? 'text-white/80' : 'text-slate-700'}`}>
                        {t.title}
                      </div>
                      {/* Meta line: who it's on (assignee first name), then the
                          project ref with the team in brackets right after it.
                          The assignee name truncates; the ref/team and overdue
                          tags hold their width so a long name can't wrap the row. */}
                      <div className={`text-[9.5px] mt-px flex items-center gap-1 min-w-0 ${dark ? 'text-white/35' : 'text-slate-400'}`}>
                        <span className={`font-semibold shrink-0 ${t.mine ? 'text-blue-500' : ''}`}
                          style={t.mine ? undefined : { color: '#22a565' }}>
                          {t.mine ? 'You' : (firstName(t.assigneeName) || 'Unassigned')}
                        </span>
                        {t.projectCode && (
                          <span className="font-mono truncate min-w-0" title={`${t.projectCode}${t.teamName ? ` (${t.teamName})` : ''}`}>
                            · {t.projectCode}{t.teamName ? ` (${t.teamName})` : ''}
                          </span>
                        )}
                        {overdue && <span className="font-semibold text-red-500 shrink-0">· overdue</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              {hoverList.length > 6 && (
                <div className={`text-[10px] font-semibold pt-0.5 ${dark ? 'text-white/35' : 'text-slate-400'}`}>
                  +{hoverList.length - 6} more
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
