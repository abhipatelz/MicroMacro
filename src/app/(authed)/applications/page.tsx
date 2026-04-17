'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Card, ProgressBar, LifecycleTag, LoadingCard } from '@/components/ui';

const STATUS_LABELS: Record<string, string> = {
  operational: 'Operational',
  under_implementation: 'Under implementation',
  under_upgrade: 'Under upgrade',
  retired: 'Retired'
};

function AppMoreOptions({
  form,
  setForm,
  users
}: {
  form: any;
  setForm: (f: any) => void;
  users: any[];
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-brand-700 hover:underline mt-3"
      >
        + Add owner, vendor, description, default lifecycle
      </button>
    );
  return (
    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-3">
      <input
        className="input"
        placeholder="Vendor"
        value={form.vendor}
        onChange={(e) => setForm({ ...form, vendor: e.target.value })}
      />
      <select
        className="select"
        value={form.ownerId}
        onChange={(e) => setForm({ ...form, ownerId: e.target.value })}
      >
        <option value="">— Owner —</option>
        {users.map((u: any) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
      <input
        className="input md:col-span-2"
        placeholder="Description"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <select
        className="select"
        value={form.defaultLifecycle}
        onChange={(e) => setForm({ ...form, defaultLifecycle: e.target.value })}
      >
        <option value="simple">Simple (Plan → Do → Done)</option>
        <option value="software">Software Delivery</option>
        <option value="csv">CSV / GAMP 5</option>
        <option value="data_integrity">Data Integrity</option>
        <option value="sop">SOP</option>
        <option value="pharmacovigilance">Pharmacovigilance</option>
        <option value="change_control">Change Control</option>
        <option value="audit">Audit</option>
        <option value="validation">Validation</option>
        <option value="deviation_capa">Deviation / CAPA</option>
        <option value="generic">Generic</option>
      </select>
      <select
        className="select"
        value={form.status}
        onChange={(e) => setForm({ ...form, status: e.target.value })}
      >
        {Object.entries(STATUS_LABELS).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
const STATUS_COLORS: Record<string, string> = {
  operational: 'bg-emerald-100 text-emerald-700',
  under_implementation: 'bg-blue-100 text-blue-700',
  under_upgrade: 'bg-amber-100 text-amber-800',
  retired: 'bg-slate-100 text-slate-600'
};

export default function ApplicationsPage() {
  const [apps, setApps] = useState<any[] | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    key: '',
    name: '',
    vendor: '',
    description: '',
    ownerId: '',
    defaultLifecycle: 'simple',
    status: 'operational'
  });

  const load = () => api<any[]>('/applications').then(setApps);
  useEffect(() => {
    load();
    api<any[]>('/users').then(setUsers);
    api<any>('/auth/me').then((d) => setMe(d.user));
  }, []);

  const canCreate = me && ['manager', 'admin'].includes(me.role);

  async function create() {
    if (!form.key.trim() || !form.name.trim()) return;
    await api('/applications', {
      method: 'POST',
      body: {
        key: form.key.trim().toUpperCase(),
        name: form.name.trim(),
        vendor: form.vendor || undefined,
        description: form.description || undefined,
        ownerId: form.ownerId || undefined,
        defaultLifecycle: form.defaultLifecycle,
        status: form.status
      }
    });
    setForm({
      key: '',
      name: '',
      vendor: '',
      description: '',
      ownerId: '',
      defaultLifecycle: 'simple',
      status: 'operational'
    });
    setCreating(false);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Applications</h1>
          <p className="text-sm text-slate-500">
            Every business application this team owns — projects and tasks live underneath them.
          </p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Close' : '+ New application'}
          </button>
        )}
      </div>

      {creating && (
        <Card title="Add application">
          <p className="text-xs text-slate-500 mb-3">
            A short key and a display name are all that&apos;s required. Add the rest whenever you like.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="input"
              placeholder="Key *"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value.toUpperCase() })}
              autoFocus
            />
            <input
              className="input md:col-span-3"
              placeholder="Display name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <AppMoreOptions form={form} setForm={setForm} users={users} />
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={create} disabled={!form.key || !form.name}>
              Create
            </button>
            <button className="btn-ghost" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apps === null && (
          <>
            <LoadingCard />
            <LoadingCard />
            <LoadingCard />
          </>
        )}
        {(apps || []).map((a) => {
          const pct = a.taskCount ? Math.round((a.tasksDone / a.taskCount) * 100) : 0;
          return (
            <Link
              href={`/applications/${a.id}`}
              key={a.id}
              className="card p-4 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-mono text-slate-500">{a.key}</div>
                  <div className="font-semibold mt-0.5">{a.name}</div>
                  {a.vendor && <div className="text-xs text-slate-500">{a.vendor}</div>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`tag ${STATUS_COLORS[a.status] || 'bg-slate-100'}`}>
                    {STATUS_LABELS[a.status] || a.status}
                  </span>
                  {a.gxp && (
                    <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span>
                  )}
                </div>
              </div>
              {a.description && (
                <p className="text-sm text-slate-500 line-clamp-2 mt-2">{a.description}</p>
              )}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>
                    {a.tasksDone}/{a.taskCount} tasks done
                  </span>
                  <span>{pct}%</span>
                </div>
                <ProgressBar value={pct} />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-500">{a.projectCount} projects</span>
                {a.overdueOpen > 0 && (
                  <span className="text-red-600 font-medium">
                    ⚠ {a.overdueOpen} overdue
                  </span>
                )}
              </div>
              <div className="mt-2">
                <LifecycleTag lifecycle={a.defaultLifecycle} />
              </div>
            </Link>
          );
        })}
        {apps !== null && apps.length === 0 && (
          <Card>
            <div className="text-sm text-slate-500 py-6 text-center">
              No applications yet. {canCreate && 'Add your first one with the button above.'}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
