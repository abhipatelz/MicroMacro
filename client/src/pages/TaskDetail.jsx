import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import {
  Card,
  LifecycleTag,
  PriorityTag,
  StatusTag,
  formatDate,
  Avatar
} from '../ui';

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'];

export default function TaskDetail() {
  const { id } = useParams();
  const [task, setTask] = useState(null);
  const [users, setUsers] = useState([]);
  const [comment, setComment] = useState('');
  const [newSub, setNewSub] = useState('');
  const { user } = useAuth();

  async function load() {
    setTask(await api(`/tasks/${id}`));
  }
  useEffect(() => {
    load();
    api('/users').then(setUsers);
  }, [id]);

  if (!task) return <div className="text-slate-500">Loading…</div>;

  async function update(patch) {
    await api(`/tasks/${id}`, { method: 'PATCH', body: patch });
    load();
  }
  async function addSubtask() {
    if (!newSub.trim()) return;
    await api(`/tasks/${id}/subtasks`, { method: 'POST', body: { title: newSub.trim() } });
    setNewSub('');
    load();
  }
  async function toggleSub(sub) {
    await api(`/subtasks/${sub.id}`, {
      method: 'PATCH',
      body: { status: sub.status === 'done' ? 'todo' : 'done' }
    });
    load();
  }
  async function addComment() {
    if (!comment.trim()) return;
    await api(`/tasks/${id}/comments`, { method: 'POST', body: { body: comment.trim() } });
    setComment('');
    load();
  }
  async function signoff() {
    await api(`/tasks/${id}/signoff`, { method: 'POST' });
    load();
  }

  const canSignoff =
    task.requires_qa_signoff &&
    !task.qa_signoff_at &&
    ['lead', 'manager', 'admin'].includes(user?.role);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <div>
          <div className="text-xs text-slate-500">
            <Link to={`/projects/${task.project_id}`} className="hover:underline">{task.project_code} · {task.project_name}</Link>
          </div>
          <h1 className="text-2xl font-bold mt-1">{task.title}</h1>
          <div className="flex flex-wrap gap-2 mt-2">
            <StatusTag status={task.status} />
            <PriorityTag priority={task.priority} />
            {task.gxp_critical ? <span className="tag bg-red-50 text-red-700 border border-red-200">GxP critical</span> : null}
            {task.requires_qa_signoff && (
              task.qa_signoff_at ? (
                <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">
                  QA ✓ {task.qa_signoff_name} · {formatDate(task.qa_signoff_at)}
                </span>
              ) : (
                <span className="tag bg-purple-50 text-purple-700 border border-purple-200">QA sign-off required</span>
              )
            )}
            <span className="tag bg-slate-100">{task.task_type}</span>
          </div>
        </div>

        <Card title="Description">
          <textarea
            className="textarea min-h-[100px]"
            value={task.description || ''}
            onChange={(e) => setTask({ ...task, description: e.target.value })}
            onBlur={(e) => update({ description: e.target.value })}
            placeholder="Describe what's expected, references, evidence…"
          />
        </Card>

        <Card
          title={`Subtasks (${task.subtasks.length})`}
          action={
            <span className="text-xs text-slate-500">
              {task.subtasks.filter((s) => s.status === 'done').length}/{task.subtasks.length} done
            </span>
          }
        >
          <div className="space-y-1">
            {task.subtasks.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-sm py-1">
                <input type="checkbox" checked={s.status === 'done'} onChange={() => toggleSub(s)} />
                <span className={`flex-1 ${s.status === 'done' ? 'line-through text-slate-400' : ''}`}>{s.title}</span>
                <span className="text-xs text-slate-500">{formatDate(s.due_date)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input
              className="input"
              placeholder="Add a subtask…"
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
            />
            <button className="btn-primary" onClick={addSubtask}>Add</button>
          </div>
        </Card>

        <Card title={`Comments (${task.comments.length})`}>
          <div className="space-y-3 mb-3">
            {task.comments.map((c) => (
              <div key={c.id} className="flex gap-3">
                <Avatar name={c.user_name} />
                <div className="flex-1">
                  <div className="text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{c.user_name}</span> · {formatDate(c.created_at)}
                  </div>
                  <div className="text-sm">{c.body}</div>
                </div>
              </div>
            ))}
            {task.comments.length === 0 && <div className="text-sm text-slate-500">No comments yet.</div>}
          </div>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Add a comment…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addComment()}
            />
            <button className="btn-primary" onClick={addComment}>Post</button>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Properties">
          <div className="space-y-3 text-sm">
            <div>
              <label className="label">Status</label>
              <select className="select" value={task.status} onChange={(e) => update({ status: e.target.value })}>
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Assignee</label>
              <select
                className="select"
                value={task.assignee_id || ''}
                onChange={(e) => update({ assignee_id: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Priority</label>
                <select className="select" value={task.priority} onChange={(e) => update({ priority: e.target.value })}>
                  {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Type</label>
                <select className="select" value={task.task_type} onChange={(e) => update({ task_type: e.target.value })}>
                  {['task', 'review', 'approval', 'test', 'deviation', 'capa', 'audit_finding'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Start</label>
                <input type="date" className="input" value={task.start_date?.slice(0, 10) || ''} onChange={(e) => update({ start_date: e.target.value || null })} />
              </div>
              <div>
                <label className="label">Due</label>
                <input type="date" className="input" value={task.due_date?.slice(0, 10) || ''} onChange={(e) => update({ due_date: e.target.value || null })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Est. hrs</label>
                <input type="number" className="input" value={task.estimated_hours ?? ''} onChange={(e) => update({ estimated_hours: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <div>
                <label className="label">Actual hrs</label>
                <input type="number" className="input" value={task.actual_hours ?? ''} onChange={(e) => update({ actual_hours: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex gap-4 pt-2 text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!task.gxp_critical} onChange={(e) => update({ gxp_critical: e.target.checked })} />
                GxP critical
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={!!task.requires_qa_signoff} onChange={(e) => update({ requires_qa_signoff: e.target.checked })} />
                QA sign-off
              </label>
            </div>
          </div>
        </Card>

        {canSignoff && (
          <Card title="QA sign-off">
            <p className="text-sm text-slate-600 mb-3">
              This task requires QA sign-off. As a {user.role}, you can approve it once the evidence is reviewed.
            </p>
            <button className="btn-primary w-full justify-center" onClick={signoff}>Sign off as QA</button>
          </Card>
        )}
      </div>
    </div>
  );
}
