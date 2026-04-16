'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Card, ProgressBar } from '@/components/ui';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid
} from 'recharts';

const COLORS = ['#3a56f2', '#1b2570', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

export default function OrgOverviewPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api<any>('/analytics/org/overview').then(setData);
  }, []);
  if (!data) return <div className="text-slate-500">Loading…</div>;
  const t = data.totals;
  const tiles = [
    { label: 'Users', value: t.users },
    { label: 'Teams', value: t.teams },
    { label: 'Active projects', value: t.activeProjects, tone: 'good' },
    { label: 'Open tasks', value: t.tasksOpen },
    { label: 'Overdue tasks', value: t.tasksOverdue, tone: 'bad' },
    { label: 'GxP-critical open', value: t.gxpCriticalOpen, tone: 'warn' },
    { label: 'QA sign-off pending', value: t.qaSignoffPending, tone: 'warn' }
  ];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organisation overview</h1>
        <p className="text-sm text-slate-500">Top-level pulse of QA activity across teams.</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {tiles.map((x) => (
          <div key={x.label} className="card p-3">
            <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">
              {x.label}
            </div>
            <div
              className={`text-2xl font-semibold mt-1 ${
                x.tone === 'bad' && x.value ? 'text-red-600' :
                x.tone === 'warn' && x.value ? 'text-amber-600' :
                x.tone === 'good' ? 'text-emerald-600' :
                'text-slate-900'
              }`}
            >
              {x.value}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Projects by lifecycle">
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.projectsByLifecycle}
                  dataKey="c"
                  nameKey="lifecycle"
                  outerRadius={80}
                  label={(d: any) => `${d.lifecycle} (${d.c})`}
                >
                  {data.projectsByLifecycle.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Projects by status">
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={data.projectsByStatus}
                  dataKey="c"
                  nameKey="status"
                  outerRadius={80}
                  label={(d: any) => `${d.status} (${d.c})`}
                >
                  {data.projectsByStatus.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Team task volume">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={data.teamProgress}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="tasks" name="Tasks" fill="#3a56f2" />
                <Bar dataKey="done" name="Done" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card title="Team completion rates">
        <div className="space-y-3">
          {data.teamProgress.map((x: any) => {
            const pct = x.tasks ? Math.round((x.done / x.tasks) * 100) : 0;
            return (
              <Link
                href={`/teams/${x.id}`}
                key={x.id}
                className="block hover:bg-slate-50 -mx-2 px-2 py-2 rounded"
              >
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{x.name}</span>
                  <span className="text-xs text-slate-500">
                    {x.done}/{x.tasks} · {pct}%
                  </span>
                </div>
                <ProgressBar value={pct} className="mt-1.5" />
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
