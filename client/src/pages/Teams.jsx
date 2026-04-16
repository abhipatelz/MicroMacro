import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Card, Avatar } from '../ui';
import { useAuth } from '../auth';

export default function Teams() {
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', lead_id: '' });
  const { user } = useAuth();

  function load() {
    api('/teams').then(setTeams);
  }
  useEffect(() => {
    load();
    api('/users').then(setUsers);
  }, []);

  async function create() {
    if (!form.name.trim()) return;
    await api('/teams', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        description: form.description || undefined,
        lead_id: form.lead_id ? Number(form.lead_id) : undefined
      }
    });
    setForm({ name: '', description: '', lead_id: '' });
    setCreating(false);
    load();
  }

  const canCreate = user && ['lead', 'manager', 'admin'].includes(user.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-sm text-slate-500">Teams align to quality pharma functions — CSV, SOPs, Deviations &amp; CAPA, audits.</p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : '+ New team'}
          </button>
        )}
      </div>

      {creating && (
        <Card title="Create team">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input className="input" placeholder="Team name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="input" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select className="select" value={form.lead_id} onChange={(e) => setForm({ ...form, lead_id: e.target.value })}>
              <option value="">Select team lead…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={create}>Create</button>
            <button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((t) => (
          <Link key={t.id} to={`/teams/${t.id}`} className="card p-4 hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <Avatar name={t.name} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-slate-500">Lead: {t.lead_name || '—'}</div>
              </div>
            </div>
            {t.description && <p className="mt-3 text-sm text-slate-600 line-clamp-2">{t.description}</p>}
            <div className="mt-4 flex justify-between text-xs text-slate-500">
              <span>{t.member_count} members</span>
              <span>{t.project_count} projects</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
