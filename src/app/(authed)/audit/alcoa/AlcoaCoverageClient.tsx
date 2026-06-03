'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import {
  ShieldCheck, ArrowLeft, RefreshCw, AlertTriangle, FileWarning,
  PenLine, Clock, ChevronRight,
} from 'lucide-react';

interface GapTask {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  grade: string;
  score: number;
  reasons: string[];
}

interface Coverage {
  generatedAt: string;
  summary: {
    totalGxp: number;
    compliantGxp: number;
    gapCount: number;
    coveragePct: number;
    avgGxpScore: number;
    signoffRequired: number;
    signoffMissing: number;
    docRefMissing: number;
    completionMissing: number;
  };
  gradeDist: Record<string, number>;
  gaps: GapTask[];
  gapsTruncated: boolean;
}

const GRADE_TONE: Record<string, string> = {
  A: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  B: 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  C: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  D: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  F: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
};

function StatCard({ icon: Icon, label, value, sub, tone }: {
  icon: any; label: string; value: string | number; sub?: string; tone: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${tone}`}>
          <Icon size={15} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-black text-slate-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AlcoaCoverageClient() {
  const [data, setData] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  function load() {
    setLoading(true);
    setErr('');
    api<Coverage>('/admin/alcoa-coverage')
      .then(setData)
      .catch((e) => setErr(e.message || 'Failed to load coverage.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const s = data?.summary;

  return (
    <div className="max-w-5xl space-y-5 pb-12">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/audit"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mb-1.5">
            <ArrowLeft size={13} /> Back to logs
          </Link>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-500" /> ALCOA+ coverage
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Read-only data-integrity rollup across GxP-critical tasks. Deterministic — every
            gap traces to a rule in the scorer. Close gaps from each task page.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="btn-secondary flex items-center gap-1.5 text-xs">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/25 px-4 py-3 text-sm text-red-700 dark:text-red-300">{err}</div>
      )}

      {loading && !data ? (
        <div className="card p-10 text-center text-sm text-slate-400">Scoring the GxP corpus…</div>
      ) : s ? (
        <>
          {/* Headline coverage */}
          <div className="card p-5">
            <div className="flex items-end justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  GxP records fully compliant
                </div>
                <div className="text-4xl font-black text-slate-900 dark:text-white">
                  {s.coveragePct}<span className="text-xl text-slate-400">%</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {s.compliantGxp} of {s.totalGxp} GxP-critical tasks clear · avg ALCOA+ score {s.avgGxpScore}/100
                </div>
              </div>
              {/* Grade distribution */}
              <div className="flex items-center gap-1.5">
                {(['A', 'B', 'C', 'D', 'F'] as const).map((g) => (
                  <div key={g} className={`px-2.5 py-1.5 rounded-lg text-center ${GRADE_TONE[g]}`}>
                    <div className="text-sm font-black leading-none">{data!.gradeDist[g] || 0}</div>
                    <div className="text-[10px] font-bold mt-0.5">{g}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-4 h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-green-500 transition-all"
                style={{ width: `${s.coveragePct}%` }} />
            </div>
          </div>

          {/* Gap stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatCard icon={PenLine} label="Sign-off missing"
              value={s.signoffMissing}
              sub={`of ${s.signoffRequired} requiring QA sign-off`}
              tone="bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300" />
            <StatCard icon={FileWarning} label="No document ref"
              value={s.docRefMissing}
              sub="GxP-critical without SOP / doc no."
              tone="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300" />
            <StatCard icon={Clock} label="Done, no timestamp"
              value={s.completionMissing}
              sub="completed without completion time"
              tone="bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" />
          </div>

          {/* Gap list */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/10 bg-slate-50/60 dark:bg-white/5 flex items-center gap-2">
              <AlertTriangle size={14} className="text-amber-500" />
              <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">Records with open gaps</h2>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 ml-1">{s.gapCount}</span>
            </div>
            {data!.gaps.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <ShieldCheck size={28} className="mx-auto text-emerald-400 mb-2" />
                <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">No open ALCOA+ gaps</div>
                <div className="text-xs text-slate-400 mt-1">Every GxP-critical task clears the deterministic checks.</div>
              </div>
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-white/5">
                {data!.gaps.map((g) => (
                  <Link key={g.id} href={`/tasks/${g.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 dark:hover:bg-white/5 transition-colors group">
                    <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${GRADE_TONE[g.grade]}`}>
                      {g.grade}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{g.title}</div>
                      <div className="text-xs text-slate-400 mt-0.5 truncate">
                        {g.projectCode && <span className="font-mono">{g.projectCode}</span>}
                        {g.projectName && <span> · {g.projectName}</span>}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {g.reasons.map((r, i) => (
                          <span key={i} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs font-mono text-slate-400">{g.score}/100</span>
                    <ChevronRight size={15} className="shrink-0 text-slate-300 group-hover:text-slate-500" />
                  </Link>
                ))}
                {data!.gapsTruncated && (
                  <div className="px-5 py-3 text-center text-xs text-slate-400">
                    Showing the 200 lowest-scoring records. Close these first, then refresh.
                  </div>
                )}
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 text-center">
            Scored {s.totalGxp} GxP-critical tasks · {new Date(data!.generatedAt).toLocaleString()} ·
            rule-based scorer (no model checkpoint), reproducible for audit.
          </p>
        </>
      ) : null}
    </div>
  );
}
