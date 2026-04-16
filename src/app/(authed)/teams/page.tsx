'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Card, Avatar } from '@/components/ui';

export default function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', leadId: '', function: 'general' });

  function load() {
    api<any[]>('/teams').then(setTeams);
  }
  useEffect(() => {
    load();
    api<any[]>('/users').then(setUsers);
    api<any>('/auth/me').then((d) => setMe(d.user));
  }, []);

  async function create() {
    if (!form.name.trim()) return;
    await api('/teams', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        description: form.description || undefined,
        leadId: form.leadId || undefined,
        function: form.function
      }
    });
    setForm({ name: '', description: '', leadId: '', function: 'general' });
    setCreating(false);
    load();
  }
  const canCreate = me && ['lead', 'manager', 'admin'].includes(me.role);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-sm text-slate-500">
            Teams align to Quality Informatics functions — CSV, data integrity, PV, audit.
          </p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : '+ New team'}
          </button>
        )}
      </div>

      {creating && (
        <Card title="Create team">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="input"
              placeholder="Team name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <select
              className="select"
              value={form.leadId}
              onChange={(e) => setForm({ ...form, leadId: e.target.value })}
            >
              <option value="">Select team lead…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
            <select
              className="select"
              value={form.function}
              onChange={(e) => setForm({ ...form, function: e.target.value })}
            >
              <option value="general">General</option>
              <option value="csv_validation">CSV / Validation</option>
              <option value="data_integrity">Data Integrity</option>
              <option value="pharmacovigilance">Pharmacovigilance</option>
              <option value="lab_informatics">Lab Informatics</option>
              <option value="audit">Audit</option>
              <option value="training">Training</option>
            </select>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={create}>
              Create
            </button>
            <button className="btn-ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/teams/${t.id}`}
            className="card p-4 hover:shadow-md transition"
          >
            <div className="flex items-center gap-3">
              <Avatar name={t.name} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-slate-500">
                  Function: {t.function}
                </div>
              </div>
            </div>
            {t.description && (
              <p className="mt-3 text-sm text-slate-600 line-clamp-2">{t.description}</p>
            )}
            <div className="mt-4 flex justify-between text-xs text-slate-500">
              <span>{t.memberCount} members</span>
              <span>{t.projectCount} projects</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
