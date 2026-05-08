'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import {
  Card,
  Avatar,
  ProgressBar,
  LifecycleTag,
  StatusTag,
  PriorityTag,
  formatDate,
  TaskLink
} from '@/components/ui';

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<any>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [view, setView] = useState<'progress' | 'microtasks' | 'projects'>('progress');

  async function load() {
    const [t, b, p] = await Promise.all([
      api<any>(`/teams/${id}`),
      api<any[]>(`/teams/${id}/board`),
      api<any>(`/analytics/team/${id}/progress`),
    ]);
    setTeam(t);
    setBoard(b);
    setProgress(p);
  }
  useEffect(() => {
    load();
    api<any[]>('/users').then(setUsers);
  }, [id]);

  if (!team) {
    return (
      <div className="space-y-6 page-enter" aria-busy="true" aria-live="polite">
        <div className="space-y-2">
          <div className="skeleton h-7 w-48" />
          <div className="skeleton h-4 w-3/4" />
          <div className="skeleton h-3 w-32" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-1 space-y-3">
            <div className="card p-4 space-y-3">
              <div className="skeleton h-4 w-24" />
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="skeleton h-7 w-7 rounded-full shrink-0" />
                  <div className="skeleton h-3 flex-1" />
                </div>
              ))}
            </div>
          </div>
          <div className="lg:col-span-3 space-y-3">
            <div className="card p-4 space-y-3">
              <div className="skeleton h-4 w-32" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <div className="skeleton h-3 w-full" />
                  <div className="skeleton h-2 w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <span className="sr-only">Loading team…</span>
      </div>
    );
  }

  async function addMember() {
    if (!newMember) return;
    await api(`/teams/${id}/members`, { method: 'POST', body: { userId: newMember } });
    setNewMember('');
    setAdding(false);
    load();
  }
  async function removeMember(uid: string) {
    await api(`/teams/${id}/members/${uid}`, { method: 'DELETE' });
    load();
  }

  const availableUsers = users.filter((u) => !team.members.find((m: any) => m.id === u.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{team.name}</h1>
        {team.description && <p className="text-slate-600 mt-1">{team.description}</p>}
        <p className="text-sm text-slate-500 mt-1">Function: {team.function}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <Card
            title={`Members (${team.members.length})`}
            action={
              <button
                className="text-xs text-brand-700 hover:underline"
                onClick={() => setAdding((v) => !v)}
              >
                {adding ? 'Cancel' : '+ Add'}
              </button>
            }
          >
            {adding && (
              <div className="flex gap-2 mb-3">
                <select
                  className="select"
                  value={newMember}
                  onChange={(e) => setNewMember(e.target.value)}
                >
                  <option value="">Select user…</option>
                  {availableUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <button className="btn-primary" onClick={addMember}>
                  Add
                </button>
              </div>
            )}
            <div className="space-y-2">
              {team.members.map((m: any) => {
                const p = progress?.members.find((x: any) => x.id === m.id);
                return (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-b-0"
                  >
                    <Avatar name={m.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {m.title || m.role}
                        {p &&
                          ` · ${p.done}/${p.assigned} done${p.overdue ? ` · ${p.overdue} overdue` : ''}`}
                      </div>
                    </div>
                    <Link
                      href={`/yearly/${m.id}`}
                      className="text-xs text-brand-700 hover:underline"
                    >
                      Year
                    </Link>
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-xs text-slate-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-2">
            {[
              ['progress', 'Team progress'],
              ['microtasks', 'Micro-tasks'],
              ['projects', 'Projects']
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setView(k as any)}
                className={`px-3 py-1.5 rounded text-sm ${
                  view === k ? 'bg-brand-600 text-white' : 'bg-white border border-slate-200'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {view === 'progress' && progress && (
            <>
              <Card title="Project progress">
                <div className="space-y-2">
                  {progress.projects.map((p: any) => {
                    const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
                    return (
                      <Link
                        href={`/projects/${p.id}`}
                        key={p.id}
                        className="block hover:bg-slate-50 -mx-2 px-2 py-2 rounded"
                      >
                        <div className="flex justify-between text-sm">
                          <div>
                            <span className="font-mono text-xs text-slate-500 mr-2">{p.code}</span>
                            {p.name}
                          </div>
                          <div className="flex items-center gap-2">
                            <LifecycleTag lifecycle={p.lifecycle} />
                            <StatusTag status={p.status} />
                            <span className="text-xs text-slate-500 w-20 text-right">
                              {p.tasksDone}/{p.taskCount} · {pct}%
                            </span>
                          </div>
                        </div>
                        <ProgressBar value={pct} className="mt-1.5" />
                      </Link>
                    );
                  })}
                </div>
              </Card>
              <Card title="Per-member load">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 uppercase">
                    <tr>
                      <th className="text-left font-semibold py-2">Member</th>
                      <th className="text-right font-semibold">Assigned</th>
                      <th className="text-right font-semibold">Done</th>
                      <th className="text-right font-semibold">Overdue</th>
                      <th className="text-left font-semibold pl-4">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {progress.members.map((m: any) => {
                      const pct = m.assigned ? Math.round((m.done / m.assigned) * 100) : 0;
                      return (
                        <tr key={m.id} className="border-t border-slate-100">
                          <td className="py-2">
                            <div className="font-medium">{m.name}</div>
                            <div className="text-xs text-slate-500">{m.title}</div>
                          </td>
                          <td className="text-right">{m.assigned}</td>
                          <td className="text-right">{m.done}</td>
                          <td
                            className={`text-right ${
                              m.overdue ? 'text-red-600 font-semibold' : ''
                            }`}
                          >
                            {m.overdue}
                          </td>
                          <td className="pl-4 w-60">
                            <ProgressBar value={pct} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {view === 'microtasks' && (
            <Card title={`All micro-tasks across team projects`}>
              <div className="divide-y divide-slate-100">
                {board.map((t: any) => (
                  <div key={t.id} className="py-2 flex items-center gap-3 text-sm">
                    <TaskLink task={t} />
                    <Link
                      href={`/projects/${t.projectId}`}
                      className="text-xs text-slate-500 hover:underline"
                    >
                      {t.projectCode}
                    </Link>
                    <LifecycleTag lifecycle={t.lifecycle} />
                    <div className="flex-1 text-xs text-slate-500">
                      {t.assigneeName || 'Unassigned'}
                    </div>
                    {t.gxpCritical && <span className="tag bg-red-50 text-red-700">GxP</span>}
                    <StatusTag status={t.status} />
                    <PriorityTag priority={t.priority} />
                    <span className="text-xs text-slate-500 w-24 text-right">
                      {formatDate(t.dueDate)}
                    </span>
                  </div>
                ))}
                {board.length === 0 && (
                  <div className="text-sm text-slate-500 py-4">No tasks yet.</div>
                )}
              </div>
            </Card>
          )}

          {view === 'projects' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {team.projects.map((p: any) => {
                const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
                return (
                  <Link
                    href={`/projects/${p.id}`}
                    key={p.id}
                    className="card p-4 hover:shadow-md transition"
                  >
                    <div className="text-xs font-mono text-slate-500">{p.code}</div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="flex gap-2 mt-2">
                      <LifecycleTag lifecycle={p.lifecycle} />
                      <StatusTag status={p.status} />
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>
                          {p.tasksDone}/{p.taskCount}
                        </span>
                        <span>{pct}%</span>
                      </div>
                      <ProgressBar value={pct} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
