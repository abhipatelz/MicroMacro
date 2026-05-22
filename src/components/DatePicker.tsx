'use client';
import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * DatePicker — a clean calendar dropdown.
 * Replaces the native `<input type="date">` with a styled trigger button
 * and a custom month-grid popover. Pass `value` as an ISO date string
 * (YYYY-MM-DD) or `null`. `onChange` receives the same format.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  minDate,
  size = 'md',
  className = '',
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  minDate?: Date;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const today = new Date();

  const selected = value ? parseISO(value) : null;
  const [viewMonth, setViewMonth] = useState(() => selected || today);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open && selected) setViewMonth(selected);
  }, [open, value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute popover position relative to the viewport (portal to body).
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const POP_WIDTH  = 260;
    const POP_HEIGHT = 300; // approx, used only to decide flip direction
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceBelow = vh - r.bottom;
      const openUp     = spaceBelow < POP_HEIGHT + 12 && r.top > POP_HEIGHT + 12;
      let left = r.right - POP_WIDTH;          // right-align with trigger
      if (left < 8) left = 8;                  // clamp to viewport
      if (left + POP_WIDTH > vw - 8) left = vw - POP_WIDTH - 8;
      const top = openUp ? r.top - POP_HEIGHT - 6 : r.bottom + 6;
      setCoords({ top, left });
    };
    place();
    window.addEventListener('scroll',  place, true);
    window.addEventListener('resize',  place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const display = selected ? formatPretty(selected) : '';
  const pad = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-xs';

  function select(d: Date) {
    onChange(toISO(d));
    setOpen(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange(null);
  }

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 rounded-lg border bg-white transition-all font-medium text-slate-700 ${
          open ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
        } ${pad}`}
      >
        <Calendar size={size === 'sm' ? 11 : 12} className="text-slate-400 shrink-0" />
        <span className={display ? 'text-slate-700' : 'text-slate-400'}>
          {display || placeholder}
        </span>
        {display && (
          <span
            role="button"
            tabIndex={-1}
            onClick={clear}
            className="ml-0.5 p-0.5 text-slate-300 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors"
            aria-label="Clear date"
          >
            <X size={9} />
          </span>
        )}
      </button>

      {mounted && open && coords && createPortal(
        <div
          ref={popRef}
          className="fixed bg-white rounded-xl border border-slate-100 p-3 fade-in-soft datepicker-pop"
          style={{
            top: coords.top,
            left: coords.left,
            width: 260,
            zIndex: 9999,
            boxShadow: '0 8px 32px rgba(15,23,42,0.18), 0 2px 8px rgba(15,23,42,0.08)',
          }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
        >
          <CalendarGrid
            viewMonth={viewMonth}
            setViewMonth={setViewMonth}
            selected={selected}
            today={today}
            minDate={minDate}
            onPick={select}
          />

          {/* Quick presets */}
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex gap-1.5 flex-wrap">
            {[
              { label: 'Today',       d: new Date() },
              { label: 'Tomorrow',    d: addDays(new Date(), 1) },
              { label: 'In 1 week',   d: addDays(new Date(), 7) },
              { label: 'In 1 month',  d: addDays(new Date(), 30) },
            ].map(p => (
              <button key={p.label}
                type="button"
                onClick={() => select(p.d)}
                className="text-[10px] font-semibold px-2 py-1 rounded-full bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                {p.label}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Calendar grid ─────────────────────────────────────────────────────────── */
function CalendarGrid({
  viewMonth, setViewMonth, selected, today, minDate, onPick,
}: {
  viewMonth: Date;
  setViewMonth: (d: Date) => void;
  selected: Date | null;
  today: Date;
  minDate?: Date;
  onPick: (d: Date) => void;
}) {
  const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const monthEnd   = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0);
  // Start grid on Sunday before monthStart
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days: Date[] = [];
  const d = new Date(gridStart);
  for (let i = 0; i < 42; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ChevronLeft size={14} />
        </button>
        <div className="text-xs font-bold text-slate-700 tracking-tight">{monthLabel}</div>
        <button type="button"
          onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
          className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {['S','M','T','W','T','F','S'].map((w, i) => (
          <div key={i} className="text-[9px] font-bold text-slate-300 uppercase tracking-wider text-center py-1">
            {w}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          const inMonth   = day.getMonth() === viewMonth.getMonth();
          const isToday   = isSameDay(day, today);
          const isSel     = selected && isSameDay(day, selected);
          const disabled  = minDate ? day < startOfDay(minDate) : false;

          let cls = 'w-8 h-7 text-[11px] font-medium rounded-md transition-all relative';
          if (disabled) cls += ' text-slate-200 cursor-not-allowed';
          else if (isSel) cls += ' bg-blue-600 text-white font-bold shadow-sm';
          else if (isToday) cls += ' text-blue-700 font-bold ring-1 ring-blue-200 hover:bg-blue-50';
          else if (inMonth) cls += ' text-slate-700 hover:bg-slate-100';
          else cls += ' text-slate-300 hover:bg-slate-50';

          return (
            <button key={i}
              type="button"
              disabled={disabled}
              onClick={() => !disabled && onPick(day)}
              className={cls}>
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Date utilities ────────────────────────────────────────────────────────── */
function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISO(s: string): Date | null {
  if (!s) return null;
  // Force noon to avoid TZ off-by-one
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfDay(d: Date) {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r;
}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function formatPretty(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
