'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Card, EmptyState, LifecycleTag, PriorityTag, StatusTag, TaskLink, formatDate, daysUntil } from '@/components/ui';
import { getTodaysPrinciple } from '@/lib/alp';
import { getGreeting, getCelebrationAugment, getTodaysQuote } from '@/lib/culture';
import { parseNaturalInput } from '@/lib/naturalDate';

interface Summary {
  totalAssigned: number;
  completed: number;
  overdue: number;
  dueThisWeek: number;
  completionRate: number;
  byStatus: Record<string, number>;
}

// ── Confetti celebration ──────────────────────────────────────────────────────
const CONFETTI_COLORS = ['#1565C0', '#1E88E5', '#43A047', '#388E3C', '#FFA726', '#EF5350', '#AB47BC', '#26C6DA'];

function Celebration({
  taskTitle,
  isGxP,
  daysEarly,
  onDone
}: {
  taskTitle: string;
  isGxP: boolean;
  daysEarly: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);

  const dots = Array.from({ length: 72 }, (_, i) => ({
    id: i,
    left: (i * 1.4) % 100,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    size: 5 + (i % 7) * 1.5,
    delay: (i * 0.022) % 0.9,
    duration: 0.85 + (i % 7) * 0.14,
    round: i % 3 !== 0,
  }));

  const augment = getCelebrationAugment({ daysEarly, isGxP });

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {dots.map((d) => (
        <div
          key={d.id}
          style={{
            position: 'absolute',
            left: `${d.left}%`,
            top: '-12px',
            width: d.size,
            height: d.size,
            backgroundColor: d.color,
            borderRadius: d.round ? '50%' : '2px',
            animation: `confetti-fall ${d.duration}s ${d.delay}s ease-in forwards`,
          }}
        />
      ))}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ animation: 'celebration-pop 0.35s ease-out forwards' }}
      >
        <div className="bg-white rounded-3xl shadow-2xl px-10 py-8 text-center max-w-xs mx-4 border border-blue-100">
          <div className="text-5xl mb-3 select-none">{isGxP ? '🏅' : '🎉'}</div>
          <div className="text-2xl font-black text-slate-900">
            {daysEarly >= 2 ? 'Shabash! ⚡' : isGxP ? 'Wah-wah! 🌟' : 'Task done!'}
          </div>
          <div className="text-slate-500 mt-2 text-sm line-clamp-2 font-medium">"{taskTitle}"</div>
          <div className="mt-3 text-xs text-brand-600 font-semibold leading-relaxed">{augment}</div>
        </div>
      </div>
    </div>
  );
}

// ── Daily Leadership Principle ────────────────────────────────────────────────
function DailyPrinciple() {
  const principle = useMemo(() => getTodaysPrinciple(), []);
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50 to-blue-50 px-4 py-3 cursor-pointer select-none"
      onClick={() => setExpanded((v) => !v)}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
          style={{ background: 'linear-gradient(135deg, #1565C0, #1E88E5)' }}
        >
          {principle.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-brand-500/70">
            Today's Principle · #{principle.number} of 16
          </div>
          <div className="font-bold text-brand-800 text-sm leading-snug">
            {principle.title}
          </div>
          <div className="text-xs text-brand-600/70 mt-0.5 italic">"{principle.tagline}"</div>
        </div>
        <div className="text-brand-400 text-xs shrink-0">{expanded ? '▲' : '▼'}</div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-brand-100 space-y-2">
          <p className="text-xs text-slate-600 leading-relaxed">{principle.text}</p>
          <div className="bg-white/70 rounded-lg px-3 py-2 border border-brand-100">
            <div className="text-[10px] font-bold uppercase tracking-wider text-forest-700 mb-1">
              For QI work specifically
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{principle.qiLens}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quality quote strip ───────────────────────────────────────────────────────
function QuoteStrip() {
  const { quote, author } = useMemo(() => getTodaysQuote(), []);
  return (
    <div className="flex items-start gap-2 px-4 py-2.5 bg-forest-50 border border-forest-100 rounded-lg">
      <div className="text-forest-400 text-lg leading-none mt-0.5 shrink-0">"</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-forest-800 italic leading-relaxed">{quote}</p>
        <p className="text-[10px] text-forest-600 font-semibold mt-1">— {author}</p>
      </div>
    </div>
  );
}

// ── Quick-add task ────────────────────────────────────────────────────────────
function QuickAdd({ projects, currentUserId, onAdded }: {
  projects: any[];
  currentUserId: string;
  onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const [projectId, setProjectId] = useState('');
  const [saving, setSaving] = useState(false);

  // Live parse as user types
  const parsed = useMemo(() => parseNaturalInput(raw), [raw]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.title.trim() || !projectId) return;
    setSaving(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          title: parsed.title.trim(),
          projectId,
          assigneeId: currentUserId,
          dueDate: parsed.dueDate || undefined,
          priority: parsed.priority || undefined,
        }
      });
      setRaw(''); setProjectId('');
      setOpen(false);
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-brand-600 text-white rounded-full shadow-xl hover:bg-brand-700 active:scale-95 flex items-center justify-center text-3xl z-40 transition-all"
        title="Add a task — Bias for Action"
      >
        +
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setOpen(false)} />
      <div className="fixed bottom-8 right-8 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 w-84" style={{ width: 340 }}>
        <div className="flex justify-between items-center mb-1">
          <div className="font-semibold text-slate-800">Add a task</div>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">✕</button>
        </div>
        <p className="text-[10px] text-brand-500/70 uppercase tracking-wider font-semibold mb-3">
          Bias for Action — speak naturally
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <input
              autoFocus
              className="input"
              placeholder='e.g. "review IDP docs by friday" or "urgent: fix login"'
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              required
            />
            {/* Live parse preview */}
            {raw.trim() && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {parsed.title !== raw.trim() && (
                  <span className="text-[11px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    📝 {parsed.title || '…'}
                  </span>
                )}
                {parsed.dueDate && (
                  <span className="text-[11px] bg-forest-50 text-forest-700 px-2 py-0.5 rounded-full font-medium">
                    📅 {new Date(parsed.dueDate + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
                {parsed.priority && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    ⚡ {parsed.priority}
                  </span>
                )}
              </div>
            )}
          </div>
          <select
            className="select"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            required
          >
            <option value="">Select project…</option>
            {projects.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.code ? `${p.code} · ` : ''}{p.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="btn-primary w-full justify-center"
            disabled={saving || !parsed.title.trim() || !projectId}
          >
            {saving ? 'Adding…' : '+ Add task'}
          </button>
        </form>
      </div>
    </>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<{ tasks: any[]; subtasks: any[] }>({ tasks: [], subtasks: [] });
  const [projects, setProjects] = useState<any[]>([]);
  const [filter, setFilter] = useState<'open' | 'overdue' | 'done' | 'all'>('open');
  const [me, setMe] = useState<any>(null);
  const [celebrating, setCelebrating] = useState<{
    id: string; title: string; isGxP: boolean; daysEarly: number;
  } | null>(null);

  const principle = useMemo(() => getTodaysPrinciple(), []);

  const reload = useCallback(() => {
    api<Summary>('/me/summary').then(setSummary);
    api<{ tasks: any[]; subtasks: any[] }>('/me/tasks').then(setData);
  }, []);

  useEffect(() => {
    reload();
    api('/auth/me').then((d: any) => setMe(d.user));
    api('/projects').then(setProjects);
  }, [reload]);

  async function markDone(task: any) {
    if (task.status === 'done') return;
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === task.id ? { ...t, status: 'done' } : t) }));
    try {
      await api(`/tasks/${task.id}`, { method: 'PATCH', body: { status: 'done' } });
      const daysEarly = task.dueDate ? Math.max(0, daysUntil(task.dueDate) ?? 0) : 0;
      setCelebrating({ id: task.id, title: task.title, isGxP: !!task.gxpCritical, daysEarly });
      setTimeout(() => { setCelebrating(null); reload(); }, 3100);
    } catch {
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => t.id === task.id ? { ...t, status: task.status } : t) }));
    }
  }

  const openCount = summary?.byStatus
    ? Object.entries(summary.byStatus).filter(([k]) => k !== 'done').reduce((a, [, v]) => a + v, 0)
    : 0;

  const filteredTasks = data.tasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'open') return t.status !== 'done';
    if (filter === 'overdue') return t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date();
    if (filter === 'done') return t.status === 'done';
    return true;
  });

  const recentWins = data.tasks
    .filter((t) => t.status === 'done' && t.completedAt)
    .filter((t) => {
      const d = new Date(t.completedAt);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      return d > cutoff;
    })
    .slice(0, 5);

  const { text: greetText, sub: greetSub } = me ? getGreeting(me.name) : { text: 'Welcome back 👋', sub: '' };

  const overdueCount = summary?.overdue ?? 0;
  const subGreeting = openCount > 0
    ? overdueCount > 0
      ? `${openCount} tasks open · ${overdueCount} overdue — ${principle.overdueNudge}`
      : `${openCount} task${openCount !== 1 ? 's' : ''} waiting for you.`
    : 'All caught up! Deliver Results — what will you build next?';

  return (
    <div className="space-y-5 pb-24">
      {celebrating && (
        <Celebration
          taskTitle={celebrating.title}
          isGxP={celebrating.isGxP}
          daysEarly={celebrating.daysEarly}
          onDone={() => setCelebrating(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{greetText}</h1>
          {greetSub && (
            <p className="text-[11px] text-brand-400 font-medium mt-0.5 uppercase tracking-wider">{greetSub}</p>
          )}
          <p className="text-slate-500 text-sm mt-1">{subGreeting}</p>
        </div>
        {me?.role === 'employee' && (
          <Link
            href="/yearly"
            className="shrink-0 text-xs text-brand-600 font-semibold hover:underline mt-1"
          >
            My year →
          </Link>
        )}
      </div>

      {/* Daily principle */}
      <DailyPrinciple />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Open tasks', value: openCount,              sub: 'in your bucket',       tone: 'default' },
          { label: 'Due this week', value: summary?.dueThisWeek ?? 0, sub: 'act early',         tone: 'warn'    },
          { label: 'Overdue',  value: overdueCount,             sub: overdueCount ? "Insist on standards" : 'clean slate ✓', tone: overdueCount ? 'bad' : 'default' },
          { label: 'Done',     value: summary?.completed ?? 0,  sub: `${summary?.completionRate ?? 0}% delivered`, tone: 'good' }
        ].map(({ label, value, sub, tone }) => (
          <div key={label} className="card p-4 border-t-2 border-t-brand-500/20">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-600/60">{label}</div>
            <div className={`text-3xl font-black mt-1 ${
              tone === 'warn'                  ? 'text-amber-500' :
              tone === 'bad' && value > 0      ? 'text-red-600' :
              tone === 'good'                  ? 'text-forest-600' :
              'text-brand-700'
            }`}>
              {value}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Task list */}
      <Card
        title="My tasks"
        action={
          <div className="flex gap-1">
            {(['open', 'overdue', 'done', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-xs capitalize ${
                  filter === f ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        }
      >
        {filteredTasks.length === 0 ? (
          <EmptyState
            title={filter === 'open' ? 'All clear! 🎉' : 'Nothing here'}
            hint={
              filter === 'open'
                ? `${principle.emptyHint} Tap + to add.`
                : 'Try a different filter.'
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTasks.map((t) => {
              const d = daysUntil(t.dueDate);
              const overdue = d !== null && d < 0 && t.status !== 'done';
              const done = t.status === 'done';
              return (
                <div key={t.id} className="py-3 flex items-center gap-3">
                  <button
                    onClick={() => !done && markDone(t)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      done
                        ? 'border-forest-500 bg-forest-500 text-white'
                        : 'border-slate-300 hover:border-brand-500 hover:bg-brand-50'
                    }`}
                    title={done ? 'Completed' : 'Mark as done'}
                    disabled={done}
                  >
                    {done && <span className="text-[10px] font-bold">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-2 flex-wrap ${done ? 'opacity-50' : ''}`}>
                      <TaskLink task={t} />
                      {t.gxpCritical && (
                        <span className="tag bg-red-50 text-red-700 border border-red-200 text-[10px]" title="GxP critical — highest standards apply">
                          GxP
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <Link href={`/projects/${t.projectId}`} className="hover:underline hover:text-brand-600">
                        {t.projectCode || t.projectName}
                      </Link>
                      {t.lifecycle && t.lifecycle !== 'generic' && (
                        <><span>·</span><LifecycleTag lifecycle={t.lifecycle} /></>
                      )}
                      {t.subtaskCount > 0 && (
                        <><span>·</span><span>{t.subtasksDone}/{t.subtaskCount} subtasks</span></>
                      )}
                    </div>
                  </div>

                  <PriorityTag priority={t.priority} />

                  <div className={`text-xs text-right w-24 shrink-0 ${overdue ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                    {t.dueDate ? formatDate(t.dueDate) : '—'}
                    {d !== null && !done && (
                      <div className="text-[10px]">
                        {d < 0 ? `${-d}d overdue` : d === 0 ? 'due today' : `in ${d}d`}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* My subtasks (micro-tasks) */}
      {data.subtasks?.length > 0 && (
        <Card title="My micro-tasks">
          <div className="divide-y divide-slate-100">
            {data.subtasks.map((s) => (
              <div key={s.id} className="py-2 flex items-center gap-3 text-sm">
                <div className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${
                  s.status === 'done' ? 'border-forest-500 bg-forest-500' : 'border-slate-300'
                }`}>
                  {s.status === 'done' && <span className="text-white text-[9px] font-bold">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={s.status === 'done' ? 'line-through text-slate-400' : ''}>{s.title}</div>
                  <div className="text-xs text-slate-400">{s.projectCode} · {s.taskTitle}</div>
                </div>
                <StatusTag status={s.status} />
                <div className="text-xs text-slate-400 w-24 text-right">{formatDate(s.dueDate)}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Recent wins */}
      {recentWins.length > 0 && (
        <Card title="Recent wins 🏆">
          <p className="text-xs text-slate-400 mb-3">
            Tasks delivered in the last 7 days · Deliver Results
          </p>
          <div className="space-y-2">
            {recentWins.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <div className="w-5 h-5 rounded-full bg-forest-100 text-forest-600 flex items-center justify-center text-xs font-bold shrink-0">✓</div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-700 truncate">{t.title}</div>
                  <div className="text-xs text-slate-400">{t.projectCode || t.projectName}</div>
                </div>
                <div className="text-xs text-forest-600 font-medium shrink-0">{formatDate(t.completedAt)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-50 text-center text-[10px] text-slate-300 uppercase tracking-widest">
            Alembic · Touching Lives over 100 Years
          </div>
        </Card>
      )}

      {/* Daily quote */}
      <QuoteStrip />

      {/* Quick-add FAB */}
      {me && (
        <QuickAdd projects={projects} currentUserId={me.id} onAdded={reload} />
      )}
    </div>
  );
}
