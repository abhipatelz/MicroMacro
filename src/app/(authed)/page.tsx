'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { LifecycleTag, PriorityTag, TaskLink, formatDate, daysUntil } from '@/components/ui';
import { getGreeting, getTodaysQuote } from '@/lib/culture';
import { parseNaturalInput } from '@/lib/naturalDate';
import {
  CheckCircle2, Clock, AlertTriangle, TrendingUp, FolderKanban,
  ChevronRight, Flame, Target, Plus, ArrowUpRight, Activity,
  Zap, BarChart2, CircleCheck, Sparkles, Quote, Calendar, Command,
} from 'lucide-react';

/* ── Animated count-up — gives numbers a subtle "alive" feel ──────────────── */
function useCountUp(target: number, durationMs = 700) {
  const [val, setVal] = useState(0);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') { setVal(target); return; }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || target === 0) { setVal(target); return; }
    fromRef.current = val;
    startRef.current = null;
    const step = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setVal(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return val;
}

function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const v = useCountUp(value);
  return <>{v}{suffix}</>;
}

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Summary {
  totalAssigned: number; completed: number; overdue: number;
  dueThisWeek: number; completionRate: number; byStatus: Record<string, number>;
}
interface OrgOverview {
  totals: { tasksOpen: number; tasksOverdue: number; activeProjects: number; users: number; doneThisMonth: number };
  projects: Array<{ id: string; name: string; code: string; status: string; taskCount: number; tasksDone: number; tasksOverdue: number; health: 'good' | 'at_risk' | 'critical'; dueDate: string | null; lastActivity?: string }>;
  attention: Array<{ severity: 'critical' | 'warn'; label: string; detail: string; href: string }>;
}

/** Living pulse — derives a green/amber/grey indicator from lastActivity. */
function pulseFor(lastActivity?: string): { color: string; label: string; pulsing: boolean } {
  if (!lastActivity) return { color: '#cbd5e1', label: 'Quiet', pulsing: false };
  const hoursAgo = (Date.now() - new Date(lastActivity).getTime()) / 3_600_000;
  if (hoursAgo <= 24)      return { color: '#43A047', label: 'Active today', pulsing: true };
  if (hoursAgo <= 24 * 3)  return { color: '#43A047', label: `${Math.round(hoursAgo / 24)}d ago`, pulsing: false };
  if (hoursAgo <= 24 * 7)  return { color: '#f59e0b', label: `${Math.round(hoursAgo / 24)}d ago`, pulsing: false };
  return { color: '#cbd5e1', label: 'Quiet', pulsing: false };
}

/* ── Confetti — Alembic brand palette ─────────────────────────────────────── */
const CONFETTI = ['#1565C0','#1E88E5','#90CAF9','#43A047','#A5D6A7','#0D47A1'];
function Celebration({ taskTitle, onDone }: { taskTitle: string; onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3000); return () => clearTimeout(t); }, [onDone]);
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden flex items-center justify-center p-4">
      {Array.from({ length: 24 }, (_, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${(i * 4.2) % 100}%`, top: '-12px',
          width: 5 + (i % 5) * 1.5, height: 5 + (i % 5) * 1.5,
          backgroundColor: CONFETTI[i % CONFETTI.length],
          borderRadius: i % 3 !== 0 ? '50%' : '2px',
          animation: `confetti-fall ${0.9 + (i % 5) * 0.15}s ${(i * 0.03) % 0.5}s ease-in forwards`,
        }} />
      ))}
      <div className="bg-white rounded-2xl shadow-2xl px-10 py-8 text-center max-w-xs border border-slate-100 modal-in">
        <div className="text-4xl mb-3">✅</div>
        <div className="text-xl font-black text-slate-900">Done!</div>
        <div className="text-slate-400 mt-2 text-sm line-clamp-2">"{taskTitle}"</div>
      </div>
    </div>
  );
}

/* ── Quick-add modal ──────────────────────────────────────────────────────── */
type Priority = 'low' | 'medium' | 'high' | 'urgent';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function shiftDateISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function QuickAdd({ projects, userId, onAdded, open, onClose }: {
  projects: any[]; userId: string; onAdded: () => void; open: boolean; onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [projectId, setPId] = useState('');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [dueOverride, setDueOverride] = useState<string>('');
  const [priorityOverride, setPriorityOverride] = useState<Priority | ''>('');
  const [personal, setPersonal] = useState<{ id: string; name: string; code: string } | null>(null);
  const parsed = useMemo(() => parseNaturalInput(raw), [raw]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Lazy-load Personal project on first open — created server-side if missing
  useEffect(() => {
    if (!open || personal) return;
    api<{ id: string; name: string; code: string }>('/projects/personal')
      .then(setPersonal)
      .catch(() => {});
  }, [open, personal]);

  // Effective values: explicit override beats natural-language parsing
  const effDue = dueOverride || parsed.dueDate || '';
  const effPriority = (priorityOverride || parsed.priority || '') as Priority | '';

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Auto-focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Auto-select if there's exactly one project
  useEffect(() => {
    if (open && projects.length === 1 && !projectId) setPId(projects[0].id);
  }, [open, projects, projectId]);

  // Reset form when closed
  useEffect(() => {
    if (!open) {
      setRaw(''); setDueOverride(''); setPriorityOverride(''); setErrMsg('');
    }
  }, [open]);

  // Esc to close, Cmd/Ctrl+Enter to submit
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        const form = document.getElementById('quick-add-form') as HTMLFormElement | null;
        form?.requestSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!parsed.title.trim() || !projectId) return;
    setSaving(true);
    setErrMsg('');
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          title: parsed.title.trim(),
          projectId,
          assigneeId: userId,
          dueDate: effDue || undefined,
          priority: effPriority || undefined,
        },
      });
      setRaw(''); setPId(''); setDueOverride(''); setPriorityOverride('');
      onClose();
      onAdded();
    } catch (err: any) {
      setErrMsg(err?.message || 'Could not create task. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Render only on the client (where document.body exists) and only when open.
  if (!open || typeof document === 'undefined') return null;

  const canSubmit = parsed.title.trim().length > 0 && !!projectId && !saving;
  const dueLabel = effDue
    ? new Date(effDue + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : '';

  // Render via portal to document.body so we escape any transformed parent
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 overlay-in"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-add-title"
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-[460px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h3 id="quick-add-title" className="font-black text-slate-900 text-lg tracking-tight flex items-center gap-2">
              <Sparkles size={15} className="text-brand-500" /> New task
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Type naturally — we&rsquo;ll detect dates &amp; priority.</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-1 -mt-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >✕</button>
        </div>

        <form id="quick-add-form" onSubmit={submit} className="px-5 pb-4 space-y-3.5">

          {/* Natural-language input */}
          <div>
            <input
              ref={inputRef}
              className="input text-sm"
              placeholder='e.g. "urgent: deploy fix by friday"'
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              required
            />
            {raw.trim() && (parsed.title !== raw.trim() || parsed.dueDate || (parsed.priority && parsed.priority !== 'low')) && (
              <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mr-1">Detected:</span>
                {parsed.title && parsed.title !== raw.trim() && (
                  <span className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">{parsed.title}</span>
                )}
                {parsed.dueDate && !dueOverride && (
                  <span className="text-[11px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">
                    {new Date(parsed.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                )}
                {parsed.priority && parsed.priority !== 'low' && !priorityOverride && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium capitalize">
                    {parsed.priority}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Project */}
          <div>
            <label className="label">Project</label>
            <select
              className="select text-sm"
              value={projectId}
              onChange={(e) => setPId(e.target.value)}
              required
            >
              <option value="">Select project…</option>
              {personal && (
                <option value={personal.id}>👤 Personal · just for me</option>
              )}
              {projects.filter(p => !personal || p.id !== personal.id).map((p) => (
                <option key={p.id} value={p.id}>{p.code ? `${p.code} · ` : ''}{p.name}</option>
              ))}
            </select>
            {projects.length === 0 && !personal && (
              <p className="text-xs text-amber-600 mt-1">No projects yet. <Link href="/projects/new" className="font-semibold underline">Create one</Link>.</p>
            )}
            {personal && projectId === personal.id && (
              <p className="text-[11px] text-slate-400 mt-1">Personal tasks are private to you — they don&rsquo;t appear in team views.</p>
            )}
          </div>

          {/* Quick-pick due dates */}
          <div>
            <label className="label flex items-center gap-1.5"><Calendar size={11} className="text-slate-400" /> Due {dueLabel && <span className="ml-1 normal-case font-semibold text-brand-700">· {dueLabel}</span>}</label>
            <div className="flex flex-wrap gap-1.5 items-center">
              {[
                { label: 'No date', val: '' },
                { label: 'Today',   val: todayISO() },
                { label: 'Tmrw',    val: shiftDateISO(1) },
                { label: 'Fri',     val: shiftDateISO(((5 - new Date().getDay()) + 7) % 7 || 7) },
                { label: 'Next wk', val: shiftDateISO(7) },
              ].map((c) => {
                const active = effDue === c.val;
                return (
                  <button
                    type="button"
                    key={c.label}
                    onClick={() => setDueOverride(c.val)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all border ${
                      active
                        ? 'bg-brand-600 text-white border-brand-600 shadow-brand'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
              <input
                type="date"
                value={dueOverride}
                onChange={(e) => setDueOverride(e.target.value)}
                className="input text-xs py-1 px-2 w-[130px] ml-auto"
                aria-label="Custom due date"
              />
            </div>
          </div>

          {/* Priority pills */}
          <div>
            <label className="label">Priority</label>
            <div className="flex gap-1.5">
              {([
                { key: '',        label: 'Default', cls: 'bg-white text-slate-500 border-slate-200',           active: 'bg-slate-100 text-slate-700 border-slate-300' },
                { key: 'medium',  label: 'Medium',  cls: 'bg-white text-blue-600  border-blue-100 hover:bg-blue-50',     active: 'bg-blue-600 text-white border-blue-600' },
                { key: 'high',    label: 'High',    cls: 'bg-white text-amber-600 border-amber-100 hover:bg-amber-50',   active: 'bg-amber-500 text-white border-amber-500' },
                { key: 'urgent',  label: 'Urgent',  cls: 'bg-white text-red-600   border-red-100 hover:bg-red-50',       active: 'bg-red-600 text-white border-red-600' },
              ] as const).map((opt) => {
                const isActive = (effPriority || '') === opt.key;
                return (
                  <button
                    type="button"
                    key={opt.label}
                    onClick={() => setPriorityOverride(opt.key as Priority | '')}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border transition-all ${isActive ? opt.active : opt.cls}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {errMsg && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-snug">
              {errMsg}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="w-full btn-primary justify-center group mt-1"
            disabled={!canSubmit}
          >
            {saving
              ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Adding…</>
              : <>Create task <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5" /></>
            }
          </button>
        </form>

        {/* Keyboard hint */}
        <div className="px-5 pb-4 -mt-1 flex items-center justify-between text-[10px] text-slate-400 font-medium">
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-slate-500">Esc</kbd>
            to close
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-slate-500 flex items-center gap-0.5">
              <Command size={9} />Enter
            </kbd>
            to create
          </span>
        </div>
      </div>
    </div>,
    document.body
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

/* ── Stat card ────────────────────────────────────────────────────────────────
   Single unified treatment — accent shows only via icon-tile background and
   (when urgent) the number colour. Keeps the 4-card grid visually rhythmic so
   nothing dominates the others, which makes the dashboard scan cleanly. */
function StatCard({ label, value, sub, icon: Icon, accent, urgent, delay = 0 }: {
  label: string; value: string | number; sub?: string;
  icon: any; accent: string; urgent?: boolean; delay?: number;
}) {
  const isNum = typeof value === 'number';
  const display: any = isNum ? <CountUp value={value as number} /> : value;

  return (
    <div className="relative overflow-hidden bg-white rounded-2xl border border-slate-200/80 flex flex-col gap-1 p-5 transition-all hover:shadow-md hover:-translate-y-px cursor-default fade-up-stagger"
      style={{
        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 1px 3px rgba(15,23,42,0.03)',
        animationDelay: `${delay}ms`,
      }}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {label}
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${accent}14` }}>
          <Icon size={15} style={{ color: accent }} />
        </div>
      </div>
      <div className="text-3xl font-black tracking-tight leading-none tabular-nums" style={{ color: urgent ? accent : '#0f172a' }}>
        {display}
      </div>
      {sub && <div className="text-[11px] font-medium" style={{ color: urgent ? accent : '#94a3b8' }}>{sub}</div>}
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
          <div className="w-9 h-9 rounded-xl bg-forest-50 border border-forest-100 flex items-center justify-center mx-auto mb-2">
            <CircleCheck size={18} className="text-forest-500" />
          </div>
          <div className="text-xs font-bold text-slate-600">Calendar&rsquo;s clear</div>
          <div style={{ fontSize: 10 }} className="text-slate-400 mt-1 leading-relaxed">No deadlines on the horizon.</div>
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
          const pulse = pulseFor(p.lastActivity);
          return (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 transition-colors group">
              <div className="relative shrink-0" title={`${pulse.label} · ${p.health.replace('_',' ')}`} style={{ color: pulse.color }}>
                <span
                  aria-hidden
                  className={`block w-2 h-2 rounded-full ${pulse.pulsing ? 'pulse-dot' : ''}`}
                  style={{ background: pulse.color }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700 truncate group-hover:text-blue-700 transition-colors leading-tight">{p.code || p.name}</div>
                <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: HC[p.health] }} />
                </div>
              </div>
              <div className="text-right shrink-0 ml-1">
                <div className="text-xs font-bold" style={{ color: HC[p.health] }}>{pct}%</div>
                {p.tasksOverdue > 0
                  ? <div style={{ fontSize: 9 }} className="text-red-400 font-medium">{p.tasksOverdue} late</div>
                  : <div style={{ fontSize: 9 }} className="text-slate-300 font-medium">{pulse.label}</div>
                }
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
  // projects is empty during the first paint (we patch totals before full org data arrives).
  // Only describe org health once we have real projects, so the sub-label doesn't flip
  // from a neutral string to a health summary as data lands.
  const hasProjects = projects.length > 0;
  const critical    = projects.filter(p => p.health === 'critical').length;
  const atRisk      = projects.filter(p => p.health === 'at_risk').length;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <StatCard label="Active projects" value={totals.activeProjects} icon={FolderKanban}
        accent="#1565C0" delay={0}
        sub={!hasProjects ? 'across the org' : critical > 0 ? `${critical} critical` : atRisk > 0 ? `${atRisk} at risk` : 'All healthy'} />
      <StatCard label="Open tasks" value={totals.tasksOpen} icon={Target} accent="#475569" delay={70}
        sub="across all projects" />
      <StatCard label="Overdue" value={totals.tasksOverdue} icon={AlertTriangle} delay={140}
        accent={totals.tasksOverdue > 0 ? '#dc2626' : '#94a3b8'}
        urgent={totals.tasksOverdue > 0}
        sub={totals.tasksOverdue > 0 ? 'Needs resolution' : 'None — great work'} />
      <StatCard label="Done this month" value={totals.doneThisMonth} icon={TrendingUp} delay={210}
        accent="#16a34a"
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
    if (filter === 'overdue') return t.status !== 'done' && !!t.dueDate && new Date(t.dueDate).getTime() < Date.now();
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

      {/* ── Hero backdrop — fixed so it spans the full viewport width and
              is never clipped by the parent overflow-auto on AppShell's
              main element. z-index -1 places it behind all page content
              but above the body background. top-14 keeps it below the
              fixed app header (56px). ─────────────────────────────── */}
      <div aria-hidden className="pointer-events-none fixed top-14 left-0 right-0 h-[200px]" style={{ zIndex: -1 }}>
        <div className="absolute inset-0" style={{
          background: 'linear-gradient(180deg, rgba(21,101,192,0.09) 0%, rgba(21,101,192,0.05) 45%, rgba(21,101,192,0.01) 80%, transparent 100%)',
        }} />
      </div>

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="relative flex items-start justify-between pt-1 mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-black tracking-tight leading-tight">
            <span className="hero-greeting">{greet}</span>
          </h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <p className="text-xs text-slate-400">{todayLabel}</p>
            {isPM && org && (
              <>
                <span className="text-slate-200">·</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  org.projects.some(p => p.health === 'critical')
                    ? 'bg-red-50 text-red-600'
                    : org.projects.some(p => p.health === 'at_risk')
                    ? 'bg-amber-50 text-amber-600'
                    : 'bg-forest-50 text-forest-700'
                }`}>
                  {org.projects.some(p => p.health === 'critical')
                    ? `${org.projects.filter(p => p.health === 'critical').length} critical project${org.projects.filter(p => p.health === 'critical').length > 1 ? 's' : ''}`
                    : org.projects.some(p => p.health === 'at_risk')
                    ? `${org.projects.filter(p => p.health === 'at_risk').length} at risk`
                    : '✓ All projects healthy'}
                </span>
              </>
            )}
            {!isPM && overdueCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">
                {overdueCount} overdue
              </span>
            )}
          </div>
        </div>
        <button onClick={() => setQaOpen(true)} className="btn-primary shrink-0 text-sm gap-2 group">
          <Plus size={15} className="transition-transform group-hover:rotate-90" /> New task
        </button>
      </div>

      {/* ── PM: Org-wide pulse ────────────────────────────────────────────── */}
      {isPM && org && <OrgPulse totals={org.totals} projects={org.projects} />}

      {/* ── IC: Personal metrics ──────────────────────────────────────────── */}
      {!isPM && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <StatCard icon={CheckCircle2} label="Open tasks" value={openCount} delay={0}
            accent={openCount === 0 ? '#16a34a' : '#1565C0'}
            sub={openCount === 0 ? 'All clear!' : `${overdueCount > 0 ? overdueCount + ' overdue' : 'on track'}`} />
          <StatCard icon={AlertTriangle} label="Overdue" value={overdueCount} delay={70}
            accent={overdueCount > 0 ? '#dc2626' : '#94a3b8'}
            urgent={overdueCount > 0}
            sub={overdueCount > 0 ? 'Act now' : 'None'} />
          <StatCard icon={BarChart2} label="Completion" value={`${rate}%`} delay={140}
            accent={rate >= 80 ? '#16a34a' : rate >= 50 ? '#1565C0' : '#d97706'}
            sub={rate >= 80 ? 'Excellent' : rate >= 50 ? 'Good pace' : 'Needs focus'} />
          <StatCard icon={FolderKanban} label="Projects" value={projects.length} delay={210}
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
              <div className="py-10 flex flex-col items-center text-center px-6">
                {filter === 'open' ? (
                  <>
                    <div className="w-11 h-11 rounded-2xl bg-forest-50 border border-forest-100 flex items-center justify-center mb-3">
                      <CheckCircle2 size={20} className="text-forest-500" />
                    </div>
                    <div className="text-sm font-bold text-slate-700">All clear!</div>
                    <div className="text-xs text-slate-400 mt-1 max-w-[260px] leading-relaxed">
                      No open tasks. Pour a chai, breathe, or get ahead.
                    </div>
                    <button onClick={() => setQaOpen(true)} className="mt-4 btn-primary text-xs gap-1.5">
                      <Plus size={12} /> Add a task
                    </button>
                  </>
                ) : filter === 'overdue' ? (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-forest-50 border border-forest-100 flex items-center justify-center mb-3">
                      <CircleCheck size={22} className="text-forest-500" />
                    </div>
                    <div className="text-sm font-bold text-slate-700">Nothing overdue</div>
                    <div className="text-xs text-slate-400 mt-1 max-w-[220px] leading-relaxed">
                      You&rsquo;re on top of every deadline. Beautiful work.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                      <Target size={20} className="text-slate-300" />
                    </div>
                    <div className="text-sm font-bold text-slate-700">Nothing here</div>
                    <div className="text-xs text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                      Try a different filter.
                    </div>
                  </>
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

      {/* ── Daily quality thought — small touch of personality ─────────────── */}
      <DailyQuote />

      {me && <QuickAdd projects={projects} userId={me.id} onAdded={reload} open={qaOpen} onClose={() => setQaOpen(false)} />}
    </div>
  );
}

/* ── Daily quality thought — bottom-of-page warmth ─────────────────────────── */
function DailyQuote() {
  const q = useMemo(() => getTodaysQuote(), []);
  return (
    <div className="mt-10 mx-auto max-w-2xl text-center px-6 fade-in-late">
      <div className="flex items-center justify-center gap-2 mb-3">
        <span className="h-px w-8 bg-slate-200" />
        <Sparkles size={11} className="text-brand-500/70" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">Quality thought · today</span>
        <Sparkles size={11} className="text-brand-500/70" />
        <span className="h-px w-8 bg-slate-200" />
      </div>
      <p className="text-sm italic text-slate-500 leading-relaxed">
        <Quote size={11} className="inline -mt-2 mr-1 text-slate-300" />
        {q.quote}
      </p>
      <p className="text-[11px] mt-2 font-semibold text-slate-400">— {q.author}</p>
    </div>
  );
}
