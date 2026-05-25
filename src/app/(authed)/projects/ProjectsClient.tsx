'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { LifecycleTag, StatusTag, formatDate } from '@/components/ui';
import { useIsLead } from '@/components/CurrentUserContext';
import { Plus, Search, SlidersHorizontal } from 'lucide-react';

interface InitialData {
  projects:   any[];
  teams:      Array<{ id: string; name: string }>;
  lifecycles: Array<{ key: string; label: string }>;
}

export default function ProjectsClient({ initialData }: { initialData: InitialData }) {
  const isLead = useIsLead();
  const [projects, setProjects] = useState<any[]>(initialData.projects);
  const teams       = initialData.teams;
  const lifecycles  = initialData.lifecycles;
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [lc, setLc] = useState('');
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState<'active' | 'completed' | 'archived' | 'all'>('active');
  const [loaded, setLoaded] = useState(true);

  // First render uses the server-provided list — skip the refetch effect
  // so we don't immediately invalidate the SSR win.
  const isFirstRender = useRef(true);

  function load() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (team) params.set('teamId', team);
    if (lc) params.set('lifecycle', lc);
    if (tab === 'active') {
      ['planning', 'in_progress', 'on_hold'].forEach(s => params.append('status', s));
    } else if (tab === 'completed') {
      params.set('status', 'completed');
    } else if (tab === 'archived') {
      params.set('archived', '1');
    } else if (status) {
      params.set('status', status);
    }
    setLoaded(false);
    api<any[]>(`/projects?${params.toString()}`)
      .then(p => { setProjects(p); setLoaded(true); })
      .catch(() => setLoaded(true));
  }

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const id = setTimeout(load, 150);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, team, lc, status, tab]);

  const STATUS_COLORS: Record<string, { dot: string; label: string }> = {
    planning:    { dot: '#94a3b8', label: 'Planning' },
    in_progress: { dot: '#3b82f6', label: 'In progress' },
    on_hold:     { dot: '#f59e0b', label: 'On hold' },
    completed:   { dot: '#22c55e', label: 'Completed' },
    cancelled:   { dot: '#ef4444', label: 'Cancelled' },
  };

  const HEALTH_COLORS: Record<string, string> = {
    good:     '#22c55e',
    at_risk:  '#f59e0b',
    critical: '#ef4444',
  };

  return (
    <div className="space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Projects</h1>
          <p className="text-xs text-slate-400 mt-1">All quality projects across teams &amp; lifecycles.</p>
        </div>
        {isLead && (
          <Link href="/projects/new" className="btn-primary gap-2 shrink-0">
            <Plus size={15} /> New project
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-100">
        {(['active', 'completed', 'all', 'archived'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatus(''); }}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors capitalize ${
              tab === t
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t === 'active' ? 'Active' : t === 'completed' ? 'Completed' : t === 'archived' ? 'Archived' : 'All'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              className="input pl-8 text-sm"
              placeholder="Search projects…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <SlidersHorizontal size={13} className="text-slate-400 shrink-0" />
            <select className="select text-sm w-auto" value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <select className="select text-sm w-auto" value={lc} onChange={(e) => setLc(e.target.value)}>
              <option value="">All templates</option>
              {lifecycles.map((l) => (
                <option key={l.key} value={l.key}>{l.label}</option>
              ))}
            </select>
            {tab === 'all' && (
              <select className="select text-sm w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                <option value="planning">Planning</option>
                <option value="in_progress">In progress</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {!loaded && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3" aria-busy="true" aria-live="polite">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton h-5 w-3/4" />
                </div>
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
              <div className="skeleton h-1.5 w-full" />
              <div className="flex justify-between">
                <div className="skeleton h-3 w-20" />
                <div className="skeleton h-3 w-12" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading projects…</span>
        </div>
      )}

      {/* Grid */}
      {loaded && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {projects.map((p) => {
          const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
          const overdueRatio = p.taskCount ? (p.tasksOverdue || 0) / p.taskCount : 0;
          const healthColor = overdueRatio > 0.3 ? HEALTH_COLORS.critical : overdueRatio > 0 ? HEALTH_COLORS.at_risk : HEALTH_COLORS.good;
          const statusInfo = STATUS_COLORS[p.status] || { dot: '#94a3b8', label: p.status };
          return (
            <Link
              href={`/projects/${p.id}`}
              key={p.id}
              className="card-hover p-5 block group"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] text-slate-400 font-mono tracking-wider uppercase">{p.code}</span>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: healthColor }}
                      title={overdueRatio > 0.3 ? 'Critical' : overdueRatio > 0 ? 'At risk' : 'Healthy'} />
                  </div>
                  <div className="font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors leading-tight">
                    {p.name}
                  </div>
                  {p.description && (
                    <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 leading-relaxed">{p.description}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <LifecycleTag lifecycle={p.lifecycle} />
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusInfo.dot }} />
                    {statusInfo.label}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full overflow-hidden mb-2" style={{ background: '#f1f5f9' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: pct >= 90 ? '#22c55e' : pct >= 60 ? '#1769C8' : pct >= 30 ? '#f59e0b' : '#94a3b8',
                  }}
                />
              </div>

              {/* Bottom meta */}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-slate-400">
                  {p.tasksDone}/{p.taskCount} tasks
                  {p.tasksOverdue > 0 && (
                    <span className="ml-1.5 text-red-500 font-semibold">· {p.tasksOverdue} late</span>
                  )}
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  {p.teamName && <span className="truncate max-w-[90px]">{p.teamName}</span>}
                  {p.dueDate && <span>{formatDate(p.dueDate)}</span>}
                  <span className={`font-bold text-sm ${pct >= 90 ? 'text-green-600' : pct >= 60 ? 'text-blue-600' : 'text-slate-500'}`}>
                    {pct}%
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      )}

      {loaded && projects.length === 0 && (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Plus size={22} className="text-blue-400" />
          </div>
          <div className="text-sm font-bold text-slate-700 mb-1">No projects yet</div>
          <div className="text-xs text-slate-400 mb-4">
            {q || team || lc || status ? 'No projects match those filters.' : 'Create your first project to get started.'}
          </div>
          {isLead && !q && !team && !lc && !status && (
            <Link href="/projects/new" className="btn-primary text-sm gap-2 inline-flex">
              <Plus size={14} /> New project
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
