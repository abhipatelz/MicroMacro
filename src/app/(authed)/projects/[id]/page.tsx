'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import {
  Card,
  LifecycleTag,
  PriorityTag,
  ProgressBar,
  StatusTag,
  StatusSelect,
  PROJECT_STATUS_OPTIONS,
  TaskLink,
  formatDate
} from '@/components/ui';
import { Download, GripVertical, CheckCircle2, Plus, Trash2 } from 'lucide-react';

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  todo:        { label: 'To Do',       color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  in_progress: { label: 'In Progress', color: '#1565C0', bg: '#eff6ff', border: '#bfdbfe' },
  review:      { label: 'Review',      color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  blocked:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  done:        { label: 'Done',        color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
};

/* ── Kanban board with HTML5 drag-and-drop ─────────────────────────────── */
function KanbanBoard({ tasks, onMove }: {
  tasks: any[];
  onMove: (taskId: string, status: string) => void;
}) {
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

  function handleDragEnd() {
    setDraggingId(null);
    setDragOverCol(null);
    dragCounter.current = {};
  }

  function handleColDragEnter(e: React.DragEvent, col: string) {
    e.preventDefault();
    dragCounter.current[col] = (dragCounter.current[col] || 0) + 1;
    setDragOverCol(col);
  }

  function handleColDragLeave(e: React.DragEvent, col: string) {
    dragCounter.current[col] = (dragCounter.current[col] || 0) - 1;
    if (dragCounter.current[col] <= 0) {
      dragCounter.current[col] = 0;
      if (dragOverCol === col) setDragOverCol(null);
    }
  }

  function handleColDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent, toStatus: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    const task = localTasks.find(t => t.id === taskId);
    if (!task || task.status === toStatus) {
      setDraggingId(null);
      setDragOverCol(null);
      return;
    }
    // Optimistic update
    setLocalTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: toStatus } : t));
    setDraggingId(null);
    setDragOverCol(null);
    dragCounter.current = {};
    onMove(taskId, toStatus);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3" style={{ minHeight: 500 }}>
      {STATUSES.map((col) => {
        const meta = STATUS_META[col];
        const colTasks = localTasks.filter(t => t.status === col);
        const isOver = dragOverCol === col;
        const isDragging = !!draggingId;

        return (
          <div
            key={col}
            className="shrink-0 flex flex-col rounded-xl transition-all duration-150"
            style={{
              width: 240,
              background: isOver ? meta.bg : '#f8fafc',
              border: `2px solid ${isOver ? meta.border : '#e9eef5'}`,
              boxShadow: isOver ? `0 0 0 3px ${meta.border}` : undefined,
            }}
            onDragEnter={(e) => handleColDragEnter(e, col)}
            onDragLeave={(e) => handleColDragLeave(e, col)}
            onDragOver={handleColDragOver}
            onDrop={(e) => handleDrop(e, col)}
          >
            {/* Column header */}
            <div className="px-3 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>
                  {meta.label}
                </span>
              </div>
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: meta.border, color: meta.color }}
              >
                {colTasks.length}
              </span>
            </div>

            {/* Drop zone */}
            <div className="flex-1 px-2 pb-2 space-y-2 min-h-[80px]">
              {colTasks.map(t => {
                const isDraggingThis = draggingId === t.id;
                return (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, t.id)}
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
                    {/* Drag handle */}
                    <div
                      className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity"
                      style={{ color: meta.color }}
                    >
                      <GripVertical size={12} />
                    </div>

                    <Link href={`/tasks/${t.id}`} className="block p-3 pl-4" onClick={(e) => isDragging && e.preventDefault()}>
                      <div className="text-xs font-semibold text-slate-800 leading-snug line-clamp-2">
                        {t.title}
                      </div>

                      {/* Tags row */}
                      {(t.gxpCritical || t.requiresQaSignoff || (t.priority && t.priority !== 'low')) && (
                        <div className="mt-1.5 flex gap-1 flex-wrap">
                          {t.gxpCritical && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-100">
                              Compliance
                            </span>
                          )}
                          {t.requiresQaSignoff && !t.qaSignoffAt && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                              Sign-off
                            </span>
                          )}
                          {t.requiresQaSignoff && t.qaSignoffAt && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Approved ✓
                            </span>
                          )}
                          {t.priority && t.priority !== 'low' && (
                            <PriorityTag priority={t.priority} />
                          )}
                        </div>
                      )}

                      {/* Footer */}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 truncate">
                          {t.assigneeName || 'Unassigned'}
                        </span>
                        {t.dueDate && (
                          <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                            {formatDate(t.dueDate)}
                          </span>
                        )}
                      </div>

                      {/* Subtask progress */}
                      {t.subtaskCount > 0 && (
                        <div className="mt-2">
                          <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.round((t.subtasksDone / t.subtaskCount) * 100)}%`,
                                background: meta.color,
                              }}
                            />
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            {t.subtasksDone}/{t.subtaskCount} subtasks
                          </div>
                        </div>
                      )}
                    </Link>
                  </div>
                );
              })}

              {/* Empty drop target */}
              {colTasks.length === 0 && (
                <div
                  className="rounded-lg border-2 border-dashed flex items-center justify-center h-16 transition-all duration-150 text-center px-2"
                  style={{
                    borderColor: isOver ? meta.color : '#e2e8f0',
                    background: isOver ? meta.bg : 'transparent',
                  }}
                >
                  <span className="text-xs leading-tight" style={{ color: isOver ? meta.color : '#94a3b8' }}>
                    {isOver
                      ? 'Drop here'
                      : isDragging
                        ? 'Move card here'
                        : 'No tasks — drag one in'}
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

function QuickAddTask({
  projectId,
  phaseId,
  users,
  onAdded
}: {
  projectId: string;
  phaseId?: string;
  users: any[];
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [qa, setQa] = useState(false);
  const [gxp, setGxp] = useState(false);

  async function add() {
    if (!title.trim()) return;
    await api('/tasks', {
      method: 'POST',
      body: {
        projectId,
        phaseId: phaseId || undefined,
        title: title.trim(),
        assigneeId: assignee || undefined,
        dueDate: due || undefined,
        requiresQaSignoff: qa,
        gxpCritical: gxp
      }
    });
    setTitle('');
    setDue('');
    setQa(false);
    setGxp(false);
    setAssignee('');
    setOpen(false);
    onAdded();
  }
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-brand-700 hover:underline mt-2"
      >
        + Add task
      </button>
    );
  return (
    <div className="mt-2 border-t pt-2 space-y-2">
      <input
        className="input"
        placeholder="Task title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-2">
        <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Unassigned</option>
          {users.map((u: any) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <input type="date" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div className="flex items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={gxp} onChange={(e) => setGxp(e.target.checked)} /> GxP critical
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={qa} onChange={(e) => setQa(e.target.checked)} /> QA sign-off
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn-primary text-xs" onClick={add}>
          Add
        </button>
        <button className="btn-ghost text-xs" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DeleteProjectModal({
  projectName,
  projectId,
  onClose,
  onDeleted,
}: {
  projectName: string;
  projectId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function confirm() {
    if (!password.trim()) { setErr('Password is required'); return; }
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) { setErr('Incorrect password'); setLoading(false); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || 'Delete failed. Please try again.');
        setLoading(false);
        return;
      }
      onDeleted();
    } catch {
      setErr('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-project-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[400px] modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 id="delete-project-title" className="text-base font-bold text-slate-800">Delete project</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
              This will permanently delete <span className="font-semibold text-slate-700">{projectName}</span> and all its tasks.
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Enter your PM password to confirm:</p>
        <input
          ref={inputRef}
          type="password"
          className="input w-full mb-1"
          placeholder="Your password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setErr(''); }}
          onKeyDown={(e) => e.key === 'Enter' && confirm()}
          autoComplete="current-password"
        />
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        {!err && <div className="mb-3" />}
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-sm" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            onClick={confirm}
            disabled={loading || !password.trim()}
          >
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [view, setView] = useState<'phases' | 'board'>('phases');
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  async function exportProject() {
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch(`/api/projects/${id}/export`, { credentials: 'include' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `project_${id}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportMsg({ kind: 'ok', text: `Downloaded ${filename}` });
    } catch (e: any) {
      setExportMsg({ kind: 'err', text: e?.message || 'Export failed. Please try again.' });
    } finally {
      setExporting(false);
      setTimeout(() => setExportMsg(null), 4000);
    }
  }

  async function load() {
    try {
      const [p, u] = await Promise.all([
        api<any>(`/projects/${id}`),
        api<any[]>('/users'),
      ]);
      setProject(p);
      setUsers(u);
      setLoadErr(null);
    } catch (e: any) {
      setLoadErr(e?.message || 'Could not load this project.');
    }
  }
  useEffect(() => {
    load();
    api<any>('/auth/me').then((d) => setMe(d.user)).catch(() => {});
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
      <div className="space-y-6 page-enter" aria-busy="true" aria-live="polite">
        <div className="space-y-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-7 w-80 max-w-full" />
          <div className="flex gap-2 mt-2">
            <div className="skeleton h-5 w-20 rounded-full" />
            <div className="skeleton h-5 w-16 rounded-full" />
            <div className="skeleton h-5 w-24 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-7 w-12" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2" style={{ width: 240 }}>
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-16 w-full rounded-lg" />
              <div className="skeleton h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <span className="sr-only">Loading project…</span>
      </div>
    );
  }

  const pct = project.tasks.length
    ? Math.round(
        (project.tasks.filter((t: any) => t.status === 'done').length /
          project.tasks.length) *
          100
      )
    : 0;
  const pendingQa = project.tasks.filter(
    (t: any) => t.requiresQaSignoff && !t.qaSignoffAt && t.status === 'done'
  ).length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = project.tasks.filter(
    (t: any) => t.dueDate && new Date(t.dueDate) < today && t.status !== 'done'
  ).length;

  async function updateStatus(newStatus: string) {
    await api(`/projects/${id}`, { method: 'PATCH', body: { status: newStatus } });
    load();
  }

  async function moveTask(taskId: string, status: string) {
    await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status } });
    load(); // reconcile server state quietly after optimistic update settles
  }

  return (
    <div className="space-y-6 page-enter">
      {exportMsg && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg border text-sm font-semibold flex items-center gap-2 fade-in ${
            exportMsg.kind === 'ok'
              ? 'bg-forest-50 border-forest-200 text-forest-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
          style={{ animation: 'fadeIn 0.2s ease-out' }}
        >
          {exportMsg.kind === 'ok' ? <CheckCircle2 size={16} className="text-forest-600" /> : <span aria-hidden>!</span>}
          {exportMsg.text}
        </div>
      )}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 font-mono">{project.code}</div>
          <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <LifecycleTag lifecycle={project.lifecycle} />
            <PriorityTag priority={project.priority} />
            <StatusTag status={project.status} />
            {project.gxpImpact && project.gxpImpact !== 'none' && (
              <span className="tag bg-red-50 text-red-700 border border-red-200">
                GxP impact: {project.gxpImpact}
              </span>
            )}
          </div>
          {project.description && (
            <p className="mt-3 text-slate-600 max-w-3xl">{project.description}</p>
          )}
          {project.lifecycleMeta?.regulatoryRefs && (
            <p className="mt-2 text-xs text-slate-500">
              <span className="font-semibold">Regulatory refs:</span>{' '}
              {project.lifecycleMeta.regulatoryRefs}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right text-xs text-slate-500">
            <div>
              Owner: <span className="font-medium text-slate-700">{project.ownerName || '—'}</span>
            </div>
            <div>
              Team:{' '}
              {project.teamId ? (
                <Link href={`/teams/${project.teamId}`} className="text-brand-700 hover:underline">
                  {project.teamName || '—'}
                </Link>
              ) : (
                '—'
              )}
            </div>
            <div>Due: {formatDate(project.dueDate)}</div>
          </div>
          <StatusSelect
            value={project.status}
            onChange={updateStatus}
            options={PROJECT_STATUS_OPTIONS}
          />
          <button
            onClick={exportProject}
            disabled={exporting}
            className="btn-secondary flex items-center gap-1.5 text-xs w-48 justify-center"
          >
            <Download size={14} />
            {exporting ? 'Exporting…' : 'Export to Excel'}
          </button>
          <a
            href={`/api/projects/${id}/calendar`}
            className="btn-secondary flex items-center gap-1.5 text-xs w-48 justify-center"
            title="Download all upcoming task deadlines as a calendar file (.ics) — opens in Outlook, Google, Apple."
          >
            <Download size={14} />
            All deadlines → .ics
          </a>
          {(me?.role === 'pm' || me?.role === 'lead') && (
            <button
              onClick={() => setDeleteOpen(true)}
              className="flex items-center gap-1.5 text-xs w-48 justify-center px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} />
              Delete project
            </button>
          )}
        </div>
      </div>
      {deleteOpen && project && (
        <DeleteProjectModal
          projectName={project.name}
          projectId={id}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            if (typeof window !== 'undefined') window.location.replace('/projects');
          }}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {/* Progress */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-1" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Progress</div>
          <div className="text-2xl font-black text-slate-800">{pct}%</div>
          <ProgressBar value={pct} />
          <div className="text-xs text-slate-400">
            {project.tasks.filter((t: any) => t.status === 'done').length}/{project.tasks.length} tasks
          </div>
        </div>
        {/* Phases */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-1" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Phases</div>
          <div className="text-2xl font-black text-slate-800">{project.phases.length}</div>
          <div className="text-xs text-slate-400">lifecycle stages</div>
        </div>
        {/* QA Sign-off */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-1" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">QA sign-off pending</div>
          <div className={`text-2xl font-black ${pendingQa > 0 ? 'text-amber-600' : 'text-slate-800'}`}>{pendingQa}</div>
          <div className="text-xs text-slate-400">{pendingQa > 0 ? 'awaiting review' : 'all approved'}</div>
        </div>
        {/* GxP */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-1" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">GxP critical</div>
          <div className="text-2xl font-black text-slate-800">{project.tasks.filter((t: any) => t.gxpCritical).length}</div>
          <div className="text-xs text-slate-400">compliance tasks</div>
        </div>
        {/* Overdue */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-1" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Overdue</div>
          <div className={`text-2xl font-black ${overdue > 0 ? 'text-red-600' : 'text-slate-800'}`}>{overdue}</div>
          <div className="text-xs text-slate-400">{overdue > 0 ? 'past deadline' : 'none — on track'}</div>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-white border border-slate-200/80 rounded-xl p-1 w-fit" style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        {[
          ['phases', 'By phase'],
          ['board', 'Kanban'],
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setView(k as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === k
                ? 'bg-brand-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {view === 'phases' ? (
        <div className="space-y-4">
          {project.phases.length === 0 && (
            <Card>
              <p className="text-slate-500 text-sm">No phases yet.</p>
            </Card>
          )}
          {project.phases.map((ph: any, i: number) => {
            const ts = project.tasks.filter((t: any) => t.phaseId === ph.id);
            const done = ts.filter((t: any) => t.status === 'done').length;
            const pctP = ts.length ? Math.round((done / ts.length) * 100) : 0;
            return (
              <Card key={ph.id}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    <span className="text-slate-400 font-mono mr-2">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {ph.name}
                  </h3>
                  <div className="text-xs text-slate-500">
                    {done}/{ts.length} · {pctP}%
                  </div>
                </div>
                <ProgressBar value={pctP} className="mt-2 mb-3" />
                <div className="divide-y divide-slate-100">
                  {ts.map((t: any) => (
                    <div key={t.id} className="py-2 flex items-center gap-3 text-sm">
                      <StatusSelect
                        value={t.status}
                        onChange={(v) => moveTask(t.id, v)}
                        size="sm"
                      />
                      <div className="flex-1">
                        <TaskLink task={t} />
                        <div className="text-xs text-slate-500">
                          {t.assigneeName || 'Unassigned'}
                          {t.subtaskCount > 0 &&
                            ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                        </div>
                      </div>
                      {t.gxpCritical && (
                        <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span>
                      )}
                      {t.requiresQaSignoff &&
                        (t.qaSignoffAt ? (
                          <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                            QA ✓
                          </span>
                        ) : (
                          <span className="tag bg-purple-50 text-purple-700 border border-purple-200">
                            QA sign-off
                          </span>
                        ))}
                      <PriorityTag priority={t.priority} />
                      <div className="text-xs text-slate-500 w-24 text-right">
                        {formatDate(t.dueDate)}
                      </div>
                    </div>
                  ))}
                </div>
                <QuickAddTask projectId={project.id} phaseId={ph.id} users={users} onAdded={load} />
              </Card>
            );
          })}
          <Card title="Unphased tasks">
            <div className="divide-y divide-slate-100">
              {project.tasks
                .filter((t: any) => !t.phaseId)
                .map((t: any) => (
                  <div key={t.id} className="py-2 flex items-center gap-3 text-sm">
                    <StatusSelect
                      value={t.status}
                      onChange={(v) => moveTask(t.id, v)}
                      size="sm"
                    />
                    <div className="flex-1">
                      <TaskLink task={t} />
                      <div className="text-xs text-slate-500">
                        {t.assigneeName || 'Unassigned'}
                        {t.subtaskCount > 0 &&
                          ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                      </div>
                    </div>
                    {t.gxpCritical && (
                      <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span>
                    )}
                    {t.requiresQaSignoff &&
                      (t.qaSignoffAt ? (
                        <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                          QA ✓
                        </span>
                      ) : (
                        <span className="tag bg-purple-50 text-purple-700 border border-purple-200">
                          QA sign-off
                        </span>
                      ))}
                    <PriorityTag priority={t.priority} />
                    <div className="text-xs text-slate-500 w-24 text-right">
                      {formatDate(t.dueDate)}
                    </div>
                  </div>
                ))}
              {project.tasks.filter((t: any) => !t.phaseId).length === 0 && (
                <div className="text-xs text-slate-500 py-2">None</div>
              )}
            </div>
            <QuickAddTask projectId={project.id} users={users} onAdded={load} />
          </Card>
        </div>
      ) : (
        <KanbanBoard tasks={project.tasks} onMove={moveTask} />
      )}
    </div>
  );
}
