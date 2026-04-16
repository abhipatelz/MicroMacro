import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  Card,
  EmptyState,
  LifecycleTag,
  PriorityTag,
  ProgressBar,
  StatusTag,
  TaskLink,
  formatDate,
  daysUntil
} from '../ui';
import { Link } from 'react-router-dom';

function StatCard({ label, value, sub, tone = 'default' }) {
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

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [data, setData] = useState({ tasks: [], subtasks: [] });
  const [filter, setFilter] = useState('open');

  useEffect(() => {
    api('/me/summary').then(setSummary);
    api('/me/tasks').then(setData);
  }, []);

  const tasks = data.tasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'overdue')
      return t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date();
    if (filter === 'done') return t.status === 'done';
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome, {user?.name?.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">
          Here's everything falling into your bucket today — at a micro and macro level.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="My open tasks" value={summary?.byStatus ? Object.entries(summary.byStatus).filter(([k]) => k !== 'done').reduce((a, [, v]) => a + v, 0) : 0} />
        <StatCard label="Due this week" value={summary?.dueThisWeek ?? 0} tone="warn" />
        <StatCard label="Overdue" value={summary?.overdue ?? 0} tone={summary?.overdue ? 'bad' : 'default'} />
        <StatCard label="Completion rate" value={`${summary?.completionRate ?? 0}%`} sub={`${summary?.completed ?? 0}/${summary?.totalAssigned ?? 0}`} tone="good" />
      </div>

      <Card
        title="My tasks"
        action={
          <div className="flex gap-1">
            {['open', 'overdue', 'done', 'all'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-xs ${
                  filter === f ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        {tasks.length === 0 ? (
          <EmptyState title="Nothing here" hint="Adjust the filter or come back when tasks roll in." />
        ) : (
          <div className="divide-y divide-slate-100">
            {tasks.map((t) => {
              const d = daysUntil(t.due_date);
              const overdue = d !== null && d < 0 && t.status !== 'done';
              const subPct = t.subtask_count ? Math.round((t.subtasks_done / t.subtask_count) * 100) : null;
              return (
                <div key={t.id} className="py-3 flex items-center gap-4">
                  <input
                    type="checkbox"
                    checked={t.status === 'done'}
                    readOnly
                    className="w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <TaskLink task={t} />
                      {t.gxp_critical ? <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span> : null}
                      {t.requires_qa_signoff ? <span className="tag bg-purple-50 text-purple-700 border border-purple-200">QA sign-off</span> : null}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                      <Link to={`/projects/${t.project_id}`} className="hover:underline">{t.project_code} · {t.project_name}</Link>
                      <span>·</span>
                      <LifecycleTag lifecycle={t.lifecycle} />
                      {subPct !== null && (
                        <>
                          <span>·</span>
                          <span>{t.subtasks_done}/{t.subtask_count} subtasks</span>
                        </>
                      )}
                    </div>
                  </div>
                  <PriorityTag priority={t.priority} />
                  <StatusTag status={t.status} />
                  <div className={`text-xs w-28 text-right ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                    {t.due_date ? formatDate(t.due_date) : '—'}
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
                  <div className={s.status === 'done' ? 'line-through text-slate-400' : ''}>{s.title}</div>
                  <div className="text-xs text-slate-500">
                    {s.project_code} · {s.task_title}
                  </div>
                </div>
                <StatusTag status={s.status} />
                <div className="text-xs w-28 text-right text-slate-500">{formatDate(s.due_date)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
