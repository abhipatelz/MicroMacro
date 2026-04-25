'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Avatar, Card, LifecycleTag, ProgressBar } from '@/components/ui';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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

interface InsightsData {
  brief: string[];
  projects: ProjectInsight[];
  people: PersonInsight[];
  stuckTasks: StuckTask[];
  velocity: { label: string; completed: number }[];
}

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
  const thisWeekVelocity = data.velocity[3]?.completed ?? 0;

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-slate-900">Insights</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Live intelligence — no guesswork, no dashboards you have to interpret.
        </p>
      </div>

      {/* Morning brief */}
      <div className="rounded-xl border border-brand-200 bg-gradient-to-r from-brand-50 to-slate-50 p-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-2">
          Team Brief · right now
        </div>
        <div className="space-y-1.5">
          {data.brief.map((line, i) => (
            <p key={i} className="text-sm text-slate-700 leading-relaxed">{line}</p>
          ))}
        </div>
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
          <div className="mt-2 text-center text-xs text-slate-400">
            {data.velocity[3].completed > data.velocity[2].completed
              ? '↑ Accelerating this week'
              : data.velocity[3].completed < data.velocity[2].completed
              ? '↓ Slowing this week'
              : '→ Steady pace'}
          </div>
        </Card>
      </div>

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
