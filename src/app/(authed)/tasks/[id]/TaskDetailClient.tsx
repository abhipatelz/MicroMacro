'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Card, PriorityTag, StatusTag, formatDate, Avatar, useToast } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { useIsLead } from '@/components/CurrentUserContext';
import { chimeIfEnabled } from '@/lib/sound';
import { ChevronRight, Shield, FileText, MessageSquare, Timer, Activity, Clock } from 'lucide-react';

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

const STATUS_META: Record<string, { label: string; dot: string; ring: string }> = {
  todo:        { label: 'To do',       dot: '#94a3b8', ring: '#e2e8f0' },
  in_progress: { label: 'In progress', dot: '#3b82f6', ring: '#bfdbfe' },
  review:      { label: 'Review',      dot: '#f59e0b', ring: '#fde68a' },
  blocked:     { label: 'Blocked',     dot: '#ef4444', ring: '#fecaca' },
  done:        { label: 'Done',        dot: '#22c55e', ring: '#bbf7d0' },
};
const TASK_TYPES = ['task','review','approval','test','issue','corrective_action','finding','data_review'] as const;
const TASK_TYPE_LABELS: Record<string, string> = {
  task: 'Task', review: 'Review', approval: 'Approval', test: 'Test',
  issue: 'Issue', corrective_action: 'Corrective Action', finding: 'Finding', data_review: 'Data Review',
  deviation: 'Issue', capa: 'Corrective Action', audit_finding: 'Finding',
};

interface TaskDetailClientProps {
  initialTask?: any;
  initialMe?: { id: string; name: string; email: string; role: string } | null;
}

export default function TaskDetailClient(props: TaskDetailClientProps) {
  const { initialTask = null, initialMe = null } = props;
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const isLead = useIsLead();
  // Seed from the server-rendered payload so real content paints on first
  // byte; the mount-time refetch below keeps it fresh.
  const [task, setTask] = useState<any>(initialTask);
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(initialMe);
  const [comment, setComment] = useState('');
  const [newSub, setNewSub] = useState('');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  const { showToast, ToastEl } = useToast();

  async function load() {
    try {
      setTask(await api<any>(`/tasks/${id}`));
      setLoadErr(null);
    } catch (e: any) {
      setLoadErr(e?.message || 'Could not load this task.');
    }
  }

  useEffect(() => {
    // The page is SSR-seeded. Avoid a duplicate task fetch on hydration; only
    // fetch the task when a direct client transition reaches this component
    // without server data, then load the scoped roster in parallel-friendly
    // follow-up calls.
    (async () => {
      try {
        const t = task || await api<any>(`/tasks/${id}`);
        if (!task) setTask(t);
        const m = me ? { user: me } : await api<any>('/auth/me');
        setMe(m.user);
        const proj = t.projectId ? await api<any>(`/projects/${t.projectId}`).catch(() => null) : null;
        const teamId = proj?.teamId;
        const u = await api<any[]>(`/users${teamId ? `?teamId=${teamId}` : ''}`);
        setUsers(u.filter((x) => x.role !== 'admin'));   // admin is never assignable
      } catch (e: any) {
        setLoadErr(e?.message || 'Could not load this task.');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadErr) {
    return (
      <div className="max-w-md mx-auto mt-12 card p-6 text-center page-enter">
        <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-3">
          <span className="text-red-600 text-lg">!</span>
        </div>
        <div className="text-sm font-bold text-slate-800 mb-1">We couldn&rsquo;t load this task</div>
        <div className="text-xs text-slate-500 mb-4">{loadErr}</div>
        <button onClick={() => { setLoadErr(null); load(); }} className="btn-primary text-xs justify-center">Retry</button>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-6xl page-enter" aria-busy="true" aria-live="polite">
        <div className="lg:col-span-2 space-y-4">
          <div className="space-y-2">
            <div className="skeleton h-3 w-40" />
            <div className="skeleton h-6 w-3/4" />
            <div className="flex gap-2 mt-1">
              <div className="skeleton h-5 w-20 rounded-full" />
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
          </div>
          <div className="card p-5 space-y-3">
            <div className="skeleton h-4 w-32" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
            <div className="skeleton h-3 w-4/6" />
          </div>
          <div className="card p-5 space-y-3">
            <div className="skeleton h-4 w-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <div className="skeleton h-4 w-4 rounded" />
                <div className="skeleton h-4 flex-1" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card p-5 space-y-2">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-8 w-full" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading task…</span>
      </div>
    );
  }

  async function update(patch: any, opts?: { optimistic?: any }) {
    if (opts?.optimistic) setTask((t: any) => ({ ...t, ...opts.optimistic }));
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: patch });
      load();
    } catch (e: any) {
      showToast(e.message || 'Save failed', 'err');
      load(); // revert
    }
  }

  async function updateStatus(newStatus: string) {
    const wasDone = task?.status === 'done';
    setSavingStatus(true);
    setTask((t: any) => ({ ...t, status: newStatus }));
    try {
      await api(`/tasks/${id}`, { method: 'PATCH', body: { status: newStatus } });
      if (newStatus === 'done' && !wasDone) {
        showToast('Task marked done ✓');
        chimeIfEnabled();
      }
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update status', 'err');
      load();
    } finally {
      setSavingStatus(false);
    }
  }
  async function addSubtask() {
    if (!newSub.trim()) return;
    await api(`/tasks/${id}/subtasks`, { method: 'POST', body: { title: newSub.trim() } });
    setNewSub(''); load();
  }
  async function toggleSub(sub: any) {
    await api(`/tasks/${id}/subtasks/${sub.id}`, { method: 'PATCH', body: { status: sub.status === 'done' ? 'todo' : 'done' } });
    load();
  }
  async function addComment() {
    if (!comment.trim()) return;
    await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: comment.trim() } });
    setComment(''); load();
  }
  async function signoff() { await api(`/tasks/${id}/signoff`, { method: 'POST' }); load(); }

  const canSignoff = task.requiresQaSignoff && !task.qaSignoffAt && (me?.role === 'lead' || me?.role === 'admin');
  const hasReferenceData = task.ccNo || task.documentNo || task.applicableSite !== 'na' || task.deployStage !== 'na';

  // IC edit contract: a contributor may edit ONLY the description and due date,
  // and ONLY on a task assigned to them. Everything else — status, assignee,
  // priority, reference/compliance fields — is lead-owned. A task assigned to
  // someone else (or unassigned) is fully read-only for an IC, and the inputs
  // are disabled so no save is even attempted. Leads/admins keep full control.
  const isAssignee  = !!(me && task.assigneeId && String(task.assigneeId) === String(me.id));
  // Description + due date: editable by leads or the assignee.
  const canEditBasics = isLead || isAssignee;
  // Reference/tracking fields, status, assignee, priority, etc.: leads only.
  const canEditAll = isLead;
  const canComment = isLead || isAssignee;
  const canEditStatus = isLead;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 max-w-6xl page-enter">
      {ToastEl}

      {/* ── Left: main content ─────────────────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4">

        {/* Breadcrumb + title */}
        <div>
          <div className="text-xs text-slate-400 flex items-center gap-1 mb-2">
            <Link href={`/projects/${task.projectId}`} className="hover:text-blue-600 transition-colors">
              {task.projectCode} · {task.projectName}
            </Link>
            <ChevronRight size={12} />
            <span className="text-slate-300">Task</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 leading-snug">{task.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <StatusTag status={task.status} />
            <PriorityTag priority={task.priority} />
            {task.gxpCritical && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                <Shield size={11} /> Compliance Critical
              </span>
            )}
            {task.requiresQaSignoff && (
              task.qaSignoffAt ? (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                  Approved ✓ {task.qaSignoffName} · {formatDate(task.qaSignoffAt)}
                </span>
              ) : (
                <span className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                  Sign-off required
                </span>
              )
            )}
            {task.taskType && task.taskType !== 'task' && (
              <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded capitalize">
                {TASK_TYPE_LABELS[task.taskType] ?? task.taskType.replace(/_/g, ' ')}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <Card title="Description">
          <textarea
            className="textarea min-h-[90px] text-sm disabled:bg-slate-50 disabled:text-slate-500"
            value={task.description || ''}
            disabled={!canEditBasics}
            onChange={(e) => setTask({ ...task, description: e.target.value })}
            onBlur={(e) => canEditBasics && update({ description: e.target.value })}
            placeholder="Describe what's expected, references, evidence required…"
          />
        </Card>
        {!isLead && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
            {canEditBasics
              ? 'You can edit the description and due date of this task. Status, assignee and other fields are lead-owned.'
              : 'Read-only: only the assignee and team leads can edit this task.'}
          </div>
        )}

        {/* ── Reference & Tracking details ─────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
            <FileText size={14} className="text-blue-500" />
            <h3 className="text-sm font-semibold text-slate-700">Reference & Tracking</h3>
            {hasReferenceData && (
              <span className="ml-auto text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Filled</span>
            )}
          </div>
          <div className="p-4 space-y-4">

            {/* Ref No. + Target Date */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Reference Number</label>
                <input
                  className="input text-sm font-mono disabled:bg-slate-50 disabled:text-slate-500"
                  placeholder="e.g. REF-2025-042"
                  value={task.ccNo || ''}
                  disabled={!canEditAll}
                  onChange={(e) => setTask({ ...task, ccNo: e.target.value })}
                  onBlur={(e) => canEditAll && update({ ccNo: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Target Completion Date</label>
                <div>
                  <DatePicker
                    value={task.ccTcd ? task.ccTcd.slice(0, 10) : null}
                    onChange={(v) => canEditAll && update({ ccTcd: v }, { optimistic: { ccTcd: v } })}
                    placeholder="Set date"
                    disabled={!canEditAll}
                    block
                  />
                </div>
              </div>
            </div>

            {/* Document No. */}
            <div>
              <label className="label flex items-center gap-1">
                <FileText size={11} /> Document No.
              </label>
              <input
                className="input text-sm font-mono disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="SOP / Protocol / Doc ref"
                value={task.documentNo || ''}
                disabled={!canEditAll}
                onChange={(e) => setTask({ ...task, documentNo: e.target.value })}
                onBlur={(e) => canEditAll && update({ documentNo: e.target.value })}
              />
            </div>

            {/* Remarks */}
            <div>
              <label className="label flex items-center gap-1">
                <MessageSquare size={11} /> Remarks
              </label>
              <textarea
                className="textarea text-sm min-h-[60px] disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Any additional notes, blockers, or context…"
                value={task.remarks || ''}
                disabled={!canEditAll}
                onChange={(e) => setTask({ ...task, remarks: e.target.value })}
                onBlur={(e) => canEditAll && update({ remarks: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Subtasks */}
        <Card
          title={`Subtasks (${task.subtasks.length})`}
          action={
            <span className="text-xs text-slate-400">
              {task.subtasks.filter((s: any) => s.status === 'done').length}/{task.subtasks.length} done
            </span>
          }
        >
          <div className="space-y-1">
            {task.subtasks.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2.5 text-sm py-1 group">
                <button
                  onClick={() => canComment && toggleSub(s)}
                  disabled={!canComment}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                    s.status === 'done' ? 'border-green-500 bg-green-500' : 'border-slate-300 hover:border-blue-400'
                  } ${canComment ? '' : 'opacity-60 cursor-default'}`}
                >
                  {s.status === 'done' && <span className="text-white text-[8px] font-black">✓</span>}
                </button>
                <span className={`flex-1 ${s.status === 'done' ? 'line-through text-slate-400' : 'text-slate-700'}`}>
                  {s.title}
                </span>
                <span className="text-xs text-slate-400">{formatDate(s.dueDate)}</span>
              </div>
            ))}
            {task.subtasks.length === 0 && (
              <div className="text-xs text-slate-400 py-1">No subtasks yet.</div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <input className="input text-sm" placeholder="Add a subtask…"
              value={newSub} onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubtask()} />
            <button className="btn-primary text-sm" onClick={addSubtask}>Add</button>
          </div>
        </Card>

        {/* Comments */}
        <Card title={`Comments (${task.comments.length})`}>
          <div className="space-y-3 mb-3">
            {task.comments.map((c: any) => (
              <div key={c.id} className="flex gap-3">
                <Avatar name={c.userName} size={28} />
                <div className="flex-1">
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{c.userName}</span> · {formatDate(c.createdAt)}
                  </div>
                  <div className="text-sm text-slate-700 mt-0.5">{c.body}</div>
                </div>
              </div>
            ))}
            {task.comments.length === 0 && (
              <div className="text-xs text-slate-400">No comments yet.</div>
            )}
          </div>
          {canComment ? (
            <div className="flex gap-2">
              <input className="input text-sm" placeholder="Add a comment…"
                value={comment} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addComment()} />
              <button className="btn-primary text-sm" onClick={addComment}>Post</button>
            </div>
          ) : (
            <div className="text-xs text-slate-400 italic">
              Only the assignee and team leads can comment on this task.
            </div>
          )}
        </Card>
      </div>

      {/* ── Right sidebar: properties ──────────────────────────────────── */}
      <div className="space-y-4">
        <Card title="Properties">
          <div className="space-y-3 text-sm">
            {/* Status — visual button flow. Contributors who are not the
                assignee see a read-only status badge instead of the
                clickable flow (the API would 403 them anyway). */}
            <div>
              <label className="label">Status</label>
              {!canEditStatus ? (
                <div className="mt-1">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 capitalize">
                    <span className="w-2 h-2 rounded-full"
                      style={{ background: STATUS_META[task.status]?.dot || '#94a3b8' }} />
                    {(STATUS_META[task.status]?.label) || String(task.status || '').replace(/_/g, ' ')}
                  </span>
                </div>
              ) : (
              <div className="flex flex-col gap-1 mt-1">
                {STATUSES.map(s => {
                  const meta  = STATUS_META[s];
                  const active = task.status === s;
                  return (
                    <button key={s} type="button"
                      disabled={savingStatus}
                      onClick={() => updateStatus(s)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                        active
                          ? 'border-transparent font-bold'
                          : 'border-transparent hover:bg-slate-50 text-slate-500 hover:text-slate-700'
                      }`}
                      style={active ? {
                        background: `${meta.ring}55`,
                        border: `1px solid ${meta.ring}`,
                        color: s === 'done' ? '#15803d' : s === 'blocked' ? '#dc2626' : s === 'in_progress' ? '#1565C0' : s === 'review' ? '#92400e' : '#475569',
                      } : {}}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 transition-all ${active ? 'scale-125' : ''}`}
                        style={{ background: meta.dot }} />
                      {meta.label}
                      {active && savingStatus && (
                        <span className="ml-auto w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin opacity-60" />
                      )}
                      {active && !savingStatus && (
                        <span className="ml-auto text-[10px] font-bold opacity-60">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
              )}
            </div>
            <div>
              <label className="label">Assignee</label>
              <select className="select disabled:bg-slate-50 disabled:text-slate-500" value={task.assigneeId || ''} disabled={!isLead} onChange={(e) => isLead && update({ assigneeId: e.target.value || null })}>
                <option value="">Unassigned</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            {/* Waiting on — who the task is stuck/pending with (QA, a person,
               a department). Editable by the assignee or a lead. */}
            <div>
              <label className="label flex items-center gap-1">
                <Clock size={11} /> Waiting on <span className="text-slate-300 font-normal normal-case">(if stuck)</span>
              </label>
              <input
                className="input text-sm"
                placeholder="e.g. QA review · Sachin · IT Helpdesk"
                value={task.pendingWith || ''}
                disabled={!canEditAll}
                onChange={(e) => setTask({ ...task, pendingWith: e.target.value })}
                onBlur={(e) => canEditAll && update({ pendingWith: e.target.value })}
              />
              {task.pendingWith && (
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                  <Clock size={11} /> Pending with {task.pendingWith}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Priority</label>
                <select className="select disabled:bg-slate-50 disabled:text-slate-500" value={task.priority} disabled={!isLead} onChange={(e) => isLead && update({ priority: e.target.value })}>
                  {['low','medium','high','critical'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select className="select disabled:bg-slate-50 disabled:text-slate-500" value={task.taskType} disabled={!isLead} onChange={(e) => isLead && update({ taskType: e.target.value })}>
                  {TASK_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Start date</label>
                <div>
                  <DatePicker
                    value={task.startDate ? task.startDate.slice(0, 10) : null}
                    onChange={(v) => isLead && update({ startDate: v }, { optimistic: { startDate: v } })}
                    placeholder="Set date"
                    disabled={!isLead}
                    block
                  />
                </div>
              </div>
              <div>
                <label className="label">Due date</label>
                <div>
                  <DatePicker
                    value={task.dueDate ? task.dueDate.slice(0, 10) : null}
                    onChange={(v) => canEditBasics && update({ dueDate: v }, { optimistic: { dueDate: v } })}
                    placeholder="Set date"
                    disabled={!canEditBasics}
                    block
                  />
                </div>
              </div>
            </div>
            {/* Compliance toggles live behind a disclosure so the default
                view stays simple. Schema-side these fields remain explicit
                per the GxP requirements in CLAUDE.md. */}
            <details className="pt-1 group">
              <summary className="text-[11px] font-semibold text-slate-400 cursor-pointer select-none hover:text-slate-600 transition-colors">
                Advanced — compliance flags
              </summary>
              <div className="flex gap-4 pt-2 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!task.gxpCritical} disabled={!isLead}
                    onChange={(e) => isLead && update({ gxpCritical: e.target.checked })} />
                  Compliance critical
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!task.requiresQaSignoff} disabled={!isLead}
                    onChange={(e) => isLead && update({ requiresQaSignoff: e.target.checked })} />
                  Requires sign-off
                </label>
              </div>
            </details>
          </div>
        </Card>

        {/* ── Advanced (effort tracking, reference fields) ──────────────
           Hidden by default. Pragati's day-to-day workflow only needs
           title + assignee + status + due — these power-user fields stay
           tucked away so the task page reads at a glance, Zerodha-Kite
           minimal. Open when you actually need to log time or look up
           a change-control number. */}
        <details className="group">
          <summary className="cursor-pointer select-none text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1 list-none [&::-webkit-details-marker]:hidden">
            <span className="inline-block transition-transform group-open:rotate-90">▸</span>
            Show effort log &amp; reference details
          </summary>
          <div className="mt-3 space-y-3">
            <ScheduleEffortCard task={task} onChanged={load} />
            {(task.ccNo || task.documentNo || task.deployStage !== 'na') && (
              <div className="card p-4 space-y-2">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Reference Summary</h4>
                {task.ccNo && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Ref No.</span>
                    <span className="font-mono font-semibold text-slate-700">{task.ccNo}</span>
              </div>
            )}
            {task.ccTcd && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Target Date</span>
                <span className="font-medium text-slate-700">{formatDate(task.ccTcd)}</span>
              </div>
            )}
            {task.documentNo && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Doc No.</span>
                <span className="font-mono font-semibold text-slate-700">{task.documentNo}</span>
              </div>
            )}
            {task.applicableSite && task.applicableSite !== 'na' && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Site</span>
                <span className="font-medium text-slate-700 uppercase">{task.applicableSite.replace('_',' + ')}</span>
              </div>
            )}
            {task.deployStage && task.deployStage !== 'na' && (
              <div className="flex justify-between text-xs items-center">
                <span className="text-slate-400">Stage</span>
                <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                  task.deployStage === 'prd' ? 'bg-green-50 text-green-700' :
                  task.deployStage === 'int' ? 'bg-blue-50 text-blue-700' :
                  'bg-purple-50 text-purple-700'
                }`}>{task.deployStage.toUpperCase()}</span>
              </div>
            )}
              </div>
            )}
          </div>
        </details>

        {canSignoff && (
          <Card title="Formal Sign-off">
            <p className="text-xs text-slate-500 mb-3">
              This task requires a formal sign-off. Review the evidence and approve below.
            </p>
            <button className="btn-primary w-full justify-center text-sm" onClick={signoff}>
              Approve & Sign off
            </button>
          </Card>
        )}

      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Log effort — simple time-spent tracker on a task.
   ────────────────────────────────────────────────────────────────────────── */
function ScheduleEffortCard({ task, onChanged }: { task: any; onChanged: () => void }) {
  const [openEffort, setOpenEffort] = useState(false);
  const [savingEffort, setSavingEffort] = useState(false);

  const [minutes, setMinutes] = useState<number>(30);
  const [note, setNote] = useState('');

  async function logEffort() {
    if (!minutes || minutes < 1) return;
    setSavingEffort(true);
    try {
      await api(`/tasks/${task.id}/effort`, { method: 'POST', body: { minutes, note: note.trim() } });
      setMinutes(30); setNote('');
      setOpenEffort(false);
      onChanged();
    } finally {
      setSavingEffort(false);
    }
  }

  const totalMins = task.effortMins || 0;
  const totalLabel = totalMins >= 60
    ? `${Math.floor(totalMins / 60)}h ${totalMins % 60 ? totalMins % 60 + 'm' : ''}`.trim()
    : `${totalMins}m`;
  const recent: any[] = (task.effortLog || []).slice(-3).reverse();

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
        <Activity size={13} className="text-brand-500" />
        <h3 className="text-sm font-semibold text-slate-700">Pulse</h3>
        {totalMins > 0 && (
          <span className="ml-auto text-[10px] font-bold text-forest-700 bg-forest-50 border border-forest-100 px-1.5 py-0.5 rounded">
            {totalLabel} logged
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        <button
          type="button"
          onClick={() => setOpenEffort(v => !v)}
          className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all border ${
            openEffort
              ? 'bg-forest-50 text-forest-700 border-forest-200'
              : 'bg-white text-slate-600 border-slate-200 hover:border-forest-200 hover:text-forest-700'
          }`}
        >
          <Timer size={13} /> Log effort
        </button>

        {openEffort && (
          <div className="rounded-lg border border-forest-100 bg-forest-50/40 p-3 space-y-2.5 fade-in-soft">
            <div className="text-[10px] font-bold uppercase tracking-wider text-forest-700">Log time spent</div>
            <div className="flex flex-wrap gap-1">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button key={m} type="button" onClick={() => setMinutes(m)}
                  className={`px-2 py-1 rounded-full text-[11px] font-bold border transition-all ${
                    minutes === m ? 'bg-forest-600 text-white border-forest-600' : 'bg-white text-slate-500 border-slate-200 hover:border-forest-300'
                  }`}>
                  {m < 60 ? `${m}m` : `${m / 60}h`}
                </button>
              ))}
              <input type="number" min={1} max={720} value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 0))}
                className="input text-xs py-1 w-20" aria-label="Custom minutes" />
            </div>
            <input className="input text-xs py-1.5" placeholder="Optional note — what did you work on?"
              value={note} onChange={(e) => setNote(e.target.value)} />
            <button onClick={logEffort} disabled={savingEffort} className="btn-success w-full justify-center text-xs"
              style={{ background: 'linear-gradient(135deg, #2B8C29 0%, #43A047 100%)' }}>
              {savingEffort ? 'Saving…' : `Log ${minutes}m`}
            </button>
          </div>
        )}

        {recent.length > 0 && (
          <div className="pt-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Recent</div>
            <ul className="space-y-1">
              {recent.map((e: any) => (
                <li key={e.id} className="flex items-start gap-2 text-xs">
                  <span className="text-forest-600 font-bold tabular-nums shrink-0">
                    {e.minutes < 60 ? `${e.minutes}m` : `${(e.minutes / 60).toFixed(1)}h`}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-slate-500">{e.note || (e.source === 'calendar' ? 'Scheduled meeting' : 'Worked on it')}</span>
                    <span className="text-[10px] text-slate-300 ml-1.5">{e.onDate || formatDate(e.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
