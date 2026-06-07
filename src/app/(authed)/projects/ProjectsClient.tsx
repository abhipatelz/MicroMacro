'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { LifecycleTag, StatusTag, formatDate } from '@/components/ui';
import { Select } from '@/components/Select';
import { useIsLead } from '@/components/CurrentUserContext';
import { Plus, Search, SlidersHorizontal, Lock } from 'lucide-react';

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
  const [tab, setTab] = useState<'active' | 'completed' | 'all'>('active');
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
    <div className="space-y-5 max-w-[1120px]">
      {/* Header */}
      <div className="flex items-start justify-between pt-1">
        <div>
          <h1 className="text-[1.75rem] font-black text-slate-900 tracking-tight leading-tight">Projects</h1>
          <p className="text-sm text-slate-500 mt-1">All quality projects across teams &amp; lifecycles.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Single create flow for every user — the form on /projects/new
              has the "Personal" toggle, so contributors and leads share the
              same entry point. */}
          <Link href="/projects/new" className="btn-primary gap-2">
            <Plus size={15} /> New project
          </Link>
        </div>
      </div>

      {/* Tabs — archiving isn't in use yet, so the Archived bin is hidden. */}
      <div className="flex gap-1 border-b border-slate-100">
        {(['active', 'completed', 'all'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setStatus(''); }}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors capitalize ${
              tab === t
                ? 'text-blue-700 border-b-2 border-blue-600 bg-blue-50/50'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t === 'active' ? 'Active' : t === 'completed' ? 'Completed' : 'All'}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4 min-h-[72px] flex items-center">
        <div className="flex flex-wrap items-center gap-3 w-full">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40 pointer-events-none" />
            <input
              className="input pl-8 text-sm"
              placeholder="Search projects…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {/* Filters stack full-width on mobile (so a long team name never
              overflows the card) and sit inline from sm: up. */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
            <SlidersHorizontal size={13} className="text-slate-400 dark:text-white/40 shrink-0 hidden sm:block" />
            <Select
              className="w-full sm:w-44" value={team} onChange={setTeam} ariaLabel="Filter by team"
              placeholder="All teams"
              options={[{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
            />
            <Select
              className="w-full sm:w-48" value={lc} onChange={setLc} ariaLabel="Filter by lifecycle"
              placeholder="All lifecycles"
              options={[{ value: '', label: 'All lifecycles' }, ...lifecycles.map((l) => ({ value: l.key, label: l.label }))]}
            />
            {tab === 'all' && (
              <Select
                className="w-full sm:w-40" value={status} onChange={setStatus} ariaLabel="Filter by status"
                placeholder="All statuses"
                options={[
                  { value: '', label: 'All statuses' },
                  { value: 'planning', label: 'Planning' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'on_hold', label: 'On hold' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'cancelled', label: 'Cancelled' },
                ]}
              />
            )}
          </div>
        </div>
      </div>

      {/* Loading skeleton */}
      {!loaded && (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))' }} aria-busy="true" aria-live="polite">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="skeleton h-1 w-full rounded-none" />
              <div className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="skeleton h-5 w-16 rounded-full" />
                  <div className="skeleton h-5 w-20 rounded-full" />
                </div>
                <div className="skeleton h-5 w-3/4" />
                <div className="skeleton h-3.5 w-full" />
                <div className="skeleton h-3.5 w-2/3" />
                <div className="skeleton h-2 w-full rounded-full" />
                <div className="flex justify-between pt-2 border-t border-slate-100">
                  <div className="skeleton h-3 w-24" />
                  <div className="skeleton h-3 w-16" />
                </div>
              </div>
            </div>
          ))}
          <span className="sr-only">Loading projects…</span>
        </div>
      )}

      {/* Grid */}
      {loaded && (
      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))' }}>
        {projects.map((p) => {
          const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
          const overdueRatio = p.taskCount ? (p.tasksOverdue || 0) / p.taskCount : 0;
          const health = overdueRatio > 0.3 ? 'critical' : overdueRatio > 0 ? 'at_risk' : 'good';
          const healthColor = HEALTH_COLORS[health];
          const healthLabel = health === 'critical' ? 'Critical' : health === 'at_risk' ? 'At risk' : 'Healthy';
          const statusInfo = STATUS_COLORS[p.status] || { dot: '#94a3b8', label: p.status };
          // App-theme progress: blue at the start, transitioning to green as it
          // nears completion — never the dull grey it used to fall back to at
          // low percentages. The % text reads green only once nearly done.
          const progressColor = pct >= 90 ? '#22c55e' : '#1769C8';
          const dueIn = p.dueDate ? Math.round((new Date(p.dueDate).getTime() - Date.now()) / 86400000) : null;
          const dueTone = dueIn === null ? 'slate' : dueIn < 0 ? 'red' : dueIn <= 7 ? 'amber' : 'slate';
          // Blue → green themed fill so the bar always carries the app accent.
          const progressGradient = 'linear-gradient(90deg, #1769C8 0%, #22c55e 100%)';
          return (
            <Link
              href={`/projects/${p.id}`}
              key={p.id}
              className="card-hover block group overflow-hidden hover:-translate-y-0.5 transition-transform"
              style={{ minHeight: 240 }}
            >
              {/* Top accent — soft gradient strip in the health colour */}
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${progressColor}, ${healthColor})` }} />

              <div className="p-5 flex flex-col h-full">
                {/* Header row: code + health + status */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  {p.isPersonal ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-violet-600 bg-violet-50 dark:bg-violet-500/15 dark:text-violet-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      <Lock size={9} /> Private
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-slate-400 dark:text-white/30 bg-slate-50 dark:bg-white/[0.05] px-2 py-0.5 rounded">
                      {p.code}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: health === 'good' ? 'rgba(34,197,94,0.10)' : health === 'at_risk' ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)',
                      color: healthColor,
                    }}
                    title={healthLabel}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: healthColor, boxShadow: `0 0 0 2px ${healthColor}22` }} />
                    {healthLabel}
                  </span>
                  <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-white/40">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: statusInfo.dot }} />
                    {statusInfo.label}
                  </span>
                </div>

                {/* Project name */}
                <h3 className="font-black text-[16px] text-slate-900 dark:text-white/90 line-clamp-2 group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors leading-snug mb-1.5">
                  {p.name}
                </h3>

                {/* Description */}
                {p.description ? (
                  <p className="text-[12.5px] text-slate-500 dark:text-white/40 line-clamp-2 leading-relaxed mb-3">{p.description}</p>
                ) : (
                  <p className="text-[12.5px] italic text-slate-300 dark:text-white/20 mb-3">No description.</p>
                )}

                {/* Lifecycle + team tags */}
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <LifecycleTag lifecycle={p.lifecycle} />
                  {p.teamName && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-white/40 bg-slate-50 dark:bg-white/[0.04] px-2 py-0.5 rounded-full truncate max-w-[150px]"
                      title={p.teamName}>
                      {p.teamName}
                    </span>
                  )}
                </div>

                {/* Progress — gradient fill with a soft inner highlight */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Progress</span>
                    <span className="text-[13px] font-black tabular-nums" style={{ color: progressColor }}>{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden bg-slate-100 dark:bg-white/[0.06]">
                    <div
                      className="relative h-full rounded-full overflow-hidden transition-all duration-700"
                      style={{
                        width: `${Math.max(pct, p.taskCount ? 2 : 0)}%`,
                        background: progressGradient,
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35)',
                      }}
                    >
                      {/* App-theme travelling sheen — same cue as the dashboard bars. */}
                      {pct > 0 && <span aria-hidden className="progress-bar-sheen" />}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[11.5px] text-slate-500 dark:text-white/40">
                    <span className="font-semibold">
                      <span className="text-slate-800 dark:text-white/80 font-black">{p.tasksDone}</span>
                      <span className="text-slate-300 dark:text-white/20">/</span>{p.taskCount} done
                    </span>
                    {p.tasksOverdue > 0 && (
                      <span className="text-red-500 font-bold">{p.tasksOverdue} overdue</span>
                    )}
                  </div>
                  {p.dueDate && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        dueTone === 'red'
                          ? 'text-red-600 bg-red-50 dark:bg-red-500/10'
                          : dueTone === 'amber'
                            ? 'text-amber-700 bg-amber-50 dark:bg-amber-500/10'
                            : 'text-slate-500 bg-slate-50 dark:bg-white/[0.04] dark:text-white/40'
                      }`}
                      title={dueIn !== null ? (dueIn < 0 ? `${Math.abs(dueIn)} day${Math.abs(dueIn) === 1 ? '' : 's'} overdue` : `${dueIn} day${dueIn === 1 ? '' : 's'} left`) : ''}
                    >
                      Due {formatDate(p.dueDate)}
                    </span>
                  )}
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
          {!q && !team && !lc && !status && (
            <Link href="/projects/new" className="btn-primary text-sm gap-2 inline-flex">
              <Plus size={14} /> New project
            </Link>
          )}
        </div>
      )}

    </div>
  );
}
