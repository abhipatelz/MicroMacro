'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Avatar, ProgressBar, formatDate } from '@/components/ui';

const HEALTH_DOT: Record<string, { bg: string; label: string }> = {
  good:     { bg: '#22c55e', label: 'Healthy' },
  at_risk:  { bg: '#f59e0b', label: 'At risk' },
  critical: { bg: '#ef4444', label: 'Critical' },
};

const STATUS_COLOR: Record<string, string> = {
  in_progress: '#1565C0',
  planning:    '#7c3aed',
  on_hold:     '#f59e0b',
  completed:   '#22c55e',
};

function KpiTile({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-5 py-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.07em' }} className="text-slate-400 uppercase font-semibold">{label}</div>
      <div className="text-3xl font-black tracking-tight mt-1" style={{ color: accent || '#0f172a' }}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function CommandCentrePage() {
  const [data, setData] = useState<any>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [tab, setTab] = useState<'all' | 'in_progress' | 'at_risk'>('all');

  const load = useCallback(() => {
    api<any>('/analytics/org/overview').then((d) => {
      setData(d);
      setLastRefresh(new Date());
    });
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000); // auto-refresh every 60s
    return () => clearInterval(interval);
  }, [load]);

  if (!data) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading Operations Hub…</div>
  );

  const t = data.totals;
  const filteredProjects = (data.projects as any[]).filter((p) => {
    if (tab === 'in_progress') return p.status === 'in_progress';
    if (tab === 'at_risk') return p.health !== 'good';
    return true;
  });

  const maxLoad = Math.max(...(data.people as any[]).map((p: any) => p.openTasks), 1);

  return (
    <div className="space-y-5 pb-10 max-w-7xl">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Operations Hub</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Bird's eye view of all quality projects, teams & people ·{' '}
            Auto-refreshes every 60s · Last updated {lastRefresh.toLocaleTimeString()}
          </p>
        </div>
        <button onClick={load} className="btn-secondary text-xs">↻ Refresh</button>
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiTile label="People"        value={t.users}         />
        <KpiTile label="Teams"         value={t.teams}         />
        <KpiTile label="Projects"      value={t.projects}      sub={`${t.activeProjects} active`} />
        <KpiTile label="Open tasks"    value={t.tasksOpen}     />
        <KpiTile label="Overdue"       value={t.tasksOverdue}  accent={t.tasksOverdue ? '#dc2626' : '#0f172a'} />
        <KpiTile label="GxP open"      value={t.gxpCriticalOpen} accent={t.gxpCriticalOpen ? '#ea580c' : '#0f172a'} />
        <KpiTile label="Done this month" value={t.doneThisMonth} accent="#15803d" />
        <KpiTile label="Health"        value={`${t.overallHealth}%`} accent={t.overallHealth >= 80 ? '#15803d' : t.overallHealth >= 60 ? '#d97706' : '#dc2626'} />
      </div>

      {/* ── Main two-column layout ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* ── Left: Project Health Matrix (2/3 width) ──────────────────── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          {/* Table toolbar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-sm font-bold text-slate-800">Project Health Matrix</h2>
            <div className="flex gap-1">
              {([['all', 'All'], ['in_progress', 'Active'], ['at_risk', 'Needs attention']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setTab(key as any)}
                  className="px-3 py-1 rounded text-xs font-medium transition-colors"
                  style={{ background: tab === key ? '#0B1628' : 'transparent', color: tab === key ? '#fff' : '#94a3b8' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Column headers */}
          <div className="grid px-5 py-2 border-b border-slate-100 bg-slate-50/40"
               style={{ gridTemplateColumns: '12px 2fr 100px 1fr 80px 60px 70px', gap: '0 12px' }}>
            {['', 'Project', 'Team', 'Progress', 'Tasks', 'Overdue', 'Due'].map((h) => (
              <div key={h} style={{ fontSize: 10, letterSpacing: '0.08em' }} className="text-slate-400 uppercase font-semibold">{h}</div>
            ))}
          </div>

          {/* Rows */}
          {filteredProjects.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">No projects match this filter.</div>
          ) : (
            <div>
              {filteredProjects.map((p: any, i: number) => {
                const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
                const dot = HEALTH_DOT[p.health] || HEALTH_DOT.good;
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}
                    className="grid items-center px-5 py-3 hover:bg-blue-50/40 transition-colors"
                    style={{ gridTemplateColumns: '12px 2fr 100px 1fr 80px 60px 70px', gap: '0 12px', borderTop: i > 0 ? '1px solid #f1f5f9' : undefined }}>

                    {/* Health dot */}
                    <div>
                      <span title={dot.label} className="block w-2.5 h-2.5 rounded-full" style={{ background: dot.bg }} />
                    </div>

                    {/* Project name + code */}
                    <div>
                      <div className="text-sm font-semibold text-slate-800 truncate leading-tight">{p.name}</div>
                      {p.code && <div className="text-[11px] text-slate-400 font-mono mt-0.5">{p.code}</div>}
                    </div>

                    {/* Team */}
                    <div className="text-xs text-slate-500 truncate">{p.teamName}</div>

                    {/* Progress bar */}
                    <div>
                      <ProgressBar value={pct} />
                      <div style={{ fontSize: 10 }} className="text-slate-400 mt-0.5">{pct}% · {p.tasksDone}/{p.taskCount}</div>
                    </div>

                    {/* Task count */}
                    <div className="text-xs text-slate-600 font-medium">{p.taskCount} tasks</div>

                    {/* Overdue */}
                    <div>
                      {p.tasksOverdue > 0
                        ? <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{p.tasksOverdue}</span>
                        : <span className="text-xs text-slate-300">—</span>}
                    </div>

                    {/* Due date */}
                    <div className="text-xs text-slate-500 text-right">{p.dueDate ? formatDate(p.dueDate) : '—'}</div>
                  </Link>
                );
              })}
            </div>
          )}

          <div className="px-5 py-2 border-t border-slate-100 bg-slate-50/40 flex justify-between items-center">
            <span className="text-xs text-slate-400">{filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}</span>
            <Link href="/projects" className="text-xs text-blue-700 font-medium hover:underline">Manage projects →</Link>
          </div>
        </div>

        {/* ── Right: People at Work (1/3 width) ───────────────────────── */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60">
            <h2 className="text-sm font-bold text-slate-800">People at Work</h2>
            <p className="text-xs text-slate-400 mt-0.5">Open tasks · this week</p>
          </div>

          <div className="flex-1 divide-y divide-slate-50">
            {(data.people as any[]).map((person: any) => {
              const barWidth = maxLoad > 0 ? (person.openTasks / maxLoad) * 100 : 0;
              const isHighLoad = barWidth > 70;
              return (
                <Link key={person.id} href={`/people`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                  <Avatar name={person.name} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-800 truncate">{person.name}</span>
                      <span className="text-xs text-slate-400 shrink-0 ml-2">{person.openTasks} open</span>
                    </div>
                    {/* Workload bar */}
                    <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barWidth}%`, background: isHighLoad ? '#ef4444' : '#1565C0' }} />
                    </div>
                    <div className="flex gap-2 mt-1">
                      {person.overdueTasks > 0 && (
                        <span className="text-[10px] text-red-500 font-semibold">{person.overdueTasks} overdue</span>
                      )}
                      {person.doneThisWeek > 0 && (
                        <span className="text-[10px] text-green-600">+{person.doneThisWeek} done this week</span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div className="px-5 py-2 border-t border-slate-100 bg-slate-50/40">
            <Link href="/people" className="text-xs text-blue-700 font-medium hover:underline">Manage people →</Link>
          </div>
        </div>
      </div>

      {/* ── Needs Attention ─────────────────────────────────────────────── */}
      {data.attention.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">Needs Attention</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#FEF2F2', color: '#dc2626' }}>
              {data.attention.length}
            </span>
          </div>
          <div className="divide-y divide-slate-50">
            {(data.attention as any[]).map((item: any, i: number) => (
              <Link key={i} href={item.href}
                className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors">
                <div className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: item.severity === 'critical' ? '#ef4444' : '#f59e0b' }} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-semibold text-slate-800">{item.label}</span>
                  <span className="text-sm text-slate-500"> · {item.detail}</span>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded"
                  style={{
                    background: item.severity === 'critical' ? '#FEF2F2' : '#FFFBEB',
                    color:      item.severity === 'critical' ? '#dc2626'  : '#b45309',
                  }}>
                  {item.severity === 'critical' ? 'Critical' : 'Warning'}
                </span>
                <span className="text-slate-300 text-xs shrink-0">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {data.attention.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-green-400" />
          <span className="text-sm text-slate-600 font-medium">All clear — no items need immediate attention.</span>
        </div>
      )}
    </div>
  );
}
