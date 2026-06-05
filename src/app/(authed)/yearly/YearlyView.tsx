'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Card, LifecycleTag, formatDate } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
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
                {u.name} ({u.title || u.role})
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
            <UserAvatar userId={target.id} name={target.name} size={48} />
            <div>
              <div className="text-lg font-semibold">{target.name}</div>
              <div className="text-sm text-slate-500">{target.title || target.role}</div>
            </div>
          </div>
        </Card>
      )}

      {!data ? (
        // Themed skeleton — 5 stat tiles + chart placeholder + 2 cards.
        // Reads as the page-in-progress rather than an empty "Loading…" frame.
        <div className="space-y-6" aria-busy="true" aria-live="polite">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <div className="skeleton h-3 w-24 mb-3" />
                <div className="skeleton h-8 w-16 mb-2" />
                <div className="skeleton h-3 w-32" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5">
            <div className="skeleton h-4 w-44 mb-4" />
            <div className="skeleton h-64 w-full" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5">
                <div className="skeleton h-4 w-48 mb-4" />
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="flex items-center gap-3 py-1">
                      <div className="skeleton h-3 w-3 rounded-full" />
                      <div className="skeleton h-3 flex-1" />
                      <div className="skeleton h-3 w-20" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <span className="sr-only">Loading yearly review…</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatTile
              label="Tasks completed"
              value={data.totals.tasksCompleted}
              accent="slate"
            />
            <StatTile
              label="Micro-tasks completed"
              value={data.totals.subtasksCompleted}
              accent="slate"
            />
            <StatTile
              label="Big deliveries"
              value={data.totals.bigTasksCompleted}
              hint="GxP · QA sign-off · approvals"
              accent="brand"
            />
            <StatTile
              label="Early completions"
              value={data.totals.earlyCompletions}
              hint="Micro & macro combined"
              accent="emerald"
            />
            <StatTile
              label="Extra-effort score"
              value={data.totals.extraEffortScore}
              hint="Days delivered ahead of deadline"
              accent="amber"
            />
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

/* ── Stat tile ─────────────────────────────────────────────────────────────
   A richer stand-in for the bare Card boxes — coloured accent rail on the
   left, generous spacing, large tabular numeric. Same five accents the
   rest of the app uses (slate / brand / emerald / amber / red). */
function StatTile({ label, value, hint, accent }: {
  label: string;
  value: number | string;
  hint?: string;
  accent: 'slate' | 'brand' | 'emerald' | 'amber' | 'red';
}) {
  const ACCENT: Record<typeof accent, { rail: string; num: string; bg: string }> = {
    slate:   { rail: '#94a3b8', num: 'text-slate-800',   bg: 'bg-slate-50/40' },
    brand:   { rail: '#1565C0', num: 'text-brand-700',   bg: 'bg-blue-50/40'  },
    emerald: { rail: '#10b981', num: 'text-emerald-600', bg: 'bg-emerald-50/40' },
    amber:   { rail: '#f59e0b', num: 'text-amber-600',   bg: 'bg-amber-50/40' },
    red:     { rail: '#ef4444', num: 'text-red-600',     bg: 'bg-red-50/40'   },
  };
  const a = ACCENT[accent];
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200/80 ${a.bg} p-5 transition-shadow hover:shadow-md`}>
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: a.rail }} />
      <div className="pl-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</div>
        <div className={`text-[2rem] font-black tabular-nums leading-none mt-2 ${a.num}`}>{value}</div>
        {hint && <div className="text-[11px] text-slate-500 mt-2 leading-snug">{hint}</div>}
      </div>
    </div>
  );
}
