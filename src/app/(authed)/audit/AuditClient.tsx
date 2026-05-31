'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { useIsAdmin } from '@/components/CurrentUserContext';
import { ScrollText, RefreshCw, Sparkles } from 'lucide-react';

interface LogRow {
  id: string;
  action: string;
  category: string;
  actorName: string;
  targetType: string;
  targetId: string;
  targetLabel: string;
  summary: string;
  createdAt: string;
}

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'project', label: 'Projects' },
  { key: 'task', label: 'Tasks' },
  { key: 'team', label: 'Teams' },
  { key: 'user', label: 'Users' },
  { key: 'auth', label: 'Sign-ins' },
];

const CATEGORY_TONE: Record<string, string> = {
  project: 'bg-purple-50 text-purple-700',
  task: 'bg-blue-50 text-blue-700',
  team: 'bg-emerald-50 text-emerald-700',
  user: 'bg-amber-50 text-amber-700',
  auth: 'bg-slate-100 text-slate-600',
  general: 'bg-slate-100 text-slate-600',
};

function targetHref(r: LogRow): string | null {
  if (!r.targetId) return null;
  if (r.targetType === 'project') return `/projects/${r.targetId}`;
  if (r.targetType === 'task') return `/tasks/${r.targetId}`;
  if (r.targetType === 'team') return `/teams/${r.targetId}`;
  return null;
}

function fmt(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

interface AuditPage { rows: LogRow[]; nextBefore: string | null }

export default function AuditClient({ initialRows, initialNextBefore = null }: { initialRows: LogRow[]; initialNextBefore?: string | null }) {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<LogRow[]>(initialRows);
  const [nextBefore, setNextBefore] = useState<string | null>(initialNextBefore);
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Skip the first effect run per category — initial data already comes from SSR.
  const skipNext = useRef(true);

  function load() {
    setBusy(true);
    api<AuditPage>(`/audit?category=${category}`)
      .then((res) => { setRows(res.rows); setNextBefore(res.nextBefore); })
      .catch(() => { setRows([]); setNextBefore(null); })
      .finally(() => setBusy(false));
  }

  function loadMore() {
    if (!nextBefore || loadingMore) return;
    setLoadingMore(true);
    api<AuditPage>(`/audit?category=${category}&before=${encodeURIComponent(nextBefore)}`)
      .then((res) => {
        // De-dupe defensively in case a row sits exactly on the cursor boundary.
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...res.rows.filter((r) => !seen.has(r.id))];
        });
        setNextBefore(res.nextBefore);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    if (!isAdmin) return;
    if (skipNext.current) { skipNext.current = false; return; }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto mt-16 card p-8 text-center">
        <ScrollText size={24} className="mx-auto text-slate-300 mb-3" />
        <div className="text-sm font-semibold text-slate-700">Operation logs are admin-only</div>
        <div className="text-xs text-slate-400 mt-1">You don&rsquo;t have access to this page.</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-5 pb-12">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <ScrollText size={20} className="text-blue-500" /> Operation logs
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            An immutable record of operational activity — who did what, and when.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/audit/changelog"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 px-2.5 py-1.5 rounded-lg transition-colors">
            <Sparkles size={13} /> Changelog
          </Link>
          <button onClick={load} disabled={busy}
            className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((c) => (
          <button key={c.key} onClick={() => setCategory(c.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
              category === c.key ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        {rows.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No activity recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/60 border-b border-slate-100 text-left">
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-4 py-2.5">When</th>
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2.5">Who</th>
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2.5">Area</th>
                  <th className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2.5">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => {
                  const href = targetHref(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500">{fmt(r.createdAt)}</td>
                      <td className="px-2 py-2.5 text-xs font-medium text-slate-700 whitespace-nowrap">{r.actorName}</td>
                      <td className="px-2 py-2.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CATEGORY_TONE[r.category] || CATEGORY_TONE.general}`}>
                          {r.category}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-slate-700">
                        {r.summary}
                        {r.targetLabel && href && (
                          <> · <Link href={href} className="text-blue-600 hover:underline font-medium">{r.targetLabel}</Link></>
                        )}
                        {r.targetLabel && !href && <span className="text-slate-400"> · {r.targetLabel}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nextBefore && (
        <div className="flex justify-center">
          <button onClick={loadMore} disabled={loadingMore}
            className="btn-secondary flex items-center gap-1.5 text-xs">
            <RefreshCw size={13} className={loadingMore ? 'animate-spin' : ''} />
            {loadingMore ? 'Loading…' : 'Load older activity'}
          </button>
        </div>
      )}
    </div>
  );
}
