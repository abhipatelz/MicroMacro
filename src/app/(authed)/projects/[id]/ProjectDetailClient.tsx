'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/client/api';
import {
  Card, LifecycleTag, PriorityTag,
  StatusSelect, StatusPillRow, PROJECT_STATUS_OPTIONS,
  TaskLink, formatDate, useToast,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { UserPicker } from '@/components/UserPicker';
import { useIsLead, useIsAdmin } from '@/components/CurrentUserContext';
import { useIsDark } from '@/lib/client/useIsDark';
import { weightedProgress } from '@/lib/progress';
import { GripVertical, CheckCircle2, Plus, Trash2, AlertTriangle, Archive, X, ChevronLeft, ChevronRight, Lock, Pencil, ShieldCheck, ScrollText, Eye, Sparkles, Copy, Check } from 'lucide-react';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import { chimeIfEnabled, playDropTick } from '@/lib/sound';
import { Celebration } from '@/components/Celebration';
import { TaskCompletePop } from '@/components/TaskCompletePop';
import { useCurrentUser } from '@/components/CurrentUserContext';
import { ExportMenu } from '@/components/ExportMenu';
import { printProjectReport, downloadProjectReport, downloadProjectCsv } from './report';
import dynamic from 'next/dynamic';
// Heavy interactive SVG canvas — only load it when a viewer actually opens it.
const BirdsEyeView = dynamic(
  () => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView),
  { ssr: false, loading: () => null },
);

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

const STATUS_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  todo:        { label: 'To Do',       color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  in_progress: { label: 'In Progress', color: '#1565C0', bg: '#eff6ff', border: '#bfdbfe' },
  review:      { label: 'Review',      color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  blocked:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  done:        { label: 'Done',        color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
};

/* ── Kanban board ─────────────────────────────────────────────────────────── */
const COLUMN_WIDTH = 230;
const COLUMN_GAP   = 12;

function KanbanBoard({ tasks, onDropReorder, isLead, onDelete }: {
  tasks: any[];
  onDropReorder: (taskId: string, toStatus: string, orderedIds: string[]) => void;
  isLead: boolean;
  onDelete: (taskId: string) => void;
}) {
  const dark = useIsDark();
  const currentUser = useCurrentUser();
  const soundEnabled = currentUser?.soundDropEnabled !== false;
  const [localTasks, setLocalTasks] = useState<any[]>(tasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Where the dragged card would land: a column + the insertion index within it.
  const [dragOver, setDragOver] = useState<{ col: string; index: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tasks of one column, in persisted order.
  const colSorted = (col: string) =>
    localTasks.filter(t => t.status === col).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => { setLocalTasks(tasks); }, [tasks]);

  // Track whether the scroller can be scrolled in either direction so we
  // can show/hide the arrow buttons.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const sync = () => {
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(el.scrollLeft < max - 4);
    };
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', sync); ro.disconnect(); };
  }, [localTasks.length]);

  function scrollByCols(dir: -1 | 1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * (COLUMN_WIDTH + COLUMN_GAP) * 2, behavior: 'smooth' });
  }

  function handleDragStart(e: React.DragEvent, taskId: string) {
    setDraggingId(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }
  function handleDragEnd() { setDraggingId(null); setDragOver(null); }

  // Hovering a specific card: insert before it or after it depending on which
  // half of the card the pointer is over. stopPropagation so the column-level
  // handler doesn't override this precise index.
  function handleCardDragOver(e: React.DragEvent, col: string, index: number) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setDragOver({ col, index: after ? index + 1 : index });
  }
  // Hovering the column but not a card → drop at the end.
  function handleColDragOver(e: React.DragEvent, col: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver({ col, index: colSorted(col).length });
  }

  function handleDrop(e: React.DragEvent, col: string) {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggingId;
    const dragged = taskId ? localTasks.find(t => t.id === taskId) : null;
    if (!taskId || !dragged) { setDraggingId(null); setDragOver(null); return; }

    const insertIndex = dragOver && dragOver.col === col ? dragOver.index : colSorted(col).length;
    const list = colSorted(col).filter(t => t.id !== taskId);
    const clamped = Math.max(0, Math.min(insertIndex, list.length));
    list.splice(clamped, 0, dragged);
    const orderedIds = list.map(t => t.id);

    // No-op guard: same column, same position.
    const before = colSorted(col).map(t => t.id);
    if (dragged.status === col && before.join() === orderedIds.join()) {
      setDraggingId(null); setDragOver(null); return;
    }

    // Optimistic: apply the new status + positions immediately.
    setLocalTasks(prev => prev.map(t => {
      const i = orderedIds.indexOf(t.id);
      if (t.id === taskId) return { ...t, status: col, position: i >= 0 ? i : t.position };
      return i >= 0 ? { ...t, position: i } : t;
    }));
    setDraggingId(null); setDragOver(null);
    // Audible cue confirming the move — only fires when the drop actually
    // changed something (the no-op guard above already returned).
    playDropTick(soundEnabled);
    onDropReorder(taskId, col, orderedIds);
  }

  // ── Top scrollbar — mirrors the bottom one so a Kanban with many
  // columns can be panned from either end of the board.
  const topScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef   = useRef<'top' | 'bottom' | null>(null);
  useEffect(() => {
    const top    = topScrollRef.current;
    const bottom = scrollRef.current;
    if (!top || !bottom) return;
    const sync = (from: 'top' | 'bottom') => () => {
      if (syncingRef.current && syncingRef.current !== from) return;
      syncingRef.current = from;
      if (from === 'top')    bottom.scrollLeft = top.scrollLeft;
      else                   top.scrollLeft    = bottom.scrollLeft;
      // Let the next event re-arm
      requestAnimationFrame(() => { syncingRef.current = null; });
    };
    const onTop    = sync('top');
    const onBottom = sync('bottom');
    top.addEventListener('scroll',    onTop,    { passive: true });
    bottom.addEventListener('scroll', onBottom, { passive: true });
    return () => {
      top.removeEventListener('scroll',    onTop);
      bottom.removeEventListener('scroll', onBottom);
    };
  }, []);
  const totalWidth = COLUMN_WIDTH * STATUSES.length + 12 * (STATUSES.length - 1);

  return (
    <div className="relative">
      {/* Top scrollbar — proxies its scrollLeft to the bottom scroller below */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto kanban-scroll mb-1"
        style={{ height: 12 }}
        aria-hidden="true"
      >
        <div style={{ width: totalWidth, height: 1 }} />
      </div>

      {/* Left arrow — shown on all viewports (mobile needs it too) */}
      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByCols(-1)}
        className={`flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 shadow-md transition-all ${
          canLeft ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronLeft size={16} />
      </button>

      {/* Right arrow — shown on all viewports */}
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByCols(1)}
        className={`flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:border-slate-300 shadow-md transition-all ${
          canRight ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <ChevronRight size={16} />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-3 kanban-scroll scroll-smooth"
        style={{ minHeight: 480, scrollSnapType: 'x mandatory' }}
      >
        {STATUSES.map(col => {
        const meta = STATUS_META[col];
        const colTasks = colSorted(col);
        const isOver = dragOver?.col === col;
        const isDragging = !!draggingId;
        return (
          <div key={col} className="kanban-col shrink-0 flex flex-col rounded-xl transition-all duration-150"
            style={{
              width: COLUMN_WIDTH,
              scrollSnapAlign: 'start',
              background: isOver ? (dark ? 'rgba(255,255,255,0.04)' : meta.bg) : (dark ? 'rgba(255,255,255,0.02)' : '#f8fafc'),
              border: `2px solid ${isOver ? meta.border : (dark ? 'rgba(255,255,255,0.08)' : '#e9eef5')}`,
              boxShadow: isOver ? `0 0 0 3px ${meta.border}` : undefined,
            }}
            onDragOver={e => handleColDragOver(e, col)}
            onDrop={e => handleDrop(e, col)}
          >
            <div className="px-3 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} />
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: meta.color }}>{meta.label}</span>
              </div>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: meta.border, color: meta.color }}>{colTasks.length}</span>
            </div>
            <div className="flex-1 px-2 pb-2 space-y-2 min-h-[80px]">
              {colTasks.map((t, index) => {
                const isDraggingThis = draggingId === t.id;
                const showLineBefore = isDragging && !isDraggingThis && dragOver?.col === col && dragOver.index === index;
                return (
                  <div key={t.id}>
                  {showLineBefore && <div className="h-0.5 rounded-full mb-2" style={{ background: meta.color }} />}
                  <div draggable
                    onDragStart={e => handleDragStart(e, t.id)}
                    onDragEnd={handleDragEnd}
                    onDragOver={e => handleCardDragOver(e, col, index)}
                    className="group relative rounded-lg border transition-all duration-150 cursor-grab active:cursor-grabbing"
                    style={{
                      background: dark ? '#1e293b' : '#ffffff',
                      borderColor: isDraggingThis ? meta.color : (dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'),
                      boxShadow: isDraggingThis
                        ? `0 8px 24px rgba(0,0,0,0.15), 0 0 0 2px ${meta.color}`
                        : '0 1px 3px rgba(0,0,0,0.06)',
                      opacity: isDraggingThis ? 0.5 : isDragging ? 0.85 : 1,
                      transform: isDraggingThis ? 'rotate(1.5deg) scale(1.02)' : undefined,
                    }}
                  >
                    <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: meta.color }}>
                      <GripVertical size={12} />
                    </div>
                    {isLead && (
                      <button
                        onClick={e => { e.stopPropagation(); e.preventDefault(); onDelete(t.id); }}
                        draggable={false}
                        aria-label="Delete task"
                        className="absolute top-1 right-1 z-10 sm:opacity-0 sm:group-hover:opacity-100 p-2 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                    <Link href={`/tasks/${t.id}`} className="block p-3 pl-4" onClick={e => isDragging && e.preventDefault()}>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">{t.title}</div>
                      {(t.requiresQaSignoff || (t.priority && t.priority !== 'low')) && (
                        <div className="mt-1.5 flex gap-1 flex-wrap">
                          {t.requiresQaSignoff && !t.qaSignoffAt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">Approval</span>}
                          {t.requiresQaSignoff && t.qaSignoffAt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">Approved ✓</span>}
                          {t.priority && t.priority !== 'low' && <PriorityTag priority={t.priority} />}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400 truncate">{t.assigneeName || 'Unassigned'}</span>
                        {t.dueDate && <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">{formatDate(t.dueDate)}</span>}
                      </div>
                      {t.subtaskCount > 0 && (
                        <div className="mt-2">
                          <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.round((t.subtasksDone / t.subtaskCount) * 100)}%`, background: meta.color }} />
                          </div>
                          <div className="text-[9px] text-slate-400 mt-0.5">{t.subtasksDone}/{t.subtaskCount} subtasks</div>
                        </div>
                      )}
                    </Link>
                  </div>
                  </div>
                );
              })}
              {/* Trailing insertion indicator (drop at end of column) */}
              {isDragging && colTasks.length > 0 && dragOver?.col === col && dragOver.index >= colTasks.length && (
                <div className="h-0.5 rounded-full" style={{ background: meta.color }} />
              )}
              {colTasks.length === 0 && (
                <div className="rounded-lg border-2 border-dashed flex items-center justify-center h-16 transition-all duration-150 text-center px-2"
                  style={{ borderColor: isOver ? meta.color : (dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0'), background: isOver ? (dark ? 'rgba(255,255,255,0.04)' : meta.bg) : 'transparent' }}>
                  <span className="text-xs leading-tight" style={{ color: isOver ? meta.color : '#94a3b8' }}>
                    {isOver ? 'Drop here' : isDragging ? 'Move card here' : 'No tasks'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

/* ── Kanban board — MOBILE ────────────────────────────────────────────────────
   The horizontally-scrolling, drag-and-drop desktop board is unusable on a
   phone (tiny columns, drag fights the page scroll). On mobile we render a
   purpose-built view instead: a status tab strip across the top, then the
   selected status's cards as a full-width vertical list. Moving a card is a
   tap — a "Move to" sheet — not a drag, which is far more reliable on touch.
   This component is only mounted below `md`, so the desktop experience is
   completely untouched. */
function KanbanBoardMobile({ tasks, onMove, isLead, onDelete }: {
  tasks: any[];
  onMove: (taskId: string, toStatus: string, orderedIds: string[]) => void;
  isLead: boolean;
  onDelete: (taskId: string) => void;
}) {
  const [active, setActive] = useState<string>('todo');
  const [moving, setMoving] = useState<any | null>(null);

  const byStatus = (s: string) => tasks
    .filter((t) => t.status === s)
    .sort((a, b) => {
      const ad = a.ccTcd ? new Date(a.ccTcd).getTime() : a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bd = b.ccTcd ? new Date(b.ccTcd).getTime() : b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return ad - bd;
    });

  const colTasks = byStatus(active);

  function move(toStatus: string) {
    if (!moving) return;
    const dest = byStatus(toStatus).map((t) => t.id).filter((id) => id !== moving.id);
    dest.push(moving.id);
    onMove(moving.id, toStatus, dest);
    setMoving(null);
    setActive(toStatus);
  }

  return (
    <div>
      {/* Status tabs — horizontally scrollable chips with live counts. */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 kanban-scroll">
        {STATUSES.map((s) => {
          const meta = STATUS_META[s];
          const n = tasks.filter((t) => t.status === s).length;
          const on = active === s;
          return (
            <button
              key={s}
              onClick={() => setActive(s)}
              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={{
                background: on ? meta.color : meta.bg,
                color: on ? '#fff' : meta.color,
                border: `1.5px solid ${on ? meta.color : meta.border}`,
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? '#fff' : meta.color }} />
              {meta.label}
              <span className="text-[10px] font-black opacity-90">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Cards for the selected status — full-width vertical list. */}
      <div className="space-y-2 mt-1">
        {colTasks.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 py-10 text-center text-sm text-slate-400">
            No tasks in {STATUS_META[active].label}.
          </div>
        ) : colTasks.map((t) => {
          const meta = STATUS_META[t.status] || STATUS_META.todo;
          return (
            <div key={t.id} className="relative rounded-xl border bg-white dark:bg-slate-800 dark:border-white/10"
              style={{ borderColor: '#e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <Link href={`/tasks/${t.id}`} className="block p-3.5">
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-snug pr-8">{t.title}</div>
                {(t.requiresQaSignoff || (t.priority && t.priority !== 'low')) && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {t.requiresQaSignoff && !t.qaSignoffAt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">Approval</span>}
                    {t.requiresQaSignoff && t.qaSignoffAt && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">Approved ✓</span>}
                    {t.priority && t.priority !== 'low' && <PriorityTag priority={t.priority} />}
                  </div>
                )}
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate">{t.assigneeName || 'Unassigned'}</span>
                  {(t.ccTcd || t.dueDate) && <span className="font-mono shrink-0 ml-2">{formatDate(t.ccTcd || t.dueDate)}</span>}
                </div>
                {t.subtaskCount > 0 && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round((t.subtasksDone / t.subtaskCount) * 100)}%`, background: meta.color }} />
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{t.subtasksDone}/{t.subtaskCount} subtasks</div>
                  </div>
                )}
              </Link>
              {/* Card actions: Move (lead) + Delete (lead). Big tap targets. */}
              {isLead && (
                <div className="flex items-stretch border-t border-slate-100 dark:border-white/5">
                  <button
                    onClick={() => setMoving(t)}
                    className="flex-1 py-2.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-white/5 transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <ChevronRight size={13} /> Move
                  </button>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="w-12 py-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-white/5 transition-colors inline-flex items-center justify-center border-l border-slate-100 dark:border-white/5"
                    aria-label="Delete task"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Move-to bottom sheet */}
      {moving && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setMoving(null)}>
          <div className="w-full max-w-md bg-white dark:bg-[#262624] rounded-t-2xl p-4 pb-6 modal-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-white/15 mx-auto mb-3" />
            <div className="text-sm font-bold text-slate-800 dark:text-white/90 mb-1 truncate">Move "{moving.title}"</div>
            <div className="text-xs text-slate-400 mb-3">Choose a new status</div>
            <div className="space-y-1.5">
              {STATUSES.filter((s) => s !== moving.status).map((s) => {
                const meta = STATUS_META[s];
                return (
                  <button key={s} onClick={() => move(s)}
                    className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl border text-left hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                    style={{ borderColor: meta.border }}>
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
                    <span className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setMoving(null)}
              className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Quick-add task ───────────────────────────────────────────────────────── */
function QuickAddTask({ projectId, phaseId, teamId, onAdded }: {
  projectId: string; phaseId?: string; teamId?: string | null; onAdded: () => void;
}) {
  const [open, setOpen]       = useState(false);
  const [title, setTitle]     = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue]         = useState('');
  const [saving, setSaving]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Task-assist suggestions (assignee + due date). Read-only, computed from the
  // team's own history; the user always confirms by clicking a chip.
  const [sug, setSug] = useState<{
    assignee: { id: string; name: string; reason: string } | null;
    dueDate:  { date: string; days: number; reason: string } | null;
  } | null>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  // Debounced lookup — only once a meaningful title exists.
  useEffect(() => {
    if (!open) { setSug(null); return; }
    const t = title.trim();
    if (t.length < 3) { setSug(null); return; }
    let cancelled = false;
    const h = setTimeout(async () => {
      try {
        const r = await api<any>(`/tasks/suggest?projectId=${encodeURIComponent(projectId)}&title=${encodeURIComponent(t)}`);
        if (!cancelled) setSug(r);
      } catch { if (!cancelled) setSug(null); }
    }, 450);
    return () => { cancelled = true; clearTimeout(h); };
  }, [title, open, projectId]);

  async function add(e?: React.FormEvent) {
    e?.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api('/tasks', {
        method: 'POST',
        body: { projectId, phaseId: phaseId || undefined, title: title.trim(), assigneeId: assignee || undefined, dueDate: due || undefined },
      });
      setTitle(''); setDue(''); setAssignee('');
      setOpen(false);
      onAdded();
    } finally { setSaving(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 rounded-lg border-2 border-dashed border-slate-200 dark:border-white/[0.07] text-xs text-slate-400 dark:text-white/25 hover:text-blue-600 dark:hover:text-blue-400 hover:border-blue-300 dark:hover:border-blue-500/40 hover:bg-blue-50/40 dark:hover:bg-blue-500/[0.06] transition-all group">
        <Plus size={12} className="group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
        Add a task
      </button>
    );
  }

  return (
    <form onSubmit={add} className="mt-2 rounded-xl border-2 border-blue-200 dark:border-blue-500/30 overflow-hidden bg-blue-50/20 dark:bg-blue-500/[0.05] fade-in-soft">
      <input
        ref={inputRef}
        className="w-full px-3 py-2.5 text-sm bg-transparent border-none outline-none text-slate-800 dark:text-white/85 placeholder:text-slate-400 dark:placeholder:text-white/25 font-medium"
        placeholder="Task title — press Enter to add"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape') { setOpen(false); setTitle(''); } }}
      />
      {((sug?.assignee && !assignee) || (sug?.dueDate && !due)) && (
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2">
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-blue-500/70 dark:text-blue-400/70">
            <Sparkles size={10} /> Suggested
          </span>
          {sug?.assignee && !assignee && (
            <button type="button" onClick={() => setAssignee(sug.assignee!.id)} title={sug.assignee.reason}
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-500/25 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors">
              Assign {sug.assignee.name}
            </button>
          )}
          {sug?.dueDate && !due && (
            <button type="button" onClick={() => setDue(sug.dueDate!.date)} title={sug.dueDate.reason}
              className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-white/70 border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors">
              Due {new Date(sug.dueDate.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </button>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-blue-100 dark:border-blue-500/20 bg-white/60 dark:bg-white/[0.02]">
        <UserPicker
          className="flex-1"
          value={assignee}
          onChange={setAssignee}
          teamId={teamId}
          excludeAdmin
          size="sm"
          placeholder="Search to assign…"
          ariaLabel="Assignee"
        />
        <DatePicker value={due} onChange={v => setDue(v || '')} placeholder="Due date" size="sm" />
        <button type="submit" disabled={!title.trim() || saving}
          className="px-3 py-1 text-xs font-bold rounded-lg bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700 transition-colors shrink-0">
          {saving ? '…' : 'Add'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setTitle(''); }}
          className="p-1 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 rounded transition-colors">
          <X size={13} />
        </button>
      </div>
    </form>
  );
}

/* ── Project-complete block modal ─────────────────────────────────────────── */
function BlockCompleteModal({ openCount, onClose }: { openCount: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-sm modal-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Can't mark as completed</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong className="text-slate-700">{openCount} {openCount === 1 ? 'task is' : 'tasks are'} still open.</strong>
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-5 leading-relaxed">
          All tasks must be marked <strong>Done</strong> before a project can be completed.
          Close out the remaining tasks and try again.
        </p>
        <button onClick={onClose} className="btn-primary w-full justify-center text-sm">
          Got it
        </button>
      </div>
    </div>
  );
}

/* ── Project status sign-off (e-signature) modal ──────────────────────────────
   Changing a shared project's status is a controlled action: it demands the
   user re-enter their password (proves the signer is who they claim) and a
   reason, which is written verbatim to the audit trail. This is the
   21 CFR Part 11 §11.10/§11.50 e-signature pattern, reusing the same password
   re-auth shape as DeleteProjectModal. */
function prettyStatus(s?: string) {
  return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
function StatusSignoffModal({
  projectName, fromStatus, toStatus, onClose, onConfirm,
}: {
  projectName: string;
  fromStatus: string;
  toStatus: string;
  onClose: () => void;
  onConfirm: (password: string, remarks: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [remarks, setRemarks]   = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  async function confirm() {
    if (!password.trim()) { setErr('Password is required to sign this change.'); return; }
    if (!remarks.trim())  { setErr('A reason is required for the audit trail.'); return; }
    setLoading(true); setErr('');
    try {
      await onConfirm(password, remarks.trim());
    } catch (e: any) {
      setErr(e?.message || 'Could not apply the change. Check your password and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div role="dialog" aria-modal className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal modal-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <ShieldCheck size={18} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-800">Sign off status change</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
              <span className="font-semibold text-slate-700">{projectName}</span>:
              {' '}{prettyStatus(fromStatus)} → <span className="font-semibold text-slate-700">{prettyStatus(toStatus)}</span>
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-800 leading-snug">
            This is a controlled change. Your e-signature (password + reason) will be recorded
            in the audit trail with your name and the time — it cannot be edited or removed afterwards.
          </p>
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Reason for change</label>
        <textarea className="input w-full mb-3 resize-none" rows={2}
          placeholder="e.g. All deliverables verified — moving to In progress"
          value={remarks} onChange={e => { setRemarks(e.target.value); setErr(''); }} />

        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Confirm with your password</label>
        <input ref={inputRef} type="password" className="input w-full mb-1" placeholder="Your password"
          value={password} onChange={e => { setPassword(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && confirm()} autoComplete="current-password" />
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}

        <div className="flex gap-2 justify-end mt-4">
          <button className="btn-ghost text-sm" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            onClick={confirm} disabled={loading || !password.trim() || !remarks.trim()}>
            {loading ? 'Signing…' : 'Sign & apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Delete project modal ─────────────────────────────────────────────────── */
function DeleteProjectModal({ projectName, projectId, onClose, onDeleted }: {
  projectName: string; projectId: string; onClose: () => void; onDeleted: () => void;
}) {
  const [password, setPassword] = useState('');
  const [err, setErr]           = useState('');
  const [loading, setLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function confirm() {
    if (!password.trim()) { setErr('Password is required'); return; }
    setLoading(true); setErr('');
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) { setErr('Incorrect password'); setLoading(false); return; }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error || 'Delete failed. Please try again.');
        setLoading(false); return;
      }
      onDeleted();
    } catch { setErr('Network error. Please try again.'); setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={onClose}>
      <div role="dialog" aria-modal className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-modal-sm modal-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Delete project</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-snug">
              Permanently deletes <span className="font-semibold text-slate-700">{projectName}</span> and all its tasks.
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-3">Enter your password to confirm:</p>
        <input ref={inputRef} type="password" className="input w-full mb-1" placeholder="Your password"
          value={password} onChange={e => { setPassword(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && confirm()} autoComplete="current-password" />
        {err && <p className="text-xs text-red-600 mb-3">{err}</p>}
        {!err && <div className="mb-3" />}
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost text-sm" onClick={onClose} disabled={loading}>Cancel</button>
          <button className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            onClick={confirm} disabled={loading || !password.trim()}>
            {loading ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main page ────────────────────────────────────────────────────────────── */
interface ProjectDetailClientProps {
  initialProject?: any;
  initialMe?: { id: string; name: string; email: string; role: string } | null;
}

/* ── AI status draft ──────────────────────────────────────────────────────
   One-click, paste-ready status update for a QA lead. It synthesises the
   project's EXISTING rollup (progress, blocked / overdue, what's next) into
   prose — it augments explanatory text only and never computes severity or a
   regulatory call (those stay rule-based per CLAUDE.md). The result is an
   editable draft (human in the loop); when GEMINI_API_KEY isn't set it returns
   a deterministic factual summary, honestly labelled. */
function StatusDraftButton({ project, tasks }: { project: any; tasks: any[] }) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText]       = useState('');
  const [source, setSource]   = useState<'ai' | 'rule' | null>(null);
  const [err, setErr]         = useState('');
  const [copied, setCopied]   = useState(false);

  const dueOf = (t: any) => t.ccTcd || t.dueDate || null;

  async function draft() {
    setOpen(true); setLoading(true); setErr(''); setText(''); setSource(null); setCopied(false);
    const now = Date.now();
    const done       = tasks.filter(t => t.status === 'done');
    const inProgress = tasks.filter(t => t.status === 'in_progress');
    const blocked    = tasks.filter(t => t.status === 'blocked');
    const overdue    = tasks.filter(t => t.status !== 'done' && dueOf(t) && new Date(dueOf(t)).getTime() < now);
    const upcoming   = tasks
      .filter(t => t.status !== 'done' && dueOf(t) && new Date(dueOf(t)).getTime() >= now)
      .sort((a, b) => new Date(dueOf(a)).getTime() - new Date(dueOf(b)).getTime())
      .slice(0, 5)
      .map(t => ({ title: t.title, due: dueOf(t) }));

    try {
      const res = await api<{ text: string; source: 'ai' | 'rule' }>('/ai/status-draft', {
        method: 'POST',
        body: {
          projectName: project.name,
          code: project.code || '',
          lifecycle: project.lifecycle ?? null,
          status: project.status ?? null,
          dueDate: project.dueDate ?? null,
          total: tasks.length,
          done: done.length,
          inProgress: inProgress.length,
          blocked: blocked.length,
          overdue: overdue.length,
          blockedTitles: blocked.slice(0, 10).map(t => t.title),
          overdueTitles: overdue.slice(0, 10).map(t => t.title),
          upcoming,
        },
      });
      setText(res.text);
      setSource(res.source);
    } catch (e: any) {
      setErr(e?.message || 'Could not generate a draft. Try again.');
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <>
      <button
        onClick={draft}
        disabled={tasks.length === 0}
        title={tasks.length === 0 ? 'Add tasks first' : 'Draft a status update from this project'}
        className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Sparkles size={13} className="text-blue-500" /> Draft status
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/45 overlay-in" onClick={() => setOpen(false)}>
          <div className="bg-white dark:bg-[#262624] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 w-full max-w-lg modal-in overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07]">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg" style={{ background: 'rgba(21,101,192,0.10)', color: '#1565C0' }}>
                <Sparkles size={13} />
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white/90">Status draft</h3>
              {source && (
                <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                  source === 'ai'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/45'
                }`}>
                  {source === 'ai' ? 'AI draft' : 'Summary · AI off'}
                </span>
              )}
              <button onClick={() => setOpen(false)} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="space-y-2.5 py-2">
                  <div className="skeleton h-3.5 w-full rounded" />
                  <div className="skeleton h-3.5 w-11/12 rounded" />
                  <div className="skeleton h-3.5 w-3/4 rounded" />
                  <div className="text-[11px] text-slate-400 dark:text-white/35 pt-1">Summarising this project…</div>
                </div>
              ) : err ? (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">{err}</div>
              ) : (
                <>
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={7}
                    className="w-full text-[13px] leading-relaxed text-slate-700 dark:text-white/80 bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl px-3.5 py-3 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/15 resize-none"
                  />
                  <p className="text-[10.5px] text-slate-400 dark:text-white/30 mt-2 leading-snug">
                    A draft for you to review and edit — not a record. It describes status only; it makes no regulatory or severity determination.
                  </p>
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button onClick={() => draft()} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/60 hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors">
                      Regenerate
                    </button>
                    <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                      {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function ProjectDetailClient(props: ProjectDetailClientProps) {
  const { initialProject = null, initialMe = null } = props;
  const { id } = useParams<{ id: string }>();
  const isLead  = useIsLead();
  const isAdmin = useIsAdmin();
  // Seed from the server-rendered payload so real content paints on first
  // byte. The client still refetches on mount to stay live; SSR is the fast
  // first paint, the client fetch is the freshness pass.
  const [project, setProject] = useState<any>(initialProject);
  const [me, setMe]           = useState<any>(initialMe);
  const [view, setView]       = useState<'phases' | 'board'>('phases');
  // The owner of a personal project may fully manage it even as an IC — that
  // is the whole point of a private workspace. Everywhere we'd gate on isLead
  // for task management, we gate on canManage instead.
  const canManage = isLead || !!(project?.isPersonal && me && project?.ownerId === me.id);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen]           = useState(false);
  const [blockCompleteOpen, setBlockComplete] = useState(false);
  const [savingStatus, setSavingStatus]       = useState(false);
  // Bird's-eye view modal — shows this project's tasks as a tree (project
  // scope, single-column layout, no team level).
  // The status the user picked that's awaiting an e-signature (password +
  // reason). Null when no sign-off is in flight.
  const [pendingStatus, setPendingStatus]     = useState<string | null>(null);
  // Toggles the inline due-date editor in the header (leads only).
  const [editingDue, setEditingDue]           = useState(false);
  const [savingDue, setSavingDue]             = useState(false);
  const [pendingTaskIds, setPendingTaskIds]   = useState<Set<string>>(new Set());
  const { showToast, ToastEl } = useToast();
  const [showBirdEye, setShowBirdEye] = useState(false);
  // Inline ccNo editor
  const [editingCcNo, setEditingCcNo]         = useState(false);
  const [ccNoDraft, setCcNoDraft]             = useState('');
  // Milestone celebration — set when finishing a task closes out its phase or
  // the whole project. The Celebration overlay fires a fanfare + confetti.
  const [celebration, setCelebration] = useState<{ title: string; subtitle?: string; emoji?: string } | null>(null);
  // Per-task mini-celebration toast (bottom-right). Distinct from `celebration`
  // (which is the full-screen phase/project milestone) — this pops on every
  // individual task close and reads its type so the line feels personalised.
  const [taskPop, setTaskPop] = useState<any | null>(null);

  async function load() {
    try {
      // The assignee picker (UserPicker) fetches its own paginated roster
      // scoped to the project's team, so we only need the project here.
      const p = await api<any>(`/projects/${id}`);
      setProject(p); setLoadErr(null);
    } catch (e: any) { setLoadErr(e?.message || 'Could not load this project.'); }
  }

  useEffect(() => {
    // The route is server-seeded with the project and current user. Avoid a
    // duplicate hydration fetch; only fall back to the API if a client-side
    // transition ever mounts without those props. Mutations still call load().
    if (!project) load();
    if (!me) api<any>('/auth/me').then(d => setMe(d.user)).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loadErr) {
    return (
      <div className="max-w-md mx-auto mt-12 card p-6 text-center page-enter">
        <div className="w-10 h-10 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-3">
          <span className="text-red-600 text-lg">!</span>
        </div>
        <div className="text-sm font-bold text-slate-800 mb-1">We couldn&rsquo;t load this project</div>
        <div className="text-xs text-slate-500 mb-4">{loadErr}</div>
        <button onClick={() => { setLoadErr(null); load(); }} className="btn-primary text-xs justify-center">Retry</button>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-6 page-enter" aria-busy>
        <div className="space-y-2">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-7 w-80 max-w-full" />
          <div className="flex gap-2 mt-2">
            {[20, 16, 24].map(w => <div key={w} className={`skeleton h-5 w-${w} rounded-full`} />)}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <div className="skeleton h-3 w-20" /><div className="skeleton h-7 w-12" />
            </div>
          ))}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="shrink-0 rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2" style={{ width: 230 }}>
              <div className="skeleton h-3 w-20" />
              <div className="skeleton h-16 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Defensive: PATCH responses don't echo tasks/phases, so a partial
  // refresh could leave these undefined. Default to empty arrays so we
  // never crash the whole page on a partial payload.
  const tasks:  any[] = Array.isArray((project as any).tasks)  ? (project as any).tasks  : [];
  const phases: any[] = Array.isArray((project as any).phases) ? (project as any).phases : [];

  // Priority-weighted progress — a critical task done moves the bar more
  // than a low one. See src/lib/progress.ts.
  const pct = weightedProgress(tasks);
  const waitingCount = tasks.filter((t: any) => t.pendingWith && t.status !== 'done').length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = tasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < today && t.status !== 'done').length;
  const openTaskCount = tasks.filter((t: any) => t.status !== 'done').length;

  async function updateStatus(newStatus: string) {
    if (newStatus === 'completed' && openTaskCount > 0) {
      setBlockComplete(true);
      return;
    }
    // A project's status is a controlled GxP record. Changing it on a shared
    // project requires a re-authenticated e-signature with a reason (21 CFR
    // Part 11 §11.10 / §11.50) — so we route through a sign-off modal instead
    // of patching straight away. Personal projects skip this (no audit trail).
    if (!project.isPersonal) {
      setPendingStatus(newStatus);
      return;
    }
    setSavingStatus(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { status: newStatus } });
      if (newStatus === 'completed') {
        setCelebration({ title: 'Project complete! 🎉', subtitle: `${project.name} is closed out and in control.`, emoji: '🏆' });
      } else {
        showToast('Project status updated');
      }
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update status', 'err');
    } finally {
      setSavingStatus(false);
    }
  }

  // Commits a status change once the user has re-entered their password and a
  // reason in the sign-off modal. The server re-verifies the password and writes
  // the reason into the immutable audit trail.
  async function confirmStatusChange(password: string, remarks: string) {
    if (!pendingStatus) return;
    const becameComplete = pendingStatus === 'completed';
    await api(`/projects/${id}`, { method: 'PATCH', body: { status: pendingStatus, password, remarks } });
    setPendingStatus(null);
    if (becameComplete) {
      setCelebration({ title: 'Project complete! 🎉', subtitle: `${project.name} is closed out and in control.`, emoji: '🏆' });
    } else {
      showToast('Project status updated');
    }
    load();
  }

  // Leads can re-schedule the whole project from the header. A null value
  // clears the due date. Optimistic toast + refetch keeps the stat cards in
  // sync (Overdue recomputes off the new date).
  async function saveDueDate(value: string | null) {
    setSavingDue(true);
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { dueDate: value } });
      setEditingDue(false);
      showToast('Due date updated');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update due date', 'err');
    } finally {
      setSavingDue(false);
    }
  }

  async function saveCcNo(value: string) {
    try {
      await api(`/projects/${id}`, { method: 'PATCH', body: { ccNo: value.trim() } });
      setEditingCcNo(false);
      showToast('CC# updated');
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update CC#', 'err');
    }
  }

  // After a task is completed, decide whether that finished a phase or the whole
  // project — the genuine milestones worth a celebration. Projects the just-done
  // task onto the current list so the check is correct even before `load()`.
  // Returns true when a milestone celebration was triggered (so the caller can
  // skip the routine completion chime and let the fanfare carry the moment).
  function celebrateIfMilestone(taskId: string): boolean {
    const projected = tasks.map((t: any) => (t.id === taskId ? { ...t, status: 'done' } : t));
    const done = (t: any) => t.status === 'done';
    if (projected.length > 0 && projected.every(done)) {
      setCelebration({
        title: 'Project complete!',
        subtitle: `Every task in ${project?.name || 'this project'} is closed and in control. Beautifully done.`,
        emoji: '🏆',
      });
      return true;
    }
    const task = projected.find((t: any) => t.id === taskId);
    const pid = task?.phaseId || null;
    if (!pid) return false;
    const phaseTasks = projected.filter((t: any) => (t.phaseId || null) === pid);
    if (phaseTasks.length > 0 && phaseTasks.every(done)) {
      const phaseName = phases.find((p: any) => p.id === pid)?.name;
      setCelebration({
        title: 'Phase complete!',
        subtitle: phaseName
          ? `“${phaseName}” is fully closed out — a real milestone. Onwards.`
          : 'A phase milestone reached — onwards to the next.',
        emoji: '✅',
      });
      return true;
    }
    return false;
  }

  // Kanban drop: persist a status change (if any) and the new column order.
  async function dropReorder(taskId: string, toStatus: string, orderedIds: string[]) {
    const cur = tasks.find((t: any) => t.id === taskId);
    const statusChanged = !!cur && cur.status !== toStatus;
    const wasNotDone = cur?.status !== 'done';
    setPendingTaskIds(s => new Set([...s, taskId]));
    try {
      if (statusChanged) {
        await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status: toStatus } });
      }
      // Persisting column order is a lead/admin action; an IC dragging their
      // own card still gets the status change, just not a saved reorder.
      if (isLead) {
        await api(`/projects/${id}/reorder-tasks`, { method: 'POST', body: { orderedIds } });
      }
      if (toStatus === 'done' && wasNotDone) {
        // The mini-pop replaces the dry toast for individual closes; the full
        // milestone fanfare supersedes it when a phase/project closes out.
        if (!celebrateIfMilestone(taskId)) {
          chimeIfEnabled();
          if (cur) setTaskPop(cur);
        }
      }
      // Optimistic state is already applied by KanbanBoard; reconcile silently.
      load();
    } catch (e: any) {
      showToast(e.message || 'Failed to update task', 'err');
      load(); // revert optimistic
    } finally {
      setPendingTaskIds(s => { const n = new Set(s); n.delete(taskId); return n; });
    }
  }

  async function moveTaskFromPhase(taskId: string, status: string) {
    const wasNotDone = tasks.find((t: any) => t.id === taskId)?.status !== 'done';
    // Optimistic local update
    setProject((p: any) => ({
      ...p,
      tasks: p.tasks.map((t: any) => t.id === taskId ? { ...t, status } : t),
    }));
    setPendingTaskIds(s => new Set([...s, taskId]));
    try {
      await api(`/tasks/${taskId}`, { method: 'PATCH', body: { status } });
      if (status === 'done' && wasNotDone) {
        if (!celebrateIfMilestone(taskId)) {
          chimeIfEnabled();
          const cur = tasks.find((t: any) => t.id === taskId);
          if (cur) setTaskPop(cur);
        }
      }
    } catch (e: any) {
      showToast(e.message || 'Failed to update task', 'err');
      load(); // revert
    } finally {
      setPendingTaskIds(s => { const n = new Set(s); n.delete(taskId); return n; });
    }
  }

  // Move a task up/down within its phase. Computes the phase's new order
  // and persists it (position = index) via the reorder endpoint.
  async function reorderInPhase(phaseId: string | null, taskId: string, dir: -1 | 1) {
    const phaseTasks = tasks
      .filter((t: any) => (t.phaseId || null) === (phaseId || null))
      .slice()
      .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    const idx = phaseTasks.findIndex((t: any) => t.id === taskId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= phaseTasks.length) return;
    [phaseTasks[idx], phaseTasks[swap]] = [phaseTasks[swap], phaseTasks[idx]];
    const orderedIds = phaseTasks.map((t: any) => t.id);
    // Optimistic: reflect the new positions locally right away.
    setProject((p: any) => ({
      ...p,
      tasks: (p.tasks || []).map((t: any) =>
        orderedIds.includes(t.id) ? { ...t, position: orderedIds.indexOf(t.id) } : t),
    }));
    try {
      await api(`/projects/${id}/reorder-tasks`, { method: 'POST', body: { orderedIds } });
    } catch (e: any) {
      showToast(e.message || 'Could not reorder', 'err');
      load();
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task permanently? This cannot be undone.')) return;
    try {
      await api(`/tasks/${taskId}`, { method: 'DELETE' });
      showToast('Task deleted');
      load();
    } catch (e: any) {
      showToast(e.message || 'Delete failed', 'err');
    }
  }

  return (
    <div className="space-y-5 page-enter">
      {ToastEl}
      {celebration && (
        <Celebration
          title={celebration.title}
          subtitle={celebration.subtitle}
          emoji={celebration.emoji}
          onDone={() => setCelebration(null)}
        />
      )}
      <TaskCompletePop task={taskPop} onDone={() => setTaskPop(null)} />

      {/* Header — stacks vertically on mobile (title block → meta → actions),
          flows horizontally with the meta/actions pinned right on md+. The old
          flex-wrap layout was forcing the project name to wrap one word per
          line on a phone because the right column refused to wrap below it. */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 md:gap-6">
        {/* Left — identity, description, then status directly below it */}
        <div className="min-w-0 md:flex-1">
          <div className="text-[11px] text-slate-400 font-mono break-all">{project.isPersonal ? 'Personal' : project.code}</div>
          {!project.isPersonal && (
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[11px] text-slate-400 font-mono">CC#:</span>
              {editingCcNo ? (
                <>
                  {/* datalist for autocomplete from existing task ccNos */}
                  <datalist id="ccno-suggestions">
                    {Array.from(new Set(tasks.map((t: any) => t.ccNo).filter(Boolean))).map((v: any) => (
                      <option key={v} value={v} />
                    ))}
                  </datalist>
                  <input
                    type="text"
                    list="ccno-suggestions"
                    value={ccNoDraft}
                    onChange={e => setCcNoDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); saveCcNo(ccNoDraft); }
                      if (e.key === 'Escape') { setEditingCcNo(false); }
                    }}
                    onBlur={() => saveCcNo(ccNoDraft)}
                    autoFocus
                    maxLength={60}
                    placeholder="e.g. CC-2025-042"
                    className="text-[11px] font-mono text-slate-700 border-b border-blue-400 outline-none bg-transparent px-0.5 w-36"
                  />
                  <button onClick={() => setEditingCcNo(false)} className="text-slate-300 hover:text-slate-500 ml-1" title="Cancel">
                    <X size={11} />
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-mono text-slate-600">{project.ccNo || '—'}</span>
                  {isLead && (
                    <button
                      onClick={() => { setCcNoDraft(project.ccNo || ''); setEditingCcNo(true); }}
                      className="ml-1 text-slate-300 hover:text-blue-500 transition-colors"
                      title="Edit CC#"
                    >
                      <Pencil size={11} />
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold mt-0.5 leading-tight break-words">{project.name}</h1>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {project.isPersonal && (
              <span className="tag border border-violet-200 bg-violet-50 text-violet-700 font-semibold inline-flex items-center gap-1.5">
                <Lock size={11} /> Private
              </span>
            )}
            {project.archived && (
              <span className="tag border border-amber-200 bg-amber-50 text-amber-800 font-semibold inline-flex items-center gap-1.5"
                    title={project.archivedAt ? `Archived ${new Date(project.archivedAt).toLocaleString()}` : 'Archived'}>
                <Archive size={11} /> Archived
              </span>
            )}
            {!project.isPersonal && <LifecycleTag lifecycle={project.lifecycle} />}
            <PriorityTag priority={project.priority} />
          </div>
          {project.description && <p className="mt-2 text-sm text-slate-600 max-w-3xl">{project.description}</p>}

          {/* Status — directly under the description */}
          <div className="flex items-center flex-wrap gap-2 mt-3">
            {isLead ? (
              <StatusPillRow
                value={project.status}
                onChange={updateStatus}
                options={PROJECT_STATUS_OPTIONS.filter(s => s !== 'planning') as unknown as string[]}
                pending={savingStatus}
              />
            ) : (
              <span className="text-xs font-semibold px-2 py-1 rounded-md bg-slate-100 text-slate-600 capitalize">
                {String(project.status || '').replace(/_/g, ' ')}
              </span>
            )}
            {openTaskCount > 0 && (
              <span className="text-[10px] text-amber-600 font-semibold">{openTaskCount} open</span>
            )}
          </div>
        </div>

        {/* Right — owner / team / due, then actions. On mobile this becomes a
            left-aligned strip below the title; on md+ it pins top-right. */}
        <div className="flex flex-col md:items-end gap-3 shrink-0">
          <div className="text-xs text-slate-500 md:text-right space-y-0.5">
            <div>Project owner: <span className="font-medium text-slate-700">{project.ownerName || '—'}</span></div>
            <div>Team: {project.teamId
              ? <Link href={`/teams/${project.teamId}`} className="text-blue-600 hover:underline">{project.teamName || '—'}</Link>
              : '—'}</div>
            {/* Due date — leads can re-schedule inline; everyone else sees it
                read-only. */}
            {isLead ? (
              editingDue ? (
                <div className="flex items-center md:justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                  <span>Due:</span>
                  <DatePicker
                    value={project.dueDate ? String(project.dueDate).slice(0, 10) : ''}
                    onChange={(v) => saveDueDate(v || null)}
                    placeholder="Set due date"
                    size="sm"
                  />
                  <button onClick={() => setEditingDue(false)}
                    className="text-slate-400 hover:text-slate-600" title="Cancel">
                    <X size={13} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setEditingDue(true)} disabled={savingDue}
                  className="inline-flex items-center gap-1 hover:text-blue-600 transition-colors group"
                  title="Change due date">
                  Due: <span className="font-medium text-slate-700 group-hover:text-blue-600">{formatDate(project.dueDate)}</span>
                  <Pencil size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              )
            ) : (
              <div>Due: {formatDate(project.dueDate)}</div>
            )}
          </div>

          {/* Actions — Export (PDF/CSV/HTML) for everyone; Archive + Delete
              admin-only. */}
          <div className="flex flex-wrap items-center md:justify-end gap-2">
            <BirdEyeButton scopeKey={`project:${id}`} onClick={() => setShowBirdEye(true)} />
            {!project.isPersonal && <StatusDraftButton project={project} tasks={tasks} />}
            <ExportMenu
              onExcel={project.isPersonal ? undefined : () => { window.location.href = `/api/projects/${project.id}/export`; }}
              onPdf={() => printProjectReport(project, phases, me?.name || me?.email || '')}
              onCsv={() => downloadProjectCsv(project, phases, me?.name || me?.email || '')}
            />
            {isAdmin && !project.isPersonal && (
              <Link
                href={`/audit?targetType=project&targetId=${project.id}`}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                title="View this project's audit trail"
              >
                <ScrollText size={13} /> Audit
              </Link>
            )}
            {isAdmin && (
              <button
                onClick={async () => {
                  const archiving = !project.archived;
                  const msg = archiving
                    ? `Archive "${project.name}"?\nIt will be hidden from the dashboard and project list, but tasks and audit history remain.`
                    : `Restore "${project.name}" from the archive?`;
                  if (!confirm(msg)) return;
                  await api(`/projects/${project.id}/archive`, { method: 'POST', body: { archived: archiving } });
                  load();
                }}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition-colors ${
                  project.archived
                    ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                    : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                }`}>
                <Archive size={13} /> {project.archived ? 'Restore' : 'Archive'}
              </button>
            )}
            {(isAdmin || (project?.isPersonal && me && project.ownerId === me.id)) && (
              <button onClick={() => setDeleteOpen(true)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stat cards — 2-up on mobile, 4-up on md+. The previous `md:grid-cols-5`
          left an awkward fifth column unused after the QA sign-off card was
          removed; matched the 4-card content count. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Progress', value: `${pct}%`, sub: `${tasks.filter((t: any) => t.status === 'done').length}/${tasks.length} tasks · weighted`, bar: pct },
          { label: 'Phases', value: phases.length, sub: 'lifecycle stages' },
          { label: 'Waiting on', value: waitingCount, sub: waitingCount > 0 ? 'pending on someone' : 'nothing stuck', warn: waitingCount > 0 },
          { label: 'Overdue', value: overdue, sub: overdue > 0 ? 'past deadline' : 'none — on track', danger: overdue > 0 },
        ].map(stat => (
          <div key={stat.label} className="bg-white rounded-2xl border border-slate-200/80 p-4 space-y-1"
            style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{stat.label}</div>
            <div className={`text-2xl font-black ${stat.danger ? 'text-red-600' : stat.warn ? 'text-amber-600' : 'text-slate-800'}`}>
              {stat.value}
            </div>
            <div className="text-xs text-slate-400">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-1 bg-white border border-slate-200/80 rounded-xl p-1 w-fit"
        style={{ boxShadow: '0 1px 2px rgba(15,23,42,0.04)' }}>
        {[['phases', 'By phase'], ['board', 'Kanban']].map(([k, l]) => (
          <button key={k} onClick={() => setView(k as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === k ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}>
            {l}
          </button>
        ))}
      </div>

      {/* Phases view */}
      {view === 'phases' && (
        <div className="space-y-4">
          {phases.length === 0 && <Card><p className="text-slate-500 text-sm">No phases yet.</p></Card>}
          {phases.map((ph: any, i: number) => {
            const ts = tasks.filter((t: any) => t.phaseId === ph.id);
            const done = ts.filter((t: any) => t.status === 'done').length;
            const pctP = weightedProgress(ts);
            return (
              <Card key={ph.id}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold text-slate-800">
                    <span className="text-slate-400 font-mono mr-2 text-sm">{String(i + 1).padStart(2, '0')}</span>
                    {ph.name}
                  </h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">{done}/{ts.length}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${pctP === 100 ? 'bg-green-50 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                      {pctP}%
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-slate-100">
                  {ts.map((t: any, ti: number) => {
                    const canEdit = canManage || (me && t.assigneeId === me.id);
                    return (
                    <div key={t.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 text-sm group">
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        {canEdit ? (
                          <StatusSelect
                            value={t.status}
                            onChange={v => moveTaskFromPhase(t.id, v)}
                            size="sm"
                            pending={pendingTaskIds.has(t.id)}
                          />
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 capitalize shrink-0">
                            {String(t.status || '').replace(/_/g, ' ')}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <TaskLink task={t} className="font-medium text-slate-800 hover:text-blue-700 transition-colors text-sm block truncate" />
                          <div className="text-xs text-slate-400 truncate">
                            {t.assigneeName || 'Unassigned'}
                            {t.subtaskCount > 0 && ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                          </div>
                        </div>
                      </div>
                      {/* Meta tags + actions — flow inline on desktop, wrap to
                          their own row on mobile so the title doesn't shrink. */}
                      <div className="flex items-center flex-wrap gap-1.5 sm:shrink-0 sm:justify-end pl-9 sm:pl-0">
                        {t.pendingWith && t.status !== 'done' && (
                          <span className="tag bg-slate-50 text-slate-500 border border-slate-200 dark:bg-white/[0.03] dark:text-white/40 dark:border-white/[0.06]"
                                title={`Waiting on ${t.pendingWith}`}>
                            waiting on {t.pendingWith}
                          </span>
                        )}
                        {!t.pendingWith && t.status !== 'done' && t.lastActivityAt && (() => {
                          const days = Math.floor((Date.now() - new Date(t.lastActivityAt).getTime()) / 86_400_000);
                          return days >= 7 ? (
                            <span className="tag bg-slate-50 text-slate-400 border border-slate-200 dark:bg-white/[0.03] dark:text-white/30 dark:border-white/[0.06]"
                                  title="No activity recorded recently">
                              {days}d idle
                            </span>
                          ) : null;
                        })()}
                        {t.requiresQaSignoff && (t.qaSignoffAt
                          ? <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">Approved ✓</span>
                          : <span className="tag bg-purple-50 text-purple-700 border border-purple-200">Approval</span>
                        )}
                        <PriorityTag priority={t.priority} />
                        {t.dueDate && <span className="text-xs text-slate-400 font-mono">{formatDate(t.dueDate)}</span>}
                        {canManage && (
                          <button onClick={() => deleteTask(t.id)} aria-label="Delete task"
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all shrink-0">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
                {canManage && (
                  <QuickAddTask projectId={project.id} phaseId={ph.id} teamId={project.teamId} onAdded={load} />
                )}
              </Card>
            );
          })}

          {/* Unphased tasks */}
          <Card title="Unphased tasks">
            <div className="divide-y divide-slate-100">
              {tasks.filter((t: any) => !t.phaseId).map((t: any) => {
                const canEdit = canManage || (me && t.assigneeId === me.id);
                return (
                <div key={t.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 text-sm group">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    {canEdit ? (
                      <StatusSelect value={t.status} onChange={v => moveTaskFromPhase(t.id, v)} size="sm" pending={pendingTaskIds.has(t.id)} />
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 text-slate-600 capitalize shrink-0">
                        {String(t.status || '').replace(/_/g, ' ')}
                      </span>
                    )}
                    <div className="flex-1 min-w-0">
                      <TaskLink task={t} className="font-medium text-slate-800 hover:text-blue-700 transition-colors text-sm block truncate" />
                      <div className="text-xs text-slate-400 truncate">
                        {t.assigneeName || 'Unassigned'}
                        {t.subtaskCount > 0 && ` · ${t.subtasksDone}/${t.subtaskCount} subtasks`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5 sm:shrink-0 sm:justify-end pl-9 sm:pl-0">
                    {t.pendingWith && t.status !== 'done' && (
                      <span className="tag bg-slate-50 text-slate-500 border border-slate-200 dark:bg-white/[0.03] dark:text-white/40 dark:border-white/[0.06]"
                            title={`Waiting on ${t.pendingWith}`}>
                        waiting on {t.pendingWith}
                      </span>
                    )}
                    {!t.pendingWith && t.status !== 'done' && t.lastActivityAt && (() => {
                      const days = Math.floor((Date.now() - new Date(t.lastActivityAt).getTime()) / 86_400_000);
                      return days >= 7 ? (
                        <span className="tag bg-slate-50 text-slate-400 border border-slate-200 dark:bg-white/[0.03] dark:text-white/30 dark:border-white/[0.06]"
                              title="No activity recorded recently">
                          {days}d idle
                        </span>
                      ) : null;
                    })()}
                    {t.gxpCritical && <span className="tag bg-red-50 text-red-700 border border-red-200">GxP</span>}
                    {t.requiresQaSignoff && (t.qaSignoffAt
                      ? <span className="tag bg-emerald-50 text-emerald-700 border border-emerald-200">QA ✓</span>
                      : <span className="tag bg-purple-50 text-purple-700 border border-purple-200">Sign-off</span>
                    )}
                    <PriorityTag priority={t.priority} />
                    {t.dueDate && <span className="text-xs text-slate-400 font-mono">{formatDate(t.dueDate)}</span>}
                    {canManage && (
                      <button onClick={() => deleteTask(t.id)} aria-label="Delete task"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded transition-all shrink-0">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
              {tasks.filter((t: any) => !t.phaseId).length === 0 && (
                <div className="text-xs text-slate-400 py-3">None</div>
              )}
            </div>
            {canManage && (
              <QuickAddTask projectId={project.id} teamId={project.teamId} onAdded={load} />
            )}
          </Card>
        </div>
      )}

      {view === 'board' && (
        <>
          {/* Desktop: the full drag-and-drop column board. Mobile: a tap-driven
              status view (see KanbanBoardMobile). Pure CSS switch by breakpoint
              so the desktop board is never affected. */}
          <div className="hidden md:block">
            <KanbanBoard tasks={tasks} onDropReorder={dropReorder} isLead={canManage} onDelete={deleteTask} />
          </div>
          <div className="md:hidden">
            <KanbanBoardMobile tasks={tasks} onMove={dropReorder} isLead={canManage} onDelete={deleteTask} />
          </div>
        </>
      )}

      {/* Modals */}
      {pendingStatus && (
        <StatusSignoffModal
          projectName={project.name}
          fromStatus={project.status}
          toStatus={pendingStatus}
          onClose={() => setPendingStatus(null)}
          onConfirm={confirmStatusChange}
        />
      )}
      {blockCompleteOpen && (
        <BlockCompleteModal openCount={openTaskCount} onClose={() => setBlockComplete(false)} />
      )}
      {deleteOpen && project && (
        <DeleteProjectModal
          projectName={project.name} projectId={id}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => { setDeleteOpen(false); window.location.replace('/projects'); }}
        />
      )}
      {showBirdEye && project && (
        <BirdsEyeView
          onClose={() => setShowBirdEye(false)}
          onChange={load}
          data={{
            rootLabel: project.name,
            rootSubLabel: `${project.code || 'Project'} · ${(tasks || []).length} task${(tasks || []).length === 1 ? '' : 's'}`,
            scope: 'project',
            teams: [],
            projects: [{
              id: project.id, code: project.code, name: project.name,
              teamId: null,
              health: 'healthy',
              taskCount: (tasks || []).length,
              tasksDone: (tasks || []).filter((t: any) => t.status === 'done').length,
              dueDate: project.dueDate || null,
              ownerName: project.ownerName || null,
            }],
            tasks: (tasks || []).map((t: any) => ({
              id: t.id, title: t.title, projectId: project.id,
              status: t.status,
              assigneeName: t.assigneeName ?? null,
              dueDate: (t.ccTcd || t.dueDate) ?? null,
              phaseName: (phases || []).find((ph: any) => ph.id === (t.phaseId || null))?.name ?? null,
            })),
          }}
        />
      )}
    </div>
  );
}
