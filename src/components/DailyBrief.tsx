'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sunrise, X, CheckCircle2, ShieldCheck, AlertTriangle, Users } from 'lucide-react';
import { api } from '@/lib/client/api';

/**
 * Morning Brief card — the in-app renderer of the Daily Brief object
 * (GET /api/me/brief). Three rules keep it from feeling like spam:
 *
 *   1. Silence is a feature — when the brief has no content, nothing renders.
 *   2. One glance — a single headline plus at most a handful of rows, never a
 *      second dashboard.
 *   3. Dismissable per day — the ✕ hides it until tomorrow (localStorage),
 *      so it never nags twice.
 */

interface BriefItem {
  id: string;
  title: string;
  projectName: string | null;
  label: string;
  priority: string | null;
}

interface Brief {
  role: string;
  dateLabel: string;
  headline: string;
  hasContent: boolean;
  my: {
    overdue: BriefItem[];
    today: BriefItem[];
    soon: BriefItem[];
    approvals: number;
    winsYesterday: number;
  };
  team?: {
    blocked: { id: string; title: string; projectName: string | null; days: number }[];
    signoffsPending: number;
    overdueByMember: { name: string; count: number }[];
  };
  workspace?: {
    doneYesterday: number;
    overdueTotal: number;
    activeProjects: number;
    risky: { id: string; name: string; overdue: number }[];
    auditHighlights: { summary: string; at: string }[];
  };
}

function dismissKey(): string {
  return `pragati-brief-dismissed:${new Date().toISOString().slice(0, 10)}`;
}

const LABEL_TONE: Record<string, string> = {
  overdue: 'text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10',
  today: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10',
  soon: 'text-slate-600 bg-slate-100 dark:text-white/50 dark:bg-white/[0.06]',
};

function TaskRow({ item, tone }: { item: BriefItem; tone: 'overdue' | 'today' | 'soon' }) {
  return (
    <Link href={`/tasks/${item.id}`} className="flex items-center gap-2 py-1 group/row min-w-0">
      <span
        className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${LABEL_TONE[tone]}`}
      >
        {item.label}
      </span>
      <span className="text-[12.5px] text-slate-700 dark:text-white/70 truncate group-hover/row:text-blue-700 dark:group-hover/row:text-blue-400 transition-colors">
        {item.title}
      </span>
      {item.projectName && (
        <span className="text-[10.5px] text-slate-400 dark:text-white/30 truncate shrink-0 max-w-[140px]">
          · {item.projectName}
        </span>
      )}
    </Link>
  );
}

export function DailyBrief() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume hidden until we know

  useEffect(() => {
    setDismissed(!!localStorage.getItem(dismissKey()));
    api<Brief>('/me/brief')
      .then(setBrief)
      .catch(() => {});
  }, []);

  if (dismissed || !brief || !brief.hasContent) return null;

  const { my, team, workspace } = brief;
  const personalRows = [
    ...my.overdue.map((t) => ({ t, tone: 'overdue' as const })),
    ...my.today.map((t) => ({ t, tone: 'today' as const })),
    ...my.soon.map((t) => ({ t, tone: 'soon' as const })),
  ].slice(0, 5);

  return (
    <section className="mb-5">
      <div
        className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
      >
        <div className="px-4 sm:px-5 py-3.5">
          {/* Header — same geometry as the other dashboard section labels. */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Sunrise size={14} className="text-amber-500 shrink-0" />
              <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 dark:text-white/40 truncate">
                Morning brief
              </h2>
              <span className="text-[10px] text-slate-300 dark:text-white/20 font-semibold shrink-0">
                {brief.dateLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                localStorage.setItem(dismissKey(), '1');
                setDismissed(true);
              }}
              aria-label="Dismiss for today"
              title="Dismiss for today"
              className="shrink-0 p-1 rounded text-slate-300 hover:text-slate-600 dark:text-white/25 dark:hover:text-white/60 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
            >
              <X size={13} />
            </button>
          </div>

          {/* The one sentence that says where to start. */}
          <p className="text-[14px] font-bold text-slate-800 dark:text-white/85 leading-snug">
            {brief.headline}
          </p>

          {/* Personal rows + quiet wins/approvals chips. */}
          {(personalRows.length > 0 || my.approvals > 0 || my.winsYesterday > 0) && (
            <div className="mt-2">
              {personalRows.map(({ t, tone }) => (
                <TaskRow key={t.id} item={t} tone={tone} />
              ))}
              {(my.approvals > 0 || my.winsYesterday > 0) && (
                <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                  {my.approvals > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 dark:text-purple-400">
                      <ShieldCheck size={12} /> {my.approvals} sign-off
                      {my.approvals === 1 ? '' : 's'} waiting on you
                    </span>
                  )}
                  {my.winsYesterday > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 size={12} /> {my.winsYesterday} closed yesterday
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Team pulse — leads only. */}
          {team &&
            (team.blocked.length > 0 || team.signoffsPending > 0 || team.overdueByMember.length > 0) && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.05]">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users size={11} className="text-slate-400 dark:text-white/30" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/30">
                    Team pulse
                  </span>
                </div>
                {team.blocked.map((b) => (
                  <Link
                    key={b.id}
                    href={`/tasks/${b.id}`}
                    className="flex items-center gap-2 py-1 group/row min-w-0"
                  >
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md text-red-700 bg-red-50 dark:text-red-400 dark:bg-red-500/10">
                      {b.days > 0 ? `${b.days}d blocked` : 'Blocked'}
                    </span>
                    <span className="text-[12.5px] text-slate-700 dark:text-white/70 truncate group-hover/row:text-blue-700 dark:group-hover/row:text-blue-400 transition-colors">
                      {b.title}
                    </span>
                    {b.projectName && (
                      <span className="text-[10.5px] text-slate-400 dark:text-white/30 truncate shrink-0 max-w-[140px]">
                        · {b.projectName}
                      </span>
                    )}
                  </Link>
                ))}
                <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-slate-500 dark:text-white/40">
                  {team.signoffsPending > 0 && (
                    <span className="font-semibold">
                      {team.signoffsPending} QA sign-off{team.signoffsPending === 1 ? '' : 's'} pending
                    </span>
                  )}
                  {team.overdueByMember.length > 0 && (
                    <span>
                      Overdue load:{' '}
                      {team.overdueByMember.map((m, i) => (
                        <span key={m.name} className="font-semibold text-slate-600 dark:text-white/55">
                          {i > 0 && ', '}
                          {m.name} ({m.count})
                        </span>
                      ))}
                    </span>
                  )}
                </div>
              </div>
            )}

          {/* Workspace rundown — admins only. */}
          {workspace && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/[0.05]">
              <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500 dark:text-white/40">
                <span>
                  <strong className="text-slate-700 dark:text-white/70 tabular-nums">
                    {workspace.doneYesterday}
                  </strong>{' '}
                  closed yesterday
                </span>
                <span>
                  <strong className="text-slate-700 dark:text-white/70 tabular-nums">
                    {workspace.overdueTotal}
                  </strong>{' '}
                  overdue
                </span>
                <span>
                  <strong className="text-slate-700 dark:text-white/70 tabular-nums">
                    {workspace.activeProjects}
                  </strong>{' '}
                  active projects
                </span>
                {workspace.risky.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <AlertTriangle size={11} className="text-amber-500" />
                    {workspace.risky.map((p, i) => (
                      <Link
                        key={p.id}
                        href={`/projects/${p.id}`}
                        className="font-semibold text-slate-600 dark:text-white/55 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
                      >
                        {i > 0 && ', '}
                        {p.name} ({p.overdue})
                      </Link>
                    ))}
                  </span>
                )}
              </div>
              {workspace.auditHighlights.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {workspace.auditHighlights.map((a, i) => (
                    <div key={i} className="text-[11px] text-slate-400 dark:text-white/30 truncate">
                      • {a.summary}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
