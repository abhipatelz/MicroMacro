'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import {
  Users, FolderKanban, Shield, BarChart3, Lock, AlertTriangle,
  Trash2, UserCheck, Activity, Clock, Check, RefreshCw,
  Search, ChevronRight, Mail, UserX, Layers, ScrollText,
  Eye, KeyRound, MoreHorizontal, ArrowUpDown, X,
} from 'lucide-react';

/* ── helpers ─────────────────────────────────────────────────────────── */
function reltime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CAT_COLOR: Record<string, string> = {
  auth:    'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300',
  user:    'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  project: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  task:    'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  team:    'bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300',
  general: 'bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-white/50',
};

const ROLE_BADGE: Record<string, string> = {
  admin:       'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-500/20',
  lead:        'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20',
  contributor: 'bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/20',
  pm:          'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/20',
  employee:    'bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-500/20',
};

const STATUS_BADGE: Record<string, string> = {
  planning:    'bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-white/50',
  in_progress: 'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  on_hold:     'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  completed:   'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  cancelled:   'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300',
};

/* ── types ───────────────────────────────────────────────────────────── */
interface Stats {
  totalActive: number;
  leadCount: number;
  contributorCount: number;
  lockedCount: number;
  pendingInvites: number;
  deactivatedCount: number;
  totalProjects: number;
  totalTasks: number;
  recentFailedLogins: number;
}

interface FullUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  locked: boolean;
  lockedAt: string | null;
  createdAt: string | null;
  mustChangePassword: boolean;
}

interface ProjectRow {
  id: string;
  name: string;
  code: string;
  status: string;
  priority: string;
  ownerId: string | null;
  createdAt: string;
}

interface TeamRow {
  id: string;
  name: string;
  memberCount: number;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  action: string;
  category: string;
  actorName: string;
  targetLabel: string;
  summary: string;
  createdAt: string;
}

type Tab = 'overview' | 'people' | 'projects' | 'teams' | 'security';

/* ── card wrapper ────────────────────────────────────────────────────── */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-[#1e1e1c] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] p-6 ${className}`}>
      {children}
    </div>
  );
}

/* ── small inline toast ──────────────────────────────────────────────── */
function InlineMsg({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${ok ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10'}`}>
      {ok ? <Check size={10} strokeWidth={3} /> : <AlertTriangle size={10} />}
      {msg}
    </span>
  );
}

/* ── Delete Project Modal ─────────────────────────────────────────────── */
function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectRow;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const valid =
    code.trim().toUpperCase() === project.code.toUpperCase() &&
    reason.trim().length >= 20 &&
    password.length >= 1;

  async function handleDelete() {
    if (!valid) return;
    setLoading(true);
    setError('');
    try {
      await api('/admin/delete-project', {
        method: 'DELETE',
        body: JSON.stringify({ code: code.trim(), reason: reason.trim(), password }),
      });
      onDeleted(project.id);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Delete failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#1a1a18] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/[0.06] flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
              <Trash2 size={18} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white/90">Delete Project</h2>
              <p className="text-[11px] text-slate-500 dark:text-white/35 mt-0.5 font-mono">{project.code}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 dark:text-white/30 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Warning */}
        <div className="mx-6 mt-5 flex items-start gap-2.5 rounded-xl bg-red-50 dark:bg-red-500/[0.08] border border-red-100 dark:border-red-500/15 px-4 py-3">
          <AlertTriangle size={14} className="text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-red-700 dark:text-red-300 leading-relaxed">
            This action cannot be undone. All tasks in <span className="font-bold">{project.name}</span> will be permanently deleted.
          </p>
        </div>

        {/* Form */}
        <div className="px-6 pt-5 pb-6 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
              Project Reference Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`Type "${project.code}" to confirm`}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] text-sm font-mono text-slate-900 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:border-red-400 dark:focus:border-red-500/50 focus:ring-1 focus:ring-red-400/20 dark:focus:ring-red-500/10 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
              Reason for deletion <span className="normal-case font-normal">(min. 20 chars)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why this project is being deleted..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:border-red-400 dark:focus:border-red-500/50 focus:ring-1 focus:ring-red-400/20 dark:focus:ring-red-500/10 transition-colors resize-none"
            />
            <div className={`text-[10px] mt-1 ${reason.trim().length >= 20 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-white/25'}`}>
              {reason.trim().length}/20 minimum characters
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40 mb-1.5">
              Your admin password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Confirm with your password"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/20 focus:outline-none focus:border-red-400 dark:focus:border-red-500/50 focus:ring-1 focus:ring-red-400/20 dark:focus:ring-red-500/10 transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-500/[0.08] border border-red-100 dark:border-red-500/15 px-3 py-2">
              <AlertTriangle size={12} className="text-red-600 dark:text-red-400 shrink-0" />
              <span className="text-[12px] text-red-700 dark:text-red-300">{error}</span>
            </div>
          )}

          <button
            onClick={handleDelete}
            disabled={!valid || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Permanently Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Reset Password Result Modal ────────────────────────────────────── */
function TempPasswordModal({ name, tempPassword, onClose }: { name: string; tempPassword: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(tempPassword).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm bg-white dark:bg-[#1a1a18] rounded-2xl border border-slate-200 dark:border-white/[0.08] shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center">
            <KeyRound size={18} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white/90">Temporary password</h2>
            <p className="text-[11px] text-slate-500 dark:text-white/35">Share this with {name} securely</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.07] px-4 py-3">
          <code className="flex-1 text-sm font-mono text-slate-800 dark:text-white/80 select-all">{tempPassword}</code>
          <button onClick={copy} className="shrink-0 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-white/35 leading-relaxed">
          They'll be required to set a new password on next login. This temporary password is shown once only.
        </p>
        <button onClick={onClose} className="w-full py-2 rounded-xl bg-slate-100 dark:bg-white/[0.06] text-sm font-bold text-slate-700 dark:text-white/70 hover:bg-slate-200 dark:hover:bg-white/[0.1] transition-colors">
          Done
        </button>
      </div>
    </div>
  );
}

/* ── Overview Tab ─────────────────────────────────────────────────────── */
function OverviewTab({
  stats,
  recentActivity,
  lockedUsers,
  mustChangePwUsers,
}: {
  stats: Stats;
  recentActivity: ActivityRow[];
  lockedUsers: FullUser[];
  mustChangePwUsers: FullUser[];
}) {
  const statCards = [
    { label: 'Total users', value: stats.totalActive, icon: Users, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-100 dark:border-blue-500/20' },
    { label: 'Team leads', value: stats.leadCount, icon: Shield, color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-50 dark:bg-indigo-500/10', border: 'border-indigo-100 dark:border-indigo-500/20' },
    { label: 'Contributors', value: stats.contributorCount, icon: Users, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-500/10', border: 'border-teal-100 dark:border-teal-500/20' },
    { label: 'Active projects', value: stats.totalProjects, icon: FolderKanban, color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-500/10', border: 'border-violet-100 dark:border-violet-500/20' },
    { label: 'Total tasks', value: stats.totalTasks, icon: BarChart3, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-500/10', border: 'border-cyan-100 dark:border-cyan-500/20' },
    { label: 'Open invites', value: stats.pendingInvites, icon: Mail, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-100 dark:border-amber-500/20' },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`rounded-xl border p-4 flex flex-col gap-2 ${card.bg} ${card.border}`}>
              <div className={`w-8 h-8 rounded-lg ${card.bg} border ${card.border} flex items-center justify-center`}>
                <Icon size={16} className={card.color} />
              </div>
              <div>
                <div className={`text-2xl font-black leading-none tabular-nums ${card.color}`}>{card.value}</div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-white/35 mt-0.5">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Platform health */}
      <Card>
        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30 mb-4">Platform health</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: 'Locked accounts',
              value: stats.lockedCount,
              icon: Lock,
              ok: stats.lockedCount === 0,
              okMsg: 'None locked',
              badMsg: `${stats.lockedCount} locked`,
            },
            {
              label: 'Failed logins (24h)',
              value: stats.recentFailedLogins,
              icon: AlertTriangle,
              ok: stats.recentFailedLogins <= 5,
              okMsg: `${stats.recentFailedLogins} attempts`,
              badMsg: `${stats.recentFailedLogins} attempts`,
              warnThreshold: 5,
            },
            {
              label: 'Pending password setup',
              value: mustChangePwUsers.length,
              icon: KeyRound,
              ok: mustChangePwUsers.length === 0,
              okMsg: 'All up to date',
              badMsg: `${mustChangePwUsers.length} pending`,
            },
          ].map((item) => {
            const Icon = item.icon;
            const isOk = item.ok;
            const isWarn = !isOk && (item as any).warnThreshold !== undefined;
            const colorClass = isOk
              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-500/20'
              : isWarn
              ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-100 dark:border-amber-500/20'
              : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-100 dark:border-red-500/20';
            return (
              <div key={item.label} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${colorClass}`}>
                <Icon size={16} className="shrink-0" />
                <div>
                  <div className="text-xs font-bold">{isOk ? item.okMsg : item.badMsg}</div>
                  <div className="text-[11px] opacity-70 mt-0.5">{item.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Recent activity */}
      {recentActivity.length > 0 && (
        <Card className="!p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.05] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-slate-400 dark:text-white/30" />
              <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
                Recent activity
              </h2>
            </div>
            <Link href="/audit" className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 transition-colors">
              View all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
            {recentActivity.map((row) => (
              <div key={row.id} className="flex items-start gap-3 px-6 py-3 hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                <div className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${CAT_COLOR[row.category] || CAT_COLOR.general}`}>
                  {row.category}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-slate-700 dark:text-white/75 leading-snug truncate">
                    {row.summary || `${row.actorName} · ${row.action}`}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400 dark:text-white/25 font-medium truncate">{row.actorName}</span>
                    {row.targetLabel && <span className="text-[11px] text-slate-300 dark:text-white/15 truncate">→ {row.targetLabel}</span>}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[11px] text-slate-400 dark:text-white/25 mt-0.5">
                  <Clock size={10} />
                  {reltime(row.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stats.lockedCount === 0 && mustChangePwUsers.length === 0 && stats.recentFailedLogins <= 5 && (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/15 bg-emerald-50/60 dark:bg-emerald-500/[0.07] px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Check size={16} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">All systems healthy</div>
            <div className="text-[11px] text-emerald-700/70 dark:text-emerald-400/60 mt-0.5">No locked accounts or pending password changes.</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── People Tab ───────────────────────────────────────────────────────── */
function PeopleTab({ users: initialUsers }: { users: FullUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [search, setSearch] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [tempPw, setTempPw] = useState<{ name: string; tempPassword: string } | null>(null);
  const [roleLoading, setRoleLoading] = useState<string | null>(null);

  function setMsg(id: string, text: string, ok: boolean) {
    setMsgs((m) => ({ ...m, [id]: { text, ok } }));
    setTimeout(() => setMsgs((m) => { const n = { ...m }; delete n[id]; return n; }), 4000);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  async function unlockUser(u: FullUser) {
    setLoadingId(u.id);
    try {
      await api(`/users/${u.id}/unlock`, { method: 'POST' });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, locked: false, lockedAt: null } : x));
      setMsg(u.id, 'Unlocked', true);
    } catch (e: any) {
      setMsg(u.id, e.message || 'Failed', false);
    } finally {
      setLoadingId(null);
    }
  }

  async function resetPassword(u: FullUser) {
    setLoadingId(u.id + ':reset');
    try {
      const res = await api(`/users/${u.id}/reset-password`, { method: 'POST' });
      setTempPw({ name: u.name, tempPassword: (res as any).tempPassword });
      setMsg(u.id, 'Password reset', true);
    } catch (e: any) {
      setMsg(u.id, e.message || 'Failed', false);
    } finally {
      setLoadingId(null);
    }
  }

  async function changeRole(u: FullUser, newRole: 'contributor' | 'lead') {
    setRoleLoading(u.id);
    try {
      await api(`/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, role: newRole } : x));
      setMsg(u.id, `Role → ${newRole}`, true);
    } catch (e: any) {
      setMsg(u.id, e.message || 'Role change failed', false);
    } finally {
      setRoleLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {tempPw && (
        <TempPasswordModal
          name={tempPw.name}
          tempPassword={tempPw.tempPassword}
          onClose={() => setTempPw(null)}
        />
      )}

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/25 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or role..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/25 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-400/20 transition-colors"
        />
      </div>

      {/* Table */}
      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                {['Name', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/25">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.035]">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors group">
                  {/* Name */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-black text-slate-600 dark:text-white/50">
                          {(u.name || u.username || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-800 dark:text-white/85 truncate">{u.name}</div>
                        <div className="text-[11px] text-slate-400 dark:text-white/30 font-mono truncate">
                          {u.username ? `@${u.username}` : u.email}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-5 py-3.5">
                    {u.role === 'admin' ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide ${ROLE_BADGE.admin}`}>
                        Admin
                      </span>
                    ) : (
                      <select
                        value={u.role === 'pm' ? 'lead' : u.role === 'employee' ? 'contributor' : u.role}
                        disabled={roleLoading === u.id}
                        onChange={(e) => changeRole(u, e.target.value as 'contributor' | 'lead')}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-black uppercase tracking-wide cursor-pointer bg-transparent focus:outline-none ${ROLE_BADGE[u.role] || ROLE_BADGE.contributor}`}
                      >
                        <option value="contributor">Contributor</option>
                        <option value="lead">Lead</option>
                      </select>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${u.locked ? 'bg-red-500' : 'bg-emerald-500'}`} />
                      <span className="text-[12px] text-slate-600 dark:text-white/50">
                        {u.locked ? 'Locked' : 'Active'}
                      </span>
                      {u.mustChangePassword && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/20 font-semibold">
                          pw reset
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Joined */}
                  <td className="px-5 py-3.5 text-[12px] text-slate-500 dark:text-white/35">
                    {fmtDate(u.createdAt)}
                  </td>

                  {/* Actions */}
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {msgs[u.id] ? (
                        <InlineMsg msg={msgs[u.id].text} ok={msgs[u.id].ok} />
                      ) : (
                        <>
                          {u.locked && u.role !== 'admin' && (
                            <button
                              onClick={() => unlockUser(u)}
                              disabled={loadingId === u.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
                            >
                              {loadingId === u.id ? <RefreshCw size={10} className="animate-spin" /> : <UserCheck size={10} />}
                              Unlock
                            </button>
                          )}
                          {u.role !== 'admin' && (
                            <button
                              onClick={() => resetPassword(u)}
                              disabled={loadingId === u.id + ':reset'}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[11px] font-bold hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                            >
                              {loadingId === u.id + ':reset' ? <RefreshCw size={10} className="animate-spin" /> : <KeyRound size={10} />}
                              Reset pw
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-white/25">
                    No users match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Projects Tab ─────────────────────────────────────────────────────── */
function ProjectsTab({ projects: initialProjects }: { projects: ProjectRow[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.status.toLowerCase().includes(q)
    );
  }, [projects, search]);

  return (
    <div className="space-y-4">
      {deleteTarget && (
        <DeleteProjectModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(id) => setProjects((prev) => prev.filter((p) => p.id !== id))}
        />
      )}

      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/25 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects..."
          className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-sm text-slate-900 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/25 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500/50 focus:ring-1 focus:ring-blue-400/20 transition-colors"
        />
      </div>

      <Card className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-white/[0.05]">
                {['Project', 'Code', 'Status', 'Created', 'Delete'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/25">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/[0.035]">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-slate-800 dark:text-white/85">{p.name}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-[11px] font-mono text-slate-500 dark:text-white/40 bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
                      {p.code}
                    </code>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[p.status] || STATUS_BADGE.planning}`}>
                      {p.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-slate-500 dark:text-white/35">
                    {fmtDate(p.createdAt)}
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 dark:text-white/25 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-white/25">
                    No projects match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Teams Tab ─────────────────────────────────────────────────────────── */
function TeamsTab({ teams }: { teams: TeamRow[] }) {
  return (
    <Card className="!p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-white/[0.05]">
              {['Team name', 'Members', 'Created', ''].map((h, i) => (
                <th key={i} className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-white/25">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-white/[0.035]">
            {teams.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center shrink-0">
                      <Users size={14} className="text-teal-600 dark:text-teal-400" />
                    </div>
                    <div className="font-semibold text-slate-800 dark:text-white/85">{t.name}</div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="text-[12px] text-slate-600 dark:text-white/50">
                    {t.memberCount} {t.memberCount === 1 ? 'member' : 'members'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[12px] text-slate-500 dark:text-white/35">
                  {fmtDate(t.createdAt)}
                </td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/teams/${t.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/[0.07] text-[11px] font-semibold text-slate-600 dark:text-white/50 hover:border-slate-300 dark:hover:border-white/12 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                  >
                    <Eye size={11} /> View
                  </Link>
                </td>
              </tr>
            ))}
            {teams.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-sm text-slate-400 dark:text-white/25">
                  No teams found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ── Security Tab ─────────────────────────────────────────────────────── */
function SecurityTab({
  lockedUsers: initialLocked,
  mustChangePwUsers,
  recentFailedLogins,
}: {
  lockedUsers: FullUser[];
  mustChangePwUsers: FullUser[];
  recentFailedLogins: number;
}) {
  const [lockedUsers, setLockedUsers] = useState(initialLocked);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, { text: string; ok: boolean }>>({});
  const [unlockedSet, setUnlockedSet] = useState<Set<string>>(new Set());

  function setMsg(id: string, text: string, ok: boolean) {
    setMsgs((m) => ({ ...m, [id]: { text, ok } }));
    setTimeout(() => setMsgs((m) => { const n = { ...m }; delete n[id]; return n; }), 4000);
  }

  async function unlockUser(u: FullUser) {
    setLoadingId(u.id);
    try {
      await api(`/users/${u.id}/unlock`, { method: 'POST' });
      setUnlockedSet((s) => new Set([...s, u.id]));
      setMsg(u.id, 'Account unlocked', true);
    } catch (e: any) {
      setMsg(u.id, e.message || 'Failed', false);
    } finally {
      setLoadingId(null);
    }
  }

  const stillLocked = lockedUsers.filter((u) => !unlockedSet.has(u.id));

  return (
    <div className="space-y-6">
      {/* Failed logins */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className={recentFailedLogins > 5 ? 'text-amber-500' : 'text-slate-400 dark:text-white/30'} />
            <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30">
              Failed login attempts
            </h3>
          </div>
          <span className={`text-2xl font-black tabular-nums ${recentFailedLogins > 5 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-white/50'}`}>
            {recentFailedLogins}
          </span>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-white/35">
          Failed sign-in attempts in the last 24 hours.
          {recentFailedLogins > 5 && ' This is above normal — review the audit log for details.'}
        </p>
        <Link href="/audit" className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors">
          <ScrollText size={12} /> View full audit log <ChevronRight size={11} />
        </Link>
      </Card>

      {/* Locked accounts */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30 mb-3 flex items-center gap-2">
          <Lock size={12} className={stillLocked.length > 0 ? 'text-red-500' : 'text-slate-400 dark:text-white/30'} />
          Locked accounts ({stillLocked.length})
        </h3>

        {stillLocked.length === 0 ? (
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/15 bg-emerald-50/60 dark:bg-emerald-500/[0.07] px-5 py-4 flex items-center gap-3">
            <Check size={15} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">No locked accounts</span>
          </div>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {stillLocked.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors">
                  <div className="w-9 h-9 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-red-700 dark:text-red-300">
                      {(u.name || u.username || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-white/85">{u.name}</div>
                    <div className="text-[11px] text-slate-400 dark:text-white/30 font-mono">
                      @{u.username || u.email.split('@')[0]}
                      {u.lockedAt && <span className="font-sans ml-2">· locked {reltime(u.lockedAt)}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {msgs[u.id] ? (
                      <InlineMsg msg={msgs[u.id].text} ok={msgs[u.id].ok} />
                    ) : (
                      <button
                        onClick={() => unlockUser(u)}
                        disabled={loadingId === u.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 text-[11px] font-bold hover:bg-red-200 dark:hover:bg-red-500/25 transition-colors disabled:opacity-50"
                      >
                        {loadingId === u.id ? <RefreshCw size={10} className="animate-spin" /> : <UserCheck size={10} />}
                        Unlock
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Pending password setup */}
      <div>
        <h3 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30 mb-3 flex items-center gap-2">
          <KeyRound size={12} className={mustChangePwUsers.length > 0 ? 'text-amber-500' : 'text-slate-400 dark:text-white/30'} />
          Pending password setup ({mustChangePwUsers.length})
        </h3>

        {mustChangePwUsers.length === 0 ? (
          <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/15 bg-emerald-50/60 dark:bg-emerald-500/[0.07] px-5 py-4 flex items-center gap-3">
            <Check size={15} className="text-emerald-600 dark:text-emerald-400" />
            <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">All users have set their passwords</span>
          </div>
        ) : (
          <Card className="!p-0 overflow-hidden">
            <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {mustChangePwUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-black text-amber-700 dark:text-amber-300">
                      {(u.name || u.username || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-800 dark:text-white/85">{u.name}</div>
                    <div className="text-[11px] text-slate-400 dark:text-white/30 font-mono">
                      @{u.username || u.email.split('@')[0]}
                      {u.createdAt && <span className="font-sans ml-2">· added {reltime(u.createdAt)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar nav item ─────────────────────────────────────────────────── */
interface NavItem {
  id: Tab;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

/* ── Main AdminConsole ────────────────────────────────────────────────── */
export default function AdminConsole({
  adminName,
  stats,
  lockedUsers,
  mustChangePwUsers,
  recentActivity,
  allUsers,
  allProjects,
  allTeams,
}: {
  adminName: string;
  stats: Stats;
  lockedUsers: FullUser[];
  mustChangePwUsers: FullUser[];
  recentActivity: ActivityRow[];
  allUsers: FullUser[];
  allProjects: ProjectRow[];
  allTeams: TeamRow[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const securityAlerts = lockedUsers.length + mustChangePwUsers.length + (stats.recentFailedLogins > 5 ? 1 : 0);

  const navItems: NavItem[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'people', label: 'People', icon: Users, badge: stats.totalActive },
    { id: 'projects', label: 'Projects', icon: FolderKanban, badge: allProjects.length },
    { id: 'teams', label: 'Teams', icon: Layers, badge: allTeams.length },
    { id: 'security', label: 'Security', icon: Shield, badge: securityAlerts > 0 ? securityAlerts : undefined },
  ];

  return (
    <div className="pb-14">
      {/* Page header */}
      <div className="pb-5 mb-8 border-b border-slate-100 dark:border-white/[0.06] pt-1">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 page-icon-box bg-indigo-50 dark:bg-indigo-500/10 shrink-0">
              <Layers size={19} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="page-title">Workspace settings</h1>
              <p className="text-sm text-slate-500 dark:text-white/45 mt-1 leading-snug">
                Manage your workspace, members, and platform configuration.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 mt-0.5">
            <Link href="/audit" className="btn-secondary gap-2 text-sm">
              <ScrollText size={14} /> Audit log
            </Link>
          </div>
        </div>
      </div>

      {/* Layout: sidebar + content */}
      <div className="flex gap-6 items-start">

        {/* Sidebar — desktop */}
        <aside className="hidden md:flex flex-col w-44 shrink-0 gap-1 sticky top-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`group flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left ${
                  active
                    ? 'bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white/90'
                    : 'text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/65 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                }`}
              >
                <Icon size={16} className={active ? 'text-slate-700 dark:text-white/70' : 'text-slate-400 dark:text-white/25 group-hover:text-slate-500 dark:group-hover:text-white/40'} />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge !== undefined && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full tabular-nums ${
                    item.id === 'security' && securityAlerts > 0
                      ? 'bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400'
                      : 'bg-slate-200/80 dark:bg-white/[0.07] text-slate-500 dark:text-white/35'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Mobile tab bar */}
        <div className="md:hidden w-full">
          <div className="flex gap-1 overflow-x-auto pb-1 mb-5 scrollbar-none">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-[12px] font-bold transition-all whitespace-nowrap ${
                    active
                      ? 'bg-slate-100 dark:bg-white/[0.07] text-slate-900 dark:text-white/90'
                      : 'text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/50'
                  }`}
                >
                  <Icon size={13} />
                  {item.label}
                  {item.id === 'security' && securityAlerts > 0 && (
                    <span className="text-[9px] font-black px-1 py-0.5 rounded-full bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-400">
                      {securityAlerts}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          {activeTab === 'overview' && (
            <OverviewTab
              stats={stats}
              recentActivity={recentActivity}
              lockedUsers={lockedUsers}
              mustChangePwUsers={mustChangePwUsers}
            />
          )}
          {activeTab === 'people' && <PeopleTab users={allUsers} />}
          {activeTab === 'projects' && <ProjectsTab projects={allProjects} />}
          {activeTab === 'teams' && <TeamsTab teams={allTeams} />}
          {activeTab === 'security' && (
            <SecurityTab
              lockedUsers={lockedUsers}
              mustChangePwUsers={mustChangePwUsers}
              recentFailedLogins={stats.recentFailedLogins}
            />
          )}
        </main>
      </div>
    </div>
  );
}
