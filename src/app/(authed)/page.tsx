'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { LifecycleTag, PriorityTag, TaskLink, StatusTag, formatDate, daysUntil } from '@/components/ui';
import { getGreeting } from '@/lib/culture';
import { parseNaturalInput } from '@/lib/naturalDate';
import {
  CheckCircle2, Clock, AlertTriangle, TrendingUp, FolderKanban,
  Users, ChevronRight, Flame, Zap, Target,
} from 'lucide-react';

/* ─── Types ────────────────────────────────────────────────────────────── */
interface Summary {
  totalAssigned: number; completed: number; overdue: number;
  dueThisWeek: number; completionRate: number; byStatus: Record<string, number>;
}
interface OrgOverview {
  totals: { tasksOpen: number; tasksOverdue: number; activeProjects: number; users: number; doneThisMonth: number };
  projects: Array<{
    id: string; name: string; code: string; status: string;
    taskCount: number; tasksDone: number; tasksOverdue: number;
    health: 'good' | 'at_risk' | 'critical'; dueDate: string | null;
  }>;
  attention: Array<{ severity: 'critical' | 'warn'; label: string; detail: string; href: string }>;
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */
const CONFETTI_COLORS = ['#1565C0','#1E88E5','#43A047','#388E3C','#FFA726','#EF5350','#AB47BC','#26C6DA'];
const HEALTH_COLOR = { good: '#22c55e', at_risk: '#f59e0b', critical: '#ef4444' };
const HEALTH_BG    = { good: '#f0fdf4', at_risk: '#fffbeb', critical: '#fef2f2' };
const HEALTH_LABEL = { good: 'On track', at_risk: 'At risk', critical: 'Critical' };

function HealthDot({ h }: { h: 'good' | 'at_risk' | 'critical' }) {
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: HEALTH_COLOR[h] }} />;
}

/* ─── Celebration overlay ──────────────────────────────────────────────── */
function Celebration({ taskTitle, onDone }: { taskTitle: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  const dots = Array.from({ length: 60 }, (_, i) => ({
    id: i, left: (i * 1.7) % 100, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 5 + (i % 6) * 1.5, delay: (i * 0.025) % 0.9,
    duration: 0.85 + (i % 7) * 0.14, round: i % 3 !== 0,
  }));
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {dots.map((d) => (
        <div key={d.id} style={{
          position: 'absolute', left: `${d.left}%`, top: '-12px',
          width: d.size, height: d.size, backgroundColor: d.color,
          borderRadius: d.round ? '50%' : '2px',
          animation: `confetti-fall ${d.duration}s ${d.delay}s ease-in forwards`,
        }} />
      ))}
      <div className="absolute inset-0 flex items-center justify-center" style={{ animation: 'celebration-pop 0.35s ease-out forwards' }}>
        <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 text-center max-w-xs mx-4 border border-slate-100">
          <div className="text-4xl mb-3 select-none">✅</div>
          <div className="text-xl font-black text-slate-900">Task Completed</div>
          <div className="text-slate-400 mt-2 text-sm line-clamp-2">"{taskTitle}"</div>
        </div>
      </div>
    </div>
  );
}

/* ─── QuickAdd modal ───────────────────────────────────────────────────── */
function QuickAdd({ projects, currentUserId, onAdded, open, onClose }: {
  projects: any[]; currentUserId: string; onAdded: () => void;
  open: boolean; onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseNaturalInput(raw), [raw]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.title.trim() || !projectId) return;
    setSaving(true);
    try {
      await api('/tasks', { method: 'POST', body: {
        title: parsed.title.trim(), projectId,
        assigneeId: currentUserId,
        dueDate: parsed.dueDate || undefined,
        priority: parsed.priority || undefined,
      }});
      setRaw(''); setProjectId(''); onClose(); onAdded();
    } finally { setSaving(false); }
  }

  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-2xl border border-slate-100 p-5" style={{ width: 380 }}>
        <div className="flex justify-between items-center mb-4">
          <div className="font-bold text-slate-800">Create task</div>
          <button onClick={onClose} className="text-slate-300 hover:text-slate-500 text-lg leading-none">✕</button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <input autoFocus className="input text-sm"
              placeholder='"review IDP docs by friday" or "urgent: fix login"'
              value={raw} onChange={(e) => setRaw(e.target.value)} required />
            {raw.trim() && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {parsed.title !== raw.trim() && (
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">{parsed.title || '…'}</span>
                )}
                {parsed.dueDate && (
                  <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                    {new Date(parsed.dueDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
                {parsed.priority && parsed.priority !== 'low' && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium">{parsed.priority}</span>
                )}
              </div>
            )}
          </div>
          <select className="select text-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
            <option value="">Select project…</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>
            ))}
          </select>
          <button type="submit"
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 transition-opacity"
            style={{ background: '#1565C0' }}
            disabled={saving || !parsed.title.trim() || !projectId}>
            {saving ? 'Creating…' : 'Create task'}
          </button>
        </form>
      </div>
    </>
  );
}

/* ─── Stat card ────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, color, bg, sub }: {
  icon: any; label: string; value: string | number; color: string; bg: string; sub?: string;
}) {
  return (
    <div className="rounded-xl px-4 py-3.5 flex items-center gap-3 border border-slate-100 bg-white shadow-sm">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="min-w-0">
        <div style={{ fontSize: 10, letterSpacing: '0.07em' }} className="text-slate-400 uppercase font-semibold truncate">{label}</div>
        <div className="text-2xl font-black tracking-tight leading-none mt-0.5" style={{ color }}>{value}</div>
        {sub && <div style={{ fontSize: 10 }} className="text-slate-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Project health sidebar card ─────────────────────────────────────── */
function ProjectHealthPanel({ projects }: { projects: OrgOverview['projects'] }) {
  const active = projects.filter(p => p.status === 'in_progress').slice(0, 6);
  if (!active.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <FolderKanban size={14} className="text-blue-500" /> Project Health
        </h3>
        <Link href="/org" className="text-xs text-blue-600 hover:underline">All →</Link>
      </div>
      <div className="divide-y divide-slate-50">
        {active.map(p => {
          const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
          return (
            <Link key={p.id} href={`/projects/${p.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
              <HealthDot h={p.health} />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-700 transition-colors">
                  {p.code ? `${p.code}` : p.name}
                </div>
                <div className="mt-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${pct}%`,
                    background: HEALTH_COLOR[p.health],
                  }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-bold" style={{ color: HEALTH_COLOR[p.health] }}>{pct}%</div>
                {p.tasksOverdue > 0 && (
                  <div style={{ fontSize: 9 }} className="text-red-400 font-medium">{p.tasksOverdue} late</div>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Upcoming deadlines panel ─────────────────────────────────────────── */
function UpcomingPanel({ tasks }: { tasks: any[] }) {
  const upcoming = tasks
    .filter(t => t.status !== 'done' && t.dueDate)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 7);

  if (!upcoming.length) return (
    <div className="card px-4 py-5 text-center">
      <div className="text-slate-300 text-xs">No upcoming deadlines</div>
    </div>
  );

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <Clock size={14} className="text-amber-500" /> Upcoming Deadlines
        </h3>
      </div>
      <div className="divide-y divide-slate-50">
        {upcoming.map(t => {
          const d = daysUntil(t.dueDate);
          const overdue = d !== null && d < 0;
          const today = d === 0;
          const soon = d !== null && d <= 2 && d >= 0;
          return (
            <div key={t.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${overdue ? 'bg-red-500' : today || soon ? 'bg-amber-400' : 'bg-slate-200'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-700 font-medium truncate leading-tight">{t.title}</div>
                <div style={{ fontSize: 10 }} className="text-slate-400 font-mono mt-0.5">{t.projectCode || t.projectName}</div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-xs font-semibold ${overdue ? 'text-red-500' : today ? 'text-amber-600' : 'text-slate-500'}`}>
                  {overdue ? `${Math.abs(d!)}d late` : today ? 'Today' : d === 1 ? 'Tomorrow' : formatDate(t.dueDate)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Needs attention panel ────────────────────────────────────────────── */
function AttentionPanel({ items }: { items: OrgOverview['attention'] }) {
  if (!items.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
          <AlertTriangle size={14} className="text-red-500" /> Needs Attention
        </h3>
        <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{items.length}</span>
      </div>
      <div className="divide-y divide-slate-50">
        {items.slice(0, 5).map((a, i) => (
          <Link key={i} href={a.href}
            className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors">
            <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-slate-700 truncate">{a.label}</div>
              <div style={{ fontSize: 10 }} className="text-slate-400 mt-0.5">{a.detail}</div>
            </div>
            <ChevronRight size={12} className="text-slate-300 shrink-0 mt-0.5" />
          </Link>
        ))}
      </div>
      {items.length > 5 && (
        <div className="px-4 py-2 border-t border-slate-50">
          <Link href="/org" className="text-xs text-blue-600 hover:underline">View {items.length - 5} more →</Link>
        </div>
      )}
    </div>
  );
}

/* ─── Main dashboard ───────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<{ tasks: any[]; subtasks: any[] }>({ tasks: [], subtasks: [] });
  const [projects, setProjects] = useState<any[]>([]);
  const [org, setOrg] = useState<OrgOverview | null>(null);
  const [filter, setFilter] = useState<'open' | 'overdue' | 'done' | 'all'>('open');
  const [me, setMe] = useState<any>(null);
  const [celebrating, setCelebrating] = useState<{ id: string; title: string } | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const reload = useCallback(() => {
    api<Summary>('/me/summary').then(setSummary);
    api<{ tasks: any[]; subtasks: any[] }>('/me/tasks').then(setData);
  }, []);

  useEffect(() => {
    reload();
    api('/auth/me').then((d: any) => {
      setMe(d.user);
      if (d.user?.role === 'pm') {
        api<OrgOverview>('/analytics/org/overview').then(setOrg).catch(() => {});
      }
    });
    api('/projects').then(setProjects);
  }, [reload]);

  async function markDone(task: any) {
    if (task.status === 'done') return;
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === task.id ? { ...t, status: 'done' } : t) }));
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done' } });
      setCelebrating({ id: task.id, title: task.title });
      setTimeout(() => { setCelebrating(null); reload(); }, 3100);
    } catch {
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === task.id ? { ...t, status: task.status } : t) }));
    }
  }

  const openCount = summary?.byStatus
    ? Object.entries(summary.byStatus).filter(([k]) => k !== 'done').reduce((a, [, v]) => a + v, 0)
    : 0;
  const overdueCount = summary?.overdue ?? 0;

  const filteredTasks = data.tasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'overdue') return t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date();
    if (filter === 'done') return t.status === 'done';
    return true;
  });

  const recentWins = data.tasks
    .filter((t) => t.status === 'done' && t.completedAt)
    .filter((t) => new Date(t.completedAt) > new Date(Date.now() - 7 * 86400000))
    .slice(0, 5);

  const { text: greetText } = me ? getGreeting(me.name) : { text: 'Welcome back' };
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const isPM = me?.role === 'pm';

  return (
    <div className="pb-24">
      {celebrating && <Celebration taskTitle={celebrating.title} onDone={() => setCelebrating(null)} />}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between pt-1 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{greetText}</h1>
          <p className="text-xs text-slate-400 mt-0.5">{today}</p>
        </div>
        <button onClick={() => setQuickAddOpen(true)} className="btn-primary text-xs" style={{ background: '#1565C0' }}>
          + Create task
        </button>
      </div>

      {/* ── KPI strip ───────────────────────────────────────────────────── */}
      <div className="grid gap-3 mb-5" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <StatCard icon={Zap}          label="Open"          value={openCount}                color="#0f172a" bg="#f1f5f9"
          sub={openCount === 0 ? 'All clear!' : `${openCount} task${openCount !== 1 ? 's' : ''}`} />
        <StatCard icon={Clock}        label="Due this week" value={summary?.dueThisWeek ?? 0} color="#1565C0" bg="#EFF6FF" />
        <StatCard icon={AlertTriangle} label="Overdue"      value={overdueCount}
          color={overdueCount > 0 ? '#dc2626' : '#0f172a'} bg={overdueCount > 0 ? '#FEF2F2' : '#f1f5f9'}
          sub={overdueCount > 0 ? 'Action needed' : 'None'} />
        <StatCard icon={CheckCircle2} label="Completed"     value={summary?.completed ?? 0}  color="#15803d" bg="#F0FDF4" />
        <StatCard icon={TrendingUp}   label="Completion"    value={`${summary?.completionRate ?? 0}%`} color="#7c3aed" bg="#f5f3ff" />
        <StatCard icon={FolderKanban} label="Projects"
          value={isPM ? (org?.totals.activeProjects ?? '—') : projects.length}
          color="#0369a1" bg="#f0f9ff"
          sub={isPM ? 'active' : undefined} />
      </div>

      {/* ── Main 2-column layout ─────────────────────────────────────────── */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 280px' }}>

        {/* Left column */}
        <div className="space-y-4 min-w-0">

          {/* My Work Items */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
              <h3 className="text-sm font-semibold text-slate-700">My Work Items</h3>
              <div className="flex items-center gap-1">
                {(['open', 'overdue', 'done', 'all'] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className="px-3 py-1 rounded text-xs font-medium transition-colors capitalize"
                    style={{
                      background: filter === f ? '#1565C0' : 'transparent',
                      color: filter === f ? '#fff' : '#94a3b8',
                    }}>
                    {f === 'open' ? `Open (${openCount})` : f === 'overdue' ? `Overdue (${overdueCount})` : f === 'done' ? 'Done' : 'All'}
                  </button>
                ))}
              </div>
            </div>

            {filteredTasks.length > 0 && (
              <div className="grid px-4 py-2 border-b border-slate-100 bg-slate-50/40"
                   style={{ gridTemplateColumns: '20px 1fr 100px 80px 72px 72px', gap: '0 10px' }}>
                <div />
                {['Summary', 'Project', 'Type', 'Priority', 'Due'].map(h => (
                  <div key={h} style={{ fontSize: 10, letterSpacing: '0.08em' }} className="text-slate-400 uppercase font-semibold last:text-right">{h}</div>
                ))}
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <div className="py-14 text-center">
                <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 size={20} className="text-green-400" />
                </div>
                <div className="text-slate-500 text-sm font-semibold">
                  {filter === 'open' ? 'All caught up!' : filter === 'overdue' ? 'No overdue tasks' : 'No tasks found'}
                </div>
                <div className="text-slate-300 text-xs mt-1">
                  {filter === 'open' ? 'No open tasks right now.' : 'Try a different filter.'}
                </div>
                {filter === 'open' && (
                  <button onClick={() => setQuickAddOpen(true)}
                    className="mt-3 text-xs text-blue-600 font-medium hover:underline">
                    + Add a task
                  </button>
                )}
              </div>
            ) : (
              <div>
                {filteredTasks.map((t, i) => {
                  const d = daysUntil(t.dueDate);
                  const overdue = d !== null && d < 0 && t.status !== 'done';
                  const done = t.status === 'done';
                  return (
                    <div key={t.id}
                      className="grid items-center px-4 py-2.5 hover:bg-blue-50/30 transition-colors"
                      style={{ gridTemplateColumns: '20px 1fr 100px 80px 72px 72px', gap: '0 10px', borderTop: i > 0 ? '1px solid #f1f5f9' : undefined }}>
                      <button
                        onClick={() => !done && markDone(t)}
                        disabled={done}
                        className="w-4 h-4 rounded-full border transition-all flex items-center justify-center shrink-0"
                        style={{
                          borderColor: done ? '#22c55e' : overdue ? '#ef4444' : '#cbd5e1',
                          background: done ? '#22c55e' : 'transparent',
                        }}>
                        {done && <span className="text-white" style={{ fontSize: 8, fontWeight: 900 }}>✓</span>}
                      </button>
                      <div className={done ? 'opacity-40' : ''}>
                        <div className="flex items-center gap-2">
                          <TaskLink task={t} />
                          {t.gxpCritical && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded">GxP</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <Link href={`/projects/${t.projectId}`}
                          className="text-xs text-slate-500 hover:text-blue-700 font-mono truncate block transition-colors">
                          {t.projectCode || t.projectName || '—'}
                        </Link>
                      </div>
                      <div>
                        {t.lifecycle && t.lifecycle !== 'generic'
                          ? <LifecycleTag lifecycle={t.lifecycle} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </div>
                      <div>
                        {t.priority && t.priority !== 'low'
                          ? <PriorityTag priority={t.priority} />
                          : <span className="text-xs text-slate-300">—</span>}
                      </div>
                      <div className="text-right">
                        <div className={`text-xs font-medium ${overdue ? 'text-red-600' : done ? 'text-slate-300' : 'text-slate-500'}`}>
                          {t.dueDate ? formatDate(t.dueDate) : '—'}
                        </div>
                        {d !== null && !done && (
                          <div style={{ fontSize: 10 }} className={overdue ? 'text-red-400' : 'text-slate-300'}>
                            {d < 0 ? `${-d}d overdue` : d === 0 ? 'today' : `in ${d}d`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between">
              <span className="text-xs text-slate-400">{filteredTasks.length} item{filteredTasks.length !== 1 ? 's' : ''}</span>
              <Link href="/projects" className="text-xs text-blue-700 font-medium hover:underline">View all projects →</Link>
            </div>
          </div>

          {/* Sub-tasks */}
          {data.subtasks?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
                <h3 className="text-sm font-semibold text-slate-700">Sub-tasks</h3>
              </div>
              {data.subtasks.map((s, i) => (
                <div key={s.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50/30 transition-colors"
                  style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : undefined }}>
                  <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${s.status === 'done' ? 'border-green-500 bg-green-500' : 'border-slate-200'}`}>
                    {s.status === 'done' && <span className="text-white" style={{ fontSize: 7, fontWeight: 900 }}>✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${s.status === 'done' ? 'line-through text-slate-300' : 'text-slate-700'}`}>{s.title}</div>
                    <div className="text-xs text-slate-400 font-mono">{s.projectCode} · {s.taskTitle}</div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0">{formatDate(s.dueDate)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Completed this week */}
          {recentWins.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <Target size={14} className="text-green-500" /> Completed this week
                </h3>
                <span className="text-xs text-slate-400">{recentWins.length} item{recentWins.length !== 1 ? 's' : ''}</span>
              </div>
              {recentWins.map((t, i) => (
                <div key={t.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors"
                  style={{ borderTop: i > 0 ? '1px solid #f1f5f9' : undefined }}>
                  <div className="w-4 h-4 rounded-full bg-green-400 border border-green-400 flex items-center justify-center shrink-0">
                    <span className="text-white" style={{ fontSize: 8, fontWeight: 900 }}>✓</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-slate-600 truncate">{t.title}</div>
                    <div className="text-xs text-slate-400 font-mono">{t.projectCode || t.projectName}</div>
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
        </div>
      </div>

      {me && <QuickAdd projects={projects} currentUserId={me.id} onAdded={reload} open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />}
    </div>
  );
}
