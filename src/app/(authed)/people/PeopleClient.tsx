'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { RoleBadge } from '@/components/ui';
import { UserAvatar } from '@/components/AvatarRegistry';
import { ActivityGraph } from '@/components/ActivityGraph';
import { UserPlus, Upload, Copy, Check, X, Shield, User, AlertTriangle, Pencil, Trash2, BarChart3, Search, UserX, RotateCcw } from 'lucide-react';

/* ── Activity peek modal — team leaders click a teammate to see how they're
   tracking: contribution graph, streak and badges (read-only, no private
   project data is exposed). ─────────────────────────────────────────────── */
function ActivityModal({ user, onClose }: { user: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[820px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <UserAvatar userId={user.id} name={user.name} size={44} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 truncate">{user.name}</h3>
              <RoleBadge role={user.role} />
            </div>
            <div className="text-xs text-slate-400 mt-0.5">Performance overview</div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-2 mt-0.5"><X size={18} /></button>
        </div>
        <ActivityGraph userId={user.id} name={user.name} />
      </div>
    </div>
  );
}

/* ── role display helpers ─────────────────────────────────────────────── */
const ROLE_COLOR: Record<string, string> = {
  admin:    'bg-amber-50 text-amber-800 border-amber-200',
  pm:       'bg-blue-50  text-blue-700  border-blue-200',
  employee: 'bg-slate-100 text-slate-600 border-slate-200',
};

/** The login handle we show: the username, or — for legacy accounts that
 *  predate usernames — the part of the email before the "@". Never the
 *  full email. */
function handleOf(u: { username?: string | null; email?: string | null }): string {
  if (u.username) return u.username;
  return (u.email || '').split('@')[0] || '—';
}

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
        body: { name: name.trim() || deriveName(username), username, employeeId },
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

/* ── Bulk import modal ─────────────────────────────────────────────────────
   Paste a roster (one person per line: username, employee ID, name) and
   create contributor accounts in one shot. Built for onboarding a big team
   without adding people one at a time. */
interface ParsedRow { username: string; employeeId: string; name: string; bad?: string; }

function parseRoster(text: string): ParsedRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      // comma- or tab-separated (so a paste straight from Excel works)
      const parts = line.split(/[,\t]/).map((p) => p.trim());
      const username   = (parts[0] || '').toLowerCase();
      const employeeId = parts[1] || '';
      const name       = parts[2] || '';
      let bad: string | undefined;
      if (!/^[a-z][a-z0-9_.]{1,28}[a-z0-9_]$/.test(username)) bad = 'invalid username';
      else if (!employeeId) bad = 'missing employee ID';
      return { username, employeeId, name, bad };
    });
}

function ImportMembersModal({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const [text, setText]     = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState('');
  const [result, setResult] = useState<{ createdCount: number; skippedCount: number; skipped: Array<{ username: string; reason: string }> } | null>(null);

  const rows      = parseRoster(text);
  const validRows = rows.filter((r) => !r.bad);
  const badRows   = rows.filter((r) => r.bad);

  async function submit() {
    if (validRows.length === 0) { setErr('Add at least one valid row.'); return; }
    setErr(''); setSaving(true);
    try {
      const res = await api<{ createdCount: number; skippedCount: number; skipped: any[] }>('/users/bulk', {
        method: 'POST',
        body: { rows: validRows.map((r) => ({ username: r.username, employeeId: r.employeeId, name: r.name || undefined })) },
      });
      setResult(res);
      onDone(res.createdCount);
    } catch (e: any) {
      setErr(e.message || 'Import failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[520px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-base font-bold text-slate-900">Import contributors</div>
            <div className="text-sm text-slate-400 mt-0.5">
              One person per line: <span className="font-mono">username, employee ID, name</span>{' '}
              (name optional). Up to 100 at a time.
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5"><X size={18} /></button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <strong>{result.createdCount}</strong> contributor{result.createdCount === 1 ? '' : 's'} added.
              {result.skippedCount > 0 && <> {result.skippedCount} skipped.</>}
            </div>
            {result.skipped.length > 0 && (
              <div className="text-xs text-slate-500 max-h-40 overflow-auto border border-slate-100 rounded-lg p-3">
                {result.skipped.map((s) => (
                  <div key={s.username}><span className="font-mono">@{s.username}</span> — {s.reason}</div>
                ))}
              </div>
            )}
            <button onClick={onClose} className="btn-primary w-full justify-center">Done</button>
          </div>
        ) : (
          <div className="space-y-3">
            <textarea
              className="textarea text-sm font-mono min-h-[180px]"
              placeholder={'priya.sharma, 100245, Priya Sharma\narjun.mehta, 100312\nneha.r, 100410, Neha Rao'}
              value={text}
              onChange={(e) => { setText(e.target.value); setErr(''); }}
              spellCheck={false}
              autoCapitalize="none"
            />

            {rows.length > 0 && (
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-emerald-600">{validRows.length} ready</span>
                {badRows.length > 0 && <span className="text-rose-600 font-semibold"> · {badRows.length} need fixing</span>}
                {badRows.slice(0, 4).map((r, i) => (
                  <div key={i} className="text-rose-500 mt-0.5">
                    line “{r.username || '(empty)'}” — {r.bad}
                  </div>
                ))}
              </div>
            )}

            {err && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">{err}</div>
            )}

            <button onClick={submit} disabled={saving || validRows.length === 0}
              className="btn-primary w-full justify-center">
              {saving ? 'Importing…' : `Import ${validRows.length || ''} contributor${validRows.length === 1 ? '' : 's'}`}
            </button>
            <p className="text-[11px] text-slate-400 text-center">
              Each gets the standard default password (first name @ employee ID). Nothing is emailed.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Role-change confirmation dialog ──────────────────────────────────── */
function RoleConfirmDialog({ user, targetRole, onConfirm, onCancel, saving }: {
  user: any; targetRole: 'lead' | 'contributor'; onConfirm: () => void; onCancel: () => void; saving: boolean;
}) {
  const promote = targetRole === 'lead';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[380px] modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center ${promote ? 'bg-blue-50' : 'bg-amber-50'}`}>
            {promote ? <Shield size={22} className="text-blue-600" /> : <AlertTriangle size={22} className="text-amber-500" />}
          </div>
          <div>
            <div className="text-base font-black text-slate-900 tracking-tight">
              {promote ? `Promote ${user.name} to Team Lead?` : `Make ${user.name} a Contributor?`}
            </div>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              {promote
                ? 'Team Leads can create and run teams, allocate projects, and assign tasks. Only promote trusted members.'
                : 'They will go back to contributor access — read their team board and update their own tasks. Their work stays intact.'}
            </p>
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={onConfirm} disabled={saving}
              className={`flex-1 justify-center btn ${promote ? 'btn-primary' : ''}`}
              style={!promote ? { background: 'linear-gradient(135deg,#b45309,#d97706)', color: '#fff', boxShadow: '0 1px 3px rgba(180,83,9,0.3)' } : {}}>
              {saving ? '…' : promote ? 'Promote to Lead' : 'Make Contributor'}
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
    name: user.name || '',
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
            <div className="text-sm text-slate-400 mt-0.5 font-mono">@{handleOf(user)}</div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 ml-4 mt-0.5"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Full name</label>
            <input className="input" required value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} />
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

/* ── Deactivate (professional removal with a record) dialog ───────────────
   Unlike a hard delete, deactivation keeps the account and all of the
   person's task history intact (ALCOA+ Attributable & Enduring). A reason
   is required so the audit trail records *why* — 21 CFR Part 11 §11.10(e).
   The account can be reactivated later, which also clears any lock. */
function DeactivateDialog({ user, onConfirm, onCancel, saving }: {
  user: any; onConfirm: (reason: string) => void; onCancel: () => void; saving: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[420px] modal-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
            <UserX size={22} className="text-amber-600" />
          </div>
          <div>
            <div className="text-base font-black text-slate-900 tracking-tight">Deactivate {user.name}?</div>
            <p className="text-sm text-slate-400 mt-2 leading-relaxed">
              They lose access immediately and disappear from assignee lists, but the
              account and all their task history are preserved. You can reactivate it
              later. This is the recommended alternative to permanent removal.
            </p>
          </div>
          <div className="w-full text-left">
            <label className="label">Reason <span className="text-slate-300 font-normal normal-case">(recorded in the audit trail)</span></label>
            <textarea
              className="textarea text-sm"
              rows={2}
              placeholder="e.g. Left the organisation · role transfer · extended leave"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2 w-full">
            <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={() => onConfirm(reason.trim())} disabled={saving || !reason.trim()}
              className="flex-1 justify-center btn text-white"
              style={{ background: 'linear-gradient(135deg,#b45309,#d97706)', boxShadow: '0 1px 3px rgba(180,83,9,0.3)' }}>
              {saving ? 'Deactivating…' : 'Deactivate'}
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
  const [showImport, setShowImport] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [creds, setCreds] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [roleConfirm, setRoleConfirm] = useState<{ user: any; targetRole: 'lead' | 'contributor' } | null>(null);
  const [roleErr, setRoleErr] = useState('');
  const [editUser, setEditUser] = useState<any | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState<any | null>(null);
  const [removing, setRemoving] = useState(false);
  const [activityUser, setActivityUser] = useState<any | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Background refresh after a mutation. The initial render uses the
  // server-provided list (which includes deactivated accounts), so no fetch
  // fires on mount. The refetch must also ask for inactive accounts —
  // /api/users hides them by default so they never leak into assignee lists.
  function load() { api<any[]>('/users?includeInactive=1').then(setUsers).catch(() => {}); }

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

  // Deactivate — professional removal that keeps the record. A reason is
  // captured for the audit trail.
  async function confirmDeactivate(reason: string) {
    if (!deactivateTarget) return;
    setDeactivating(true);
    setRoleErr('');
    try {
      await api(`/users/${deactivateTarget.id}`, {
        method: 'PATCH',
        body: { active: false, deactivationReason: reason },
      });
      setDeactivateTarget(null);
      await load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to deactivate account.');
      setDeactivateTarget(null);
    } finally {
      setDeactivating(false);
    }
  }

  // Reactivate — restores access and clears any brute-force lock in one go.
  async function reactivate(user: any) {
    if (!confirm(`Reactivate ${user.name}'s account?\nThey'll be able to sign in again, and any lock is cleared. They keep their existing password.`)) return;
    setSaving(user.id);
    setRoleErr('');
    try {
      await api(`/users/${user.id}`, { method: 'PATCH', body: { active: true } });
      await load();
    } catch (e: any) {
      setRoleErr(e.message || 'Failed to reactivate account.');
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

  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const matches = (u: any) =>
    !q ||
    (u.name || '').toLowerCase().includes(q) ||
    (u.username || '').toLowerCase().includes(q) ||
    (u.email || '').toLowerCase().includes(q) ||
    (u.employeeId || '').toLowerCase().includes(q);

  // Active accounts drive the Leads/Contributors sections; deactivated
  // accounts move to their own record section at the bottom.
  const liveUsers = users.filter((u) => u.active !== false);
  const pms = liveUsers.filter((u) => (u.role === 'lead' || u.role === 'admin') && matches(u));
  const ics = liveUsers.filter((u) => u.role === 'contributor' && matches(u));
  const deactivated = users.filter((u) => u.active === false && matches(u));
  const isLeadOrAdmin = (me?.role === 'lead' || me?.role === 'admin');

  // Workspace-wide totals (unfiltered) for the summary strip.
  const totalPeople  = liveUsers.length;
  const leadCount    = liveUsers.filter((u) => u.role === 'lead' || u.role === 'admin').length;
  const icCount      = liveUsers.filter((u) => u.role === 'contributor').length;
  const deactivatedCount = users.filter((u) => u.active === false).length;

  return (
    <div className="space-y-6 max-w-3xl">
      {justAdded && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 fade-in-soft">
          <strong>{justAdded}</strong> added. They're now available to assign on your team's tasks.
        </div>
      )}
      {/* Modals */}
      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onCreated={handleCreated} />}
      {showImport && (
        <ImportMembersModal
          onClose={() => setShowImport(false)}
          onDone={(n) => { if (n > 0) { setJustAdded(`${n} contributor${n === 1 ? '' : 's'}`); setTimeout(() => setJustAdded(null), 4000); } load(); }}
        />
      )}
      {creds && <CredentialsModal {...creds} onClose={() => setCreds(null)} />}
      {editUser && <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={load} />}
      {activityUser && <ActivityModal user={activityUser} onClose={() => setActivityUser(null)} />}
      {removeConfirm && (
        <RemoveConfirmDialog
          user={removeConfirm}
          onConfirm={confirmRemove}
          onCancel={() => setRemoveConfirm(null)}
          saving={removing}
        />
      )}
      {deactivateTarget && (
        <DeactivateDialog
          user={deactivateTarget}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivateTarget(null)}
          saving={deactivating}
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
            Workspace user management — add people, promote contributors to leads, reset passwords, and unlock accounts.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowImport(true)} className="btn-secondary gap-2">
            <Upload size={14} /> Import
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary gap-2">
            <UserPlus size={14} /> Add member
          </button>
        </div>
      </div>

      {/* Role info banner */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-blue-700">Roles:</strong>{' '}
            <strong>Contributors</strong> read their team board and update their own tasks.{' '}
            <strong>Team Leads</strong> create teams, allocate projects, and assign tasks.{' '}
            <strong>Admin</strong> (you) manages everyone. Promote and demote anyone below.
          </div>
        </div>
      </div>

      {/* Summary strip — at-a-glance workspace headcount + lock health. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'People',       value: totalPeople, icon: User,   color: 'text-slate-600' },
          { label: 'Leads & admin', value: leadCount,  icon: Shield, color: 'text-blue-600' },
          { label: 'Contributors', value: icCount,     icon: User,   color: 'text-slate-600' },
          { label: 'Deactivated',  value: deactivatedCount, icon: UserX, color: deactivatedCount ? 'text-amber-600' : 'text-slate-400' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-slate-200/80 bg-white px-4 py-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Icon size={12} className={s.color} /> {s.label}
              </div>
              <div className={`mt-1 text-2xl font-black ${s.color}`}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search by name, username or member ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {roleErr && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{roleErr}</div>
      )}

      {/* PM section */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center gap-2">
          <Shield size={14} className="text-blue-500" />
          <h2 className="text-sm font-bold text-slate-700">Team Leads &amp; Admin</h2>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">{pms.length}</span>
        </div>
        {pms.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">{q ? 'No leads match your search.' : 'No leads yet.'}</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {pms.map((u) => (
              <div key={u.id} className="flex items-center flex-wrap gap-x-3 gap-y-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => isLeadOrAdmin && setActivityUser(u)}
                  disabled={!isLeadOrAdmin}
                  className={`flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors ${isLeadOrAdmin ? 'hover:bg-blue-50/60 cursor-pointer' : 'cursor-default'}`}
                  title={isLeadOrAdmin ? `View ${u.name}'s activity` : undefined}>
                  <UserAvatar userId={u.id} name={u.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm leading-tight flex items-center gap-1.5">
                      {u.name}
                      {isLeadOrAdmin && <BarChart3 size={12} className="text-slate-300 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">@{handleOf(u)}</div>
                  </div>
                </button>
                <RoleBadge role={u.role} />
                {u.lockedAt && (
                  <span className="tag border text-xs font-semibold border-rose-200 bg-rose-50 text-rose-700"
                        title={`Locked at ${new Date(u.lockedAt).toLocaleString()} after too many failed sign-ins`}>
                    Locked
                  </span>
                )}
                {isLeadOrAdmin && (
                  <button
                    className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    onClick={() => setEditUser(u)} title="Edit profile">
                    <Pencil size={13} />
                  </button>
                )}
                {isLeadOrAdmin && u.lockedAt && (
                  <button
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors border border-rose-200"
                    onClick={() => unlockAccount(u)}
                    disabled={saving === u.id}
                    title="Clear the failed-login counter so this user can sign in again">
                    Unlock
                  </button>
                )}
                {isLeadOrAdmin && (
                  <button
                    className="text-xs text-slate-500 hover:text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                    onClick={() => resetPassword(u)}
                    disabled={saving === u.id}
                    title="Generate a temporary password for this lead">
                    Reset password
                  </button>
                )}
                {/* Demote a lead to contributor. Never offered for the
                   admin row or the admin's own row. */}
                {me?.id !== u.id && u.role !== 'admin' && (
                  <button
                    className="text-xs text-slate-500 hover:text-amber-600 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors border border-transparent hover:border-amber-200"
                    onClick={() => setRoleConfirm({ user: u, targetRole: 'contributor' })}
                    disabled={saving === u.id}>
                    Make contributor
                  </button>
                )}
                {me?.id !== u.id && u.role !== 'admin' && (
                  <button
                    className="p-1.5 rounded-lg text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                    onClick={() => setDeactivateTarget(u)}
                    disabled={saving === u.id}
                    title="Deactivate account (keeps the record)">
                    <UserX size={14} />
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
          <h2 className="text-sm font-bold text-slate-700">Contributors</h2>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 ml-1">{ics.length}</span>
        </div>
        {ics.length === 0 ? (
          <div className="px-5 py-5 text-sm text-slate-400">
            {q ? 'No contributors match your search.' : (
              <>
                No contributors yet.{' '}
                <button onClick={() => setShowAdd(true)} className="text-blue-600 font-medium hover:underline">Add the first member.</button>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {ics.map((u) => (
              <div key={u.id} className="flex items-center flex-wrap gap-x-3 gap-y-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => isLeadOrAdmin && setActivityUser(u)}
                  disabled={!isLeadOrAdmin}
                  className={`flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors ${isLeadOrAdmin ? 'hover:bg-blue-50/60 cursor-pointer' : 'cursor-default'}`}
                  title={isLeadOrAdmin ? `View ${u.name}'s activity` : undefined}>
                  <UserAvatar userId={u.id} name={u.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800 text-sm leading-tight flex items-center gap-1.5">
                      {u.name}
                      {isLeadOrAdmin && <BarChart3 size={12} className="text-slate-300 shrink-0" />}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">@{handleOf(u)}</div>
                  </div>
                </button>
                <RoleBadge role={u.role} />
                {u.lockedAt && (
                  <span className="tag border text-xs font-semibold border-rose-200 bg-rose-50 text-rose-700"
                        title={`Locked at ${new Date(u.lockedAt).toLocaleString()} after too many failed sign-ins`}>
                    Locked
                  </span>
                )}
                <button
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  onClick={() => setEditUser(u)} title="Edit profile">
                  <Pencil size={13} />
                </button>
                {u.lockedAt && (
                  <button
                    className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-rose-50 transition-colors border border-rose-200"
                    onClick={() => unlockAccount(u)}
                    disabled={saving === u.id}
                    title="Clear the failed-login counter so this user can sign in again">
                    Unlock
                  </button>
                )}
                <button
                  className="text-xs text-slate-500 hover:text-blue-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                  onClick={() => resetPassword(u)}
                  disabled={saving === u.id}
                  title="Generate a temporary password">
                  Reset password
                </button>
                <button
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition-colors border border-transparent hover:border-blue-200"
                  onClick={() => setRoleConfirm({ user: u, targetRole: 'lead' })}
                  disabled={saving === u.id}>
                  Promote to Lead
                </button>
                <button
                  className="p-1.5 rounded-lg text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  onClick={() => setDeactivateTarget(u)}
                  disabled={saving === u.id}
                  title="Deactivate account (keeps the record)">
                  <UserX size={14} />
                </button>
                <button
                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  onClick={() => setRemoveConfirm(u)} title="Permanently remove (deletes the record)">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deactivated record — kept on purpose. A deactivated person can't
         sign in and is gone from every assignee list, but the account and
         their task history remain attributable. Reactivating restores
         access and clears any lock. */}
      {deactivated.length > 0 && (
        <div className="card overflow-hidden border-amber-200/70">
          <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50/50 flex items-center gap-2">
            <UserX size={14} className="text-amber-500" />
            <h2 className="text-sm font-bold text-slate-700">Deactivated accounts</h2>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 ml-1">{deactivated.length}</span>
            <span className="ml-auto text-[11px] text-slate-400">Record retained · can be reactivated</span>
          </div>
          <div className="divide-y divide-slate-50">
            {deactivated.map((u) => (
              <div key={u.id} className="flex items-center flex-wrap gap-x-3 gap-y-2 px-5 py-4">
                <button
                  type="button"
                  onClick={() => isLeadOrAdmin && setActivityUser(u)}
                  disabled={!isLeadOrAdmin}
                  className={`flex items-center gap-3 flex-1 min-w-0 text-left rounded-lg -m-1 p-1 transition-colors ${isLeadOrAdmin ? 'hover:bg-amber-50/60 cursor-pointer' : 'cursor-default'}`}
                  title={isLeadOrAdmin ? `View ${u.name}'s activity` : undefined}>
                  <span className="opacity-60"><UserAvatar userId={u.id} name={u.name} size={36} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-700 text-sm leading-tight truncate">{u.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono">@{handleOf(u)}</span>
                      {u.deactivatedAt && <span>· off {new Date(u.deactivatedAt).toLocaleDateString()}</span>}
                      {u.deactivatedBy && <span>· by {u.deactivatedBy}</span>}
                    </div>
                    {u.deactivationReason && (
                      <div className="text-[11px] text-amber-700/80 mt-0.5 italic truncate" title={u.deactivationReason}>
                        “{u.deactivationReason}”
                      </div>
                    )}
                  </div>
                </button>
                <span className="tag border text-xs font-semibold border-amber-200 bg-amber-50 text-amber-700">Deactivated</span>
                <button
                  className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors border border-emerald-200 inline-flex items-center gap-1.5"
                  onClick={() => reactivate(u)}
                  disabled={saving === u.id}
                  title="Restore access and clear any lock">
                  <RotateCcw size={12} /> Reactivate
                </button>
                <button
                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  onClick={() => setRemoveConfirm(u)} title="Permanently remove (deletes the record)">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
