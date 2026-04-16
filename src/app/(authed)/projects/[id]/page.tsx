'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import {
  Card,
  LifecycleTag,
  PriorityTag,
  ProgressBar,
  StatusTag,
  TaskLink,
  formatDate
} from '@/components/ui';

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

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

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [view, setView] = useState<'phases' | 'board'>('phases');

  async function load() {
    const p = await api<any>(`/projects/${id}`);
    setProject(p);
  }
  useEffect(() => {
    load();
    api<any[]>('/users').then(setUsers);
  }, [id]);

  if (!project) return <div className="text-slate-500">Loading…</div>;

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

  async function updateStatus(newStatus: string) {
    await api(`/projects/${id}`, { method: 'PATCH', body: { status: newStatus } });
    load();
  }

  async function moveTask(taskId: string, status: string) {
    await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status } });
    load();
  }

  return (
    <div className="space-y-6">
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
          <select
            className="select w-48"
            value={project.status}
            onChange={(e) => updateStatus(e.target.value)}
          >
            <option value="planning">Planning</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <div className="text-xs text-slate-500 font-semibold uppercase">Progress</div>
          <div className="text-2xl font-semibold mt-1">{pct}%</div>
          <ProgressBar value={pct} className="mt-2" />
          <div className="text-xs text-slate-500 mt-1">
            {project.tasks.filter((t: any) => t.status === 'done').length}/{project.tasks.length}{' '}
            tasks
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-semibold uppercase">Phases</div>
          <div className="text-2xl font-semibold mt-1">{project.phases.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-semibold uppercase">QA sign-off pending</div>
          <div className={`text-2xl font-semibold mt-1 ${pendingQa ? 'text-amber-600' : ''}`}>
            {pendingQa}
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-semibold uppercase">GxP critical tasks</div>
          <div className="text-2xl font-semibold mt-1">
            {project.tasks.filter((t: any) => t.gxpCritical).length}
          </div>
        </Card>
      </div>

      <div className="flex gap-2">
        {[
          ['phases', 'By phase'],
          ['board', 'Kanban']
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
                      <select
                        className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white"
                        value={t.status}
                        onChange={(e) => moveTask(t.id, e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.replace('_', ' ')}
                          </option>
                        ))}
                      </select>
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
                    <TaskLink task={t} />
                    <span className="ml-auto text-xs text-slate-500">
                      {t.assigneeName || 'Unassigned'}
                    </span>
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STATUSES.map((s) => (
            <div key={s} className="bg-slate-100 rounded-md p-2">
              <div className="text-xs font-semibold text-slate-600 uppercase mb-2 px-1">
                {s.replace('_', ' ')}
              </div>
              <div className="space-y-2">
                {project.tasks
                  .filter((t: any) => t.status === s)
                  .map((t: any) => (
                    <Link
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="block bg-white rounded p-2 text-xs shadow-sm hover:shadow"
                    >
                      <div className="font-medium text-slate-800">{t.title}</div>
                      <div className="mt-1 flex gap-1 flex-wrap">
                        {t.gxpCritical && <span className="tag bg-red-50 text-red-700">GxP</span>}
                        {t.requiresQaSignoff && (
                          <span className="tag bg-purple-50 text-purple-700">QA</span>
                        )}
                        <PriorityTag priority={t.priority} />
                      </div>
                      <div className="mt-1 text-slate-500">{t.assigneeName || 'Unassigned'}</div>
                    </Link>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
