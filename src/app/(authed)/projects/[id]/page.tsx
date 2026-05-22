'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import {
  Card, LifecycleTag, PriorityTag, ProgressBar,
  StatusSelect, PROJECT_STATUS_OPTIONS,
  TaskLink, formatDate, useToast,
} from '@/components/ui';
import { Download, GripVertical, CheckCircle2, Plus, Trash2, AlertTriangle, X } from 'lucide-react';

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  todo:        { label: 'To Do',       color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  in_progress: { label: 'In Progress', color: '#1565C0', bg: '#eff6ff', border: '#bfdbfe' },
  review:      { label: 'Review',      color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  blocked:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  done:        { label: 'Done',        color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
};

/* ── Kanban board ─────────────────────────────────────────────────────────── */
function KanbanBoard({ tasks, onMove }: { tasks: any[]; onMove: (taskId: string, status: string) => void }) {
  const [localTasks, setLocalTasks] = useState<any[]>(tasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const dragCounter = useRef<Record<string, number>>({});

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

  function handleDragStart(e: React.DragEvent, taskId: string) {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }
  function handleDragEnd() { setDraggingId(null); setDragOverCol(null); dragCounter.current = {}; }
  function handleColDragEnter(e: React.DragEvent, col: string) {
    e.preventDefault();
    dragCounter.current[col] = (dragCounter.current[col] || 0) + 1;
    setDragOverCol(col);
  }
  function handleColDragLeave(e: React.DragEvent, col: string) {
    dragCounter.current[col] = (dragCounter.current[col] || 0) - 1;
    if (dragCounter.current[col] <= 0) { dragCounter.current[col] = 0; if (dragOverCol === col) setDragOverCol(null); }
  }
  function handleColDragOver(e: React.DragEvent) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
  function handleDrop(e: React.DragEvent, toStatus: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = localTasks.find(t => t.id === taskId);
    if (!task || task.status === toStatus) { setDraggingId(null); setDragOverCol(null); return; }
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: toStatus } : t));
    setDraggingId(null); setDragOverCol(null); dragCounter.current = {};
    onMove(taskId, toStatus);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 480 }}>
      {STATUSES.map(col => {
        const meta = STATUS_META[col];
        const colTasks = localTasks.filter(t => t.status === col);
        const isOver = dragOverCol === col;
        const isDragging = !!draggingId;
        return (
          <div key={col} className="shrink-0 flex flex-col rounded-xl transition-all duration-150"
            style={{
              width: 230,
              background: isOver ? meta.bg : '#f8fafc',
              border: `2px solid ${isOver ? meta.border : '#e9eef5'}`,
              boxShadow: isOver ? `0 0 0 3px ${meta.border}` : undefined,
            }}
            onDragEnter={e => handleColDragEnter(e, col)}
            onDragLeave={e => handleColDragLeave(e, col)}
            onDragOver={handleColDragOver}
            onDrop={e => handleDrop(e, col)}
          >
            <div className="px-3 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
              </div>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: meta.border, color: meta.color }}>{colTasks.length}</span>
            </div>
            <div className="flex-1 px-2 pb-2 space-y-2 min-h-[80px]">
              {colTasks.map(t => {
                const isDraggingThis = draggingId === t.id;
                return (
                  <div key={t.id} draggable
                    onDragStart={e => handleDragStart(e, t.id)}
                    onDragEnd={handleDragEnd}
                    className="group relative bg-white rounded-lg border transition-all duration-150 cursor-grab active:cursor-grabbing"
                    style={{
                      borderColor: isDraggingThis ? meta.color : '#e2e8f0',
                      boxShadow: isDraggingThis
                        ? `0 8px 24px rgba(0,0,0,0.15), 0 0 0 2px ${meta.color}`
                        : '0 1px 3px rgba(0,0,0,0.06)',
                      opacity: isDraggingThis ? 0.5 : isDragging ? 0.85 : 1,
                      transform: isDraggingThis ? 'rotate(1.5deg) scale(1.02)' : undefined,
                    }}
                  >
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: meta.color }}>
                      <GripVertical size={12} />
                    </div>
                    <Link href={`/tasks/${t.id}`} className="block p-3 pl-4" onClick={e => isDragging && e.preventDefault()}>
                      <div className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">{t.title}</div>
                      {(t.gxpCritical || t.requiresQaSignoff || (t.priority && t.priority !== 'low')) && (
                        <div className="mt-1.5 flex gap-1 flex-wrap">
                          {t.gxpCritical && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">Compliance</span>}
                          {t.requiresQaSignoff && !t.qaSignoffAt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">Sign-off</span>}
                          {t.requiresQaSignoff && t.qaSignoffAt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">Approved ✓</span>}
                          {t.priority && t.priority !== 'low' && <PriorityTag priority={t.priority} />}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 truncate">{t.assigneeName || 'Unassigned'}</span>
                        {t.dueDate && <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">{formatDate(t.dueDate)}</span>}
                      </div>
                      {t.subtaskCount > 0 && (
                        <div className="mt-2">
                          <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((t.subtasksDone / t.subtaskCount) * 100)}%`, background: meta.color }} />
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">{t.subtasksDone}/{t.subtaskCount} subtasks</div>
                        </div>
                      )}
                    </Link>
                  </div>
                );
              })}
              {colTasks.length === 0 && (
                <div className="rounded-lg border-2 border-dashed flex items-center justify-center h-16 transition-all duration-150 text-center px-2"
                  style={{ borderColor: isOver ? meta.color : '#e2e8f0', background: isOver ? meta.bg : 'transparent' }}>
                  <span className="text-xs leading-tight" style={{ color: isOver ? meta.color : '#94a3b8' }}>
                    {isOver ? 'Drop here' : isDragging ? 'Move card here' : 'No tasks'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Quick-add task ───────────────────────────────────────────────────────── */
function QuickAddTask({ projectId, phaseId, users, onAdded }: {
  projectId: string; phaseId?: string; users: any[]; onAdded: () => void;
}) {
  const [open, setOpen]       = useState(false);
  const [title, setTitle]     = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue]         = useState('');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: { projectId, phaseId: phaseId || undefined, title: title.trim(), assigneeId: assignee || undefined, dueDate: due || undefined },
      });
      setTitle(''); setDue(''); setAssignee('');
      setOpen(false);
      onAdded();
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-slate-200 text-xs text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/40 transition-all group">
        <Plus size={12} className="group-hover:text-blue-600 transition-colors" />
        Add a task
      </button>
    );
  }

  return (
    <form onSubmit={add} className="mt-2 rounded-xl border-2 border-blue-200 overflow-hidden bg-blue-50/20 fade-in-soft">
      <input
        ref={inputRef}
        className="w-full px-3 py-2.5 text-sm bg-transparent border-none outline-none text-slate-800 placeholder:text-slate-400 font-medium"
        placeholder="Task title — press Enter to add"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setTitle(''); } }}
      />
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-blue-100 bg-white/60">
        <select className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:border-blue-300"
          value={assignee} onChange={e => setAssignee(e.target.value)}>
          <option value="">Unassigned</option>
          {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input type="date" className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 focus:outline-none focus:border-blue-300"
          value={due} onChange={e => setDue(e.target.value)} />
        <button type="submit" disabled={!title.trim() || saving}
          className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors shrink-0">
          {saving ? '…' : 'Add'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setTitle(''); }}
          className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors">
          <X size={13} />
        </button>
      </div>
    </form>
  );
}

/* ── Project-complete block modal ─────────────────────────────────────────── */
function BlockCompleteModal({ openCount, onClose }: { openCount: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-sm modal-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Can't mark as completed</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong className="text-slate-700">{openCount} {openCount === 1 ? 'task is' : 'tasks are'} still open.</strong>
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          All tasks must be marked <strong>Done</strong> before a project can be completed.
          Close out the remaining tasks and try again.
        </p>
        <button onClick={onClose} className="btn-primary w-full justify-center text-sm">
          Got it
        </button>
      </div>
    </div>
  );
}

/* ── Delete project modal ─────────────────────────────────────────────────── */
function DeleteProjectModal({ projectName, projectId, onClose, onDeleted }: {
  projectName: string; projectId: string; onClose: () => void; onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function confirm() {
    if (!password.trim()) { setErr('Password is required'); return; }
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) { setErr('Incorrect password'); setLoading(false); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || 'Delete failed. Please try again.');
        setLoading(false); return;
      }
      onDeleted();
    } catch { setErr('Network error. Please try again.'); setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div role="dialog" aria-modal className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[400px] modal-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Delete project</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
              Permanently deletes <span className="font-semibold text-slate-700">{projectName}</span> and all its tasks.
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Enter your password to confirm:</p>
        <input ref={inputRef} type="password" className="input w-full mb-1" placeholder="Your password"
          value={password} onChange={e => { setPassword(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && confirm()} autoComplete="current-password" />
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        {!err && <div className="mb-3" />}
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-sm" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            onClick={confirm} disabled={loading || !password.trim()}>
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [users, setUsers]     = useState<any[]>([]);
  const [me, setMe]           = useState<any>(null);
  const [view, setView]       = useState<'phases' | 'board'>('phases');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen]           = useState(false);
  const [blockCompleteOpen, setBlockComplete] = useState(false);
  const [savingStatus, setSavingStatus]       = useState(false);
  const [pendingTaskIds, setPendingTaskIds]   = useState<Set<string>>(new Set());
  const { showToast, ToastEl } = useToast();

  async function load() {
    try {
      const [p, u] = await Promise.all([api<any>(`/projects/${id}`), api<any[]>('/users')]);
      setProject(p); setUsers(u); setLoadErr(null);
    } catch (e: any) { setLoadErr(e?.message || 'Could not load this project.'); }
  }

  useEffect(() => {
    load();
    api<any>('/auth/me').then(d => setMe(d.user)).catch(() => {});
  }, [id]);

  if (loadErr) {
    return (
      <div className="max-w-md mx-auto mt-12 card p-6 text-center page-enter">
        <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-3">
          <span className="text-red-600 text-lg">!</span>
        </div>
        <div className="text-sm font-bold text-slate-800 mb-1">We couldn&rsquo;t load this project</div>
        <div className="text-xs text-slate-500 mb-4">{loadErr}</div>
        <button onClick={() => { setLoadErr(null); load(); }} className="btn-primary text-xs justify-center">Retry</button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 page-enter" aria-busy>
        <div className="space-y-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-7 w-80 max-w-full" />
          <div className="flex gap-2 mt-2">
            {[20, 16, 24].map(w => <div key={w} className={`skeleton h-5 w-${w} rounded-full`} />)}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="skeleton h-3 w-20" /><div className="skeleton h-7 w-12" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2" style={{ width: 230 }}>
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const pct = project.tasks.length
    ? Math.round(project.tasks.filter((t: any) => t.status === 'done').length / project.tasks.length * 100)
    : 0;
  const pendingQa = project.tasks.filter((t: any) => t.requiresQaSignoff && !t.qaSignoffAt && t.status === 'done').length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = project.tasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < today && t.status !== 'done').length;
  const openTaskCount = project.tasks.filter((t: any) => t.status !== 'done').length;

  async function updateStatus(newStatus: string) {
    if (newStatus === 'completed' && openTaskCount > 0) {
      setBlockComplete(true);
      return;
    }
    setSavingStatus(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { status: newStatus } });
      showToast('Project status updated');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update status', 'err');
    } finally {
      setSavingStatus(false);
    }
  }

  async function moveTask(taskId: string, status: string) {
    setPendingTaskIds(s => new Set([...s, taskId]));
    try {
      await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status } });
      // Optimistic state is already applied by KanbanBoard; just reconcile silently
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update task', 'err');
      load(); // revert optimistic
    } finally {
      setPendingTaskIds(s => { const n = new Set(s); n.delete(taskId); return n; });
    }
  }

  async function moveTaskFromPhase(taskId: string, status: string) {
    // Optimistic local update
    setProject((p: any) => ({
      ...p,
      tasks: p.tasks.map((t: any) => t.id === taskId ? { ...t, status } : t),
    }));
    setPendingTaskIds(s => new Set([...s, taskId]));
    try {
      await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status } });
      if (status === 'done') showToast('Task completed ✓');
    } catch (e: any) {
      showToast(e.message || 'Failed to update task', 'err');
      load(); // revert
    } finally {
      setPendingTaskIds(s => { const n = new Set(s); n.delete(taskId); return n; });
    }
  }

  async function exportProject() {
    try {
      const res = await fetch(`/api/projects/${id}/export`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `project_${id}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      showToast(`Downloaded ${filename}`);
    } catch (e: any) {
      showToast(e?.message || 'Export failed', 'err');
    }
  }

  return (
    <div className="space-y-5 page-enter">
      {ToastEl}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-slate-400 font-mono">{project.code}</div>
          <h1 className="text-2xl font-bold mt-0.5">{project.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <LifecycleTag lifecycle={project.lifecycle} />
            <PriorityTag priority={project.priority} />
            {project.gxpImpact && project.gxpImpact !== 'none' && (
              <span className="tag bg-red-50 text-red-700 border border-red-200">GxP: {project.gxpImpact}</span>
            )}
          </div>
          {project.description && <p className="mt-2 text-sm text-slate-600 max-w-3xl">{project.description}</p>}
          {project.lifecycleMeta?.regulatoryRefs && (
            <p className="mt-1.5 text-xs text-slate-500">
              <span className="font-semibold">Regulatory refs:</span> {project.lifecycleMeta.regulatoryRefs}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right text-xs text-slate-500 space-y-0.5">
            <div>Owner: <span className="font-medium text-slate-700">{project.ownerName || '—'}</span></div>
            <div>Team: {project.teamId
              ? <Link href={`/teams/${project.teamId}`} className="text-blue-600 hover:underline">{project.teamName || '—'}</Link>
              : '—'}</div>
            <div>Due: {formatDate(project.dueDate)}</div>
          </div>

          {/* Project status — guarded for completion */}
          <div className="flex items-center gap-2">
            {openTaskCount > 0 && (
              <span className="text-[10px] text-amber-600 font-semibold">{openTaskCount} open</span>
            )}
            <StatusSelect
              value={project.status}
              onChange={updateStatus}
              options={PROJECT_STATUS_OPTIONS}
              pending={savingStatus}
            />
          </div>

          <button onClick={exportProject}
            className="btn-secondary flex items-center gap-1.5 text-xs w-44 justify-center">
            <Download size={13} /> Export to Excel
          </button>
          {(me?.role === 'pm' || me?.role === 'lead') && (
            <button onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1.5 text-xs w-44 justify-center px-3 py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 size={13} /> Delete project
            </button>
          )}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Progress', value: `${pct}%`, sub: `${project.tasks.filter((t: any) => t.status === 'done').length}/${project.tasks.length} tasks`, bar: pct },
          { label: 'Phases', value: project.phases.length, sub: 'lifecycle stages' },
          { label: 'QA sign-off', value: pendingQa, sub: pendingQa > 0 ? 'awaiting review' : 'all approved', warn: pendingQa > 0 },
          { label: 'GxP critical', value: project.tasks.filter((t: any) => t.gxpCritical).length, sub: 'compliance tasks' },
          { label: 'Overdue', value: overdue, sub: overdue > 0 ? 'past deadline' : 'none — on track', danger: overdue > 0 },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-1"
            style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</div>
            <div className={`text-2xl font-black ${stat.danger ? 'text-red-600' : stat.warn ? 'text-amber-600' : 'text-slate-800'}`}>
              {stat.value}
            </div>
            {'bar' in stat && <ProgressBar value={stat.bar!} />}
            <div className="text-xs text-slate-400">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-white border border-slate-200/80 rounded-xl p-1 w-fit"
        style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        {[['phases', 'By phase'], ['board', 'Kanban']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === k ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* Phases view */}
      {view === 'phases' && (
        <div className="space-y-4">
          {project.phases.length === 0 && <Card><p className="text-slate-500 text-sm">No phases yet.</p></Card>}
          {project.phases.map((ph: any, i: number) => {
            const ts = project.tasks.filter((t: any) => t.phaseId === ph.id);
            const done = ts.filter((t: any) => t.status === 'done').length;
            const pctP = ts.length ? Math.round((done / ts.length) * 100) : 0;
            return (
              <Card key={ph.id}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-slate-800">
                    <span className="text-slate-400 font-mono mr-2 text-sm">{String(i + 1).padStart(2, '0')}</span>
                    {ph.name}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{done}/{ts.length}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${pctP === 100 ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {pctP}%
                    </span>
                  </div>
                </div>
                <ProgressBar value={pctP} className="mb-3" />
                <div className="divide-y divide-slate-100">
                  {ts.map((t: any) => (
                    <div key={t.id} className="py-2.5 flex items-center gap-2.5 text-sm group">
                      <StatusSelect
                        value={t.status}
                        onChange={v => moveTaskFromPhase(t.id, v)}
                        size="sm"
                        pending={pendingTaskIds.has(t.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <TaskLink task={t} className="font-medium text-slate-800 hover:text-blue-700 transition-colors text-sm truncate" />
                        <div className="text-xs text-slate-400 truncate">
                          {t.assigneeName || 'Unassigned'}
                          {t.subtaskCount > 0 && ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {t.gxpCritical && <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span>}
                        {t.requiresQaSignoff && (t.qaSignoffAt
                          ? <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">QA ✓</span>
                          : <span className="tag bg-purple-50 text-purple-700 border border-purple-200">Sign-off</span>
                        )}
                        <PriorityTag priority={t.priority} />
                        <span className="text-xs text-slate-400 w-16 text-right">{formatDate(t.dueDate)}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <QuickAddTask projectId={project.id} phaseId={ph.id} users={users} onAdded={load} />
              </Card>
            );
          })}

          {/* Unphased tasks */}
          <Card title="Unphased tasks">
            <div className="divide-y divide-slate-100">
              {project.tasks.filter((t: any) => !t.phaseId).map((t: any) => (
                <div key={t.id} className="py-2.5 flex items-center gap-2.5 text-sm group">
                  <StatusSelect value={t.status} onChange={v => moveTaskFromPhase(t.id, v)} size="sm" pending={pendingTaskIds.has(t.id)} />
                  <div className="flex-1 min-w-0">
                    <TaskLink task={t} className="font-medium text-slate-800 hover:text-blue-700 transition-colors text-sm truncate" />
                    <div className="text-xs text-slate-400 truncate">
                      {t.assigneeName || 'Unassigned'}
                      {t.subtaskCount > 0 && ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {t.gxpCritical && <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span>}
                    {t.requiresQaSignoff && (t.qaSignoffAt
                      ? <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">QA ✓</span>
                      : <span className="tag bg-purple-50 text-purple-700 border border-purple-200">Sign-off</span>
                    )}
                    <PriorityTag priority={t.priority} />
                    <span className="text-xs text-slate-400 w-16 text-right">{formatDate(t.dueDate)}</span>
                  </div>
                </div>
              ))}
              {project.tasks.filter((t: any) => !t.phaseId).length === 0 && (
                <div className="text-xs text-slate-400 py-3">None</div>
              )}
            </div>
            <QuickAddTask projectId={project.id} users={users} onAdded={load} />
          </Card>
        </div>
      )}

      {view === 'board' && <KanbanBoard tasks={project.tasks} onMove={moveTask} />}

      {/* Modals */}
      {blockCompleteOpen && (
        <BlockCompleteModal openCount={openTaskCount} onClose={() => setBlockComplete(false)} />
      )}
      {deleteOpen && project && (
        <DeleteProjectModal
          projectName={project.name} projectId={id}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => { setDeleteOpen(false); window.location.replace('/projects'); }}
        />
      )}
    </div>
  );
}
