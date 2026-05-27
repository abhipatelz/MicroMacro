'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Card, Avatar, LifecycleTag, formatDate, roleLabel } from '@/components/ui';
import { SimpleBarChart } from '@/components/SimpleBarChart';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function YearlyView({ targetUserId }: { targetUserId?: string }) {
  const router = useRouter();
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    api<any[]>('/users').then(setUsers);
    api<any>('/auth/me').then((d) => setMe(d.user));
  }, []);
  const viewingId = targetUserId || me?.id;
  useEffect(() => {
    if (!viewingId) return;
    api<any>(`/analytics/user/${viewingId}/year?year=${year}`).then(setData);
  }, [viewingId, year]);

  const target = users.find((u) => u.id === viewingId);
  const chartData = useMemo(() => {
    if (!data) return [];
    return data.months.map((m: any) => ({ name: MONTH_NAMES[m.month - 1], ...m }));
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Yearly review</h1>
          <p className="text-sm text-slate-500">
            A celebration of big deliveries and the extra-effort early completions by this employee.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="select w-56"
            value={viewingId || ''}
            onChange={(e) => router.push(`/yearly/${e.target.value}`)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.title || roleLabel(u.role)})
              </option>
            ))}
          </select>
          <select
            className="select w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {target && (
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={target.name} size={48} />
            <div>
              <div className="text-lg font-semibold">{target.name}</div>
              <div className="text-sm text-slate-500">{target.title || roleLabel(target.role)}</div>
            </div>
          </div>
        </Card>
      )}

      {!data ? (
        <Card>Loading…</Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">Tasks completed</div>
              <div className="text-3xl font-semibold mt-1">{data.totals.tasksCompleted}</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Micro-tasks completed
              </div>
              <div className="text-3xl font-semibold mt-1">{data.totals.subtasksCompleted}</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">Big deliveries</div>
              <div className="text-3xl font-semibold mt-1 text-brand-700">
                {data.totals.bigTasksCompleted}
              </div>
              <div className="text-xs text-slate-500 mt-1">GxP / QA sign-off / approvals</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Early completions
              </div>
              <div className="text-3xl font-semibold mt-1 text-emerald-600">
                {data.totals.earlyCompletions}
              </div>
              <div className="text-xs text-slate-500 mt-1">Micro &amp; macro combined</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Extra-effort score
              </div>
              <div className="text-3xl font-semibold mt-1 text-amber-600">
                {data.totals.extraEffortScore}
              </div>
              <div className="text-xs text-slate-500 mt-1">Days delivered ahead of deadline</div>
            </Card>
          </div>

          <Card title={`Monthly activity — ${year}`}>
            <SimpleBarChart
              height={288}
              data={chartData.map((d: any) => ({ label: d.name, ...d }))}
              series={[
                { key: 'completed', name: 'Completed',             color: '#1565C0' },
                { key: 'big',       name: 'Big deliveries',        color: '#0D47A1' },
                { key: 'early',     name: 'Early (extra effort)',  color: '#43A047' },
              ]}
            />
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Top big-deliveries this year">
              {data.bigTasks.length === 0 ? (
                <div className="text-sm text-slate-500">No big deliveries recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {data.bigTasks.map((t: any) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/tasks/${t.id}`}
                          className="text-sm text-brand-700 hover:underline font-medium"
                        >
                          {t.title}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {t.projectCode} · {t.projectName}
                        </div>
                      </div>
                      <LifecycleTag lifecycle={t.lifecycle} />
                      <span className="text-xs text-slate-500 w-20 text-right">
                        {formatDate(t.completedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Early completions — extra effort 🏆">
              {data.earlyCompletions.length === 0 ? (
                <div className="text-sm text-slate-500">No early completions recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {data.earlyCompletions.map((t: any, idx: number) => (
                    <div
                      key={`${t.kind}-${t.id}-${idx}`}
                      className="flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{t.title}</div>
                        <div className="text-xs text-slate-500">
                          {t.projectCode}
                          {t.taskTitle ? ` · ${t.taskTitle}` : ''}
                        </div>
                      </div>
                      <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {t.daysEarly}d early
                      </span>
                      <span className="text-xs text-slate-500 w-20 text-right">
                        {formatDate(t.completedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
