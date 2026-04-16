import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import {
  Card,
  LifecycleTag,
  PriorityTag,
  ProgressBar,
  StatusTag,
  TaskLink,
  formatDate
} from '../ui';

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'];

function QuickAddTask({ projectId, phaseId, users, onAdded }) {
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
        project_id: projectId,
        phase_id: phaseId || undefined,
        title: title.trim(),
        assignee_id: assignee ? Number(assignee) : undefined,
        due_date: due || undefined,
        requires_qa_signoff: qa,
        gxp_critical: gxp
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
      <button onClick={() => setOpen(true)} className="text-xs text-brand-700 hover:underline mt-2">
        + Add task
      </button>
    );
  return (
    <div className="mt-2 border-t pt-2 space-y-2">
      <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
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
        <button className="btn-primary text-xs" onClick={add}>Add</button>
        <button className="btn-ghost text-xs" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [view, setView] = useState('phases');

  async function load() {
    const p = await api(`/projects/${id}`);
    setProject(p);
  }
  useEffect(() => {
    load();
    api('/users').then(setUsers);
  }, [id]);

  if (!project) return <div className="text-slate-500">Loading…</div>;
  const pct = project.tasks.length
    ? Math.round((project.tasks.filter((t) => t.status === 'done').length / project.tasks.length) * 100)
    : 0;
  const pending_qa = project.tasks.filter((t) => t.requires_qa_signoff && !t.qa_signoff_at && t.status === 'done').length;

  async function updateStatus(newStatus) {
    await api(`/projects/${id}`, { method: 'PATCH', body: { status: newStatus } });
    load();
  }

  async function moveTask(taskId, status) {
    await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status } });
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs text-slate-500 font-mono">{project.code}</div>
          <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <LifecycleTag lifecycle={project.lifecycle} />
            <PriorityTag priority={project.priority} />
            <StatusTag status={project.status} />
            {project.gxp_impact && project.gxp_impact !== 'none' && (
              <span className="tag bg-red-50 text-red-700 border border-red-200">GxP impact: {project.gxp_impact}</span>
            )}
          </div>
          {project.description && <p className="mt-3 text-slate-600 max-w-3xl">{project.description}</p>}
          {project.lifecycle_meta?.regulatory_refs && (
            <p className="mt-2 text-xs text-slate-500"><span className="font-semibold">Regulatory refs:</span> {project.lifecycle_meta.regulatory_refs}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-right text-xs text-slate-500">
            <div>Owner: <span className="font-medium text-slate-700">{project.owner_name || '—'}</span></div>
            <div>Team: <Link to={`/teams/${project.team_id}`} className="text-brand-700 hover:underline">{project.team_name || '—'}</Link></div>
            <div>Due: {formatDate(project.due_date)}</div>
          </div>
          <select className="select w-48" value={project.status} onChange={(e) => updateStatus(e.target.value)}>
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
            {project.tasks.filter((t) => t.status === 'done').length}/{project.tasks.length} tasks
          </div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-semibold uppercase">Phases</div>
          <div className="text-2xl font-semibold mt-1">{project.phases.length}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-semibold uppercase">QA sign-off pending</div>
          <div className={`text-2xl font-semibold mt-1 ${pending_qa ? 'text-amber-600' : ''}`}>{pending_qa}</div>
        </Card>
        <Card>
          <div className="text-xs text-slate-500 font-semibold uppercase">GxP critical tasks</div>
          <div className="text-2xl font-semibold mt-1">{project.tasks.filter((t) => t.gxp_critical).length}</div>
        </Card>
      </div>

      <div className="flex gap-2">
        {[
          ['phases', 'By phase'],
          ['board', 'Kanban']
        ].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setView(k)}
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
          {project.phases.map((ph, i) => {
            const ts = project.tasks.filter((t) => t.phase_id === ph.id);
            const done = ts.filter((t) => t.status === 'done').length;
            const pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
            return (
              <Card key={ph.id}>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    <span className="text-slate-400 font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>
                    {ph.name}
                  </h3>
                  <div className="text-xs text-slate-500">{done}/{ts.length} · {pct}%</div>
                </div>
                <ProgressBar value={pct} className="mt-2 mb-3" />
                <div className="divide-y divide-slate-100">
                  {ts.map((t) => (
                    <div key={t.id} className="py-2 flex items-center gap-3 text-sm">
                      <select
                        className="text-xs border border-slate-200 rounded px-1 py-0.5 bg-white"
                        value={t.status}
                        onChange={(e) => moveTask(t.id, e.target.value)}
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                      <div className="flex-1">
                        <TaskLink task={t} />
                        <div className="text-xs text-slate-500">
                          {t.assignee_name || 'Unassigned'}
                          {t.subtask_count > 0 && ` · ${t.subtasks_done}/${t.subtask_count} subtasks`}
                        </div>
                      </div>
                      {t.gxp_critical ? <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span> : null}
                      {t.requires_qa_signoff ? (
                        t.qa_signoff_at ? (
                          <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">QA ✓</span>
                        ) : (
                          <span className="tag bg-purple-50 text-purple-700 border border-purple-200">QA sign-off</span>
                        )
                      ) : null}
                      <PriorityTag priority={t.priority} />
                      <div className="text-xs text-slate-500 w-24 text-right">{formatDate(t.due_date)}</div>
                    </div>
                  ))}
                </div>
                <QuickAddTask projectId={project.id} phaseId={ph.id} users={users} onAdded={load} />
              </Card>
            );
          })}
          <Card title="Unphased tasks">
            <div className="divide-y divide-slate-100">
              {project.tasks.filter((t) => !t.phase_id).map((t) => (
                <div key={t.id} className="py-2 flex items-center gap-3 text-sm">
                  <TaskLink task={t} />
                  <span className="ml-auto text-xs text-slate-500">{t.assignee_name || 'Unassigned'}</span>
                </div>
              ))}
              {project.tasks.filter((t) => !t.phase_id).length === 0 && (
                <div className="text-xs text-slate-500 py-2">None</div>
              )}
            </div>
            <QuickAddTask projectId={project.id} phaseId={null} users={users} onAdded={load} />
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {STATUSES.map((s) => (
            <div key={s} className="bg-slate-100 rounded-md p-2">
              <div className="text-xs font-semibold text-slate-600 uppercase mb-2 px-1">{s.replace('_', ' ')}</div>
              <div className="space-y-2">
                {project.tasks.filter((t) => t.status === s).map((t) => (
                  <Link
                    key={t.id}
                    to={`/tasks/${t.id}`}
                    className="block bg-white rounded p-2 text-xs shadow-sm hover:shadow"
                  >
                    <div className="font-medium text-slate-800">{t.title}</div>
                    <div className="mt-1 flex gap-1 flex-wrap">
                      {t.gxp_critical ? <span className="tag bg-red-50 text-red-700">GxP</span> : null}
                      {t.requires_qa_signoff ? <span className="tag bg-purple-50 text-purple-700">QA</span> : null}
                      <PriorityTag priority={t.priority} />
                    </div>
                    <div className="mt-1 text-slate-500">{t.assignee_name || 'Unassigned'}</div>
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
