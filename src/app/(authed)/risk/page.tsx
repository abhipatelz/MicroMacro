'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import {
  Activity, Info, ChevronDown, ChevronUp, RefreshCw,
  UserPlus, Clock, ExternalLink,
} from 'lucide-react';
import { Select } from '@/components/Select';

interface RiskFeature {
  name: string; value: number; weight: number; contribution: number; explanation: string;
}
interface RiskTask {
  taskId: string; title: string; probability: number; label: 'low' | 'medium' | 'high';
  features: RiskFeature[]; recommendation: string;
  projectId: string; projectCode?: string; projectName?: string;
  assigneeId?: string; assigneeName?: string; dueDate?: string;
}
interface RiskData {
  model: { baseRate: number; trainedOn: number };
  tasks: RiskTask[];
}

const RISK_CFG = {
  high:   { label: 'High Risk',   bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-700',   bar: '#EF4444', dot: '🔴' },
  medium: { label: 'Medium Risk', bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', bar: '#F59E0B', dot: '🟡' },
  low:    { label: 'Low Risk',    bg: 'bg-green-50',  border: 'border-green-200', text: 'text-green-700', bar: '#22C55E', dot: '🟢' },
};

function RiskBar({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100);
  const color = pct >= 70 ? '#EF4444' : pct >= 40 ? '#F59E0B' : '#22C55E';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold tabular-nums" style={{ color }}>{pct}%</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Inline action: re-assign / snooze. Optimistic — local UI updates first.
   ──────────────────────────────────────────────────────────────────────── */
function InlineActions({ task, users, onChanged }: {
  task: RiskTask; users: { id: string; name: string }[]; onChanged: () => void;
}) {
  const [open, setOpen]       = useState<'reassign' | 'snooze' | null>(null);
  const [busy, setBusy]       = useState(false);
  const [done, setDone]       = useState<string | null>(null);

  async function reassign(userId: string) {
    setBusy(true);
    try {
      await api(`/tasks/${task.taskId}`, { method: 'PATCH', body: { assigneeId: userId || null } });
      setDone(`Re-assigned to ${users.find(u => u.id === userId)?.name ?? 'unassigned'}`);
      setOpen(null);
      onChanged();
    } finally { setBusy(false); }
  }

  async function snooze(days: number) {
    setBusy(true);
    try {
      const base = task.dueDate ? new Date(task.dueDate) : new Date();
      base.setDate(base.getDate() + days);
      await api(`/tasks/${task.taskId}`, {
        method: 'PATCH',
        body: { dueDate: base.toISOString() }
      });
      setDone(`Due date extended by ${days} day${days > 1 ? 's' : ''}`);
      setOpen(null);
      onChanged();
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="mt-2 text-[11px] text-forest-700 font-semibold flex items-center gap-1.5">
        ✓ {done}
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => setOpen(o => o === 'reassign' ? null : 'reassign')}
          className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
            open === 'reassign'
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300 hover:text-brand-700'
          }`}
        >
          <UserPlus size={11} /> Re-assign
        </button>
        <button
          type="button"
          onClick={() => setOpen(o => o === 'snooze' ? null : 'snooze')}
          className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border transition-all ${
            open === 'snooze'
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300 hover:text-amber-700'
          }`}
        >
          <Clock size={11} /> Extend due
        </button>
        <Link
          href={`/tasks/${task.taskId}`}
          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg border bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800 transition-all"
        >
          <ExternalLink size={11} /> Open
        </Link>
      </div>

      {open === 'reassign' && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 fade-in-soft">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Assign to</div>
          <div className="flex flex-wrap gap-1">
            {users.length === 0 && <span className="text-[11px] text-slate-400">No users available.</span>}
            {users.slice(0, 8).map(u => (
              <button
                key={u.id}
                disabled={busy || u.id === task.assigneeId}
                onClick={() => reassign(u.id)}
                className="text-[11px] px-2 py-1 rounded-full border border-slate-200 hover:border-brand-300 hover:bg-brand-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                {u.name}{u.id === task.assigneeId ? ' (current)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {open === 'snooze' && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2.5 fade-in-soft">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Push due date by</div>
          <div className="flex flex-wrap gap-1">
            {[3, 7, 14].map(d => (
              <button
                key={d}
                disabled={busy}
                onClick={() => snooze(d)}
                className="text-[11px] px-2 py-1 rounded-full border border-slate-200 hover:border-amber-300 hover:bg-amber-50 disabled:opacity-30 transition-all"
              >
                +{d} days
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5">
            Re-baselining the date logs an updated_at — past misses still count for predictions.
          </p>
        </div>
      )}
    </div>
  );
}

function TaskCard({ t, users, onChanged }: { t: RiskTask; users: any[]; onChanged: () => void }) {
  const [showFactors, setShowFactors] = useState(false);
  const cfg = RISK_CFG[t.label];
  const topFeatures = [...t.features].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3);

  return (
    <div className={`rounded-xl border p-4 ${cfg.bg} ${cfg.border}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[10px] font-mono text-slate-400">{t.projectCode}</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
              {cfg.dot} {cfg.label}
            </span>
          </div>
          <Link href={`/tasks/${t.taskId}`} className={`font-semibold text-sm text-slate-800 hover:${cfg.text} hover:underline leading-snug`}>
            {t.title}
          </Link>
          <div className="text-xs text-slate-400 mt-0.5">
            {t.assigneeName || 'Unassigned'}{t.dueDate ? ` · Due ${new Date(t.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
          </div>
        </div>
        <div className="shrink-0 w-28">
          <RiskBar probability={t.probability} />
        </div>
      </div>

      <div className={`mt-3 text-xs font-medium ${cfg.text} leading-snug`}>
        → {t.recommendation}
      </div>

      <InlineActions task={t} users={users} onChanged={onChanged} />

      <button
        onClick={() => setShowFactors(o => !o)}
        className={`mt-2 flex items-center gap-1 text-[11px] ${cfg.text} opacity-50 hover:opacity-90 transition-opacity`}
      >
        {showFactors ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        {showFactors ? 'Hide' : 'Why'} risk factors
      </button>

      {showFactors && (
        <div className="mt-2 space-y-1 pl-1 border-t border-current/10 pt-2">
          {topFeatures.map(f => (
            <div key={f.name} className="flex items-center gap-2 text-[11px]">
              <span className={`font-bold ${f.contribution > 0 ? 'text-red-500' : 'text-green-600'}`}>
                {f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(2)}
              </span>
              <span className="text-slate-500">{f.explanation}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RiskRadarPage() {
  const [data, setData]       = useState<RiskData | null>(null);
  const [users, setUsers]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'high' | 'medium'>('all');
  const [teams, setTeams]     = useState<any[]>([]);
  const [teamId, setTeamId]   = useState('');

  async function load() {
    setLoading(true);
    try {
      const params = teamId ? `?teamId=${teamId}` : '';
      const d = await api<RiskData>(`/ai/risk${params}`);
      setData(d);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    Promise.all([
      api<any[]>('/teams').then(setTeams),
      api<any[]>('/users').then(setUsers),
    ]).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const tasks = data?.tasks ?? [];
  const visible = tasks.filter(t => filter === 'all' ? true : t.label === filter);
  const highCount   = tasks.filter(t => t.label === 'high').length;
  const mediumCount = tasks.filter(t => t.label === 'medium').length;

  return (
    <div className="max-w-3xl space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity size={20} className="text-red-500" />
            <h1 className="text-2xl font-black text-slate-900">Task Triage</h1>
          </div>
          <p className="text-sm text-slate-500">
            Open tasks ranked by deadline-miss probability — fix the riskiest first, right from here.
            {data && <span className="ml-1 text-slate-400">(model trained on {data.model.trainedOn} closed tasks)</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading} className="btn-secondary flex items-center gap-1.5 text-xs shrink-0">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary tiles */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'High risk', count: highCount,   tone: 'high',   icon: '🔴' },
            { label: 'Medium',    count: mediumCount, tone: 'medium', icon: '🟡' },
            { label: 'On track',  count: tasks.length - highCount - mediumCount, tone: 'low', icon: '🟢' },
          ].map(({ label, count, tone, icon }) => (
            <button
              key={tone}
              onClick={() => setFilter(f => f === tone ? 'all' : tone as any)}
              className={`card p-4 text-left transition-all ${filter === tone ? 'ring-2 ring-brand-400' : ''}`}
            >
              <div className="text-lg">{icon}</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{count}</div>
              <div className="text-xs text-slate-400 font-medium">{label}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Select
          className="w-48" value={teamId} onChange={setTeamId} ariaLabel="Filter by team"
          placeholder="All teams"
          options={[{ value: '', label: 'All teams' }, ...teams.map((t) => ({ value: t.id, label: t.name }))]}
        />
        {filter !== 'all' && (
          <button onClick={() => setFilter('all')} className="text-xs text-slate-500 hover:text-slate-700 underline">
            Clear filter
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{visible.length} tasks shown</span>
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-3xl mb-2">🟢</div>
          <div className="text-sm font-semibold text-slate-700">No tasks at risk</div>
          <div className="text-xs text-slate-400 mt-1">
            {data?.model.trainedOn === 0
              ? 'Complete more tasks to train the model — predictions improve with history.'
              : 'All open tasks are on track. Keep the momentum.'}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(t => <TaskCard key={t.taskId} t={t} users={users} onChanged={load} />)}
        </div>
      )}

      {data && data.model.trainedOn < 10 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex items-start gap-2">
          <Info size={14} className="text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700">
            The model is trained on <strong>{data.model.trainedOn}</strong> completed tasks.
            Predictions become more accurate as your team completes more work.
          </p>
        </div>
      )}
    </div>
  );
}
