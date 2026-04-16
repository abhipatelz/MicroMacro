'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import {
  Card,
  EmptyState,
  LifecycleTag,
  PriorityTag,
  StatusTag,
  TaskLink,
  formatDate,
  daysUntil
} from '@/components/ui';

interface Summary {
  totalAssigned: number;
  completed: number;
  overdue: number;
  dueThisWeek: number;
  completionRate: number;
  byStatus: Record<string, number>;
}

function StatCard({
  label,
  value,
  sub,
  tone = 'default'
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: 'default' | 'warn' | 'bad' | 'good';
}) {
  const toneMap = {
    default: 'text-slate-900',
    warn: 'text-amber-600',
    bad: 'text-red-600',
    good: 'text-emerald-600'
  };
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${toneMap[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<{ tasks: any[]; subtasks: any[] }>({ tasks: [], subtasks: [] });
  const [filter, setFilter] = useState<'open' | 'overdue' | 'done' | 'all'>('open');
  const [me, setMe] = useState<any>(null);

  useEffect(() => {
    api<Summary>('/me/summary').then(setSummary);
    api<{ tasks: any[]; subtasks: any[] }>('/me/tasks').then(setData);
    api('/auth/me').then((d: any) => setMe(d.user));
  }, []);

  const tasks = data.tasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'overdue')
      return t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date();
    if (filter === 'done') return t.status === 'done';
    return true;
  });

  const openCount = summary?.byStatus
    ? Object.entries(summary.byStatus)
        .filter(([k]) => k !== 'done')
        .reduce((a, [, v]) => a + v, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {me?.name?.split(' ')[0] || 'there'}</h1>
        <p className="text-sm text-slate-500">
          Everything falling into your bucket today — at a micro and macro level.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="My open tasks" value={openCount} />
        <StatCard label="Due this week" value={summary?.dueThisWeek ?? 0} tone="warn" />
        <StatCard
          label="Overdue"
          value={summary?.overdue ?? 0}
          tone={summary?.overdue ? 'bad' : 'default'}
        />
        <StatCard
          label="Completion rate"
          value={`${summary?.completionRate ?? 0}%`}
          sub={`${summary?.completed ?? 0}/${summary?.totalAssigned ?? 0}`}
          tone="good"
        />
      </div>

      <Card
        title="My tasks"
        action={
          <div className="flex gap-1">
            {(['open', 'overdue', 'done', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-xs ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        {tasks.length === 0 ? (
          <EmptyState title="Nothing here" hint="Adjust the filter or come back later." />
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const d = daysUntil(t.dueDate);
              const overdue = d !== null && d < 0 && t.status !== 'done';
              const subPct =
                t.subtaskCount > 0 ? Math.round((t.subtasksDone / t.subtaskCount) * 100) : null;
              return (
                <div key={t.id} className="py-3 flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={t.status === 'done'}
                    readOnly
                    className="w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TaskLink task={t} />
                      {t.gxpCritical && (
                        <span className="tag bg-red-50 text-red-700 border border-red-200">
                          GxP
                        </span>
                      )}
                      {t.requiresQaSignoff && (
                        <span className="tag bg-purple-50 text-purple-700 border border-purple-200">
                          QA sign-off
                        </span>
                      )}
                      {t.aiTriage?.severity === 'critical' && (
                        <span className="tag bg-red-100 text-red-700">AI: critical</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <Link href={`/projects/${t.projectId}`} className="hover:underline">
                        {t.projectCode} · {t.projectName}
                      </Link>
                      <span>·</span>
                      <LifecycleTag lifecycle={t.lifecycle} />
                      {subPct !== null && (
                        <>
                          <span>·</span>
                          <span>
                            {t.subtasksDone}/{t.subtaskCount} subtasks
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <PriorityTag priority={t.priority} />
                  <StatusTag status={t.status} />
                  <div
                    className={`text-xs w-28 text-right ${
                      overdue ? 'text-red-600 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {t.dueDate ? formatDate(t.dueDate) : '—'}
                    {d !== null && t.status !== 'done' && (
                      <div className="text-[11px]">
                        {d < 0 ? `${-d}d overdue` : d === 0 ? 'due today' : `in ${d}d`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {data.subtasks?.length > 0 && (
        <Card title="My micro-tasks (subtasks)">
          <div className="divide-y divide-slate-100">
            {data.subtasks.map((s) => (
              <div key={s.id} className="py-2 flex items-center gap-4 text-sm">
                <input type="checkbox" checked={s.status === 'done'} readOnly className="w-4 h-4" />
                <div className="flex-1 min-w-0">
                  <div className={s.status === 'done' ? 'line-through text-slate-400' : ''}>
                    {s.title}
                  </div>
                  <div className="text-xs text-slate-500">
                    {s.projectCode} · {s.taskTitle}
                  </div>
                </div>
                <StatusTag status={s.status} />
                <div className="text-xs w-28 text-right text-slate-500">{formatDate(s.dueDate)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
