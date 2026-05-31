'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Avatar } from '@/components/ui';
import { Pencil, Plus, Users as UsersIcon, X, Check, Search, Trash2, AlertTriangle, ArrowRight } from 'lucide-react';

interface TeamItem {
  id: string;
  name: string;
  description?: string;
  leadId?: string;
  function: string;
  memberIds: string[];
  memberCount: number;
  projectCount: number;
}

interface UserItem {
  id: string;
  name: string;
  role: string;
  title?: string;
}

const FUNCTION_LABEL: Record<string, string> = {
  rtb: 'Run the Business',
  ctb: 'Change the Business',
  general: 'General',
  csv_validation: 'CSV / Validation',
  data_integrity: 'Data Integrity',
  pharmacovigilance: 'Pharmacovigilance',
  lab_informatics: 'Lab Informatics',
  audit: 'Audit',
  training: 'Training',
};

const FUNCTION_TONE: Record<string, { bg: string; text: string; border: string }> = {
  rtb:               { bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200'    },
  ctb:               { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  general:           { bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200'   },
  csv_validation:    { bg: 'bg-brand-50',   text: 'text-brand-700',   border: 'border-brand-200'   },
  data_integrity:    { bg: 'bg-purple-50',  text: 'text-purple-700',  border: 'border-purple-200'  },
  pharmacovigilance: { bg: 'bg-pink-50',    text: 'text-pink-700',    border: 'border-pink-200'    },
  lab_informatics:   { bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200'    },
  audit:             { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  training:          { bg: 'bg-forest-50',  text: 'text-forest-700',  border: 'border-forest-200'  },
};

export default function TeamsClient({
  initialTeams,
  initialUsers,
  me,
}: {
  initialTeams: TeamItem[];
  initialUsers: UserItem[];
  me: { id: string; name: string; role: string } | null;
}) {
  const [teams, setTeams]     = useState<TeamItem[]>(initialTeams);
  const [users]               = useState<UserItem[]>(initialUsers);
  const [query, setQuery]     = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TeamItem | null>(null);
  const [deleting, setDeleting] = useState<TeamItem | null>(null);

  function load() {
    api<TeamItem[]>('/teams').then(setTeams).catch(() => {});
  }

  const canManage = (me?.role === 'lead' || me?.role === 'admin');
  const uMap = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const filtered = teams.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      FUNCTION_LABEL[t.function]?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Teams</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Cross-functional groups — people, projects, and shared accountability.
          </p>
        </div>
        {canManage && (
          <button className="btn-primary flex items-center gap-1.5" onClick={() => setCreating(true)}>
            <Plus size={14} /> New team
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
        <input
          className="input pl-9"
          placeholder="Search teams…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <UsersIcon size={20} className="text-slate-400" />
          </div>
          <div className="text-sm font-semibold text-slate-700">
            {teams.length === 0 ? 'No teams yet' : 'No teams match your search'}
          </div>
          {teams.length === 0 && canManage && (
            <button className="btn-primary mt-3" onClick={() => setCreating(true)}>+ Create your first team</button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <TeamCard
              key={t.id}
              team={t}
              lead={t.leadId ? uMap.get(t.leadId) : undefined}
              members={(t.memberIds || []).map((id) => uMap.get(id)).filter(Boolean) as UserItem[]}
              canManage={me?.role === 'admin' || (!!t.leadId && t.leadId === me?.id)}
              onEdit={() => setEditing(t)}
              onDelete={() => setDeleting(t)}
            />
          ))}
        </div>
      )}

      {creating && (
        <TeamFormModal
          mode="create"
          users={users}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
      {editing && (
        <TeamFormModal
          mode="edit"
          team={editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {deleting && (
        <DeleteTeamModal
          team={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); load(); }}
        />
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Team card — name, function tag, lead avatar, member stack, counts, edit.
   ────────────────────────────────────────────────────────────────────────── */
function TeamCard({
  team, lead, members, canManage, onEdit, onDelete,
}: {
  team: TeamItem;
  lead?: UserItem;
  members: UserItem[];
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tone = FUNCTION_TONE[team.function] || FUNCTION_TONE.general;
  const visibleMembers = members.slice(0, 4);
  const extra = Math.max(0, members.length - visibleMembers.length);

  return (
    <div className="card p-4 group hover:shadow-md transition-shadow flex flex-col">
      <div className="flex items-start gap-3">
        <Avatar name={team.name} size={40} />
        <div className="flex-1 min-w-0">
          <Link href={`/teams/${team.id}`} className="font-semibold text-slate-900 hover:text-brand-700 hover:underline truncate block">
            {team.name}
          </Link>
          <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${tone.bg} ${tone.text} ${tone.border}`}>
            {FUNCTION_LABEL[team.function] || team.function}
          </span>
        </div>
        {canManage && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
              aria-label="Edit team"
              title="Edit team"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              aria-label="Delete team"
              title="Delete team"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>

      {team.description && (
        <p className="mt-3 text-sm text-slate-600 line-clamp-2">{team.description}</p>
      )}

      <div className="mt-3 text-[11px] text-slate-400">
        <span className="font-semibold uppercase tracking-wider text-slate-400">Team leader · </span>
        <span className="text-slate-600 font-medium">{lead?.name || 'Unassigned'}</span>
      </div>

      <div className="mt-3 flex items-center -space-x-1.5">
        {visibleMembers.length === 0 ? (
          <span className="text-[11px] text-slate-400 italic">No members yet</span>
        ) : (
          visibleMembers.map((m) => (
            <div key={m.id} className="ring-2 ring-white rounded-full" title={m.name}>
              <Avatar name={m.name} size={26} />
            </div>
          ))
        )}
        {extra > 0 && (
          <div className="w-[26px] h-[26px] rounded-full ring-2 ring-white bg-slate-100 text-[10px] font-bold text-slate-500 flex items-center justify-center">
            +{extra}
          </div>
        )}
      </div>

      <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex gap-3">
          <span><strong className="text-slate-700">{team.memberCount}</strong> members</span>
          <span><strong className="text-slate-700">{team.projectCount}</strong> projects</span>
        </div>
        <Link
          href={`/teams/${team.id}`}
          className="group/cta inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #1565C0 0%, #2b8c47 100%)', boxShadow: '0 2px 8px rgba(21,101,192,0.28)' }}
        >
          Open team
          <ArrowRight size={13} className="transition-transform group-hover/cta:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Create / Edit modal — same form for both flows.
   ────────────────────────────────────────────────────────────────────────── */
function TeamFormModal({
  mode, team, users, onClose, onSaved,
}: {
  mode: 'create' | 'edit';
  team?: TeamItem;
  users: UserItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName]               = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [func, setFunc]               = useState<string>(team?.function || 'general');
  const [leadId, setLeadId]           = useState(team?.leadId || '');
  const [memberIds, setMemberIds]     = useState<string[]>(team?.memberIds || []);
  const [memberQuery, setMemberQuery] = useState('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const filteredUsers = users.filter((u) => {
    if (u.role === 'admin') return false;
    if (!memberQuery.trim()) return true;
    const q = memberQuery.toLowerCase();
    return u.name.toLowerCase().includes(q);
  });

  function toggleMember(id: string) {
    setMemberIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  async function save() {
    if (!name.trim()) { setError('Team name is required'); return; }
    setSaving(true);
    setError('');
    try {
      if (mode === 'create') {
        await api('/teams', {
          method: 'POST',
          body: {
            name: name.trim(),
            description: description || undefined,
            leadId: leadId || undefined,
            memberIds: memberIds.length ? memberIds : undefined,
            function: func,
          },
        });
      } else if (team) {
        await api(`/teams/${team.id}`, {
          method: 'PATCH',
          body: {
            name: name.trim(),
            description,
            leadId: leadId || null,
            memberIds,
            function: func,
          },
        });
      }
      onSaved();
    } catch (e: any) {
      setError(e?.message || 'Could not save team');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 overlay-in" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-xl modal-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-5 py-5 text-white overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0f4fb8 0%, #1769c8 45%, #2b8c47 100%)' }}>
          <div aria-hidden className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }} />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                <UsersIcon size={18} />
              </div>
              <div>
                <h2 className="text-lg font-black leading-tight">
                  {mode === 'create' ? 'Create a team' : 'Edit team'}
                </h2>
                <p className="text-xs text-white/70 mt-0.5">
                  {mode === 'create' ? 'Name it, pick a function, add your people.' : 'Update team details and membership.'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Team name <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              placeholder="e.g. CSV Validation Squad"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={120}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Description
            </label>
            <textarea
              className="input"
              rows={2}
              placeholder="What does this team focus on?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Function
              </label>
              <select className="select" value={func} onChange={(e) => setFunc(e.target.value)}>
                <option value="general">General</option>
                <option value="ctb">Change the Business</option>
                <option value="rtb">Run the Business</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Team owner
              </label>
              <select className="select" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                <option value="">— No owner —</option>
                {users
                  .filter((u) => u.role === 'lead')
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Members <span className="text-slate-400 normal-case font-normal">({memberIds.length} selected)</span>
              </label>
              {memberIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMemberIds([])}
                  className="text-[11px] text-slate-400 hover:text-slate-600"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="relative mb-2">
              <Search size={13} className="absolute top-1/2 -translate-y-1/2 left-3 text-slate-400" />
              <input
                className="input pl-9 text-sm"
                placeholder="Search people…"
                value={memberQuery}
                onChange={(e) => setMemberQuery(e.target.value)}
              />
            </div>
            <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">No people match.</div>
              ) : (
                filteredUsers.map((u) => {
                  if (u.id === leadId) return null;
                  const selected = memberIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleMember(u.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                        selected ? 'bg-brand-50/60 hover:bg-brand-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <Avatar name={u.name} size={26} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {u.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {u.role === 'lead' ? 'Team Lead' : u.role === 'admin' ? 'Admin' : 'Individual Contributor'}
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-colors ${
                        selected ? 'bg-brand-600 text-white' : 'border border-slate-300'
                      }`}>
                        {selected && <Check size={12} />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {leadId && !memberIds.includes(leadId) && (
              <p className="text-[11px] text-slate-400 mt-1.5">
                The owner is automatically added as a team member when you save.
              </p>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create team' : 'Save changes'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Delete confirmation — password re-entry (21 CFR 11 audit intent).
   ────────────────────────────────────────────────────────────────────────── */
function DeleteTeamModal({
  team, onClose, onDeleted,
}: {
  team: TeamItem;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function confirm() {
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/teams/${team.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) {
        setError('Incorrect password — try again.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || 'Could not delete team.');
        return;
      }
      onDeleted();
    } catch (e: any) {
      setError(e?.message || 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-slate-900">Delete team?</h2>
            <p className="text-sm text-slate-500 mt-1 leading-snug">
              <span className="font-semibold text-slate-700">{team.name}</span> will be permanently removed.
              Any projects linked to this team will be detached but their tasks and history will be kept intact.
            </p>
          </div>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Confirm with your password
            </label>
            <input
              ref={inputRef}
              type="password"
              className="input"
              placeholder="Your account password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost" disabled={busy}>Cancel</button>
          <button
            onClick={confirm}
            disabled={busy || !password}
            className="px-3 py-1.5 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
