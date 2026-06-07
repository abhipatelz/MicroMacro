'use client';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Card, PriorityTag, StatusTag, formatDate, useToast } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { DatePicker } from '@/components/DatePicker';
import { Select } from '@/components/Select';
import { UserPicker } from '@/components/UserPicker';
import { useIsLead, useIsAdmin } from '@/components/CurrentUserContext';
import { chimeIfEnabled } from '@/lib/sound';
import { ChevronRight, Shield, FileText, MessageSquare, Clock, Trash2, ScrollText, Pencil, Check, X } from 'lucide-react';
import { FlowSignalTaskStrip } from '@/components/FlowSignalTaskStrip';

// TaskCompletePop is only shown on task completion — off the critical render
// path so deferring it improves FCP/LCP.
const TaskCompletePop = dynamic(
  () => import('@/components/TaskCompletePop').then(m => m.TaskCompletePop),
  { ssr: false, loading: () => null },
);

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
  const isAdmin = useIsAdmin();
  // Seed from the server-rendered payload so real content paints on first
  // byte; the mount-time refetch below keeps it fresh.
  const [task, setTask] = useState<any>(initialTask);
  // Project team scope for the assignee picker. The picker fetches its own
  // (paginated) roster from /api/users?teamId=… — we only need the id here.
  const [teamId, setTeamId] = useState<string | null>(null);
  const [me, setMe] = useState<any>(initialMe);
  const [comment, setComment] = useState('');
  // Inline comment editing — author-only. Holds the id of the comment being
  // edited and its working text.
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [newSub, setNewSub] = useState('');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState(false);
  // Mini-celebration shown when the task moves to "done". A small bottom-right
  // toast — not a confetti overlay — that recognises the *type* of task that
  // was finished. Stays null until the user actually closes the task.
  const [celebrate, setCelebrate] = useState<any | null>(null);
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
        if (!me) {
          const m = await api<any>('/auth/me');
          setMe(m.user);
        }
        if (t.projectTeamId !== undefined) {
          setTeamId(t.projectTeamId || null);
        } else {
          const proj = t.projectId ? await api<any>(`/projects/${t.projectId}`).catch(() => null) : null;
          setTeamId(proj?.teamId || null);
        }
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
        chimeIfEnabled();
        // The mini-pop replaces the dry "Task marked done ✓" toast — it reads
        // the task's type and priority so the message feels personal.
        setCelebrate({
          id: task.id, title: task.title, taskType: task.taskType,
          gxpCritical: task.gxpCritical, priority: task.priority,
        });
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
    try {
      await api(`/tasks/${id}/subtasks`, { method: 'POST', body: { title: newSub.trim() } });
      setNewSub(''); load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to add subtask', 'err');
    }
  }
  async function toggleSub(sub: any) {
    await api(`/tasks/${id}/subtasks/${sub.id}`, { method: 'PATCH', body: { status: sub.status === 'done' ? 'todo' : 'done' } });
    load();
  }
  async function deleteSub(sub: any) {
    // Match the parent-task delete UX — short confirm + cascade. The server
    // enforces lead/owner permissions; the button hides for everyone else.
    if (!confirm(`Delete subtask "${sub.title}"? This can't be undone.`)) return;
    await api(`/tasks/${id}/subtasks/${sub.id}`, { method: 'DELETE' });
    load();
  }
  async function addComment() {
    if (!comment.trim()) return;
    try {
      await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: comment.trim() } });
      setComment(''); load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to post comment', 'err');
    }
  }
  async function saveCommentEdit(commentId: string) {
    if (!editingCommentBody.trim()) return;
    try {
      await api(`/tasks/${id}/comments/${commentId}`, { method: 'PATCH', body: { body: editingCommentBody.trim() } });
      setEditingCommentId(null); setEditingCommentBody(''); load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to update comment', 'err');
    }
  }
  async function deleteComment(commentId: string) {
    if (!confirm('Delete this comment? This cannot be undone.')) return;
    try {
      await api(`/tasks/${id}/comments/${commentId}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      showToast(e?.message || 'Failed to delete comment', 'err');
    }
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
      <TaskCompletePop task={celebrate} onDone={() => setCelebrate(null)} />

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
            {isAdmin && (
              <Link
                href={`/audit?targetType=task&targetId=${task.id}`}
                className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-blue-600 transition-colors"
                title="View this task's audit trail"
              >
                <ScrollText size={11} /> Audit
              </Link>
            )}
          </div>
          <h1 className="text-xl font-bold text-slate-900 leading-snug">{task.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <StatusTag status={task.status} />
            <PriorityTag priority={task.priority} />
            {task.requiresQaSignoff && (
              task.qaSignoffAt ? (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/25 px-2 py-0.5 rounded">
                  Approved ✓ {task.qaSignoffName} · {formatDate(task.qaSignoffAt)}
                </span>
              ) : (
                <span className="text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/25 px-2 py-0.5 rounded">
                  Approval required
                </span>
              )
            )}
            {task.taskType && task.taskType !== 'task' && (
              <span className="text-xs font-medium text-slate-600 bg-slate-100 dark:bg-white/5 dark:text-white/60 px-2 py-0.5 rounded capitalize">
                {TASK_TYPE_LABELS[task.taskType] ?? task.taskType.replace(/_/g, ' ')}
              </span>
            )}
          </div>

          {/* Quiet "Waiting on …" strip — only renders when the assignee or
              a lead has confirmed a waiting/decision/help state. Same source
              of truth as the dashboard strip (Task.flowPending*). */}
          <FlowSignalTaskStrip
            taskId={task.id}
            pendingType={task.flowPendingType}
            detail={task.flowPendingDetail}
            confirmedAt={task.flowPendingConfirmedAt}
            confirmedByName={task.flowPendingConfirmedByName}
            canResolve={isLead || isAdmin || (me && task.flowPendingConfirmedByUserId === me.id)}
            onChanged={load}
          />
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
                <span className={`flex-1 ${s.status === 'done' ? 'line-through text-slate-400 dark:text-white/35' : 'text-slate-700'}`}>
                  {s.title}
                </span>
                <span className="text-xs text-slate-400">{formatDate(s.dueDate)}</span>
                {/* Delete affordance — same gesture as the parent task's
                    delete: visible on row hover, lead/owner-only. Avoids
                    leaving subtasks behind when the work scope shrinks. */}
                {isLead && (
                  <button
                    type="button"
                    onClick={() => deleteSub(s)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                    title="Delete subtask"
                    aria-label={`Delete subtask ${s.title}`}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
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
            {task.comments.map((c: any) => {
              const isAuthor = !!(me && String(c.userId) === String(me.id));
              const isEditing = editingCommentId === c.id;
              const edited = c.updatedAt && c.createdAt && new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000;
              return (
                <div key={c.id} className="group/comment flex gap-3">
                  <UserAvatar userId={c.userId} name={c.userName} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-500 flex items-center gap-1.5">
                      <span className="font-semibold text-slate-700">{c.userName}</span>
                      <span>· {formatDate(c.createdAt)}</span>
                      {edited && <span className="text-slate-400 italic">(edited)</span>}
                      {/* Author-only edit / delete — revealed on row hover */}
                      {isAuthor && !isEditing && (
                        <span className="ml-auto flex items-center gap-1 opacity-0 group-hover/comment:opacity-100 transition-opacity">
                          <button
                            onClick={() => { setEditingCommentId(c.id); setEditingCommentBody(c.body); }}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                            title="Edit comment"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete comment"
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      )}
                    </div>
                    {isEditing ? (
                      <div className="mt-1 flex items-start gap-1.5">
                        <textarea
                          autoFocus
                          rows={2}
                          className="input text-sm flex-1 resize-none"
                          value={editingCommentBody}
                          onChange={(e) => setEditingCommentBody(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveCommentEdit(c.id);
                            if (e.key === 'Escape') { setEditingCommentId(null); setEditingCommentBody(''); }
                          }}
                          maxLength={4000}
                        />
                        <button onClick={() => saveCommentEdit(c.id)}
                          className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors" title="Save">
                          <Check size={13} />
                        </button>
                        <button onClick={() => { setEditingCommentId(null); setEditingCommentBody(''); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Cancel">
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="text-sm text-slate-700 mt-0.5 whitespace-pre-wrap break-words">{c.body}</div>
                    )}
                  </div>
                </div>
              );
            })}
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
              <UserPicker
                value={task.assigneeId || ''}
                valueLabel={task.assigneeName}
                disabled={!isLead}
                ariaLabel="Assignee"
                teamId={teamId}
                excludeAdmin
                onChange={(v: string) => isLead && update({ assigneeId: v || null })}
              />
            </div>
            {/* Waiting on — who the task is stuck/pending with (QA, a person,
               a department). Editable by the assignee or a lead. */}
            <div>
              <label className="label flex items-center gap-1">
                <Clock size={11} /> Waiting on <span className="text-slate-300 font-normal normal-case">(if stuck)</span>
              </label>
              <input
                className="input text-sm"
                placeholder="e.g. QA/HOD · Specific department · Person's name"
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
                <Select
                  value={task.priority}
                  disabled={!isLead}
                  ariaLabel="Priority"
                  onChange={(v) => isLead && update({ priority: v })}
                  options={['low', 'medium', 'high', 'critical'].map((p) => ({ value: p, label: p.charAt(0).toUpperCase() + p.slice(1) }))}
                />
              </div>
              <div>
                <label className="label">Type</label>
                <Select
                  value={task.taskType}
                  disabled={!isLead}
                  ariaLabel="Task type"
                  onChange={(v) => isLead && update({ taskType: v })}
                  options={TASK_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) }))}
                />
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
          </div>
        </Card>

        {/* ── Reference details ─────────────────────────────────────────
           The change-control / document reference summary for this task.
           Shown plainly (no effort-tracking here) so the page reads at a
           glance. Only renders when the task actually carries reference data. */}
        {hasReferenceData && (
          <Card title="Reference details">
            <div className="space-y-2">
              {task.ccNo && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 dark:text-white/35">Ref No.</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-white/80">{task.ccNo}</span>
                </div>
              )}
              {task.ccTcd && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 dark:text-white/35">Target Date</span>
                  <span className="font-medium text-slate-700 dark:text-white/80">{formatDate(task.ccTcd)}</span>
                </div>
              )}
              {task.documentNo && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 dark:text-white/35">Doc No.</span>
                  <span className="font-mono font-semibold text-slate-700 dark:text-white/80">{task.documentNo}</span>
                </div>
              )}
              {task.applicableSite && task.applicableSite !== 'na' && (
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 dark:text-white/35">Site</span>
                  <span className="font-medium text-slate-700 dark:text-white/80 uppercase">{task.applicableSite.replace('_', ' + ')}</span>
                </div>
              )}
              {task.deployStage && task.deployStage !== 'na' && (
                <div className="flex justify-between text-xs items-center">
                  <span className="text-slate-400 dark:text-white/35">Stage</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                    task.deployStage === 'prd' ? 'bg-green-50 text-green-700' :
                    task.deployStage === 'int' ? 'bg-blue-50 text-blue-700' :
                    'bg-purple-50 text-purple-700'
                  }`}>{task.deployStage.toUpperCase()}</span>
                </div>
              )}
            </div>
          </Card>
        )}

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

