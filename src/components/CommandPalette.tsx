'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, LayoutDashboard, FolderKanban, Users, Calendar,
  PieChart, Lightbulb, UserCog, Settings, Plus, ArrowRight,
  Hash, User as UserIcon, Keyboard, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/client/api';

interface PaletteItem {
  id:       string;
  label:    string;
  sub?:     string;
  icon:     React.ElementType;
  group:    string;
  action:   () => void;
  accent?:  boolean;
}

export function CommandPalette({ isPM }: { isPM: boolean }) {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [q, setQ]             = useState('');
  const [projects, setProjects] = useState<any[]>([]);
  const [people, setPeople]   = useState<any[]>([]);
  const [sel, setSel]         = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  /* ── Open/close ──────────────────────────────────────────────────────── */
  const close = useCallback(() => { setOpen(false); setQ(''); setSel(0); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') close();
    }
    function onCustom() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onCustom);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onCustom);
    };
  }, [close]);

  /* ── Load data on open ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!open) return;
    setSel(0);
    setTimeout(() => inputRef.current?.focus(), 40);
    api<any[]>('/projects').then(setProjects).catch(() => {});
    if (isPM) api<any[]>('/users').then(setPeople).catch(() => {});
  }, [open, isPM]);

  /* ── Item lists ──────────────────────────────────────────────────────── */
  function go(href: string) { router.push(href); close(); }

  const actions: PaletteItem[] = [
    { id: 'new-project', label: 'New project',   sub: 'Create a project',  icon: Plus, group: 'Quick actions', action: () => go('/projects/new'), accent: true },
  ];

  const nav: PaletteItem[] = [
    { id: 'n-dash',     label: 'Dashboard',       icon: LayoutDashboard, group: 'Navigate', action: () => go('/') },
    { id: 'n-projects', label: 'Projects',         icon: FolderKanban,    group: 'Navigate', action: () => go('/projects') },
    { id: 'n-yearly',   label: 'My Year',          icon: Calendar,        group: 'Navigate', action: () => go('/yearly') },
    ...(isPM ? [
      { id: 'n-teams',    label: 'Teams',           icon: Users,           group: 'Navigate', action: () => go('/teams') },
      { id: 'n-org',      label: 'Command Centre',  icon: PieChart,        group: 'Navigate', action: () => go('/org') },
      { id: 'n-insights', label: 'Insights',        icon: Lightbulb,       group: 'Navigate', action: () => go('/insights') },
      { id: 'n-people',   label: 'People',          icon: UserCog,         group: 'Navigate', action: () => go('/people') },
    ] : []),
    { id: 'n-settings', label: 'Settings',         icon: Settings,        group: 'Navigate', action: () => go('/settings') },
  ];

  const projectItems: PaletteItem[] = projects.map(p => ({
    id:     `p-${p.id}`,
    label:  p.name,
    sub:    `${p.code} · ${(p.status || '').replace('_', ' ')}`,
    icon:   Hash,
    group:  'Projects',
    action: () => go(`/projects/${p.id}`),
  }));

  const peopleItems: PaletteItem[] = people.map(u => ({
    id:     `u-${u.id}`,
    label:  u.name,
    sub:    u.title || (u.role === 'pm' || u.role === 'lead' ? 'Lead' : 'Individual Contributor'),
    icon:   UserIcon,
    group:  'People',
    action: () => go('/people'),
  }));

  /* ── Filter ──────────────────────────────────────────────────────────── */
  const all = [...actions, ...nav, ...projectItems, ...peopleItems];
  const ql  = q.toLowerCase().trim();

  const filtered: PaletteItem[] = ql
    ? all.filter(i =>
        i.label.toLowerCase().includes(ql) ||
        (i.sub?.toLowerCase().includes(ql)) ||
        i.group.toLowerCase().includes(ql)
      )
    : [...actions, ...nav.slice(0, 5), ...projectItems.slice(0, 4)];

  /* ── Group ───────────────────────────────────────────────────────────── */
  const grouped: Record<string, PaletteItem[]> = {};
  filtered.forEach(i => { (grouped[i.group] ??= []).push(i); });
  const flat = Object.values(grouped).flat();

  /* ── Keyboard nav in list ────────────────────────────────────────────── */
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, flat.length - 1)); scrollSel(sel + 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); scrollSel(sel - 1); }
    if (e.key === 'Enter' && flat[sel]) { flat[sel].action(); }
  }

  function scrollSel(idx: number) {
    const el = listRef.current?.querySelector(`[data-idx="${idx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9990] bg-black/50 backdrop-blur-[3px]"
        style={{ animation: 'fadeIn 0.15s ease-out' }}
        onClick={close}
      />

      {/* Panel */}
      <div
        className="fixed z-[9991] top-[18%] left-1/2 -translate-x-1/2 w-[calc(100vw-24px)] max-w-[560px] rounded-2xl overflow-hidden"
        style={{
          background:  'var(--bg-card)',
          border:      '1px solid var(--border-card)',
          boxShadow:   '0 32px 80px rgba(0,0,0,0.28), 0 8px 24px rgba(0,0,0,0.12)',
          animation:   'paletteIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* Search row */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b" style={{ borderColor: 'var(--border-card)' }}>
          <Search size={16} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKeyDown}
            placeholder="Search projects, pages, people…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {q && (
            <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-600 transition-colors text-xs">clear</button>
          )}
          <kbd className="hidden sm:block text-[10px] font-mono px-1.5 py-0.5 rounded text-slate-400"
            style={{ background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)' }}>esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[380px] overflow-y-auto py-1">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="px-4 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                {group}
              </div>
              {items.map(item => {
                const Icon  = item.icon;
                const idx   = flat.indexOf(item);
                const active = idx === sel;
                return (
                  <button
                    key={item.id}
                    data-idx={idx}
                    onClick={item.action}
                    onMouseEnter={() => setSel(idx)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors mx-1"
                    style={{
                      width:       'calc(100% - 8px)',
                      borderRadius: 10,
                      background:  active ? (item.accent ? 'rgba(21,101,192,0.1)' : 'rgba(0,0,0,0.05)') : 'transparent',
                    }}
                  >
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors"
                      style={{ background: active ? (item.accent ? 'rgba(21,101,192,0.15)' : 'rgba(0,0,0,0.07)') : 'rgba(0,0,0,0.04)' }}>
                      <Icon size={13} style={{ color: active ? (item.accent ? '#1565C0' : 'var(--text-primary)') : 'var(--text-secondary)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate transition-colors"
                        style={{ color: active ? (item.accent ? '#1565C0' : 'var(--text-primary)') : 'var(--text-primary)' }}>
                        {item.label}
                      </div>
                      {item.sub && (
                        <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{item.sub}</div>
                      )}
                    </div>
                    {active && <ChevronRight size={13} style={{ color: item.accent ? '#1565C0' : 'var(--text-muted)', flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="px-4 py-10 text-center">
              <div className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No results for "{q}"</div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Try a project name, page, or person</div>
            </div>
          )}
        </div>

        {/* Footer hints */}
        <div className="px-4 py-2.5 border-t flex items-center gap-5" style={{ borderColor: 'var(--border-card)', background: 'rgba(0,0,0,0.02)' }}>
          {[['↑↓', 'navigate'], ['↵', 'open'], ['esc', 'close']].map(([key, label]) => (
            <span key={key} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <kbd className="font-mono px-1.5 py-0.5 rounded text-[9px]"
                style={{ background: 'rgba(0,0,0,0.06)', border: '1px solid rgba(0,0,0,0.08)', color: 'var(--text-secondary)' }}>
                {key}
              </kbd>
              {label}
            </span>
          ))}
          <span className="ml-auto flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <Keyboard size={10} /> ⌘K to toggle
          </span>
        </div>
      </div>
    </>
  );
}
