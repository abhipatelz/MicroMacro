'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui';
import { UserPlus, Copy, Check, X, Shield, User, AlertTriangle, Pencil, Trash2 } from 'lucide-react';

/* ── role display helpers ─────────────────────────────────────────────── */
const ROLE_COLOR: Record<string, string> = {
  admin:    'bg-amber-50 text-amber-800 border-amber-200',
  pm:       'bg-blue-50  text-blue-700  border-blue-200',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[420px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-base font-bold text-slate-900">Account created</div>
            <div className="text-sm text-slate-400 mt-0.5">Share these credentials with {name}.</div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5"><X size={18} /></button>
        </div>

        <div className="space-y-3 mb-5">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Username</div>
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
          This password is shown only once. {name} will be prompted to set their own on first login.
        </div>

        <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
      </div>
    </div>
  );
}

/* ── Add member modal — role is always IC, no picker needed ───────────── */
// Title-case a corporate username into a display name:
//   priya.sharma → "Priya Sharma",  p_kumar → "P Kumar"
function deriveName(username: string): string {
  return username
    .split(/[._]+/)
    .filter(Boolean)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(' ');
}

function AddMemberModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  // Two inputs only: the corporate username and the employee ID. The
  // display name auto-derives from the username (editable if it looks
  // wrong). No password is collected or shown — contributors sign in with
  // the standard convention the admin communicates out-of-band.
  const [username, setUsername]     = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [name, setName]             = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [title, setTitle]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [err, setErr]               = useState('');

  function onUsernameChange(value: string) {
    const v = value.toLowerCase();
    setUsername(v);
    if (!nameEdited) setName(deriveName(v));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const res = await api<{ user: any }>('/users', {
        method: 'POST',
        body: { name: name.trim() || deriveName(username), username, employeeId, title },
      });
      onCreated(res.user.name);
    } catch (e: any) {
      setErr(e.message || 'Failed to add member.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[400px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-base font-bold text-slate-900">Add team member</div>
            <div className="text-sm text-slate-400 mt-0.5">
              Enter their company username and employee ID. They'll appear in
              your assignee lists and team board straight away.
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Corporate username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-mono pointer-events-none">@</span>
              <input
                className="input pl-7 font-mono text-sm"
                placeholder="priya.sharma"
                required
                minLength={3}
                maxLength={30}
                pattern="[a-z][a-z0-9_.]{1,28}[a-z0-9_]"
                autoCapitalize="none"
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={(e) => onUsernameChange(e.target.value)}
              />
            </div>
            <div className="text-[11px] text-slate-400 mt-1 leading-snug">
              The part of their work email before the
              <span className="font-mono px-1">@</span>
              — e.g. <span className="font-mono">priya.sharma</span> for <span className="font-mono">priya.sharma@company.com</span>.
            </div>
          </div>

          <div>
            <label className="label">Employee ID</label>
            <input
              className="input font-mono text-sm"
              placeholder="e.g. 100245"
              required
              maxLength={40}
              autoComplete="off"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Display name <span className="text-slate-300 font-normal normal-case">(auto-filled)</span></label>
            <input
              className="input"
              placeholder="Priya Sharma"
              required
              value={name}
              onChange={(e) => { setName(e.target.value); setNameEdited(true); }}
            />
          </div>

          <div>
            <label className="label">Job title <span className="text-slate-300 font-normal normal-case">(optional)</span></label>
            <input className="input" placeholder="e.g. Validation Analyst"
              value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">{err}</div>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full justify-center">
            {saving ? 'Adding…' : 'Add member'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ── Role-change confirmation dialog ──────────────────────────────────── */
function RoleConfirmDialog({ user, targetRole, onConfirm, onCancel, saving }: {
  user: any; targetRole: 'pm' | 'employee'; onConfirm: () => void; onCancel: () => void; saving: boolean;
}) {
  const promote = targetRole === 'pm';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[380px] modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${promote ? 'bg-blue-50' : 'bg-amber-50'}`}>
            {promote ? <Shield size={22} className="text-blue-600" /> : <AlertTriangle size={22} className="text-amber-500" />}
          </div>
          <div>
            <div className="text-base font-black text-slate-900 tracking-tight">
              {promote ? `Promote ${user.name} to PM?` : `Remove PM from ${user.name}?`}
            </div>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              {promote
                ? 'PMs have full access to all projects, teams, org analytics, and AI insights. Only promote trusted team members.'
                : 'They will lose access to org analytics, AI insights, and team management. Their tasks and projects remain intact.'}
            </p>
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={onConfirm} disabled={saving}
              className={`flex-1 justify-center btn ${promote ? 'btn-primary' : ''}`}
              style={!promote ? { background: 'linear-gradient(135deg,#b45309,#d97706)', color: '#fff', boxShadow: '0 1px 3px rgba(180,83,9,0.3)' } : {}}>
              {saving ? '…' : promote ? 'Promote to PM' : 'Remove PM access'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Edit user modal ──────────────────────────────────────────────────── */
function EditUserModal({ user, onClose, onSaved }: {
  user: any; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name:       user.name       || '',
    title:      user.title      || '',
    department: user.department || '',
    phone:      user.phone      || '',
    location:   user.location   || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: form });
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || 'Failed to save.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[420px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-base font-bold text-slate-900">Edit profile</div>
            <div className="text-sm text-slate-400 mt-0.5 font-mono">@{user.username || user.email}</div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="label">Full name</label>
              <input className="input" required value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Job title</label>
              <input className="input" placeholder="e.g. QA Specialist"
                value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <label className="label">Department</label>
              <input className="input" placeholder="e.g. Quality"
                value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" placeholder="+91 98765 43210"
                value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" placeholder="Mumbai"
                value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
            </div>
          </div>
          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Remove member confirm dialog ────────────────────────────────────── */
function RemoveConfirmDialog({ user, onConfirm, onCancel, saving }: {
  user: any; onConfirm: () => void; onCancel: () => void; saving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[380px] modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
            <Trash2 size={22} className="text-red-600" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900">Remove {user.name}?</div>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              Their account will be deleted and they will lose access immediately.
              All tasks assigned to them will be unassigned. This cannot be undone.
            </p>
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={onConfirm} disabled={saving}
              className="flex-1 justify-center btn text-white"
              style={{ background: 'linear-gradient(135deg,#dc2626,#ef4444)', boxShadow: '0 1px 3px rgba(220,38,38,0.3)' }}>
              {saving ? 'Removing…' : 'Remove member'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────── */
interface PeopleClientProps {
  initialUsers: any[];
  me:           any;
}

export default function PeopleClient({ initialUsers, me }: PeopleClientProps) {
  const [users, setUsers] = useState<any[]>(initialUsers);
  const [saving, setSaving] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{ user: any; targetRole: 'pm' | 'employee' } | null>(null);
  const [roleErr, setRoleErr] = useState('');
  const [editUser, setEditUser] = useState<any | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);

  // Background refresh after a mutation. The initial render uses the
  // server-provided list, so no fetch fires on mount.
  function load() { api<any[]>('/users').then(setUsers).catch(() => {}); }

  async function confirmRoleChange() {
    if (!roleConfirm) return;
    setSaving(roleConfirm.user.id);
    setRoleErr('');
    try {
      await api(`/users/${roleConfirm.user.id}`, { method: 'PATCH', body: { role: roleConfirm.targetRole } });
      setRoleConfirm(null);
      load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to update role.');
    } finally {
      setSaving(null);
    }
  }

  async function confirmRemove() {
    if (!removeConfirm) return;
    setRemoving(true);
    try {
      await api(`/users/${removeConfirm.id}`, { method: 'DELETE' });
      setRemoveConfirm(null);
      load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to remove user.');
      setRemoveConfirm(null);
    } finally { setRemoving(false); }
  }

  // Clear a brute-force lock without rotating the password — useful
  // when the lock came from typos, not a forgotten password.
  async function unlockAccount(user: any) {
    if (!confirm(`Unlock ${user.name}'s account?\nTheir existing password still works; the failed-attempt counter is reset to zero.`)) return;
    setSaving(user.id);
    try {
      await api(`/users/${user.id}/unlock`, { method: 'POST' });
      await load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to unlock account.');
    } finally {
      setSaving(null);
    }
  }

  // Admin-driven password reset. Avoids the SMTP round-trip entirely:
  // we generate a temp password server-side and surface it through the
  // same CredentialsModal used after creating a new user.
  async function resetPassword(user: any) {
    if (!confirm(`Generate a new temporary password for ${user.name}?\nThey'll be forced to change it on next sign-in.`)) return;
    setSaving(user.id);
    try {
      const res = await api<{ tempPassword: string; user: { name: string; email: string; username?: string } }>(
        `/users/${user.id}/reset-password`,
        { method: 'POST' },
      );
      // Surface the username if the account has one, else fall back to email
      // for legacy accounts that haven't been backfilled yet.
      setCreds({
        name: res.user.name,
        email: res.user.username || res.user.email,
        tempPassword: res.tempPassword,
      });
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to reset password.');
    } finally {
      setSaving(null);
    }
  }

  function handleCreated(name: string) {
    setShowAdd(false);
    setJustAdded(name);
    load();
    // auto-dismiss the confirmation after a few seconds
    setTimeout(() => setJustAdded(null), 4000);
  }

  const pms = users.filter((u) => u.role === 'pm' || u.role === 'lead' || u.role === 'admin');
  const ics = users.filter((u) => u.role === 'employee');
  const isPM = (me?.role === 'pm' || me?.role === 'lead' || me?.role === 'admin');

  return (
    <div className="space-y-6 max-w-3xl">
      {justAdded && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 fade-in-soft">
          <strong>{justAdded}</strong> added. They're now available to assign on your team's tasks.
        </div>
      )}
      {/* Modals */}
      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
      {creds && <CredentialsModal {...creds} onClose={() => setCreds(null)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
      {removeConfirm && (
        <RemoveConfirmDialog
          user={removeConfirm}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveConfirm(null)}
          saving={removing}
        />
      )}
      {roleConfirm && (
        <RoleConfirmDialog
          user={roleConfirm.user}
          targetRole={roleConfirm.targetRole}
          onConfirm={confirmRoleChange}
          onCancel={() => { setRoleConfirm(null); setRoleErr(''); }}
          saving={saving === roleConfirm.user.id}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">People</h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage team members and access. PMs see everything — ICs see their own work.
          </p>
        </div>
        {isPM && (
          <button onClick={() => setShowAdd(true)} className="btn-primary shrink-0 gap-2">
            <UserPlus size={14} /> Add member
          </button>
        )}
      </div>

      {/* Role info banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-blue-700">Access levels:</strong>{' '}
            <strong>Individual Contributors</strong> see their tasks, projects, and yearly view.{' '}
            <strong>PMs</strong> additionally access Teams, Org analytics, and AI Insights.{' '}
            {isPM && <span className="text-slate-400">Promote ICs to PM only when needed — PM access cannot be self-assigned.</span>}
          </div>
        </div>
      </div>

      {roleErr && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{roleErr}</div>
      )}

      {/* PM section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
          <Shield size={14} className="text-blue-500" />
          <h2 className="text-sm font-bold text-slate-700">Project Managers</h2>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">{pms.length}</span>
        </div>
        {pms.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">No PMs yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pms.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-4">
                <Avatar name={u.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm leading-tight">{u.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{u.title || 'Team Lead'} · <span className="font-mono">@{u.username || u.email}</span></div>
                </div>
                <span className={`tag border text-xs font-semibold ${u.role === 'admin' ? ROLE_COLOR.admin : ROLE_COLOR.pm}`}>
                  {u.role === 'admin' ? 'Admin' : 'Lead'}
                </span>
                {u.lockedAt && (
                  <span className="tag border text-xs font-semibold border-rose-200 bg-rose-50 text-rose-700"
                        title={`Locked at ${new Date(u.lockedAt).toLocaleString()} after too many failed sign-ins`}>
                    Locked
                  </span>
                )}
                {isPM && (
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    onClick={() => setEditUser(u)} title="Edit profile">
                    <Pencil size={13} />
                  </button>
                )}
                {isPM && u.lockedAt && (
                  <button
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors border border-rose-200"
                    onClick={() => unlockAccount(u)}
                    disabled={saving === u.id}
                    title="Clear the failed-login counter so this user can sign in again">
                    Unlock
                  </button>
                )}
                {isPM && (
                  <button
                    className="text-xs text-slate-500 hover:text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                    onClick={() => resetPassword(u)}
                    disabled={saving === u.id}
                    title="Generate a temporary password for this lead">
                    Reset password
                  </button>
                )}
                {isPM && me?.id !== u.id && (
                  <button
                    className="text-xs text-slate-500 hover:text-amber-600 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors border border-transparent hover:border-amber-200"
                    onClick={() => setRoleConfirm({ user: u, targetRole: 'employee' })}
                    disabled={saving === u.id}>
                    Remove PM
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* IC section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
          <User size={14} className="text-slate-400" />
          <h2 className="text-sm font-bold text-slate-700">Individual Contributors</h2>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 ml-1">{ics.length}</span>
        </div>
        {ics.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">
            No ICs yet.{isPM && (
              <> <button onClick={() => setShowAdd(true)} className="text-blue-600 font-medium hover:underline">Add the first member.</button></>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {ics.map((u) => (
              <div key={u.id} className="flex items-center gap-3 px-5 py-4">
                <Avatar name={u.name} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-800 text-sm leading-tight">{u.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{u.title || 'Individual Contributor'} · <span className="font-mono">@{u.username || u.email}</span></div>
                </div>
                <span className={`tag border text-xs ${ROLE_COLOR.employee}`}>IC</span>
                {isPM && (
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    onClick={() => setEditUser(u)} title="Edit profile">
                    <Pencil size={13} />
                  </button>
                )}
                {isPM && (
                  <button
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                    onClick={() => setRoleConfirm({ user: u, targetRole: 'pm' })}
                    disabled={saving === u.id}>
                    Promote to PM
                  </button>
                )}
                {isPM && (
                  <button
                    className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    onClick={() => setRemoveConfirm(u)} title="Remove member">
                    <Trash2 size={13} />
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
