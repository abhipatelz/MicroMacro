'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import { UserAvatar } from './AvatarRegistry';
import { api } from '@/lib/client/api';

/**
 * UserPicker — a search-as-you-type, paginated replacement for the native
 * <select> rosters used to pick an assignee / team member.
 *
 * Why it exists: every previous picker loaded the FULL user list into a
 * dropdown (`/api/users` with no limit). That's fine at ~10 users and a wall
 * at thousands. This component instead queries the directory endpoint the
 * backend already exposes — `/api/users?q=&limit=&offset=&teamId=` — so the
 * client only ever holds one page (20 rows) regardless of how many people the
 * workspace has. Server-side regex search + skip/limit do the heavy lifting,
 * so the same control scales from a handful of users to a very large org.
 *
 * Visual language matches <Select>: the trigger looks like `.select`, the
 * popover is portalled to <body> so it never gets clipped by an ancestor's
 * overflow, and it carries the same dark-mode treatment.
 */
type Row = {
  id: string; name: string; title?: string; department?: string;
  organisation?: string; role?: string;
};

const PAGE = 20;

export function UserPicker({
  value,
  valueLabel,
  onChange,
  teamId,
  excludeAdmin = false,
  excludeIds,
  allowUnassigned = true,
  unassignedLabel = 'Unassigned',
  placeholder = 'Search people…',
  disabled = false,
  ariaLabel,
  className = '',
  size = 'md',
}: {
  value: string;
  /** Display name for the current selection when the list isn't loaded yet. */
  valueLabel?: string | null;
  onChange: (userId: string) => void;
  /** Scope the roster to a team's lead + members. */
  teamId?: string | null;
  /** Drop the workspace admin from results (admins are never assignees). */
  excludeAdmin?: boolean;
  /** Hide specific ids (e.g. people already on the team). */
  excludeIds?: string[];
  allowUnassigned?: boolean;
  unassignedLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const [open, setOpen]       = useState(false);
  const [mounted, setMounted] = useState(false);
  const [q, setQ]             = useState('');
  const [rows, setRows]       = useState<Row[]>([]);
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(false);
  const [active, setActive]   = useState(0);
  // Remember the label of the selected user once we've seen it, so the resting
  // trigger keeps showing the name even after the search list changes.
  const [seenLabel, setSeenLabel] = useState<string | null>(valueLabel ?? null);

  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean } | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (valueLabel) setSeenLabel(valueLabel); }, [valueLabel]);

  // Fetch a page from the directory endpoint. `reset` replaces, else appends.
  async function fetchPage(query: string, offset: number, reset: boolean) {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
      if (query) sp.set('q', query);
      if (teamId) sp.set('teamId', teamId);
      const res = await api<{ items: Row[]; total: number }>(`/users?${sp.toString()}`);
      let items = res.items || [];
      if (excludeAdmin) items = items.filter((u) => u.role !== 'admin');
      if (excludeIds?.length) items = items.filter((u) => !excludeIds.includes(u.id));
      setTotal(res.total ?? items.length);
      setRows((prev) => (reset ? items : [...prev, ...items]));
    } catch {
      if (reset) { setRows([]); setTotal(0); }
    } finally {
      setLoading(false);
    }
  }

  // (Re)load page 1 when opening or when the debounced query changes.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => { setActive(0); fetchPage(q, 0, true); }, q ? 220 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, q, teamId]);

  // Focus the search box on open.
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 20); }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const place = () => {
      const r = btnRef.current!.getBoundingClientRect();
      const POP_H = 320;
      const spaceBelow = window.innerHeight - r.bottom;
      const openUp = spaceBelow < POP_H + 12 && r.top > POP_H + 12;
      setCoords({
        top: openUp ? r.top - POP_H - 6 : r.bottom + 6,
        left: r.left,
        width: Math.max(r.width, 240),
        openUp,
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Build the option list: optional "Unassigned" first, then fetched rows.
  const options: Array<{ id: string; label: string; sub?: string; clear?: boolean }> = [
    ...(allowUnassigned ? [{ id: '', label: unassignedLabel, clear: true }] : []),
    ...rows.map((u) => ({
      id: u.id,
      label: u.name,
      sub: [u.title, u.department || u.organisation].filter(Boolean).join(' · ') || undefined,
    })),
  ];

  function commit(id: string, label: string) {
    onChange(id);
    if (id) setSeenLabel(label); else setSeenLabel(null);
    setOpen(false);
    setQ('');
    btnRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(options.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter')     {
      e.preventDefault();
      const opt = options[active];
      if (opt) commit(opt.id, opt.label);
    }
  }

  const restLabel = value ? (seenLabel || 'Selected user') : (allowUnassigned ? unassignedLabel : placeholder);
  const pad = size === 'sm' ? 'px-2 py-1 text-xs' : '';

  return (
    <div className={`relative ${className}`}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`select flex items-center justify-between gap-2 text-left ${pad} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${open ? 'ring-2 ring-blue-100 border-blue-300' : ''}`}
        style={{ backgroundImage: 'none', paddingRight: '0.6rem' }}
      >
        <span className="flex items-center gap-2 min-w-0">
          {value
            ? <UserAvatar userId={value} name={seenLabel || ''} size={size === 'sm' ? 18 : 20} />
            : null}
          <span className={`truncate ${value ? '' : 'text-slate-400 dark:text-white/35'}`}>{restLabel}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-slate-400 dark:text-white/40 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {mounted && open && coords && createPortal(
        <div
          ref={popRef}
          role="listbox"
          tabIndex={-1}
          className="fixed z-[9999] rounded-xl border border-slate-200/80 bg-white dark:bg-[#262624] dark:border-white/10 shadow-xl overflow-hidden datepicker-pop flex flex-col"
          style={{ top: coords.top, left: coords.left, width: coords.width, maxHeight: 320, boxShadow: '0 18px 44px rgba(15,23,42,0.16)' }}
          onKeyDown={onKeyDown}
        >
          {/* Search box */}
          <div className="p-2 border-b border-slate-100 dark:border-white/10 shrink-0">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40 pointer-events-none" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-7 pr-7 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-800 dark:text-white/90 placeholder:text-slate-400 focus:outline-none focus:border-blue-300"
              />
              {q && (
                <button type="button" onClick={() => setQ('')} aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="overflow-y-auto p-1 flex-1">
            {options.map((opt, i) => {
              const isSel = opt.id === value;
              const isActive = i === active;
              return (
                <button
                  key={opt.id || '__unassigned'}
                  type="button"
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => commit(opt.id, opt.label)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                    isActive ? 'bg-blue-50 dark:bg-white/5' : 'hover:bg-slate-50 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {isSel && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
                  </span>
                  {opt.clear
                    ? <span className="w-5 h-5 rounded-full border border-dashed border-slate-300 dark:border-white/20 shrink-0" />
                    : <UserAvatar userId={opt.id} name={opt.label} size={22} />}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${isSel ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-white/80'}`}>
                      {opt.label}
                    </span>
                    {opt.sub && <span className="block text-[11px] text-slate-400 dark:text-white/40 truncate">{opt.sub}</span>}
                  </span>
                </button>
              );
            })}

            {loading && <div className="px-3 py-2 text-xs text-slate-400 dark:text-white/40">Searching…</div>}
            {!loading && rows.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-400 dark:text-white/40 text-center">
                {q ? `No people match “${q}”.` : 'No people found.'}
              </div>
            )}

            {/* Load more — only one extra page is fetched at a time. */}
            {!loading && rows.length < total && (
              <button
                type="button"
                onClick={() => fetchPage(q, rows.length, false)}
                className="w-full mt-1 px-3 py-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-white/5 rounded-lg transition-colors"
              >
                Load {Math.min(PAGE, total - rows.length)} more · {rows.length} of {total}
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
