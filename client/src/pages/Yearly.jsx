import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Card, formatDate, Avatar, LifecycleTag } from '../ui';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function Yearly() {
  const { userId: paramId } = useParams();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const targetId = Number(paramId) || user?.id;

  useEffect(() => {
    api('/users').then(setUsers);
  }, []);

  useEffect(() => {
    if (!targetId) return;
    api(`/analytics/user/${targetId}/year?year=${year}`).then(setData);
  }, [targetId, year]);

  const target = users.find((u) => u.id === targetId);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.months.map((m) => ({ name: MONTH_NAMES[m.month - 1], ...m }));
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
            value={targetId}
            onChange={(e) => {
              const id = e.target.value;
              window.location.href = `/yearly/${id}`;
            }}
          >
            {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.title || u.role})</option>)}
          </select>
          <select className="select w-28" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
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
              <div className="text-sm text-slate-500">{target.title || target.role}</div>
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
              <div className="text-3xl font-semibold mt-1">{data.totals.tasks_completed}</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">Micro-tasks completed</div>
              <div className="text-3xl font-semibold mt-1">{data.totals.subtasks_completed}</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">Big deliveries</div>
              <div className="text-3xl font-semibold mt-1 text-brand-700">{data.totals.big_tasks_completed}</div>
              <div className="text-xs text-slate-500 mt-1">GxP / QA sign-off / approvals</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">Early completions</div>
              <div className="text-3xl font-semibold mt-1 text-emerald-600">{data.totals.early_completions}</div>
              <div className="text-xs text-slate-500 mt-1">Micro &amp; macro combined</div>
            </Card>
            <Card>
              <div className="text-xs font-semibold uppercase text-slate-500">Extra-effort score</div>
              <div className="text-3xl font-semibold mt-1 text-amber-600">{data.totals.extra_effort_score}</div>
              <div className="text-xs text-slate-500 mt-1">Days delivered ahead of deadline</div>
            </Card>
          </div>

          <Card title={`Monthly activity — ${year}`}>
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" name="Completed" fill="#3a56f2" />
                  <Bar dataKey="big" name="Big deliveries" fill="#1b2570" />
                  <Bar dataKey="early" name="Early (extra effort)" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="Top big-deliveries this year">
              {data.big_tasks.length === 0 ? (
                <div className="text-sm text-slate-500">No big deliveries recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {data.big_tasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                      <div className="flex-1 min-w-0">
                        <Link to={`/tasks/${t.id}`} className="text-sm text-brand-700 hover:underline font-medium">
                          {t.title}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {t.project_code} · {t.project_name}
                        </div>
                      </div>
                      <LifecycleTag lifecycle={t.lifecycle} />
                      <span className="text-xs text-slate-500 w-20 text-right">{formatDate(t.completed_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Early completions — extra effort 🏆">
              {data.early_completions.length === 0 ? (
                <div className="text-sm text-slate-500">No early completions recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {data.early_completions.map((t) => (
                    <div key={`${t.task_id || 't'}-${t.id}`} className="flex items-center gap-2 border-b border-slate-100 pb-2 last:border-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{t.title}</div>
                        <div className="text-xs text-slate-500">
                          {t.project_code}{t.task_title ? ` · ${t.task_title}` : ''}
                        </div>
                      </div>
                      <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {t.days_early}d early
                      </span>
                      <span className="text-xs text-slate-500 w-20 text-right">{formatDate(t.completed_at)}</span>
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
