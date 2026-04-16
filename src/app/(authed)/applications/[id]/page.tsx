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
  RISK_COLORS,
  formatDate
} from '@/components/ui';
import { AlertTriangle, Sparkles } from 'lucide-react';

export default function ApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [app, setApp] = useState<any>(null);
  const [bottlenecks, setBottlenecks] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [me, setMe] = useState<any>(null);

  async function load() {
    setApp(await api<any>(`/applications/${id}`));
    setBottlenecks(await api<any>(`/applications/${id}/bottlenecks`));
  }
  useEffect(() => {
    load();
    api<any[]>('/users').then(setUsers);
    api<any>('/auth/me').then((d) => setMe(d.user));
  }, [id]);

  if (!app) return <div className="text-slate-500">Loading…</div>;
  const canManage = me && ['manager', 'admin'].includes(me.role);

  async function addMember() {
    if (!newMember) return;
    await api(`/applications/${id}/members`, {
      method: 'POST',
      body: { userId: newMember }
    });
    setNewMember('');
    setAdding(false);
    load();
  }
  async function removeMember(uid: string) {
    await api(`/applications/${id}/members/${uid}`, { method: 'DELETE' });
    load();
  }

  const availableUsers = users.filter((u) => !app.members.find((m: any) => m.id === u.id));
  const overallPct = app.projects.length
    ? Math.round(
        app.projects.reduce(
          (a: number, p: any) => a + (p.taskCount ? p.tasksDone / p.taskCount : 0),
          0
        ) / app.projects.length * 100
      )
    : 0;

  // worst-performing member (highest bottleneck score) gets a hint
  const topBottleneck = bottlenecks?.members?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 font-mono">{app.key}</div>
          <h1 className="text-2xl font-bold mt-1">{app.name}</h1>
          {app.vendor && <div className="text-sm text-slate-500">{app.vendor}</div>}
          {app.description && (
            <p className="mt-3 text-slate-600 max-w-3xl">{app.description}</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="tag bg-slate-100">{app.status?.replace('_', ' ')}</span>
            {app.gxp && (
              <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span>
            )}
            <LifecycleTag lifecycle={app.defaultLifecycle} />
          </div>
        </div>
        <div className="text-xs text-slate-500 text-right">
          <div>
            Owner:{' '}
            <span className="font-medium text-slate-700">{app.ownerName || '—'}</span>
          </div>
          <div>{app.projects.length} projects</div>
        </div>
      </div>

      {/* signals */}
      {bottlenecks && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="card p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">Overall progress</div>
            <div className="text-3xl font-semibold mt-1">{overallPct}%</div>
            <ProgressBar value={overallPct} className="mt-2" />
          </div>
          <div className="card p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">Overdue</div>
            <div
              className={`text-3xl font-semibold mt-1 ${
                bottlenecks.signals.overdue ? 'text-red-600' : ''
              }`}
            >
              {bottlenecks.signals.overdue}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">Blocked</div>
            <div
              className={`text-3xl font-semibold mt-1 ${
                bottlenecks.signals.blocked ? 'text-amber-600' : ''
              }`}
            >
              {bottlenecks.signals.blocked}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">GxP-critical open</div>
            <div className="text-3xl font-semibold mt-1">
              {bottlenecks.signals.gxpCriticalOpen}
            </div>
          </div>
          <div className="card p-4">
            <div className="text-xs font-semibold uppercase text-slate-500">QA sign-off pending</div>
            <div
              className={`text-3xl font-semibold mt-1 ${
                bottlenecks.signals.qaSignoffPending ? 'text-amber-600' : ''
              }`}
            >
              {bottlenecks.signals.qaSignoffPending}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Members */}
        <Card
          title={`Team (${app.members.length})`}
          action={
            canManage && (
              <button
                className="text-xs text-brand-700 hover:underline"
                onClick={() => setAdding((v) => !v)}
              >
                {adding ? 'Cancel' : '+ Add'}
              </button>
            )
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
            {app.members.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                <Avatar name={m.name} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{m.name}</div>
                  <div className="text-xs text-slate-500 truncate">{m.title || m.role}</div>
                </div>
                <Link
                  href={`/yearly/${m.id}`}
                  className="text-xs text-brand-700 hover:underline"
                >
                  Year
                </Link>
                {canManage && (
                  <button
                    onClick={() => removeMember(m.id)}
                    className="text-xs text-slate-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {app.members.length === 0 && (
              <div className="text-xs text-slate-500 py-2">
                No members yet — add a few to start tracking load.
              </div>
            )}
          </div>
        </Card>

        {/* Bottleneck heatmap */}
        <Card
          className="lg:col-span-2"
          title={
            <span className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-brand-600" />
              Bottleneck heatmap
            </span>
          }
        >
          {bottlenecks?.members && bottlenecks.members.length > 0 ? (
            <>
              {topBottleneck && topBottleneck.bottleneckScore > 5 && (
                <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 mb-3 text-amber-800">
                  Highest load right now: <strong>{topBottleneck.name}</strong> ·{' '}
                  {topBottleneck.openLoad} open · {topBottleneck.overdue} overdue ·{' '}
                  {topBottleneck.highRiskCount} high-risk. Consider rebalancing.
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="text-left font-semibold py-2">Member</th>
                    <th className="text-right font-semibold">Open</th>
                    <th className="text-right font-semibold">Overdue</th>
                    <th className="text-right font-semibold">Blocked</th>
                    <th className="text-right font-semibold">GxP</th>
                    <th className="text-right font-semibold">High-risk</th>
                    <th className="text-right font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {bottlenecks.members.map((m: any) => {
                    const tone =
                      m.bottleneckScore > 12
                        ? 'bg-red-50'
                        : m.bottleneckScore > 6
                          ? 'bg-amber-50'
                          : '';
                    return (
                      <tr key={m.id} className={`border-t border-slate-100 ${tone}`}>
                        <td className="py-2">
                          <div className="font-medium">{m.name}</div>
                          <div className="text-xs text-slate-500">{m.title}</div>
                        </td>
                        <td className="text-right">{m.openLoad}</td>
                        <td
                          className={`text-right ${
                            m.overdue ? 'text-red-600 font-semibold' : ''
                          }`}
                        >
                          {m.overdue}
                        </td>
                        <td
                          className={`text-right ${
                            m.blocked ? 'text-amber-700 font-semibold' : ''
                          }`}
                        >
                          {m.blocked}
                        </td>
                        <td className="text-right">{m.gxpCriticalOpen}</td>
                        <td
                          className={`text-right ${
                            m.highRiskCount ? 'text-red-600' : ''
                          }`}
                        >
                          {m.highRiskCount}
                        </td>
                        <td className="text-right font-mono text-xs">
                          {m.bottleneckScore.toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-500 mt-2 italic">
                Score = overdue×4 + blocked×3 + high-risk×2 + GxP×1.5 + open-load×0.2.
                Transparent on purpose — no black box.
              </p>
            </>
          ) : (
            <div className="text-sm text-slate-500">
              No team members assigned yet. Add members and assign tasks to see the heatmap.
            </div>
          )}
        </Card>
      </div>

      {/* Top AI-flagged risk tasks */}
      {bottlenecks?.topRiskTasks && bottlenecks.topRiskTasks.length > 0 && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <Sparkles size={16} className="text-brand-600" />
              Top AI-flagged risk tasks
            </span>
          }
        >
          <div className="space-y-2">
            {bottlenecks.topRiskTasks.map((t: any) => (
              <div
                key={t.taskId}
                className="border border-slate-200 rounded p-2 text-sm flex flex-wrap items-center gap-2"
              >
                <Link
                  href={`/tasks/${t.taskId}`}
                  className="font-medium text-brand-700 hover:underline flex-1"
                >
                  {t.title}
                </Link>
                {t.projectCode && (
                  <Link
                    href={`/projects/${t.projectId}`}
                    className="text-xs font-mono text-slate-500 hover:underline"
                  >
                    {t.projectCode}
                  </Link>
                )}
                <span className="text-xs text-slate-500">
                  {t.assigneeName || 'Unassigned'}
                </span>
                {t.dueDate && (
                  <span className="text-xs text-slate-500">
                    due {formatDate(t.dueDate)}
                  </span>
                )}
                <span
                  className={`tag ${RISK_COLORS[t.label as 'low' | 'medium' | 'high']}`}
                >
                  {Math.round(t.probability * 100)}% · {t.label}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Project hotspots */}
      <Card title="Projects under this application">
        {bottlenecks?.projectHotspots?.length ? (
          <div className="space-y-2">
            {bottlenecks.projectHotspots.map((p: any) => {
              const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
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
                      {p.overdue > 0 && (
                        <span className="text-xs text-red-600 font-medium">
                          ⚠ {p.overdue} overdue
                        </span>
                      )}
                      {p.highRisk > 0 && (
                        <span className="text-xs text-red-600 font-medium">
                          {p.highRisk} high-risk
                        </span>
                      )}
                      <span className="text-xs text-slate-500 w-20 text-right">
                        {p.doneCount}/{p.taskCount} · {pct}%
                      </span>
                    </div>
                  </div>
                  <ProgressBar value={pct} className="mt-1.5" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="text-sm text-slate-500 py-6 text-center">
            No projects under this application yet.{' '}
            <Link
              href={`/projects/new?applicationId=${app.id}`}
              className="text-brand-700 hover:underline"
            >
              Create the first one
            </Link>
            .
          </div>
        )}
      </Card>
    </div>
  );
}
