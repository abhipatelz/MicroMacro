'use client';
import { useEffect, useRef, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useCurrentUser } from '@/components/CurrentUserContext';
import { Trash2, BarChart3, X, Camera } from 'lucide-react';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import dynamic from 'next/dynamic';
// Heavy interactive SVG canvas — defer it until a viewer opens the modal.
const BirdsEyeView = dynamic(() => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView), {
  ssr: false,
  loading: () => null,
});
const ActivityGraph = dynamic(() => import('@/components/ActivityGraph').then((m) => m.ActivityGraph), {
  ssr: false,
  loading: () => <div className="h-40 skeleton rounded-xl" />,
});
import { Card, ProgressBar, LifecycleTag, StatusTag, RoleBadge, formatDate, TaskLink } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { downloadTeamReport, printTeamReport, downloadTeamCsv } from './report';
import { ExportMenu } from '@/components/ExportMenu';
import { Select } from '@/components/Select';

/* One task line, reused by the Work view (grouped by person for leads, flat for
   an IC). When grouped under a person we drop the redundant assignee chip. */
function TeamTaskRow({ t, showAssignee }: { t: any; showAssignee: boolean }) {
  const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done';
  return (
    <div className="py-2.5 flex items-center gap-3 text-sm">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <TaskLink task={t} />
        </div>
        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 min-w-0">
          <Link href={`/projects/${t.projectId}`} className="hover:underline font-medium truncate shrink-0">
            {t.projectCode}
          </Link>
          {showAssignee && (
            <span className="inline-flex items-center gap-1 min-w-0">
              <span className="text-slate-300">·</span>
              {t.assigneeId ? (
                <>
                  <UserAvatar userId={t.assigneeId} name={t.assigneeName} size={16} />
                  <span className="truncate">{t.assigneeName}</span>
                </>
              ) : (
                <span>Unassigned</span>
              )}
            </span>
          )}
        </div>
      </div>
      <StatusTag status={t.status} />
      <span
        className={`text-xs w-24 text-right shrink-0 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}`}
      >
        {t.dueDate ? formatDate(t.dueDate) : '—'}
      </span>
    </div>
  );
}

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
  // Team avatar — loaded on mount, updated on upload/remove
  const [avatarImage, setAvatarImage] = useState<string | null>(null);
  const [avatarHover, setAvatarHover] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const me = useCurrentUser();
  const isLead = me?.role === 'lead' || me?.role === 'admin';
  // Two views, not three. The old "Team progress" tab duplicated the "Projects"
  // tab (same per-project bars), so they're merged into one Projects overview
  // (team-wide summary + per-project rows). "Work" answers the lead's daily
  // question — who is doing what — by grouping tasks under each person; an IC
  // sees only their own. Both roles open on Work.
  const [view, setView] = useState<'work' | 'projects'>('work');

  async function load() {
    setLoadError('');
    try {
      // Per-member progress analytics is a LEAD/ADMIN-only endpoint (it 403s
      // for contributors). Only request it when the viewer can use it — if we
      // include it for an IC the whole Promise.all rejects and the page hangs
      // on the skeleton forever.
      const [t, b] = await Promise.all([api<any>(`/teams/${id}`), api<any[]>(`/teams/${id}/board`)]);
      setTeam(t);
      setBoard(b);
      if (isLead) {
        api<any>(`/analytics/team/${id}/progress`)
          .then(setProgress)
          .catch(() => {});
      }
    } catch (e: any) {
      setLoadError(e?.message || 'This team could not be loaded.');
    }
  }
  useEffect(() => {
    load();
    // The user list only feeds the add-member dropdown (owner/admin only); a
    // failure here must never block the team view from rendering.
    api<any[]>('/users')
      .then(setUsers)
      .catch(() => {});
    // Load team avatar on mount — stored separately (select: false on the
    // model) so we always do a dedicated fetch rather than rely on the team
    // payload.
    api<{ avatarImage: string | null }>(`/teams/${id}/avatar`)
      .then((r) => setAvatarImage(r.avatarImage))
      .catch(() => {});
  }, [id]);

  // Resize a File to 128×128 JPEG (quality 0.85) and return a data-URL.
  function resizeToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 128;
          canvas.height = 128;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2d context unavailable'));
            return;
          }
          // Draw centred square crop then scale to 128×128
          const size = Math.min(img.width, img.height);
          const sx = (img.width - size) / 2;
          const sy = (img.height - size) / 2;
          ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset so the same file can be picked again after a remove
    e.target.value = '';
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      await api(`/teams/${id}/avatar`, { method: 'PUT', body: { image: dataUrl } });
      setAvatarImage(dataUrl);
    } catch {
      // Silent fail — keep the existing avatar
    } finally {
      setAvatarUploading(false);
    }
  }

  async function removeAvatar() {
    setAvatarUploading(true);
    try {
      await api(`/teams/${id}/avatar`, { method: 'PUT', body: { image: null } });
      setAvatarImage(null);
    } catch {
      // Silent fail
    } finally {
      setAvatarUploading(false);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-3 page-enter">
        <h1 className="text-lg font-bold text-slate-800">Team unavailable</h1>
        <p className="text-sm text-slate-500">{loadError}</p>
        <div className="flex items-center justify-center gap-2 pt-1">
          <button onClick={() => load()} className="btn-primary">
            Try again
          </button>
          <Link href="/teams" className="btn-secondary">
            Back to teams
          </Link>
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

  const availableUsers = users.filter(
    (u) => u.role !== 'admin' && !team.members.find((m: any) => m.id === u.id),
  );

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
        <ModalPortal>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
            onClick={() => setActivityMember(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[820px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-5">
                <UserAvatar userId={activityMember.id} name={activityMember.name} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-slate-900 truncate">{activityMember.name}</h3>
                    {activityMember.role && <RoleBadge role={activityMember.role} />}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Performance overview</div>
                </div>
                <button
                  onClick={() => setActivityMember(null)}
                  className="text-slate-300 hover:text-slate-500 ml-2 mt-0.5"
                >
                  <X size={18} />
                </button>
              </div>
              <ActivityGraph userId={activityMember.id} name={activityMember.name} />
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
                  Working on now
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {board
                    .filter(
                      (task: any) =>
                        task.assigneeId === activityMember.id &&
                        task.status !== 'done' &&
                        task.status !== 'cancelled',
                    )
                    .slice(0, 8)
                    .map((task: any) => (
                      <Link
                        key={task.id}
                        href={`/tasks/${task.id}`}
                        className="rounded-xl border border-slate-200 p-3 transition hover:border-blue-200 hover:bg-blue-50/40"
                      >
                        <div className="truncate text-sm font-semibold text-slate-800">{task.title}</div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="truncate">{task.projectCode}</span>
                          <StatusTag status={task.status} />
                        </div>
                      </Link>
                    ))}
                  {!board.some(
                    (task: any) =>
                      task.assigneeId === activityMember.id &&
                      task.status !== 'done' &&
                      task.status !== 'cancelled',
                  ) && <div className="text-sm text-slate-400">No active assigned tasks right now.</div>}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Team avatar — 64px rounded square; leads/admins can change it on hover */}
          <div
            className="relative shrink-0 cursor-pointer"
            onMouseEnter={() => setAvatarHover(true)}
            onMouseLeave={() => setAvatarHover(false)}
            onClick={() => isOwnerOrAdmin && avatarInputRef.current?.click()}
            title={isOwnerOrAdmin ? 'Change team avatar' : undefined}
          >
            {avatarImage ? (
              <img
                src={avatarImage}
                alt={`${team.name} avatar`}
                className="w-16 h-16 rounded-xl object-cover border border-slate-200"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center">
                <span className="text-2xl font-black text-slate-400 select-none">
                  {team.name.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
            {/* Change-avatar overlay — only for owner/admin */}
            {isOwnerOrAdmin && (avatarHover || avatarUploading) && (
              <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                {avatarUploading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={18} className="text-white" />
                )}
              </div>
            )}
          </div>
          {/* Hidden file input */}
          {isOwnerOrAdmin && (
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
          )}
          <div>
            <h1 className="page-title">{team.name}</h1>
            {team.description && <p className="text-slate-600 mt-1">{team.description}</p>}
            {/* Human label + tone for the team's operating function — the raw
                enum value ("rtb") is a database detail, not UI copy. */}
            <span
              className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                (
                  {
                    rtb: 'bg-blue-50 text-blue-700 border-blue-200',
                    ctb: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  } as Record<string, string>
                )[team.function] || 'bg-slate-50 text-slate-600 border-slate-200'
              }`}
            >
              {(
                {
                  rtb: 'Run the Business',
                  ctb: 'Change the Business',
                  general: 'General',
                  csv_validation: 'CSV / Validation',
                  data_integrity: 'Data Integrity',
                  pharmacovigilance: 'Pharmacovigilance',
                  lab_informatics: 'Lab Informatics',
                  audit: 'Audit',
                  training: 'Training',
                } as Record<string, string>
              )[team.function] || team.function}
            </span>
            {/* Remove avatar option — shown when avatar is set and user is owner/admin */}
            {isOwnerOrAdmin && avatarImage && (
              <button
                onClick={removeAvatar}
                disabled={avatarUploading}
                className="mt-1 text-[11px] text-slate-400 hover:text-red-500 transition-colors"
              >
                Remove avatar
              </button>
            )}
          </div>
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
              onBirdEyeSvg={() => setShowBirdEye(true)}
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
                Add someone here to give them access to every project assigned to this team. Membership is the
                tag — no separate permissions needed.
              </div>
            )}
            {adding && isOwnerOrAdmin && (
              <div className="flex gap-2 mb-3">
                <Select
                  className="flex-1"
                  value={newMember}
                  onChange={setNewMember}
                  ariaLabel="Select user to add"
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
                        {isLead &&
                          p &&
                          ` · ${p.done}/${p.assigned} done${p.overdue ? ` · ${p.overdue} overdue` : ''}`}
                      </div>
                      {isLead && p && p.assigned > 0 && (
                        <ProgressBar value={Math.round((p.done / p.assigned) * 100)} className="mt-1" />
                      )}
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
            {(
              [
                ['work', isLead ? 'Work' : 'My tasks'],
                ['projects', 'Projects'],
              ] as [string, string][]
            ).map(([k, l]) => (
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

          {/* ── Work — who is doing what ──────────────────────────────────
              For a lead, tasks are grouped under each person (with open/total
              counts) so the answer to "who's on what" is the page itself, not a
              spreadsheet. An IC sees only their own tasks, flat. */}
          {view === 'work' &&
            (isLead ? (
              <Card title="Who's doing what">
                {(() => {
                  const byAssignee = new Map<string, any[]>();
                  for (const t of visibleBoard) {
                    const k = t.assigneeId || '__unassigned';
                    (byAssignee.get(k) || byAssignee.set(k, []).get(k)!).push(t);
                  }
                  const groups: { id: string; name: string; tasks: any[] }[] = [];
                  for (const m of team.members) {
                    const ts = byAssignee.get(m.id);
                    if (ts && ts.length) groups.push({ id: m.id, name: m.name, tasks: ts });
                  }
                  const un = byAssignee.get('__unassigned');
                  if (un && un.length) groups.push({ id: '__unassigned', name: 'Unassigned', tasks: un });
                  if (groups.length === 0)
                    return <div className="text-sm text-slate-500 py-4">No tasks yet.</div>;
                  return (
                    <div className="space-y-5">
                      {groups.map((g) => {
                        const open = g.tasks.filter((t) => t.status !== 'done').length;
                        const overdue = g.tasks.filter(
                          (t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done',
                        ).length;
                        return (
                          <div key={g.id}>
                            <div className="flex items-center gap-2 mb-1">
                              {g.id === '__unassigned' ? (
                                <span className="w-[22px] h-[22px] rounded-full bg-slate-100 text-slate-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                                  ?
                                </span>
                              ) : (
                                <UserAvatar userId={g.id} name={g.name} size={22} />
                              )}
                              <span className="text-sm font-bold text-slate-700">{g.name}</span>
                              <span className="text-[11px] text-slate-400">
                                {open} open · {g.tasks.length} total
                                {overdue > 0 && (
                                  <span className="text-red-500 font-semibold"> · {overdue} overdue</span>
                                )}
                              </span>
                            </div>
                            <div className="divide-y divide-slate-100 pl-1">
                              {g.tasks.map((t: any) => (
                                <TeamTaskRow key={t.id} t={t} showAssignee={false} />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </Card>
            ) : (
              <Card title="My tasks across team projects">
                <div className="divide-y divide-slate-100">
                  {visibleBoard.map((t: any) => (
                    <TeamTaskRow key={t.id} t={t} showAssignee={false} />
                  ))}
                  {visibleBoard.length === 0 && (
                    <div className="text-sm text-slate-500 py-4">You have no tasks in this team yet.</div>
                  )}
                </div>
              </Card>
            ))}

          {view === 'projects' && (
            <div className="space-y-4">
              {/* Team-wide progress summary — the headline the old separate
                  "Team progress" tab used to carry, now at the top of Projects
                  so there's one place for "where does the team stand". */}
              {(() => {
                const projs = team.projects || [];
                const total = projs.reduce((s: number, p: any) => s + (p.taskCount || 0), 0);
                const done = projs.reduce((s: number, p: any) => s + (p.tasksDone || 0), 0);
                const active = projs.filter((p: any) => p.status === 'in_progress').length;
                const pct = total ? Math.round((done / total) * 100) : 0;
                if (projs.length === 0) return null;
                return (
                  <Card title="Team progress">
                    <div className="flex items-center justify-between gap-3 mb-2 text-sm">
                      <span className="text-slate-500">
                        <strong className="text-slate-800 dark:text-white/85">{projs.length}</strong> project
                        {projs.length === 1 ? '' : 's'} · {active} active
                      </span>
                      <span className="text-slate-500">
                        <strong className="text-slate-800 dark:text-white/85 tabular-nums">{done}</strong>/
                        {total} tasks done ·{' '}
                        <strong className="text-blue-600 dark:text-blue-400 tabular-nums">{pct}%</strong>
                      </span>
                    </div>
                    <ProgressBar value={pct} />
                  </Card>
                );
              })()}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {team.projects.map((p: any) => {
                  const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
                  return (
                    <Link
                      href={`/projects/${p.id}`}
                      key={p.id}
                      className="card p-4 hover:shadow-md transition"
                    >
                      <div className="text-xs font-mono text-slate-500">{p.ccNo || p.code}</div>
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
              id: p.id,
              code: p.ccNo || p.code,
              name: p.name,
              teamId: team.id,
              health: 'healthy',
              taskCount: p.taskCount ?? 0,
              tasksDone: p.tasksDone ?? 0,
              dueDate: p.dueDate ?? null,
              ownerName: p.ownerName ?? null,
            })),
            tasks: (board || []).map((t: any) => ({
              id: t.id,
              title: t.title,
              projectId: t.projectId,
              status: t.status,
              assigneeName: t.assigneeName ?? null,
              dueDate: (t.ccTcd || t.dueDate) ?? null,
              subtaskCount: t.subtaskCount,
              subtasksDone: t.subtasksDone,
              subtaskTitles: (t.subtaskTitles || []).slice(0, 5),
            })),
          }}
        />
      )}
    </div>
  );
}
