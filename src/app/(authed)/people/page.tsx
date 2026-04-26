'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui';
import { UserPlus, Copy, Check, X, Shield, User } from 'lucide-react';

/* ── role display helpers ─────────────────────────────────────────────── */
const ROLE_LABEL: Record<string, string> = {
  pm:       'PM',
  employee: 'Individual Contributor',
};
const ROLE_COLOR: Record<string, string> = {
  pm:       'bg-blue-50 text-blue-700 border-blue-200',
  employee: 'bg-slate-100 text-slate-600 border-slate-200',
};

/* ── Copy-to-clipboard button ─────────────────────────────────────────── */
function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy} className="ml-2 text-slate-400 hover:text-blue-600 transition-colors" title="Copy">
      {copied ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
    </button>
  );
}

/* ── Credentials reveal modal ─────────────────────────────────────────── */
function CredentialsModal({ name, email, tempPassword, onClose }: {
  name: string; email: string; tempPassword: string; onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-[calc(100vw-32px)] sm:w-[420px]">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-base font-bold text-slate-900">Account created</div>
            <div className="text-sm text-slate-400 mt-0.5">Share these credentials with {name}.</div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5"><X size={18} /></button>
        </div>

        <div className="space-y-3 mb-5">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Email</div>
            <div className="flex items-center">
              <span className="text-sm font-mono font-semibold text-slate-800 flex-1">{email}</span>
              <CopyBtn text={email} />
            </div>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 mb-1">Temporary password</div>
            <div className="flex items-center">
              <span className="text-sm font-mono font-semibold text-blue-800 flex-1 tracking-wide">{tempPassword}</span>
              <CopyBtn text={tempPassword} />
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800 leading-snug mb-5">
          This password is shown only once. Ask {name} to change it after first login via Settings → Security.
        </div>

        <button onClick={onClose} className="btn-primary w-full justify-center">
          Done
        </button>
      </div>
    </>
  );
}

/* ── Add member modal ─────────────────────────────────────────────────── */
function AddMemberModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (name: string, email: string, tempPassword: string) => void;
}) {
  const [form, setForm] = useState({ name: '', email: '', title: '', role: 'employee' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const res = await api<{ user: any; tempPassword: string }>('/users', {
        method: 'POST',
        body: { name: form.name, email: form.email, title: form.title, role: form.role },
      });
      onCreated(res.user.name, res.user.email, res.tempPassword);
    } catch (e: any) {
      setErr(e.message || 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-[calc(100vw-32px)] sm:w-[400px]">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-base font-bold text-slate-900">Add team member</div>
            <div className="text-sm text-slate-400 mt-0.5">A temporary password will be generated for you to share.</div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Full name</label>
            <input className="input" placeholder="e.g. Priya Sharma" required
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Work email</label>
            <input className="input" type="email" placeholder="priya@company.com" required
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Job title <span className="text-slate-300 font-normal normal-case">(optional)</span></label>
            <input className="input" placeholder="e.g. Frontend Engineer"
              value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Role</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {[
                { value: 'employee', label: 'Individual Contributor', icon: User,   desc: 'Sees own tasks & projects' },
                { value: 'pm',       label: 'PM',                     icon: Shield, desc: 'Full access — all teams & analytics' },
              ].map((r) => {
                const Icon = r.icon;
                const active = form.role === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setForm({ ...form, role: r.value })}
                    className="rounded-xl border-2 p-3 text-left transition-all"
                    style={{
                      borderColor: active ? '#1565C0' : '#e2e8f0',
                      background:  active ? '#eff6ff'  : '#fafafa',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon size={13} style={{ color: active ? '#1565C0' : '#94a3b8' }} />
                      <span className="text-xs font-bold" style={{ color: active ? '#1565C0' : '#475569' }}>{r.label}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 leading-snug">{r.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">{err}</div>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </div>
    </>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
export default function PeoplePage() {
  const [users, setUsers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [creds, setCreds] = useState<{ name: string; email: string; tempPassword: string } | null>(null);

  function load() { api<any[]>('/users').then(setUsers); }
  useEffect(() => {
    load();
    api<any>('/auth/me').then((d) => setMe(d.user));
  }, []);

  async function toggleRole(user: any) {
    const newRole = user.role === 'pm' ? 'employee' : 'pm';
    setSaving(user.id);
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: { role: newRole } });
      load();
    } finally { setSaving(null); }
  }

  function handleCreated(name: string, email: string, tempPassword: string) {
    setShowAdd(false);
    setCreds({ name, email, tempPassword });
    load();
  }

  const pms = users.filter((u) => u.role === 'pm');
  const ics  = users.filter((u) => u.role !== 'pm');
  const isPM = me?.role === 'pm';

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Modals */}
      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
      {creds  && <CredentialsModal {...creds} onClose={() => setCreds(null)} />}

      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-subtitle">
            Manage team members and roles. PMs see everything — ICs see their own work.
          </p>
        </div>
        {isPM && (
          <button onClick={() => setShowAdd(true)} className="btn-primary shrink-0">
            <UserPlus size={14} /> Add member
          </button>
        )}
      </div>

      {/* How roles work */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-slate-700">
        <strong className="text-blue-700">How roles work:</strong>{' '}
        <span className="text-slate-500">
          <strong>Individual Contributors</strong> see their tasks, projects, and yearly view.{' '}
          <strong>PMs</strong> additionally access Teams, Org overview, and the Insights centre.
          {isPM && ' You can promote or demote anyone below — except yourself.'}
        </span>
      </div>

      {/* PM section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Shield size={14} className="text-blue-500" /> PMs
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{pms.length}</span>
          </h2>
        </div>
        {pms.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">No PMs yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pms.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={u.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm">{u.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{u.title || 'Product Manager'} · {u.email}</div>
                </div>
                <span className={`tag border text-xs font-semibold ${ROLE_COLOR.pm}`}>{ROLE_LABEL.pm}</span>
                {isPM && me?.id !== u.id && (
                  <button className="btn-ghost text-xs text-slate-500" onClick={() => toggleRole(u)} disabled={saving === u.id}>
                    {saving === u.id ? '…' : 'Make IC'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* IC section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <User size={14} className="text-slate-400" /> Individual Contributors
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600">{ics.length}</span>
          </h2>
        </div>
        {ics.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">
            No ICs yet.{isPM && <> <button onClick={() => setShowAdd(true)} className="text-blue-600 font-medium hover:underline">Add the first member.</button></>}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {ics.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                <Avatar name={u.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-800 text-sm">{u.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{u.title || 'Individual Contributor'} · {u.email}</div>
                </div>
                <span className={`tag border text-xs ${ROLE_COLOR.employee}`}>{ROLE_LABEL.employee}</span>
                {isPM && (
                  <button className="btn-ghost text-xs text-blue-700" onClick={() => toggleRole(u)} disabled={saving === u.id}>
                    {saving === u.id ? '…' : 'Make PM'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
