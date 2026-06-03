'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import {
  Users, Shield, Lock, Mail, UserX, UserCheck, Activity,
  ArrowRight, AlertTriangle, Check, RefreshCw, ScrollText,
  UserPlus, Download, Zap, Clock, ChevronRight, Layers,
} from 'lucide-react';

/* ── Relative-time helper ──────────────────────────────────────────── */
function reltime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/* Category → colour token */
const CAT_COLOR: Record<string, string> = {
  auth:    'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300',
  user:    'bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300',
  project: 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  task:    'bg-cyan-100 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
  team:    'bg-teal-100 dark:bg-teal-500/15 text-teal-700 dark:text-teal-300',
  general: 'bg-slate-100 dark:bg-white/8 text-slate-600 dark:text-white/50',
};

interface Stats {
  totalActive: number;
  leadCount: number;
  contributorCount: number;
  lockedCount: number;
  pendingInvites: number;
  deactivatedCount: number;
}

interface SlimUser { id: string; name: string; username: string; email: string; lockedAt: string | null; createdAt: string | null; }
interface ActivityRow { id: string; action: string; category: string; actorName: string; targetLabel: string; summary: string; createdAt: string; }

export default function AdminConsole({
  adminName,
  stats,
  lockedUsers,
  mustChangePwUsers,
  recentActivity,
}: {
  adminName: string;
  stats: Stats;
  lockedUsers: SlimUser[];
  mustChangePwUsers: SlimUser[];
  recentActivity: ActivityRow[];
}) {
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  const alerts = lockedUsers.length + mustChangePwUsers.length;

  async function unlockUser(u: SlimUser) {
    setUnlocking(u.id);
    setError('');
    try {
      await api(`/users/${u.id}/unlock`, { method: 'POST' });
      setUnlocked((s) => new Set([...s, u.id]));
    } catch (e: any) {
      setError(e.message || 'Unlock failed.');
    } finally {
      setUnlocking(null);
    }
  }

  const statCards = [
    {
      label: 'Total members',
      value: stats.totalActive,
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-500/10',
      border: 'border-blue-100 dark:border-blue-500/20',
    },
    {
      label: 'Team leads',
      value: stats.leadCount,
      icon: Shield,
      color: 'text-indigo-600 dark:text-indigo-400',
      bg: 'bg-indigo-50 dark:bg-indigo-500/10',
      border: 'border-indigo-100 dark:border-indigo-500/20',
    },
    {
      label: 'Contributors',
      value: stats.contributorCount,
      icon: Users,
      color: 'text-teal-600 dark:text-teal-400',
      bg: 'bg-teal-50 dark:bg-teal-500/10',
      border: 'border-teal-100 dark:border-teal-500/20',
    },
    {
      label: 'Locked accounts',
      value: stats.lockedCount,
      icon: Lock,
      color: stats.lockedCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400 dark:text-white/25',
      bg: stats.lockedCount > 0 ? 'bg-red-50 dark:bg-red-500/10' : 'bg-slate-50 dark:bg-white/[0.03]',
      border: stats.lockedCount > 0 ? 'border-red-100 dark:border-red-500/20' : 'border-slate-100 dark:border-white/[0.06]',
    },
    {
      label: 'Open invites',
      value: stats.pendingInvites,
      icon: Mail,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-500/10',
      border: 'border-amber-100 dark:border-amber-500/20',
    },
    {
      label: 'Deactivated',
      value: stats.deactivatedCount,
      icon: UserX,
      color: 'text-slate-500 dark:text-white/35',
      bg: 'bg-slate-50 dark:bg-white/[0.03]',
      border: 'border-slate-100 dark:border-white/[0.06]',
    },
  ];

  return (
    <div className="max-w-5xl space-y-8 pb-14">

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <Layers size={13} className="text-white" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/30">
              Admin Console
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white/90">
            Workspace overview
          </h1>
          <p className="text-sm text-slate-500 dark:text-white/40 mt-1">
            Manage members, monitor access, and maintain system health.
          </p>
        </div>

        {/* Quick-action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/people" className="btn-secondary gap-2 text-sm">
            <Users size={14} /> People
          </Link>
          <Link href="/audit" className="btn-secondary gap-2 text-sm">
            <ScrollText size={14} /> Audit logs
          </Link>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 flex items-center gap-2 fade-in-soft">
          <AlertTriangle size={14} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Stats grid ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={`rounded-xl border p-4 flex flex-col gap-2 ${card.bg} ${card.border}`}
            >
              <div className={`w-8 h-8 rounded-lg ${card.bg} border ${card.border} flex items-center justify-center`}>
                <Icon size={16} className={card.color} />
              </div>
              <div>
                <div className={`text-2xl font-black leading-none tabular-nums ${card.color}`}>
                  {card.value}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 dark:text-white/35 mt-0.5">
                  {card.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Alert section (locked + mustChangePw) ─────────────────── */}
      {alerts > 0 && (
        <div className="space-y-4">
          <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30 flex items-center gap-2">
            <AlertTriangle size={12} className="text-amber-500" />
            Accounts needing attention ({alerts})
          </h2>

          {/* Locked accounts */}
          {lockedUsers.length > 0 && (
            <div className="rounded-xl border border-red-100 dark:border-red-500/15 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-red-100 dark:border-red-500/10 bg-red-50/60 dark:bg-red-500/[0.08] flex items-center gap-2">
                <Lock size={13} className="text-red-600 dark:text-red-400" />
                <span className="text-xs font-bold text-red-800 dark:text-red-300">
                  Locked accounts — {lockedUsers.length}
                </span>
                <span className="text-[11px] text-red-500/70 dark:text-red-400/50 ml-1">
                  Locked after repeated failed sign-in attempts
                </span>
              </div>
              <div className="divide-y divide-red-100/50 dark:divide-white/[0.04]">
                {lockedUsers
                  .filter((u) => !unlocked.has(u.id))
                  .map((u) => (
                    <div key={u.id}
                      className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-white/[0.02] hover:bg-red-50/40 dark:hover:bg-red-500/[0.05] transition-colors">
                      <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-black text-red-700 dark:text-red-300">
                          {(u.name || u.username || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-white/85 truncate">{u.name}</div>
                        <div className="text-[11px] text-slate-400 dark:text-white/30 font-mono truncate">
                          @{u.username || u.email.split('@')[0]}
                          {u.lockedAt && (
                            <span className="ml-2 font-sans">· locked {reltime(u.lockedAt)}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/people`}
                          className="text-[11px] font-semibold text-slate-500 dark:text-white/35 hover:text-blue-600 dark:hover:text-blue-400 transition-colors flex items-center gap-1">
                          Reset pw <ChevronRight size={11} />
                        </Link>
                        <button
                          onClick={() => unlockUser(u)}
                          disabled={unlocking === u.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-300 text-[11px] font-bold hover:bg-red-200 dark:hover:bg-red-500/25 transition-colors disabled:opacity-50"
                        >
                          {unlocking === u.id ? (
                            <RefreshCw size={11} className="animate-spin" />
                          ) : (
                            <UserCheck size={11} />
                          )}
                          Unlock
                        </button>
                      </div>
                    </div>
                  ))}
                {lockedUsers.filter((u) => unlocked.has(u.id)).length > 0 && (
                  <div className="px-4 py-2.5 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-500/[0.06] flex items-center gap-1.5">
                    <Check size={11} strokeWidth={3} />
                    {lockedUsers.filter((u) => unlocked.has(u.id)).length} account{lockedUsers.filter((u) => unlocked.has(u.id)).length > 1 ? 's' : ''} unlocked this session
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Must change password */}
          {mustChangePwUsers.length > 0 && (
            <div className="rounded-xl border border-amber-100 dark:border-amber-500/15 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-amber-100 dark:border-amber-500/10 bg-amber-50/60 dark:bg-amber-500/[0.08] flex items-center gap-2">
                <Zap size={13} className="text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Awaiting first password change — {mustChangePwUsers.length}
                </span>
                <span className="text-[11px] text-amber-500/70 dark:text-amber-400/50 ml-1">
                  These users haven't changed their temporary password yet
                </span>
              </div>
              <div className="divide-y divide-amber-100/40 dark:divide-white/[0.04]">
                {mustChangePwUsers.map((u) => (
                  <div key={u.id}
                    className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-white/[0.02] hover:bg-amber-50/40 dark:hover:bg-amber-500/[0.04] transition-colors">
                    <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center shrink-0">
                      <span className="text-[11px] font-black text-amber-700 dark:text-amber-300">
                        {(u.name || u.username || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-white/85 truncate">{u.name}</div>
                      <div className="text-[11px] text-slate-400 dark:text-white/30 font-mono truncate">
                        @{u.username || u.email.split('@')[0]}
                        {u.createdAt && (
                          <span className="ml-2 font-sans">· added {reltime(u.createdAt)}</span>
                        )}
                      </div>
                    </div>
                    <Link href="/people"
                      className="shrink-0 text-[11px] font-semibold text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 flex items-center gap-1 transition-colors">
                      Manage <ChevronRight size={11} />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Quick links ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30 mb-3">
          Quick actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              href: '/people',
              icon: UserPlus,
              label: 'Manage people',
              desc: 'Add members, promote roles, reset passwords',
              color: 'text-blue-600 dark:text-blue-400',
              iconBg: 'bg-blue-50 dark:bg-blue-500/10',
            },
            {
              href: '/audit',
              icon: ScrollText,
              label: 'Audit trail',
              desc: 'Full 21 CFR Part 11 activity log',
              color: 'text-indigo-600 dark:text-indigo-400',
              iconBg: 'bg-indigo-50 dark:bg-indigo-500/10',
            },
            {
              href: '/projects',
              icon: Layers,
              label: 'All projects',
              desc: 'View, manage and monitor every project',
              color: 'text-teal-600 dark:text-teal-400',
              iconBg: 'bg-teal-50 dark:bg-teal-500/10',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}
                className="group flex items-start gap-3 rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.025] hover:border-slate-300 dark:hover:border-white/12 hover:shadow-sm dark:hover:bg-white/[0.04] transition-all p-4">
                <div className={`w-9 h-9 rounded-lg ${item.iconBg} flex items-center justify-center shrink-0`}>
                  <Icon size={18} className={item.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800 dark:text-white/85 flex items-center gap-1">
                    {item.label}
                    <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5" />
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-white/30 mt-0.5 leading-snug">{item.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Recent activity ──────────────────────────────────────────── */}
      {recentActivity.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-white/30 flex items-center gap-2">
              <Activity size={12} /> Recent activity
            </h2>
            <Link href="/audit"
              className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center gap-1 transition-colors">
              View all <ChevronRight size={11} />
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.02] overflow-hidden divide-y divide-slate-100 dark:divide-white/[0.04]">
            {recentActivity.map((row) => (
              <div key={row.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/60 dark:hover:bg-white/[0.025] transition-colors">
                {/* Category pill */}
                <div className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${CAT_COLOR[row.category] || CAT_COLOR.general}`}>
                  {row.category}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-slate-700 dark:text-white/75 leading-snug truncate">
                    {row.summary || `${row.actorName} · ${row.action}`}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-slate-400 dark:text-white/25 font-medium truncate">
                      {row.actorName}
                    </span>
                    {row.targetLabel && (
                      <span className="text-[11px] text-slate-300 dark:text-white/15 truncate">
                        → {row.targetLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[11px] text-slate-400 dark:text-white/25 mt-0.5">
                  <Clock size={10} />
                  {reltime(row.createdAt)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts === 0 && (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-500/15 bg-emerald-50/60 dark:bg-emerald-500/[0.07] px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
            <Check size={16} className="text-emerald-600 dark:text-emerald-400" strokeWidth={2.5} />
          </div>
          <div>
            <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">All systems healthy</div>
            <div className="text-[11px] text-emerald-700/70 dark:text-emerald-400/60 mt-0.5">
              No locked accounts or pending password changes.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
