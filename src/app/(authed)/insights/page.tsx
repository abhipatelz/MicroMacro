'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { api } from '@/lib/client/api';
import { Card, LifecycleTag } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { ChevronRight, Pause, TrendingUp, TrendingDown, AlertTriangle, Zap, Users, AlertCircle } from 'lucide-react';

const VelocityChart = dynamic(() => import('./VelocityChart'), {
  ssr: false,
  loading: () => <div className="h-40 bg-slate-50 rounded-lg animate-pulse" />,
});

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
  id: string; title: string; why: string; link: string;
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

const LOAD_CONFIG = {
  healthy:    { dot: '🟢', label: 'Healthy',    bg: 'bg-forest-50',  text: 'text-forest-700'  },
  busy:       { dot: '🟡', label: 'Busy',       bg: 'bg-amber-50',   text: 'text-amber-700'   },
  overloaded: { dot: '🔴', label: 'Overloaded', bg: 'bg-red-50',     text: 'text-red-700'     },
};

const ACTION_META: Record<TopAction['kind'], { icon: React.ReactNode; bg: string; border: string; label: string }> = {
  gxp:      { icon: <AlertTriangle size={14} />, bg: 'bg-red-50',    border: 'border-red-200',    label: 'GxP Critical' },
  stuck:    { icon: <Pause         size={14} />, bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'Stuck task'   },
  overload: { icon: <Users         size={14} />, bg: 'bg-orange-50', border: 'border-orange-200', label: 'Overloaded'   },
  critical: { icon: <AlertCircle   size={14} />, bg: 'bg-red-50',    border: 'border-red-200',    label: 'Critical'     },
  atrisk:   { icon: <Zap           size={14} />, bg: 'bg-amber-50',  border: 'border-amber-200',  label: 'At risk'      },
};

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

  const thisWeekVelocity = data.velocity?.[3]?.completed ?? 0;
  const lastWeekVelocity = data.velocity?.[2]?.completed ?? 0;
  const velocityUp = thisWeekVelocity >= lastWeekVelocity;

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          How your teams are moving over time — velocity, momentum and people load.
          <Link href="/org" className="ml-1 text-brand-600 hover:underline">See today's project health →</Link>
        </p>
      </div>

      {/* Executive brief */}
      {data.brief?.length > 0 && (
        <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-[#1e1e1c] p-4 space-y-1.5"
          style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
          {data.brief.map((line, i) => (
            <p key={i} className="text-sm text-slate-600 dark:text-white/60 leading-snug">{line}</p>
          ))}
        </div>
      )}

      {/* Top 3 Actions Today */}
      {data.topActions?.length > 0 && (
        <div>
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-white/30 mb-2">Top actions today</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.topActions.map((action, i) => {
              const meta = ACTION_META[action.kind];
              return (
                <Link key={action.id} href={action.link}
                  className={`flex flex-col gap-2 p-4 rounded-xl border ${meta.bg} ${meta.border} hover:opacity-90 transition-opacity group`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${meta.bg} border ${meta.border}`}>
                      {meta.icon}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{meta.label}</span>
                    <span className="ml-auto text-[10px] font-black text-slate-400">#{i + 1}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-white leading-snug">{action.title}</p>
                  <p className="text-xs text-slate-500 dark:text-white/50 leading-relaxed">{action.why}</p>
                  <span className="text-xs text-brand-600 font-medium group-hover:underline mt-auto">
                    Go → <ChevronRight size={11} className="inline -mt-0.5" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Velocity headline */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          velocityUp ? 'bg-forest-50 text-forest-600' : 'bg-amber-50 text-amber-600'
        }`}>
          {velocityUp ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        </div>
        <p className="text-sm text-slate-700 leading-snug">{data.velocityHeadline}</p>
      </div>

      {/* Velocity chart — now the centerpiece */}
      <Card title="Team velocity · last 4 weeks">
        <VelocityChart data={data.velocity} />
      </Card>

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
                    <UserAvatar userId={p.id} name={p.name} size={32} />
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