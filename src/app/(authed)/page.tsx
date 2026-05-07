'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { LifecycleTag, PriorityTag, TaskLink, formatDate, daysUntil } from '@/components/ui';
import { getGreeting } from '@/lib/culture';
import { parseNaturalInput } from '@/lib/naturalDate';
import {
  CheckCircle2, Clock, AlertTriangle, TrendingUp, FolderKanban,
  ChevronRight, Flame, Target, Plus, ArrowUpRight, Activity,
  Zap, BarChart2, CircleCheck,
} from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Summary {
  totalAssigned: number; completed: number; overdue: number;
  dueThisWeek: number; completionRate: number; byStatus: Record<string, number>;
}
interface OrgOverview {
  totals: { tasksOpen: number; tasksOverdue: number; activeProjects: number; users: number; doneThisMonth: number };
  projects: Array<{ id: string; name: string; code: string; status: string; taskCount: number; tasksDone: number; tasksOverdue: number; health: 'good' | 'at_risk' | 'critical'; dueDate: string | null }>;
  attention: Array<{ severity: 'critical' | 'warn'; label: string; detail: string; href: string }>;
}

/* ── Confetti — Alembic brand palette ─────────────────────────────────────── */
const CONFETTI = ['#1565C0','#1E88E5','#90CAF9','#43A047','#A5D6A7','#0D47A1'];
function Celebration({ taskTitle, onDone }: { taskTitle: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {Array.from({ length: 60 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${(i * 1.7) % 100}%`, top: '-12px',
          width: 5 + (i % 6) * 1.5, height: 5 + (i % 6) * 1.5,
          backgroundColor: CONFETTI[i % CONFETTI.length],
          borderRadius: i % 3 !== 0 ? '50%' : '2px',
          animation: `confetti-fall ${0.85 + (i % 7) * 0.14}s ${(i * 0.025) % 0.9}s ease-in forwards`,
        }} />
      ))}
      <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'celebration-pop 0.35s ease-out forwards' }}>
        <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 text-center max-w-xs mx-4 border border-slate-100">
          <div className="text-4xl mb-3">✅</div>
          <div className="text-xl font-black text-slate-900">Done!</div>
          <div className="text-slate-400 mt-2 text-sm line-clamp-2">"{taskTitle}"</div>
        </div>
      </div>
    </div>
  );
}

/* ── Quick-add modal ──────────────────────────────────────────────────────── */
function QuickAdd({ projects, userId, onAdded, open, onClose }: {
  projects: any[]; userId: string; onAdded: () => void; open: boolean; onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [projectId, setPId] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseNaturalInput(raw), [raw]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.title.trim() || !projectId) return;
    setSaving(true);
    try {
      await api('/tasks', { method: 'POST', body: { title: parsed.title.trim(), projectId, assigneeId: userId, dueDate: parsed.dueDate || undefined, priority: parsed.priority || undefined }});
      setRaw(''); setPId(''); onClose(); onAdded();
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-[calc(100vw-32px)] sm:w-[420px]"
        style={{ animation: 'celebration-pop 0.25s ease-out' }}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-black text-slate-900 text-lg tracking-tight">New task</h3>
            <p className="text-xs text-slate-400 mt-0.5">Type naturally — "fix login bug by friday"</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors">✕</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <input autoFocus className="input text-sm" placeholder='"review docs by friday" or "urgent: deploy fix"'
              value={raw} onChange={e => setRaw(e.target.value)} required />
            {raw.trim() && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {parsed.title !== raw.trim() && <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{parsed.title || '…'}</span>}
                {parsed.dueDate && <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{new Date(parsed.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>}
                {parsed.priority && parsed.priority !== 'low' && <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium capitalize">{parsed.priority}</span>}
              </div>
            )}
          </div>
          <select className="select text-sm" value={projectId} onChange={e => setPId(e.target.value)} required>
            <option value="">Select project…</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>)}
          </select>
          <button type="submit" className="w-full btn-primary justify-center" disabled={saving || !parsed.title.trim() || !projectId}>
            {saving ? 'Adding…' : 'Create task'}
          </button>
        </form>
      </div>
    </>
  );
}

/* ── Task row ─────────────────────────────────────────────────────────────── */
function TaskRow({ task, onDone }: { task: any; onDone: (t: any) => void }) {
  const [hov, setHov] = useState(false);
  const done    = task.status === 'done';
  const d       = daysUntil(task.dueDate);
  const overdue = !done && d !== null && d < 0;
  const today   = !done && d === 0;
  const soon    = !done && d !== null && d > 0 && d <= 2;

  const dueBg    = overdue ? '#fee2e2' : today ? '#fef9c3' : soon ? '#fff7ed' : 'transparent';
  const dueColor = overdue ? '#dc2626' : today ? '#d97706' : soon ? '#ea580c' : '#94a3b8';
  const dueText  = overdue ? `${Math.abs(d!)}d late` : today ? 'Today' : d === 1 ? 'Tomorrow' : formatDate(task.dueDate);

  return (
    <div
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className="flex items-center gap-3 px-5 py-3.5 transition-colors relative group"
      style={{
        background: hov ? 'rgba(21,101,192,0.025)' : 'transparent',
        borderLeft: overdue ? '3px solid #ef4444' : today ? '3px solid #f59e0b' : '3px solid transparent',
      }}
    >
      <button
        onClick={() => !done && onDone(task)} disabled={done}
        className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 hover:scale-110 focus:outline-none"
        style={{
          borderColor: done ? '#22c55e' : overdue ? '#ef4444' : hov ? '#1565C0' : '#d1d5db',
          background:  done ? '#22c55e' : hov && !done ? 'rgba(21,101,192,0.06)' : 'transparent',
        }}>
        {done && <CheckCircle2 size={12} className="text-white" strokeWidth={3} />}
        {!done && hov && <div className="w-2 h-2 rounded-full" style={{ background: overdue ? '#ef4444' : '#1565C0', opacity: 0.5 }} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TaskLink task={task}
            className={`text-sm font-semibold truncate transition-colors leading-snug ${done ? 'line-through text-slate-300' : 'text-slate-800 hover:text-blue-700'}`} />
          {task.gxpCritical && <span className="text-[9px] font-bold text-purple-700 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded shrink-0">GxP</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {(task.projectCode || task.projectName) && (
            <Link href={`/projects/${task.projectId}`} className="text-[11px] font-mono text-slate-400 hover:text-blue-600 transition-colors shrink-0">
              {task.projectCode || task.projectName}
            </Link>
          )}
          {task.priority && task.priority !== 'low' && <PriorityTag priority={task.priority} />}
          {task.lifecycle && task.lifecycle !== 'generic' && <LifecycleTag lifecycle={task.lifecycle} />}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {task.dueDate && !done && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap"
            style={{ background: dueBg, color: dueColor }}>
            {overdue && <Flame size={9} />}{dueText}
          </span>
        )}
        {done && task.completedAt && (
          <span className="text-[11px] text-slate-300">{formatDate(task.completedAt)}</span>
        )}
        {hov && (
          <Link href={`/tasks/${task.id}`} className="p-1 rounded text-slate-300 hover:text-blue-500 transition-colors" title="Open">
            <ArrowUpRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

/* ── Stat card ────────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, accent, urgent, filled }: {
  label: string; value: string | number; sub?: string;
  icon: any; accent: string; urgent?: boolean; filled?: boolean;
}) {
  if (filled) {
    return (
      <div className="relative overflow-hidden rounded-2xl flex flex-col gap-1 p-5 transition-all hover:scale-[1.02] cursor-default"
        style={{
          background: `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`,
          boxShadow: `0 4px 20px ${accent}40, 0 1px 3px ${accent}30`,
        }}>
        <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full opacity-10"
          style={{ background: '#fff' }} />
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/70">{label}</div>
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-white" />
          </div>
        </div>
        <div className="text-3xl font-black tracking-tight leading-none text-white">{value}</div>
        {sub && <div className="text-[11px] font-medium text-white/60">{sub}</div>}
      </div>
    );
  }
  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border flex flex-col gap-1 p-5 transition-all hover:shadow-md hover:scale-[1.01] cursor-default"
      style={{
        borderColor: urgent ? `${accent}40` : 'rgba(210,218,228,0.8)',
        boxShadow: urgent
          ? `0 0 0 1px ${accent}18, 0 4px 16px ${accent}10`
          : '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.025)',
      }}>
      {urgent && (
        <div className="absolute inset-x-0 top-0 h-[3px] rounded-t-2xl" style={{ background: accent }} />
      )}
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: urgent ? accent : '#94a3b8' }}>
          {label}
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}14` }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-3xl font-black tracking-tight leading-none" style={{ color: urgent ? accent : '#0f172a' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] font-medium" style={{ color: urgent ? `${accent}99` : '#94a3b8' }}>{sub}</div>}
    </div>
  );
}

/* ── Urgency banner ───────────────────────────────────────────────────────── */
function UrgencyBanner({ overdue, dueToday }: { overdue: number; dueToday: number }) {
  if (overdue === 0 && dueToday === 0) return null;
  return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-3 mb-5"
      style={{ background: overdue > 0 ? '#fef2f2' : '#fffbeb', border: `1px solid ${overdue > 0 ? '#fecaca' : '#fde68a'}` }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: overdue > 0 ? '#fee2e2' : '#fef3c7' }}>
        {overdue > 0 ? <Flame size={15} className="text-red-500" /> : <Clock size={15} className="text-amber-500" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold" style={{ color: overdue > 0 ? '#991b1b' : '#92400e' }}>
          {overdue > 0
            ? `${overdue} task${overdue > 1 ? 's' : ''} overdue — needs immediate attention`
            : `${dueToday} task${dueToday > 1 ? 's' : ''} due today`}
        </div>
        <div className="text-xs mt-0.5" style={{ color: overdue > 0 ? '#b91c1c' : '#b45309', opacity: 0.7 }}>
          {overdue > 0 ? 'Switch to Overdue filter to address these first.' : 'You\'re on track — finish these today.'}
        </div>
      </div>
    </div>
  );
}

/* ── Upcoming panel ───────────────────────────────────────────────────────── */
function UpcomingPanel({ tasks }: { tasks: any[] }) {
  const upcoming = tasks.filter(t => t.status !== 'done' && t.dueDate)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).slice(0, 6);

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Clock size={13} className="text-amber-500" />
        <span className="text-sm font-bold text-slate-700">Upcoming</span>
        {upcoming.length > 0 && (
          <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{upcoming.length}</span>
        )}
      </div>
      {upcoming.length === 0 ? (
        <div className="px-4 py-8 text-center">
          <CircleCheck size={20} className="text-slate-200 mx-auto mb-2" />
          <div className="text-xs text-slate-300 font-medium">No upcoming deadlines</div>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {upcoming.map(t => {
            const d = daysUntil(t.dueDate);
            const overdue = d !== null && d < 0;
            const today   = d === 0;
            return (
              <div key={t.id} className="flex items-start gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors">
                <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${overdue ? 'bg-red-500' : today ? 'bg-amber-400' : 'bg-slate-200'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-slate-700 truncate leading-tight">{t.title}</div>
                  <div style={{ fontSize: 10 }} className="text-slate-400 font-mono mt-0.5">{t.projectCode || t.projectName}</div>
                </div>
                <div className={`text-xs font-bold shrink-0 ${overdue ? 'text-red-500' : today ? 'text-amber-600' : 'text-slate-400'}`}>
                  {overdue ? `${Math.abs(d!)}d late` : today ? 'Today' : d === 1 ? 'Tmrw' : formatDate(t.dueDate)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── PM panels ────────────────────────────────────────────────────────────── */
const HC = { good: '#22c55e', at_risk: '#f59e0b', critical: '#ef4444' };
const HCbg = { good: '#f0fdf4', at_risk: '#fffbeb', critical: '#fef2f2' };

function ProjectHealthPanel({ projects }: { projects: OrgOverview['projects'] }) {
  const active = projects.filter(p => p.status === 'in_progress').slice(0, 5);
  if (!active.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={13} className="text-blue-500" />
          <span className="text-sm font-bold text-slate-700">Project Health</span>
        </div>
        <Link href="/org" className="text-xs text-blue-600 hover:underline font-medium">All →</Link>
      </div>
      <div className="divide-y divide-slate-50">
        {active.map(p => {
          const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors group">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: HC[p.health] }} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-700 transition-colors leading-tight">{p.code || p.name}</div>
                <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: HC[p.health] }} />
                </div>
              </div>
              <div className="text-right shrink-0 ml-1">
                <div className="text-xs font-bold" style={{ color: HC[p.health] }}>{pct}%</div>
                {p.tasksOverdue > 0 && <div style={{ fontSize: 9 }} className="text-red-400 font-medium">{p.tasksOverdue} late</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AttentionPanel({ items }: { items: OrgOverview['attention'] }) {
  if (!items.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} className="text-red-500" />
          <span className="text-sm font-bold text-slate-700">Needs attention</span>
        </div>
        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">{items.length}</span>
      </div>
      {items.slice(0, 4).map((a, i) => (
        <Link key={i} href={a.href} className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
          <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-700 truncate">{a.label}</div>
            <div style={{ fontSize: 10 }} className="text-slate-400 mt-0.5">{a.detail}</div>
          </div>
          <ChevronRight size={11} className="text-slate-300 shrink-0 mt-1" />
        </Link>
      ))}
    </div>
  );
}

/* ── PM Org pulse strip ───────────────────────────────────────────────────── */
function OrgPulse({ totals, projects }: { totals: OrgOverview['totals']; projects: OrgOverview['projects'] }) {
  const critical = projects.filter(p => p.health === 'critical').length;
  const atRisk   = projects.filter(p => p.health === 'at_risk').length;
  const allHealthy = critical === 0 && atRisk === 0;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <StatCard label="Active projects" value={totals.activeProjects} icon={FolderKanban}
        accent="#1565C0" filled
        sub={critical > 0 ? `${critical} critical` : atRisk > 0 ? `${atRisk} at risk` : 'All healthy'} />
      <StatCard label="Open tasks" value={totals.tasksOpen} icon={Target} accent="#475569"
        sub="across all projects" />
      <StatCard label="Overdue" value={totals.tasksOverdue} icon={AlertTriangle}
        accent={totals.tasksOverdue > 0 ? '#dc2626' : '#94a3b8'}
        filled={totals.tasksOverdue > 0}
        urgent={totals.tasksOverdue > 0}
        sub={totals.tasksOverdue > 0 ? 'Needs resolution' : 'None — great work'} />
      <StatCard label="Done this month" value={totals.doneThisMonth} icon={TrendingUp}
        accent="#16a34a" filled={allHealthy && totals.doneThisMonth > 0}
        sub="tasks shipped" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [summary, setSummary]   = useState<Summary | null>(null);
  const [data, setData]         = useState<{ tasks: any[]; subtasks: any[] }>({ tasks: [], subtasks: [] });
  const [projects, setProjects] = useState<any[]>([]);
  const [org, setOrg]           = useState<OrgOverview | null>(null);
  const [me, setMe]             = useState<any>(null);
  const [celebrating, setCelebrating] = useState<{ id: string; title: string } | null>(null);
  const [qaOpen, setQaOpen]     = useState(false);
  const [filter, setFilter]     = useState<'open' | 'overdue' | 'done' | 'all'>('open');

  const reload = useCallback(async () => {
    const dash = await api<any>('/dashboard');
    setSummary(dash.summary);
    setData({ tasks: dash.tasks, subtasks: dash.subtasks ?? [] });
    setMe(dash.user);
    setProjects(dash.projects ?? []);
    if (dash.user?.role === 'pm') {
      // Patch org totals from dashboard, then lazy-load full org data
      if (dash.orgTotals) {
        setOrg(prev => prev
          ? { ...prev, totals: { ...prev.totals, ...dash.orgTotals } }
          : { totals: dash.orgTotals, projects: [], people: [], attention: [] } as any
        );
      }
      api<OrgOverview>('/analytics/org/overview').then(setOrg).catch(() => {});
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function markDone(task: any) {
    if (task.status === 'done') return;
    setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === task.id ? { ...t, status: 'done' } : t) }));
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done' } });
      setCelebrating({ id: task.id, title: task.title });
      setTimeout(() => { setCelebrating(null); reload(); }, 3100);
    } catch {
      setData(d => ({ ...d, tasks: d.tasks.map(t => t.id === task.id ? { ...t, status: task.status } : t) }));
    }
  }

  const openCount    = summary?.byStatus ? Object.entries(summary.byStatus).filter(([k]) => k !== 'done').reduce((a, [, v]) => a + v, 0) : 0;
  const overdueCount = summary?.overdue ?? 0;
  const rate         = summary?.completionRate ?? 0;
  const isPM         = me?.role === 'pm';

  const dueTodayCount = data.tasks.filter(t => t.status !== 'done' && daysUntil(t.dueDate) === 0).length;

  const filteredTasks = data.tasks.filter(t => {
    if (filter === 'open')    return t.status !== 'done';
    if (filter === 'overdue') return t.status !== 'done' && t.dueDate && daysUntil(t.dueDate) !== null && daysUntil(t.dueDate)! < 0;
    if (filter === 'done')    return t.status === 'done';
    return true;
  });

  const recentWins = data.tasks.filter(t => t.status === 'done' && t.completedAt && new Date(t.completedAt) > new Date(Date.now() - 7 * 86400000)).slice(0, 5);
  const { text: greet } = me ? getGreeting(me.name) : { text: 'Welcome back' };
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const FILTERS = [
    { key: 'open',    label: 'Open',    count: openCount },
    { key: 'overdue', label: 'Overdue', count: overdueCount },
    { key: 'done',    label: 'Done',    count: null },
    { key: 'all',     label: 'All',     count: data.tasks.length },
  ] as const;

  if (!me) {
    return (
      <div className="pb-20 max-w-5xl page-enter" aria-busy="true" aria-live="polite">
        <div className="flex items-start justify-between pt-1 mb-6 gap-4">
          <div className="space-y-2">
            <div className="skeleton h-7 w-64" />
            <div className="skeleton h-3 w-44" />
          </div>
          <div className="skeleton h-9 w-28 rounded-lg" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-7 w-16" />
              <div className="skeleton h-3 w-24" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div className="skeleton h-4 w-24" />
              <div className="skeleton h-5 w-40" />
            </div>
            <div className="divide-y divide-slate-50/80">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-4">
                  <div className="skeleton h-4 w-4 rounded-full" />
                  <div className="skeleton h-4 flex-1 max-w-md" />
                  <div className="skeleton h-4 w-14" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="card p-4 space-y-2">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-12 w-full" />
            </div>
            <div className="card p-4 space-y-2">
              <div className="skeleton h-3 w-24" />
              <div className="skeleton h-12 w-full" />
            </div>
          </div>
        </div>
        <span className="sr-only">Loading your workspace…</span>
      </div>
    );
  }

  return (
    <div className="pb-20 max-w-5xl page-enter">
      {celebrating && <Celebration taskTitle={celebrating.title} onDone={() => setCelebrating(null)} />}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between pt-1 mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-tight">{greet}</h1>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <p className="text-xs text-slate-400">{todayLabel}</p>
            {isPM && org && (
              <div className="flex items-center gap-2">
                <span className="text-slate-200">·</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  org.projects.some(p => p.health === 'critical')
                    ? 'bg-red-50 text-red-600'
                    : org.projects.some(p => p.health === 'at_risk')
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-green-50 text-green-700'
                }`}>
                  {org.projects.some(p => p.health === 'critical')
                    ? `${org.projects.filter(p => p.health === 'critical').length} critical project${org.projects.filter(p => p.health === 'critical').length > 1 ? 's' : ''}`
                    : org.projects.some(p => p.health === 'at_risk')
                    ? `${org.projects.filter(p => p.health === 'at_risk').length} at risk`
                    : '✓ All projects healthy'}
                </span>
              </div>
            )}
            {!isPM && overdueCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                {overdueCount} overdue
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setQaOpen(true)} className="btn-primary shrink-0 text-sm gap-2">
          <Plus size={15} /> New task
        </button>
      </div>

      {/* ── PM: Org-wide pulse ────────────────────────────────────────────── */}
      {isPM && org && <OrgPulse totals={org.totals} projects={org.projects} />}

      {/* ── IC: Personal metrics ──────────────────────────────────────────── */}
      {!isPM && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatCard icon={CheckCircle2} label="Open tasks" value={openCount}
            accent={openCount === 0 ? '#16a34a' : '#1565C0'}
            filled={openCount === 0}
            sub={openCount === 0 ? 'All clear!' : `${overdueCount > 0 ? overdueCount + ' overdue' : 'on track'}`} />
          <StatCard icon={AlertTriangle} label="Overdue" value={overdueCount}
            accent={overdueCount > 0 ? '#dc2626' : '#94a3b8'}
            filled={overdueCount > 0}
            urgent={overdueCount > 0}
            sub={overdueCount > 0 ? 'Act now' : 'None'} />
          <StatCard icon={BarChart2} label="Completion" value={`${rate}%`}
            accent={rate >= 80 ? '#16a34a' : rate >= 50 ? '#1565C0' : '#d97706'}
            filled={rate >= 80}
            sub={rate >= 80 ? 'Excellent' : rate >= 50 ? 'Good pace' : 'Needs focus'} />
          <StatCard icon={FolderKanban} label="Projects" value={projects.length}
            accent="#0369a1" sub="active" />
        </div>
      )}

      {/* ── Urgency banner ────────────────────────────────────────────────── */}
      <UrgencyBanner overdue={overdueCount} dueToday={dueTodayCount} />

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">

        {/* Left column */}
        <div className="space-y-4">
          {/* Task card */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-800">My Work</h2>
              <div className="flex items-center gap-0.5">
                {FILTERS.map(f => {
                  const active = filter === f.key;
                  return (
                    <button key={f.key} onClick={() => setFilter(f.key)}
                      aria-pressed={active}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                        active
                          ? 'bg-brand-600 text-white shadow-brand'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                      }`}>
                      {f.label}
                      {f.count !== null && f.count > 0 && (
                        <span className={`rounded-full px-1 min-w-[16px] text-center text-[10px] font-bold ${
                          active
                            ? 'bg-white/25 text-white'
                            : f.key === 'overdue'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-slate-100 text-slate-600'
                        }`}>
                          {f.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="py-16 flex flex-col items-center text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
                  <CheckCircle2 size={22} className="text-green-400" />
                </div>
                <div className="text-sm font-bold text-slate-700">
                  {filter === 'open' ? 'All clear!' : filter === 'overdue' ? 'No overdue tasks' : 'Nothing here'}
                </div>
                <div className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                  {filter === 'open' ? 'No open tasks right now.' : 'Try a different filter.'}
                </div>
                {filter === 'open' && (
                  <button onClick={() => setQaOpen(true)} className="mt-4 btn-primary text-xs gap-1.5">
                    <Plus size={12} /> Add a task
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-50/80">
                {filteredTasks.map(t => <TaskRow key={t.id} task={t} onDone={markDone} />)}
              </div>
            )}

            <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
              <span className="text-xs text-slate-400">{filteredTasks.length} item{filteredTasks.length !== 1 ? 's' : ''}</span>
              <Link href="/projects" className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1">
                All projects <ArrowUpRight size={10} />
              </Link>
            </div>
          </div>

          {/* Sub-tasks */}
          {data.subtasks?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/40 flex items-center gap-2">
                <Zap size={12} className="text-violet-500" />
                <h3 className="text-sm font-bold text-slate-700">Sub-tasks</h3>
                <span className="text-xs font-normal text-slate-400 ml-1">({data.subtasks.length})</span>
              </div>
              {data.subtasks.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors" style={{ borderTop: i > 0 ? '1px solid #f8fafc' : undefined }}>
                  <div className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center shrink-0 ${s.status === 'done' ? 'border-green-500 bg-green-500' : 'border-slate-200'}`}>
                    {s.status === 'done' && <span className="text-white" style={{ fontSize: 7, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${s.status === 'done' ? 'line-through text-slate-300' : 'text-slate-700'}`}>{s.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{s.projectCode} · {s.taskTitle}</div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">{formatDate(s.dueDate)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Recent wins */}
          {recentWins.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target size={13} className="text-green-500" />
                  <span className="text-sm font-bold text-slate-700">Completed this week</span>
                </div>
                <span className="text-xs font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">{recentWins.length}</span>
              </div>
              {recentWins.map((t, i) => (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors" style={{ borderTop: i > 0 ? '1px solid #f8fafc' : undefined }}>
                  <div className="w-5 h-5 rounded-full bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={11} className="text-green-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-700 truncate font-medium">{t.title}</div>
                    <div className="text-[10px] text-slate-400 font-mono">{t.projectCode || t.projectName}</div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">{formatDate(t.completedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {isPM && org && <ProjectHealthPanel projects={org.projects} />}
          <UpcomingPanel tasks={data.tasks} />
          {isPM && org && org.attention.length > 0 && <AttentionPanel items={org.attention} />}

          {/* PM quick links */}
          {isPM && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Zap size={13} className="text-blue-400" />
                <span className="text-sm font-bold text-slate-700">Quick nav</span>
              </div>
              <div className="p-2 grid grid-cols-2 gap-1.5">
                {[
                  { href: '/org',      label: 'Operations Hub', color: '#dc2626' },
                  { href: '/insights', label: 'AI Insights',    color: '#d97706' },
                  { href: '/people',   label: 'People',         color: '#7c3aed' },
                  { href: '/teams',    label: 'Teams',          color: '#0369a1' },
                ].map(l => (
                  <Link key={l.href} href={l.href}
                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors group">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.color }} />
                    {l.label}
                    <ChevronRight size={10} className="ml-auto text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* IC empty state */}
          {!isPM && data.tasks.length === 0 && (
            <div className="card p-5 text-center">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Target size={18} className="text-blue-400" />
              </div>
              <div className="text-sm font-bold text-slate-700 mb-1">Board is empty</div>
              <div className="text-xs text-slate-400 mb-3 leading-relaxed">Ask your PM to assign tasks, or create your own.</div>
              <button onClick={() => setQaOpen(true)} className="btn-primary text-xs w-full justify-center gap-1.5">
                <Plus size={12} /> Add first task
              </button>
            </div>
          )}
        </div>
      </div>

      {me && <QuickAdd projects={projects} userId={me.id} onAdded={reload} open={qaOpen} onClose={() => setQaOpen(false)} />}
    </div>
  );
}
