'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Avatar, Card, LifecycleTag, ProgressBar } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { ChevronRight, Shield, AlertTriangle, Pause, Users, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';

interface ProjectInsight {
  id: string; name: string; code: string; lifecycle: string;
  score: number; health: 'healthy' | 'at_risk' | 'critical';
  openTasks: number; overdueCount: number; completedThisWeek: number;
  stagnantDays: number; daysUntilDue: number | null; issues: string[];
}

interface PersonInsight {
  id: string; name: string; title: string;
  openTasks: number; overdueCount: number; completedThisWeek: number;
  loadScore: number; loadLevel: 'healthy' | 'busy' | 'overloaded';
}

interface StuckTask {
  id: string; title: string; assignee: string;
  projectCode: string; projectName: string;
  daysSince: number; gxpCritical: boolean;
}

interface ArchiveProject {
  id: string; name: string; code: string; lifecycle: string;
  taskCount: number; tasksDone: number; completedAt: string | null;
}

interface TopAction {
  id: string;
  title: string;
  why: string;
  link: string;
  kind: 'gxp' | 'stuck' | 'overload' | 'critical' | 'atrisk';
}

interface InsightsData {
  brief: string[];
  topActions: TopAction[];
  velocityHeadline: string;
  movers: { risingStars: ProjectInsight[]; needAttention: ProjectInsight[] };
  projects: ProjectInsight[];
  people: PersonInsight[];
  stuckTasks: StuckTask[];
  velocity: { label: string; completed: number }[];
  archive: ArchiveProject[];
}

const ACTION_KIND = {
  gxp:      { Icon: Shield,        bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     iconBg: 'bg-red-100' },
  stuck:    { Icon: Pause,         bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   iconBg: 'bg-amber-100' },
  overload: { Icon: Users,         bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-800',  iconBg: 'bg-purple-100' },
  critical: { Icon: AlertTriangle, bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     iconBg: 'bg-red-100' },
  atrisk:   { Icon: AlertTriangle, bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   iconBg: 'bg-amber-100' },
} as const;

const HEALTH_CONFIG = {
  healthy:  { dot: '🟢', label: 'Healthy',  bg: 'bg-forest-50',  border: 'border-forest-200',  text: 'text-forest-700'  },
  at_risk:  { dot: '🟡', label: 'At risk',  bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700'   },
  critical: { dot: '🔴', label: 'Critical', bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700'     },
};

const LOAD_CONFIG = {
  healthy:    { dot: '🟢', label: 'Healthy',    bg: 'bg-forest-50',  text: 'text-forest-700'  },
  busy:       { dot: '🟡', label: 'Busy',       bg: 'bg-amber-50',   text: 'text-amber-700'   },
  overloaded: { dot: '🔴', label: 'Overloaded', bg: 'bg-red-50',     text: 'text-red-700'     },
};

function HealthBadge({ health }: { health: ProjectInsight['health'] }) {
  const c = HEALTH_CONFIG[health];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text} border ${c.border}`}>
      {c.dot} {c.label}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? '#43A047' : score >= 40 ? '#F59E0B' : '#EF4444';
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
      <div className="h-1.5 rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
    </div>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<InsightsData>('/insights')
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-slate-100 rounded-lg animate-pulse w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) return <div className="text-slate-500 text-sm">Could not load insights.</div>;

  const criticalCount = data.projects.filter(p => p.health === 'critical').length;
  const atRiskCount   = data.projects.filter(p => p.health === 'at_risk').length;
  const healthyCount  = data.projects.filter(p => p.health === 'healthy').length;
  const thisWeekVelocity = data.velocity?.[3]?.completed ?? 0;

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">Insights</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          What needs your attention today — ranked by impact, with one click to act.
        </p>
      </div>

      {/* Top 3 Actions Today */}
      {data.topActions && data.topActions.length > 0 ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Sparkles size={13} className="text-brand-500" />
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-brand-600">
              Top {data.topActions.length} action{data.topActions.length > 1 ? 's' : ''} today
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {data.topActions.map((a, i) => {
              const c = ACTION_KIND[a.kind];
              const Icon = c.Icon;
              return (
                <Link
                  href={a.link}
                  key={a.id}
                  className={`group rounded-xl border ${c.border} ${c.bg} p-4 hover:shadow-md transition-all hover:-translate-y-0.5`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg ${c.iconBg} flex items-center justify-center shrink-0`}>
                      <Icon size={15} className={c.text} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="text-[10px] font-black text-slate-400">#{i + 1}</span>
                        <h3 className={`text-sm font-bold leading-tight ${c.text}`}>{a.title}</h3>
                      </div>
                      <p className="text-xs text-slate-600 leading-snug">{a.why}</p>
                      <div className={`mt-2 inline-flex items-center gap-0.5 text-[11px] font-semibold ${c.text} group-hover:gap-1.5 transition-all`}>
                        Take action <ChevronRight size={11} />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-forest-200 bg-gradient-to-r from-forest-50 to-slate-50 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-forest-100 flex items-center justify-center shrink-0">
            <Sparkles size={18} className="text-forest-600" />
          </div>
          <div>
            <div className="text-sm font-bold text-forest-700">Nothing urgent on your plate today.</div>
            <div className="text-xs text-forest-600/80 mt-0.5">
              No critical projects, no overloaded teammates, no blockers. Time to pick up momentum work.
            </div>
          </div>
        </div>
      )}

      {/* Velocity headline */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          (data.velocity?.[3]?.completed ?? 0) >= (data.velocity?.[2]?.completed ?? 0)
            ? 'bg-forest-50 text-forest-600' : 'bg-amber-50 text-amber-600'
        }`}>
          {(data.velocity?.[3]?.completed ?? 0) >= (data.velocity?.[2]?.completed ?? 0)
            ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        </div>
        <p className="text-sm text-slate-700 leading-snug">{data.velocityHeadline}</p>
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Critical projects', value: criticalCount, tone: criticalCount > 0 ? 'bad' : 'good' },
          { label: 'At risk',           value: atRiskCount,   tone: atRiskCount > 0 ? 'warn' : 'good' },
          { label: 'On track',          value: healthyCount,  tone: 'good' },
          { label: 'Done this week',    value: thisWeekVelocity, tone: 'default' },
        ].map(({ label, value, tone }) => (
          <div key={label} className="card p-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600/60">{label}</div>
            <div className={`text-3xl font-black mt-1 ${
              tone === 'bad' && value > 0 ? 'text-red-600' :
              tone === 'warn' && value > 0 ? 'text-amber-500' :
              tone === 'good' ? 'text-forest-600' :
              'text-brand-700'
            }`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Project risk radar */}
        <div className="xl:col-span-2">
          <Card title="Project health radar">
            {data.projects.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">No active projects.</div>
            ) : (
              <div className="space-y-3">
                {data.projects.map((p) => {
                  const hc = HEALTH_CONFIG[p.health];
                  return (
                    <div key={p.id} className={`rounded-lg border p-3 ${hc.bg} ${hc.border}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-slate-500">{p.code}</span>
                            <Link href={`/projects/${p.id}`} className="font-semibold text-sm text-slate-800 hover:text-brand-700 hover:underline truncate">
                              {p.name}
                            </Link>
                            <LifecycleTag lifecycle={p.lifecycle} />
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                            {p.issues.map((issue) => (
                              <span key={issue} className={`text-xs font-medium ${hc.text}`}>
                                · {issue}
                              </span>
                            ))}
                          </div>
                          <ScoreBar score={p.score} />
                        </div>
                        <div className="shrink-0 text-right">
                          <HealthBadge health={p.health} />
                          <div className="text-[10px] text-slate-400 mt-1">score {p.score}/100</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Velocity */}
        <Card title="Team velocity · last 4 weeks">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.velocity} barSize={28}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v: any) => [`${v} tasks`, 'Completed']}
              />
              <Bar dataKey="completed" radius={[4, 4, 0, 0]}>
                {data.velocity.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={i === 3 ? '#1565C0' : '#BBDEFB'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Movers — what changed this week */}
      {(data.movers?.risingStars?.length > 0 || data.movers?.needAttention?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.movers.risingStars.length > 0 && (
            <Card title="Rising stars · most progress this week">
              <div className="space-y-2">
                {data.movers.risingStars.map(p => (
                  <Link href={`/projects/${p.id}`} key={p.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-forest-50/40 transition-colors group">
                    <div className="w-7 h-7 rounded-md bg-forest-50 border border-forest-100 flex items-center justify-center shrink-0">
                      <TrendingUp size={13} className="text-forest-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">{p.code}</span>
                        <span className="text-sm font-medium text-slate-700 truncate group-hover:text-brand-700">{p.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{p.completedThisWeek} task{p.completedThisWeek > 1 ? 's' : ''} shipped</div>
                    </div>
                    <ChevronRight size={13} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </Card>
          )}
          {data.movers.needAttention.length > 0 && (
            <Card title="Need attention · stalled this week">
              <div className="space-y-2">
                {data.movers.needAttention.map(p => (
                  <Link href={`/projects/${p.id}`} key={p.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-amber-50/40 transition-colors group">
                    <div className="w-7 h-7 rounded-md bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
                      <Pause size={13} className="text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-slate-400">{p.code}</span>
                        <span className="text-sm font-medium text-slate-700 truncate group-hover:text-brand-700">{p.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400">No movement in {p.stagnantDays}d · {p.openTasks} open</div>
                    </div>
                    <ChevronRight size={13} className="text-slate-300 group-hover:text-brand-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Team pulse */}
      <Card title="Team pulse">
        {data.people.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">No team members yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.people.map((p) => {
              const lc = LOAD_CONFIG[p.loadLevel];
              return (
                <div key={p.id} className={`rounded-lg p-3 border ${lc.bg} border-slate-200`}>
                  <div className="flex items-center gap-2.5 mb-2">
                    <Avatar name={p.name} size={32} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-800 truncate">{p.name}</div>
                      <div className="text-[10px] text-slate-400 truncate">{p.title || 'Team member'}</div>
                    </div>
                    <span className={`text-xs font-bold ${lc.text}`}>{lc.dot}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-lg font-black text-brand-700">{p.openTasks}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">open</div>
                    </div>
                    <div>
                      <div className={`text-lg font-black ${p.overdueCount > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                        {p.overdueCount}
                      </div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">overdue</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-forest-600">{p.completedThisWeek}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">done/wk</div>
                    </div>
                  </div>
                  <div className={`mt-2 text-[10px] font-semibold text-center ${lc.text}`}>
                    {lc.dot} {lc.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Completed project archive */}
      {data.archive?.length > 0 && (
        <Card title={`Project archive · last ${data.archive.length} completed`}>
          <div className="divide-y divide-slate-50">
            {data.archive.map(p => {
              const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 100;
              return (
                <div key={p.id} className="py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-green-50 border border-green-200 flex items-center justify-center shrink-0 text-sm">✅</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">{p.code}</span>
                      <Link href={`/projects/${p.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-700 hover:underline truncate">
                        {p.name}
                      </Link>
                      <LifecycleTag lifecycle={p.lifecycle} />
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {p.tasksDone}/{p.taskCount} tasks · {pct}% complete
                      {p.completedAt && ` · ${new Date(p.completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </div>
                  </div>
                  <div className="shrink-0 w-20">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Stuck tasks */}
      {data.stuckTasks.length > 0 && (
        <Card title={`Stuck tasks · in progress 5+ days (${data.stuckTasks.length})`}>
          <div className="divide-y divide-slate-100">
            {data.stuckTasks.map((t) => (
              <div key={t.id} className="py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0 text-sm">
                  ⏸
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/tasks/${t.id}`} className="text-sm font-medium text-slate-800 hover:text-brand-700 hover:underline">
                      {t.title}
                    </Link>
                    {t.gxpCritical && (
                      <span className="tag bg-red-50 text-red-700 border border-red-200 text-[10px]">GxP</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {t.projectCode} · {t.assignee}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-bold text-amber-600">{t.daysSince}d</div>
                  <div className="text-[10px] text-slate-400">no movement</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-50 text-xs text-slate-400 text-center">
            Dive Deep — find out what's blocking each of these.
          </div>
        </Card>
      )}

    </div>
  );
}
