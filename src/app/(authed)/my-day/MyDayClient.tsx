'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '@/lib/client/api';
import { useIsLead, useCurrentUser } from '@/components/CurrentUserContext';
import {
  Plus, Check, Trash2, ArrowRight, X, Sparkles, Calendar, Zap,
  ChevronDown, ChevronUp, Target, BookmarkCheck, Shield, BrainCircuit, Network,
} from 'lucide-react';
import { DatePicker } from '@/components/DatePicker';
import { Select } from '@/components/Select';
import dynamicImport from 'next/dynamic';
// The whiteboard is an interactive canvas with autosave; keep it out of the
// My Day first paint unless the user opens it.
const Whiteboard = dynamicImport(
  () => import('@/components/Whiteboard').then((m) => m.Whiteboard),
  { ssr: false, loading: () => (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/40 h-[460px] flex items-center justify-center text-xs text-slate-400">
      Loading whiteboard…
    </div>
  ) },
);

interface Note { id: string; text: string; done: boolean; promotedTaskId: string | null; createdAt: string; }

/* The home page already shows the time-of-day greeting; My Day opens with an
   encouraging line instead, so the page feels like a fresh start each day. The
   line is keyed to the day-of-year so it's stable through the day (no flicker)
   yet rotates over time. */
const ENCOURAGEMENTS = [
  'Let’s make today count',
  'One clear thought at a time',
  'Small steps, real progress',
  'Capture it, then conquer it',
  'A clear mind moves fast',
  'Today is yours to shape',
  'Progress beats perfection',
  'Start light — empty your head',
];
function encouragement() {
  const d = new Date();
  const dayOfYear = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
  return ENCOURAGEMENTS[dayOfYear % ENCOURAGEMENTS.length];
}

/* Live clock day/date — suppresses hydration mismatch via suppressHydrationWarning */
function useDateLabel() {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const fmt = () => {
      const d = new Date();
      const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      setLabel(`${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`);
    };
    fmt();
    const t = setInterval(fmt, 60_000);
    return () => clearInterval(t);
  }, []);
  return label;
}

/* Circular SVG ring that fills as notes are checked off */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 22;
  const circ = 2 * Math.PI * r;
  const pct  = total ? done / total : 0;
  const offset = circ * (1 - pct);
  const allDone = total > 0 && done === total;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 60, height: 60 }}>
      <svg width={60} height={60} className="-rotate-90">
        <circle cx={30} cy={30} r={r} fill="none" strokeWidth={3.5}
          className="stroke-slate-200 dark:stroke-white/[0.08]" />
        <circle cx={30} cy={30} r={r} fill="none" strokeWidth={3.5}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
          style={{ stroke: allDone ? '#22c55e' : '#1769C8' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {total === 0 ? (
          <Target size={14} className="text-slate-300 dark:text-white/20" />
        ) : allDone ? (
          <Check size={16} className="text-green-500" strokeWidth={3} />
        ) : (
          <>
            <span className="text-[14px] font-black leading-none text-slate-700 dark:text-white/85 tabular-nums">{done}</span>
            <span className="text-[9px] font-bold text-slate-400 dark:text-white/30 leading-none mt-px tabular-nums">/{total}</span>
          </>
        )}
      </div>
    </div>
  );
}

export default function MyDayClient({ initialData }: {
  initialData: { open: Note[]; done: Note[] };
}) {
  const isLead  = useIsLead();
  const me      = useCurrentUser();
  const firstName = (me?.name || '').trim().split(/\s+/)[0] || '';
  const dateLabel = useDateLabel();

  const [open, setOpen]   = useState<Note[]>(initialData.open);
  const [done, setDone]   = useState<Note[]>(initialData.done);
  const [text, setText]   = useState('');
  const [showDone, setShowDone] = useState(false);
  const [promote, setPromote] = useState<Note | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editText,  setEditText]    = useState('');
  const [savedAt,   setSavedAt]     = useState<Date | null>(null);
  const [justDone,  setJustDone]    = useState<string | null>(null);
  // Mind map panel — collapsed by default so the focused "what's on" view
  // stays the My Day landing experience.
  const [mindMapOpen, setMindMapOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const total   = open.length + done.length;
  const allDone = total > 0 && done.length === total;

  function markSaved() { setSavedAt(new Date()); }
  function startEdit(n: Note) { setEditingId(n.id); setEditText(n.text); }
  function cancelEdit()       { setEditingId(null); setEditText(''); }

  async function saveEdit(n: Note) {
    const t = editText.trim();
    if (!t || t === n.text) { cancelEdit(); return; }
    setOpen((o) => o.map((x) => (x.id === n.id ? { ...x, text: t } : x)));
    cancelEdit();
    try { await api(`/scratch/${n.id}`, { method: 'PATCH', body: { text: t } }); markSaved(); } finally { load(); }
  }

  const load = useCallback(async () => {
    try {
      const res = await api<{ open: Note[]; done: Note[] }>('/scratch');
      setOpen(res.open); setDone(res.done);
    } catch {}
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    const temp: Note = { id: `tmp-${Date.now()}`, text: t, done: false, promotedTaskId: null, createdAt: new Date().toISOString() };
    setOpen((o) => [temp, ...o]);
    try { await api('/scratch', { method: 'POST', body: { text: t } }); markSaved(); } finally { load(); }
    inputRef.current?.focus();
  }

  async function toggle(n: Note) {
    if (!n.done) {
      setJustDone(n.id);
      setTimeout(() => setJustDone(null), 700);
    }
    if (n.done) {
      setDone((d) => d.filter((x) => x.id !== n.id));
      setOpen((o) => [{ ...n, done: false }, ...o]);
    } else {
      setOpen((o) => o.filter((x) => x.id !== n.id));
      setDone((d) => [{ ...n, done: true }, ...d]);
    }
    try { await api(`/scratch/${n.id}`, { method: 'PATCH', body: { done: !n.done } }); markSaved(); } finally { load(); }
  }

  async function remove(n: Note) {
    setOpen((o) => o.filter((x) => x.id !== n.id));
    setDone((d) => d.filter((x) => x.id !== n.id));
    try { await api(`/scratch/${n.id}`, { method: 'DELETE' }); markSaved(); } finally { load(); }
  }

  return (
    <div className="max-w-2xl mx-auto pb-14">

      {/* ── Hero header ──────────────────────────────────────────────── */}
      <div className="mb-7 pt-1">
        <div className="flex items-start justify-between gap-4">
          {/* Left: greeting + date */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 dark:text-white/30">
                My Day
              </span>
              {savedAt && (
                <span key={savedAt.getTime()}
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400/80 fade-in-soft"
                  title={`Last saved ${savedAt.toLocaleTimeString()}`}
                >
                  <Check size={10} strokeWidth={3} /> Saved
                </span>
              )}
            </div>
            <h1 className="text-[1.7rem] font-black tracking-tight leading-tight text-slate-800 dark:text-white/90">
              <span suppressHydrationWarning>{encouragement()}{firstName ? ', ' : '.'}</span>
              {firstName && (
                <span className="text-blue-700 dark:text-blue-400" suppressHydrationWarning>
                  {firstName}.
                </span>
              )}
            </h1>
            {dateLabel && (
              <div className="flex items-center gap-1.5 mt-1.5">
                <Calendar size={11} className="text-slate-400 dark:text-white/25 shrink-0" />
                <span className="text-[12px] text-slate-500 dark:text-white/40 font-medium">
                  {dateLabel}
                </span>
              </div>
            )}
          </div>

          {/* Right: circular progress ring + label */}
          <div className="shrink-0 flex flex-col items-center gap-1 mt-0.5">
            <ProgressRing done={done.length} total={total} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-white/25">
              {done.length === total && total > 0 ? 'Done' : 'Today'}
            </span>
          </div>
        </div>

        {/* All-done celebration banner */}
        {allDone && (
          <div className="mt-4 rounded-xl border border-emerald-200/80 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/[0.08] px-4 py-3 flex items-center gap-3 fade-in-soft">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-800 dark:text-emerald-300">All done for today.</div>
              <div className="text-[11px] text-emerald-700/70 dark:text-emerald-400/60 mt-0.5">
                You cleared everything. Come back tomorrow or add more below.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Capture — the heart of My Day: get it out of your head first ── */}
      <form onSubmit={add} className="mb-6">
        <div className="relative rounded-2xl border border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-3 shadow-sm hover:border-slate-300/80 hover:shadow-sm focus-within:border-blue-500/60 dark:focus-within:border-blue-500/50 focus-within:shadow-[0_0_0_3px_rgba(21,101,192,0.10)] transition-all">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/10 to-indigo-500/10 dark:from-blue-500/15 dark:to-indigo-500/15 flex items-center justify-center shrink-0">
              <BrainCircuit size={17} className="text-blue-500 dark:text-blue-400" />
            </div>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-[15px] text-slate-800 dark:text-white/90 placeholder-slate-500 dark:placeholder-white/35 border-0 outline-none py-1 min-w-0"
              placeholder="Empty your mind — what’s on it right now?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              maxLength={2000}
            />
            {text.trim() ? (
              <button type="submit"
                className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 fade-in-soft transition-colors">
                Capture ↵
              </button>
            ) : (
              <span className="shrink-0 hidden sm:inline text-[11px] text-slate-400 dark:text-white/25 font-medium pr-1">Enter ↵</span>
            )}
          </div>
        </div>
      </form>

      {/* Whiteboard toggle — opens a free-form drawing surface below. A
          board, not a mind-map: drag-to-draw, switch tools, erase, start
          over. Forces real thinking rather than the pre-formatted polish of
          a node graph. */}
      {/* Whiteboard — a tiny side affordance, NOT a full-width banner. Sits to
          the right of the capture row above (when closed) so the focused
          "what's on your mind" capture stays the page's centre of gravity.
          When opened, the canvas expands beneath. */}
      {mindMapOpen ? (
        <div className="mb-5 fade-in-soft">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/40">Whiteboard</div>
            <button
              type="button"
              onClick={() => setMindMapOpen(false)}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white/70 inline-flex items-center gap-1"
            >
              Close <ChevronUp size={11} />
            </button>
          </div>
          <Whiteboard />
        </div>
      ) : (
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={() => setMindMapOpen(true)}
            title="Open whiteboard — draw, erase, start over"
            aria-label="Open whiteboard"
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-white/35 hover:text-blue-700 dark:hover:text-blue-400 transition-colors"
          >
            <span className="w-5 h-5 rounded-md flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #1565C0, #22C55E)' }}>
              <BrainCircuit size={11} className="text-white" />
            </span>
            Whiteboard
          </button>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {open.length === 0 && done.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-white/[0.08] p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={22} className="text-blue-400 dark:text-blue-400/70" />
          </div>
          <div className="text-sm font-bold text-slate-700 dark:text-white/60 mb-1">A clear head starts here</div>
          <div className="text-xs text-slate-400 dark:text-white/25 max-w-xs mx-auto leading-relaxed">
            Jot anything — ideas, blockers, follow-ups. Unfinished notes carry over automatically.
          </div>
        </div>
      )}

      {/* ── Open notes list ──────────────────────────────────────────── */}
      {open.length > 0 && (
        <div className="space-y-1">
          {open.map((n) => {
            const isChecking = justDone === n.id;
            return (
              <div
                key={n.id}
                className={`
                  group flex items-center min-w-0 gap-3 rounded-xl px-3.5 py-2.5 border
                  transition-all duration-200
                  ${isChecking
                    ? 'border-emerald-200 dark:border-emerald-500/25 bg-emerald-50/80 dark:bg-emerald-500/[0.08] scale-[0.995]'
                    : 'border-slate-200/80 dark:border-white/[0.07] bg-white dark:bg-white/[0.025] hover:border-slate-300 dark:hover:border-white/12 hover:shadow-sm dark:hover:bg-white/[0.045]'
                  }
                `}
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggle(n)}
                  aria-label="Mark done"
                  className={`
                    w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0
                    transition-all duration-200
                    ${isChecking
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-slate-300 dark:border-white/20 hover:border-emerald-400 dark:hover:border-emerald-400/50 hover:bg-emerald-50 dark:hover:bg-emerald-400/[0.08]'
                    }
                  `}
                  style={isChecking ? { transform: 'scale(1.15)' } : {}}
                >
                  {isChecking && <Check size={11} className="text-white" strokeWidth={3} />}
                </button>

                {/* Note text / inline editor */}
                {editingId === n.id ? (
                  <textarea
                    autoFocus
                    rows={1}
                    className="input min-w-0 flex-1 text-sm py-1 resize-none leading-relaxed whitespace-pre-wrap break-words overflow-hidden"
                    value={editText}
                    maxLength={2000}
                    onFocus={(e) => {
                      e.currentTarget.style.height = 'auto';
                      e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                      const len = e.currentTarget.value.length;
                      e.currentTarget.setSelectionRange(len, len);
                    }}
                    onChange={(e) => {
                      setEditText(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(n); }
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    onBlur={() => saveEdit(n)}
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-white/80 cursor-text hover:text-slate-900 dark:hover:text-white leading-relaxed"
                    onClick={() => startEdit(n)}
                    title="Click to edit"
                  >
                    {n.text}
                  </span>
                )}

                {/* Hover actions */}
                <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {n.promotedTaskId ? (
                    <a href={`/tasks/${n.promotedTaskId}`}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300">
                      <BookmarkCheck size={12} strokeWidth={2.5} /> tracked
                    </a>
                  ) : editingId !== n.id ? (
                    <button
                      onClick={() => setPromote(n)}
                      title="Promote to tracked task"
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      <Zap size={11} strokeWidth={2.5} /> track
                    </button>
                  ) : null}
                  <button onClick={() => remove(n)} aria-label="Delete"
                    className="p-0.5 rounded text-slate-300 dark:text-white/15 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Done section ─────────────────────────────────────────────── */}
      {done.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowDone((s) => !s)}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50/60 dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/[0.07] text-[12px] font-semibold text-slate-500 dark:text-white/35 hover:text-slate-700 dark:hover:text-white/55 hover:bg-slate-100/50 dark:hover:bg-white/[0.04] transition-colors"
          >
            <div className="w-[18px] h-[18px] rounded-[5px] bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center shrink-0">
              <Check size={10} className="text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
            </div>
            <span>Done · {done.length}</span>
            <span className="ml-auto">
              {showDone ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </span>
          </button>
          <div className="mt-1.5 border-t border-slate-100 dark:border-white/[0.05]" />

          {showDone && (
            <div className="space-y-0.5 mt-1.5 fade-in-soft">
              {done.map((n) => (
                <div key={n.id}
                  className="group flex items-center gap-3 px-3.5 py-2 rounded-xl hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors">
                  <button
                    onClick={() => toggle(n)}
                    aria-label="Reopen"
                    className="w-[18px] h-[18px] rounded-[5px] bg-emerald-500 border border-emerald-500 flex items-center justify-center shrink-0 hover:bg-emerald-400 transition-colors"
                  >
                    <Check size={11} className="text-white" strokeWidth={3} />
                  </button>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-slate-400 dark:text-white/25 line-through leading-relaxed">
                    {n.text}
                  </span>
                  <button onClick={() => remove(n)} aria-label="Delete"
                    className="p-0.5 rounded text-slate-300 dark:text-white/15 hover:text-red-500 dark:hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Promote modal */}
      {promote && (
        <PromoteModal
          note={promote}
          canCreateShared={isLead}
          onClose={() => setPromote(null)}
          onDone={() => { setPromote(null); load(); }}
        />
      )}
    </div>
  );
}

/* ── Promote modal ────────────────────────────────────────────────────── */
function PromoteModal({ note, canCreateShared, onClose, onDone }: { note: Note; canCreateShared: boolean; onClose: () => void; onDone: () => void }) {
  const [projects,    setProjects]  = useState<any[]>([]);
  const [projectId,   setProjectId] = useState('');
  const [phases,      setPhases]    = useState<{ id: string; name: string }[]>([]);
  const [members,     setMembers]   = useState<any[]>([]);
  const [phaseId,     setPhaseId]   = useState('');
  const [priority,    setPriority]  = useState('medium');
  const [assigneeId,  setAssignee]  = useState('');
  const [due,         setDue]       = useState('');
  const [privateToMe, setPrivateToMe] = useState(!canCreateShared);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving,      setSaving]    = useState(false);
  const [err,         setErr]       = useState('');

  useEffect(() => {
    api<any[]>('/projects')
      .then((p) => { setProjects(p); if (p[0]) setProjectId(p[0].id); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) { setPhases([]); setMembers([]); return; }
    setPhaseId(''); setAssignee('');
    const proj = projects.find((p) => p.id === projectId);
    setPhases((proj?.phases || []).map((ph: any) => ({ id: ph.id, name: ph.name })));
    if (privateToMe || !canCreateShared) { setMembers([]); setLoadingMeta(false); return; }
    setLoadingMeta(true);
    api<any[]>(`/users${proj?.teamId ? `?teamId=${proj.teamId}` : ''}`)
      .then((r) => setMembers(r))
      .catch(() => setMembers([]))
      .finally(() => setLoadingMeta(false));
  }, [projectId, projects, privateToMe, canCreateShared]);

  async function go() {
    if (!projectId) { setErr('Pick a project.'); return; }
    setSaving(true); setErr('');
    try {
      const body: any = { projectId, title: note.text, priority, privateToMe };
      if (phaseId)    body.phaseId    = phaseId;
      if (!privateToMe && assigneeId) body.assigneeId = assigneeId;
      if (due)        body.dueDate    = due;
      const task = await api<{ id: string }>('/tasks', { method: 'POST', body });
      await api(`/scratch/${note.id}`, { method: 'PATCH', body: { done: true, promotedTaskId: task.id } });
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Could not create the task.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overlay-in" style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="w-full max-w-sm modal-in rounded-2xl border p-6 shadow-2xl"
          style={{
            background: 'var(--bg-page) ',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-500/15 flex items-center justify-center">
                  <ArrowRight size={13} className="text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-base font-bold text-slate-900 dark:text-white/90">Add to project</span>
              </div>
              <p className="text-xs text-slate-400 dark:text-white/35 ml-8">Turn this thought into project work — or keep it private to you.</p>
            </div>
            <button onClick={onClose}
              className="text-slate-300 dark:text-white/25 hover:text-slate-500 dark:hover:text-white/50 transition-colors p-0.5 rounded">
              <X size={18} />
            </button>
          </div>

          {/* Note preview */}
          <div className="rounded-lg border-l-4 border-blue-300 dark:border-blue-500/50 bg-blue-50/70 dark:bg-blue-500/[0.08] px-3 py-2.5 mb-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-500 dark:text-blue-400/70 mb-0.5">Note</div>
            <p className="text-sm text-slate-700 dark:text-white/75 leading-relaxed">{note.text}</p>
          </div>

          <label className="label">Project</label>
          <div className="mb-3">
            <Select
              value={projectId} onChange={setProjectId} ariaLabel="Project"
              placeholder={projects.length === 0 ? 'No projects available' : 'Select a project'}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </div>

          <button
            type="button"
            onClick={() => canCreateShared && setPrivateToMe((v) => !v)}
            className={`w-full mb-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${privateToMe ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 dark:bg-white/[0.03]'}`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield size={14} className={privateToMe ? 'text-emerald-600' : 'text-slate-400'} />
                <div>
                  <div className="text-xs font-black">Track this task as private</div>
                  <div className="text-[10px] opacity-70 mt-0.5">
                    {canCreateShared ? 'Visible only to you, while linked to the selected project.' : 'Contributor notes are tracked privately and stay visible only to you.'}
                  </div>
                </div>
              </div>
              <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${privateToMe ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                <span className={`block w-4 h-4 rounded-full bg-white transition-transform ${privateToMe ? 'translate-x-4' : ''}`} />
              </span>
            </div>
          </button>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Phase</label>
              <Select
                value={phaseId} onChange={setPhaseId} ariaLabel="Phase"
                disabled={loadingMeta || phases.length === 0}
                placeholder={phases.length === 0 ? 'No phases' : 'Unassigned'}
                options={[
                  { value: '', label: phases.length === 0 ? 'No phases' : 'Unassigned' },
                  ...phases.map((ph) => ({ value: ph.id, label: ph.name })),
                ]}
              />
            </div>
            <div className={privateToMe ? 'hidden' : ''}>
              <label className="label">Priority</label>
              <Select
                value={priority} onChange={setPriority} ariaLabel="Priority"
                options={[
                  { value: 'low',      label: 'Low' },
                  { value: 'medium',   label: 'Medium' },
                  { value: 'high',     label: 'High' },
                  { value: 'critical', label: 'Critical' },
                ]}
              />
            </div>
          </div>

          <div className={`grid gap-3 mb-4 ${privateToMe ? 'grid-cols-1' : 'grid-cols-2'}`}> 
            <div className={privateToMe ? 'hidden' : ''}>
              <label className="label">Assign to</label>
              <Select
                value={assigneeId} onChange={setAssignee} ariaLabel="Assign to"
                disabled={loadingMeta}
                placeholder="Unassigned"
                options={[
                  { value: '', label: 'Unassigned' },
                  ...members.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            </div>
            <div>
              <label className="label">Due date</label>
              <DatePicker value={due} onChange={(v) => setDue(v || '')} block />
            </div>
          </div>

          {err && (
            <div className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2.5 mb-4">
              {err}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center text-sm">
              Cancel
            </button>
            <button
              onClick={go}
              disabled={saving || !projectId}
              className="btn-primary flex-1 justify-center text-sm"
            >
              {saving ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
