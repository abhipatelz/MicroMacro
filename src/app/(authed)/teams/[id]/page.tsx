'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useCurrentUser } from '@/components/CurrentUserContext';
import { Trash2, BarChart3, X } from 'lucide-react';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import dynamic from 'next/dynamic';
// Heavy interactive SVG canvas — defer it until a viewer opens the modal.
const BirdsEyeView = dynamic(
  () => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView),
  { ssr: false, loading: () => null },
);
const ActivityGraph = dynamic(
  () => import('@/components/ActivityGraph').then(m => m.ActivityGraph),
  { ssr: false, loading: () => <div className="h-40 skeleton rounded-xl" /> },
);
import {
  Card,
  ProgressBar,
  LifecycleTag,
  StatusTag,
  RoleBadge,
  formatDate,
  TaskLink
} from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { downloadTeamReport, printTeamReport, downloadTeamCsv } from './report';
import { ExportMenu } from '@/components/ExportMenu';
import { Select } from '@/components/Select';

const FUNCTION_LABEL: Record<string, string> = {
  general: 'General',
  ctb: 'Change the Business',
  rtb: 'Run the Business',
  csv_validation: 'CSV / Validation',
  data_integrity: 'Data Integrity',
  pharmacovigilance: 'Pharmacovigilance',
  lab_informatics: 'Lab Informatics',
  audit: 'Audit',
  training: 'Training',
};

export default function TeamDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [team, setTeam] = useState<any>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [loadError, setLoadError] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [activityMember, setActivityMember] = useState<any | null>(null);
  const [showBirdEye, setShowBirdEye] = useState(false);
  const me = useCurrentUser();
  const isLead = me?.role === 'lead' || me?.role === 'admin';
  // An IC's team view is personal: they see their own micro-tasks only and
  // none of their teammates' progress. Default them straight to micro-tasks.
  const [view, setView] = useState<'progress' | 'microtasks' | 'projects'>(isLead ? 'progress' : 'microtasks');

  async function load() {
    setLoadError('');
    try {
      // Per-member progress analytics is a LEAD/ADMIN-only endpoint (it 403s
      // for contributors). Only request it when the viewer can use it — if we
      // include it for an IC the whole Promise.all rejects and the page hangs
      // on the skeleton forever.
      const [t, b] = await Promise.all([
        api<any>(`/teams/${id}`),
        api<any[]>(`/teams/${id}/board`),
      ]);
      setTeam(t);
      setBoard(b);
      if (isLead) {
        api<any>(`/analytics/team/${id}/progress`).then(setProgress).catch(() => {});
      }
    } catch (e: any) {
      setLoadError(e?.message || 'This team could not be loaded.');
    }
  }
  useEffect(() => {
    load();
    // The user list only feeds the add-member dropdown (owner/admin only); a
    // failure here must never block the team view from rendering.
    api<any[]>('/users').then(setUsers).catch(() => {});
  }, [id]);

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-3 page-enter">
        <h1 className="text-lg font-bold text-slate-800">Team unavailable</h1>
        <p className="text-sm text-slate-500">{loadError}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button onClick={() => load()} className="btn-primary">Try again</button>
          <Link href="/teams" className="btn-secondary">Back to teams</Link>
        </div>
      </div>
    );
  }

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

  const availableUsers = users.filter((u) => u.role !== 'admin' && !team.members.find((m: any) => m.id === u.id));

  // Only the team's owner (its lead) or the workspace admin can edit the team
  // — add/remove members, etc. (mirrors the API guard).
  const isOwnerOrAdmin = me?.role === 'admin' || (!!team.leadId && team.leadId === me?.id);

  // ICs only ever see their own micro-tasks; leads see the whole board.
  const visibleBoard = isLead ? board : board.filter((t: any) => t.assigneeId === me?.id);

  return (
    <div className="space-y-6">
      {/* Per-member activity peek — leads/admins click the graph icon on a
          member to see how they're tracking (read-only). */}
      {activityMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={() => setActivityMember(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[820px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-5">
              <UserAvatar userId={activityMember.id} name={activityMember.name} size={44} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-slate-900 truncate">{activityMember.name}</h3>
                  {activityMember.role && <RoleBadge role={activityMember.role} />}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">Performance overview</div>
              </div>
              <button onClick={() => setActivityMember(null)} className="text-slate-300 hover:text-slate-500 ml-2 mt-0.5"><X size={18} /></button>
            </div>
            <ActivityGraph userId={activityMember.id} name={activityMember.name} />
          </div>
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{team.name}</h1>
          {team.description && <p className="text-slate-600 mt-1">{team.description}</p>}
          <p className="text-sm text-slate-500 mt-1">Function: {team.function}</p>
        </div>
        {/* Any team lead (not just the team's owner) or an admin can export
            a presentable team report. One "Export" button → PDF / CSV / HTML;
            the report is generated entirely from data already on screen so
            this is purely a UI gate. */}
        {(isOwnerOrAdmin || isLead) && (
          <div className="shrink-0 flex items-center gap-2 flex-wrap">
            <BirdEyeButton scopeKey={`team:${id}`} onClick={() => setShowBirdEye(true)} />
            <ExportMenu
              onPdf={() => printTeamReport(team, progress, board, me?.name || me?.email || '')}
              onCsv={() => downloadTeamCsv(team, board, me?.name || me?.email || '')}
            />
          </div>
        )}
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-4">
          <Card
            title={`Members (${team.members.length})`}
            action={
              isOwnerOrAdmin ? (
                <button
                  className="text-xs font-bold text-brand-700 hover:text-brand-800 px-2 py-1 rounded-md hover:bg-blue-50 transition-colors"
                  onClick={() => setAdding((v) => !v)}
                >
                  {adding ? 'Cancel' : '+ Add member'}
                </button>
              ) : undefined
            }
          >
            {/* Helper note — membership IS the access mechanism */}
            {isOwnerOrAdmin && (
              <div className="mb-3 -mt-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-2 leading-snug">
                Add someone here to give them access to every project assigned to this team.
                Membership is the tag — no separate permissions needed.
              </div>
            )}
            {adding && isOwnerOrAdmin && (
              <div className="flex gap-2 mb-3">
                <Select
                  className="flex-1" value={newMember} onChange={setNewMember} ariaLabel="Select user to add"
                  placeholder="Select user…"
                  options={[
                    { value: '', label: 'Select user…' },
                    ...availableUsers.map((u: any) => ({ value: u.id, label: u.name })),
                  ]}
                />
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
                    className="group flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-b-0"
                  >
                    <UserAvatar userId={m.id} name={m.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{m.name}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {m.title || m.role}
                        {/* Per-member progress is only shown to leads/admins —
                            an IC never sees a teammate's done/overdue counts. */}
                        {isLead && p &&
                          ` · ${p.done}/${p.assigned} done${p.overdue ? ` · ${p.overdue} overdue` : ''}`}
                      </div>
                    </div>
                    {isLead && (
                      <button
                        onClick={() => setActivityMember(m)}
                        title={`View ${m.name}'s activity`}
                        className="text-slate-400 hover:text-blue-600 transition-colors shrink-0"
                      >
                        <BarChart3 size={14} />
                      </button>
                    )}
                    {isOwnerOrAdmin && (
                      <button
                        onClick={() => removeMember(m.id)}
                        title="Remove from team"
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 transition-opacity"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex gap-2">
            {([
              ...(isLead ? [['progress', 'Team progress']] : []),
              ['microtasks', isLead ? 'Micro-tasks' : 'My tasks'],
              ['projects', 'Projects'],
            ] as [string, string][]).map(([k, l]) => (
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

          {/* Skeleton placeholder while the progress aggregation is loading,
              so the page doesn't appear frozen while Mongo is responding. */}
          {view === 'progress' && isLead && !progress && (
            <div className="space-y-4" aria-busy="true" aria-live="polite">
              <Card title="Project progress">
                <div className="space-y-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton h-3 w-1/2" />
                      <div className="skeleton h-2 flex-1" />
                      <div className="skeleton h-3 w-12" />
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Member workload">
                <div className="space-y-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="skeleton h-7 w-7 rounded-full shrink-0" />
                      <div className="skeleton h-3 flex-1" />
                      <div className="skeleton h-3 w-16" />
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}
          {view === 'progress' && isLead && progress && (
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
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[460px]">
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
                </div>
              </Card>
            </>
          )}

          {view === 'microtasks' && (
            <Card title={isLead ? 'All micro-tasks across team projects' : 'My tasks across team projects'}>
              {/* Decluttered row: title + project · assignee (leads only) on the
                  left; status and due date on the right. Lifecycle/priority/GxP
                  chips moved off the main row to reduce visual noise. */}
              <div className="divide-y divide-slate-100">
                {visibleBoard.map((t: any) => {
                  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done';
                  return (
                    <div key={t.id} className="py-2.5 flex items-center gap-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <TaskLink task={t} />
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          <Link href={`/projects/${t.projectId}`} className="hover:underline font-medium">
                            {t.projectCode}
                          </Link>
                          {isLead && <> · {t.assigneeName || 'Unassigned'}</>}
                        </div>
                      </div>
                      <StatusTag status={t.status} />
                      <span className={`text-xs w-24 text-right shrink-0 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        {t.dueDate ? formatDate(t.dueDate) : '—'}
                      </span>
                    </div>
                  );
                })}
                {visibleBoard.length === 0 && (
                  <div className="text-sm text-slate-500 py-4">
                    {isLead ? 'No tasks yet.' : 'You have no tasks in this team yet.'}
                  </div>
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
      {showBirdEye && team && (
        <BirdsEyeView
          onClose={() => setShowBirdEye(false)}
          onChange={load}
          data={{
            rootLabel: team.name,
            rootSubLabel: `${(team.projects || []).length} project${(team.projects || []).length === 1 ? '' : 's'} · ${(board || []).length} task${(board || []).length === 1 ? '' : 's'}`,
            scope: 'team',
            teams: [{ id: team.id, name: team.name, ownerName: team.leadName }],
            projects: (team.projects || []).map((p: any) => ({
              id: p.id, code: p.code, name: p.name,
              teamId: team.id,
              health: 'healthy',
              taskCount: p.taskCount ?? 0,
              tasksDone: p.tasksDone ?? 0,
              dueDate: p.dueDate ?? null,
              ownerName: p.ownerName ?? null,
            })),
            tasks: (board || []).map((t: any) => ({
              id: t.id, title: t.title, projectId: t.projectId,
              status: t.status,
              assigneeName: t.assigneeName ?? null,
              dueDate: (t.ccTcd || t.dueDate) ?? null,
            })),
          }}
        />
      )}
    </div>
  );
}
