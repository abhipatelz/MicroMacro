import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import {
  Card,
  LifecycleTag,
  PriorityTag,
  ProgressBar,
  StatusTag,
  formatDate
} from '../ui';

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [teams, setTeams] = useState([]);
  const [lifecycles, setLifecycles] = useState([]);
  const [q, setQ] = useState('');
  const [team, setTeam] = useState('');
  const [lc, setLc] = useState('');
  const [status, setStatus] = useState('');

  function load() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (team) params.set('team_id', team);
    if (lc) params.set('lifecycle', lc);
    if (status) params.set('status', status);
    api(`/projects?${params.toString()}`).then(setProjects);
  }

  useEffect(() => {
    api('/teams').then(setTeams);
    api('/lifecycles').then(setLifecycles);
  }, []);

  useEffect(() => {
    const id = setTimeout(load, 150);
    return () => clearTimeout(id);
  }, [q, team, lc, status]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-slate-500">
            Macro view of all quality projects across teams &amp; lifecycles.
          </p>
        </div>
        <Link to="/projects/new" className="btn-primary">+ New project</Link>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input className="input" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All teams</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className="select" value={lc} onChange={(e) => setLc(e.target.value)}>
            <option value="">All lifecycles</option>
            {lifecycles.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="planning">Planning</option>
            <option value="in_progress">In progress</option>
            <option value="on_hold">On hold</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {projects.map((p) => {
          const pct = p.task_count ? Math.round((p.tasks_done / p.task_count) * 100) : 0;
          return (
            <Link to={`/projects/${p.id}`} key={p.id} className="card p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500 font-mono">{p.code}</div>
                  <div className="font-semibold text-slate-900 truncate">{p.name}</div>
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  <LifecycleTag lifecycle={p.lifecycle} />
                  <PriorityTag priority={p.priority} />
                  <StatusTag status={p.status} />
                </div>
              </div>
              {p.description && <p className="text-sm text-slate-500 line-clamp-2 mt-2">{p.description}</p>}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{p.tasks_done}/{p.task_count} tasks done</span>
                  <span>{pct}%</span>
                </div>
                <ProgressBar value={pct} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{p.team_name || '—'}</span>
                <span>Due {formatDate(p.due_date)}</span>
              </div>
            </Link>
          );
        })}
      </div>
      {projects.length === 0 && (
        <Card>
          <div className="py-10 text-center text-slate-500">
            No projects match those filters. <Link to="/projects/new" className="text-brand-700 hover:underline">Create one?</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
