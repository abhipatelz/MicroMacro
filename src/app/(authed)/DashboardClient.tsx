'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Avatar, formatDate, daysUntil, ProgressBar,
  LIFECYCLE_LABELS, STATUS_COLORS,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { api } from '@/lib/client/api';
import { useIsLead } from '@/components/CurrentUserContext';
import {
  AlertTriangle, FolderKanban, CheckCircle2, Users as UsersIcon,
  ChevronDown, TrendingUp, Clock, Sparkles, ArrowRight, UserPlus, Plus,
  Maximize2, X, GripVertical,
} from 'lucide-react';

// Lazy-loaded — only ships when the user actually sees the tour.
const FirstTimeTour = dynamic(
  () => import('@/components/FirstTimeTour').then(m => m.FirstTimeTour),
  { ssr: false, loading: () => null },
);

/* ── Types matching /api/lead-dashboard ──────────────────────────────────── */
interface TeamTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  dueDate?: string | null;
  ccTcd?: string | null;
  completedAt?: string | null;
  projectId: string;
  projectCode: string;
  projectName: string;
  lifecycle?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  subtaskCount: number;
  subtasksDone: number;
  subtaskTitles?: string[];
  gxpCritical?: boolean;
}

interface DashProject {
  id: string; code: string; name: string;
  lifecycle?: string;
  status: string;
  ownerId?: string; ownerName?: string;
  teamName?: string | null;
  dueDate?: string | null;
  taskCount?: number; tasksDone?: number;
  openTasks: number; overdueCount: number;
  health: 'healthy' | 'at_risk' | 'critical';
}

interface DashPerson {
  id: string; name: string; title: string;
  openTasks: number; overdueCount: number; completedThisWeek: number;
  loadScore: number; loadLevel: 'healthy' | 'busy' | 'overloaded';
}

interface DashResp {
  user: { id: string; name: string; email: string; role: string };
  projects: DashProject[];
  tasks: any[];
  teamTasks: TeamTask[];
  people: DashPerson[];
  teamCount: number;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 5)  return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do', in_progress: 'In progress', review: 'Review',
  blocked: 'Blocked', done: 'Done',
};

const FLOW_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  todo: { label: 'To do', color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' },
  in_progress: { label: 'In progress', color: '#1565C0', bg: '#eff6ff', border: '#bfdbfe' },
  review: { label: 'Review', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
  blocked: { label: 'Blocked', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  done: { label: 'Done', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
};

const HEALTH_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  healthy:  { label: 'On track',  bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },
  at_risk:  { label: 'At risk',   bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-400' },
  critical: { label: 'Critical',  bg: 'bg-red-50',   text: 'text-red-600',   dot: 'bg-red-500'   },
};

type ActionFilter = 'week' | 'nextWeek' | 'month' | 'untilDate';

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function DashboardClient({
  initialData, hasSeenTour,
}: { initialData: DashResp; hasSeenTour: boolean }) {
  const dash = initialData;
  const isLead = useIsLead();

  // First-run: a lead/admin whose workspace has no projects yet. Show a
  // guided setup path instead of a wall of empty panels — this is the
  // first thing a brand-new admin sees, so it should point the way.
  const isFirstRun = isLead && dash.projects.length === 0;

  // Individual contributors get a strictly personal view: their dashboard is
  // "My Tasks", so every task panel below is scoped to the tasks assigned to
  // them. Leads/admins keep the full team view. This is what keeps one IC from
  // seeing another team member's workload or progress (see also: the
  // Contributors panel, which is hidden for ICs entirely).
  const myId = dash.user.id;
  const visibleTasks = useMemo(
    () => (isLead ? dash.teamTasks : dash.teamTasks.filter(t => t.assigneeId === myId)),
    [dash, isLead, myId],
  );

  const ongoingProjects = useMemo(() =>
    dash.projects.filter(p =>
      p.status === 'in_progress' || p.status === 'planning' || p.status === 'on_hold',
    ),
  [dash]);

  const tasksByProject = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of visibleTasks) {
      if (!m.has(t.projectId)) m.set(t.projectId, []);
      m.get(t.projectId)!.push(t);
    }
    return m;
  }, [visibleTasks]);

  const tasksByAssignee = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of visibleTasks) {
      if (t.status === 'done' || !t.assigneeId) continue;
      if (!m.has(t.assigneeId)) m.set(t.assigneeId, []);
      m.get(t.assigneeId)!.push(t);
    }
    return m;
  }, [visibleTasks]);

  const firstName  = (dash.user.name || '').split(' ')[0] || 'there';

  return (
    <div className="pb-12 max-w-[1440px]">

      {/* ── Greeting ────────────────────────────────────────────────────── */}
      <div className="mb-6 pt-1">
        <h1 className="text-3xl font-black tracking-tight leading-tight">
          <span className="brand-shimmer-text" suppressHydrationWarning>{greeting()}, {firstName}.</span>
        </h1>
      </div>

      {isFirstRun ? (
        <FirstRunGuide hasTeam={dash.people.length > 0} />
      ) : (
        <>
          {/* ── Summary strip ──────────────────────────────────────────── */}
          {(() => {
            const totalOpen    = visibleTasks.filter(t => t.status !== 'done').length;
            const totalOverdue = visibleTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date()).length;
            return (
              <div className="flex flex-wrap gap-2.5 mb-6">
                <SummaryChip label="Ongoing projects" value={ongoingProjects.length} accent="blue"  href="/projects" />
                <SummaryChip label="Open tasks"       value={totalOpen}              accent="slate" href="/projects" />
                <SummaryChip label="Overdue"          value={totalOverdue}           accent={totalOverdue > 0 ? 'red' : 'slate'} href="/projects" />
                <SummaryChip label={dash.teamCount === 1 ? 'Team' : 'Teams'} value={dash.teamCount} accent="green" href="/teams" />
              </div>
            );
          })()}
        </>
      )}

      {/* ── Main layout: Projects (left) · Actions (right, same row) ───── */}
      {!isFirstRun && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

          {/* Left column — Projects */}
          <ProjectsColumn
            projects={ongoingProjects}
            tasksByProject={tasksByProject}
          />

          {/* Right column — Actions + "My tasks" (for leads: also Contributors). */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto pr-1">
            <ActionsPanel tasks={visibleTasks} />
            <MyTasksPanel tasks={visibleTasks} myId={myId} />
            {isLead && <ContributorsPanel people={dash.people} tasksByAssignee={tasksByAssignee} />}
          </div>
        </div>
      )}

      {/* First-time tour for new leads */}
      <FirstTimeTour alreadySeen={hasSeenTour} />
    </div>
  );
}

/* ── Full-screen overlay ──────────────────────────────────────────────────
   Lets the Actions and Contributors panels expand to a distraction-free,
   full-page view (#12). Click the backdrop or the ✕ to close. */
function FullScreenOverlay({
  title, icon, onClose, children,
}: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-3 sm:p-8 overflow-auto"
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl my-2 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
          {icon}
          <h3 className="text-sm font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} title="Close"
            className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-2 sm:p-3">{children}</div>
      </div>
    </div>
  );
}

/* A small maximize affordance for panel headers. */
function ExpandButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Open full screen"
      className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors">
      <Maximize2 size={12} />
    </button>
  );
}

/* ── Summary chip ────────────────────────────────────────────────────────── */
function SummaryChip({
  label, value, accent, href,
}: { label: string; value: number; accent: 'blue' | 'red' | 'slate' | 'green'; href: string }) {
  const styles = {
    blue:  'bg-blue-50  text-blue-700',
    red:   'bg-red-50   text-red-600',
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-50 text-emerald-700',
  }[accent];

  // Clickable — each chip drills into the relevant view.
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all hover:brightness-95 hover:shadow-sm ${styles}`}
    >
      <span className="text-sm font-black">{value}</span>
      <span className="text-xs font-medium opacity-80">{label}</span>
    </Link>
  );
}

/* ── First-run guide ──────────────────────────────────────────────────────
   Shown to a lead/admin whose workspace has no projects yet. A three-step
   path — team → members → project — so a brand-new admin always knows the
   next click instead of staring at empty panels. */
function FirstRunGuide({ hasTeam }: { hasTeam: boolean }) {
  const steps = [
    {
      href: '/teams',
      icon: UsersIcon,
      tint: 'blue' as const,
      title: 'Create your team',
      body: 'Give your group a name. Every project rolls up to a team.',
      done: hasTeam,
    },
    {
      href: '/people',
      icon: UserPlus,
      tint: 'teal' as const,
      title: 'Add your people',
      body: 'Add members with their company username + employee ID. They become assignable instantly.',
      done: hasTeam,
    },
    {
      href: '/projects/new',
      icon: Plus,
      tint: 'green' as const,
      title: 'Create your first project',
      body: 'Pick a lifecycle, assign it to your team, and start adding tasks.',
      done: false,
    },
  ];
  const tints: Record<'blue' | 'teal' | 'green', string> = {
    blue:  'bg-blue-50 text-blue-600',
    teal:  'bg-teal-50 text-teal-600',
    green: 'bg-emerald-50 text-emerald-600',
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-blue-500" />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Let’s get you set up
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              className="fluid-card group bg-white rounded-2xl border border-slate-200/80 p-5 flex flex-col"
              style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tints[s.tint]}`}>
                  <Icon size={17} />
                </div>
                {s.done ? (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                ) : (
                  <span className="text-[11px] font-bold text-slate-300">STEP {i + 1}</span>
                )}
              </div>
              <div className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-1">
                {s.title}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed flex-1">{s.body}</p>
              <div className="mt-3 text-xs font-semibold text-blue-600 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
                {s.done ? 'Review' : 'Start'} <ArrowRight size={13} />
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 mt-3 text-center">
        Your dashboard fills in automatically as you create projects and assign tasks.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  PROJECTS COLUMN — left side, expandable project rows with tasks inside    */
/* ────────────────────────────────────────────────────────────────────────── */
function ProjectsColumn({
  projects, tasksByProject,
}: { projects: DashProject[]; tasksByProject: Map<string, TeamTask[]> }) {
  const isLead  = useIsLead();
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderKanban size={14} className="text-slate-400" />
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            Your team’s projects
          </h2>
          <span className="text-[10px] text-slate-300 font-semibold">{projects.length}</span>
        </div>
        <Link href="/projects" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          All projects →
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 text-center py-12 px-6"
          style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <FolderKanban size={26} className="mx-auto text-slate-300 mb-3" />
          <div className="text-sm font-semibold text-slate-600 mb-1">No ongoing projects</div>
          <div className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            When you start or join a team project, it will show up here with all its tasks.
          </div>
          {isLead && (
            <Link href="/projects/new" className="btn-primary text-xs mt-4 inline-flex">
              + New project
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p, i) => (
            <ProjectRow
              key={p.id}
              project={p}
              tasks={tasksByProject.get(p.id) || []}
              defaultOpen={i < 2}
            />
          ))}
        </div>
      )}
    </section>
  );
}


/* Inline vertical task list inside an expanded project row. Leads can drag
   the GripVertical handle to reorder rows; the new order is persisted via
   /api/projects/[id]/reorder-tasks. The dashboard is intentionally NOT a
   Kanban — it's a quick reorderable list so a lead can re-prioritise from
   the bird's-eye view without bouncing into the project. */
function DashboardTaskFlow({ projectId, tasks, canMove }: {
  projectId: string;
  tasks: TeamTask[];
  canMove: boolean;
}) {
  const [local, setLocal] = useState(tasks);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId,     setOverId]     = useState<string | null>(null);
  useEffect(() => setLocal(tasks), [tasks]);

  function onDragStart(e: React.DragEvent, id: string) {
    if (!canMove) return;
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  function onDragOverRow(e: React.DragEvent, overTaskId: string) {
    if (!canMove || !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== overTaskId) setOverId(overTaskId);
  }
  async function onDropRow(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setOverId(null);
    if (!canMove || !draggingId || draggingId === targetId) { setDraggingId(null); return; }

    const next = local.slice();
    const from = next.findIndex((t) => t.id === draggingId);
    const to   = next.findIndex((t) => t.id === targetId);
    if (from < 0 || to < 0) { setDraggingId(null); return; }
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setLocal(next);
    setDraggingId(null);

    try {
      await api(`/projects/${projectId}/reorder-tasks`, {
        method: 'POST',
        body: { orderedIds: next.map((t) => t.id) },
      });
    } catch {
      setLocal(tasks); // server rejected → snap back
    }
  }

  const visible = local.slice(0, 20);

  return (
    <ul className="divide-y divide-slate-100">
      {visible.map((t) => {
        const meta = FLOW_META[t.status] || FLOW_META.todo;
        const dragging = draggingId === t.id;
        const over     = overId === t.id;
        return (
          <li
            key={t.id}
            onDragOver={(e) => onDragOverRow(e, t.id)}
            onDrop={(e) => onDropRow(e, t.id)}
            className={`relative flex items-center gap-3 px-3 py-2 transition-colors ${
              dragging ? 'opacity-50' : ''
            } ${over ? 'bg-blue-50/60' : 'hover:bg-slate-50/60'}`}
          >
            {/* Drop indicator: a thin blue line above the row being hovered. */}
            {over && !dragging && (
              <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-blue-500" />
            )}

            {/* Drag handle — only leads (and personal-project owners on the
                server) can reorder, so it shows up only for them. */}
            {canMove ? (
              <span
                draggable
                onDragStart={(e) => onDragStart(e, t.id)}
                onDragEnd={() => { setDraggingId(null); setOverId(null); }}
                className="shrink-0 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500"
                title="Drag to reorder"
                aria-label="Reorder task"
              >
                <GripVertical size={14} />
              </span>
            ) : (
              <span className="shrink-0 w-3.5" />
            )}

            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.color }} aria-hidden />

            <Link
              href={`/tasks/${t.id}`}
              className="flex-1 min-w-0 text-xs leading-snug text-slate-800 hover:text-blue-700"
              onClick={(e) => draggingId && e.preventDefault()}
            >
              <span className="line-clamp-1 font-semibold">{t.title}</span>
              <span className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                <span>·</span>
                <span className="truncate">{t.assigneeName || 'Unassigned'}</span>
                {(t.ccTcd || t.dueDate) && <span>· {formatDate(t.ccTcd || t.dueDate)}</span>}
              </span>
            </Link>
          </li>
        );
      })}
      {local.length > 20 && (
        <li className="px-3 py-2 text-[10px] text-slate-400">
          Showing 20 of {local.length} tasks — open the project for the full board.
        </li>
      )}
    </ul>
  );
}

function ProjectRow({
  project, tasks, defaultOpen,
}: { project: DashProject; tasks: TeamTask[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const isLead = useIsLead();
  const health = HEALTH_META[project.health];
  const total  = project.taskCount ?? 0;
  const done   = project.tasksDone ?? 0;
  const pct    = total > 0 ? Math.round(done / total * 100) : 0;
  const dueIn  = daysUntil(project.dueDate);
  const cat    = project.lifecycle && project.lifecycle !== 'generic' ? (LIFECYCLE_LABELS[project.lifecycle] || project.lifecycle) : null;

  // Sort tasks: active first, done last
  const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };
  const sortedTasks = [...tasks].sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s !== 0) return s;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });

  return (
    <article className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden transition-all"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      {/* Project header */}
      <header
        onClick={() => setOpen(o => !o)}
        className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50/60 transition-colors select-none"
      >
        <button className="p-0.5 text-slate-400 transition-transform" style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
          <ChevronDown size={14} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <Link href={`/projects/${project.id}`} onClick={e => e.stopPropagation()}
              className="text-sm font-bold text-slate-800 hover:text-blue-700 truncate">
              {project.name}
            </Link>
            <span className="text-[10px] font-bold text-slate-300 tracking-wider">{project.code}</span>
            {cat && (
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                {cat}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${health.bg} ${health.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
              {health.label}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
            <span><span className="font-semibold text-slate-600">{done}/{total}</span> tasks</span>
            {project.overdueCount > 0 && (
              <span className="text-red-600 font-semibold">{project.overdueCount} overdue</span>
            )}
            {project.dueDate && (
              <span className={dueIn !== null && dueIn < 0 ? 'text-red-600 font-semibold' : ''}>
                Due {formatDate(project.dueDate)}
                {dueIn !== null && dueIn >= 0 && ` · ${dueIn === 0 ? 'today' : `${dueIn}d left`}`}
                {dueIn !== null && dueIn < 0 && ` · ${Math.abs(dueIn)}d late`}
              </span>
            )}
            {project.ownerName && <span>Owner: <span className="text-slate-600">{project.ownerName}</span></span>}
          </div>
        </div>

        <div className="w-28 shrink-0">
          <ProgressBar value={pct} />
          <div className="text-[10px] text-slate-400 mt-1 text-right font-semibold">{pct}%</div>
        </div>
      </header>

      {/* Tasks table */}
      {open && (
        <div className="border-t border-slate-100 fade-in-soft">
          {sortedTasks.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 size={18} className="mx-auto text-slate-200 mb-2" />
              <div className="text-xs text-slate-400">No tasks yet for this project.</div>
            </div>
          ) : (
            <DashboardTaskFlow projectId={project.id} tasks={sortedTasks} canMove={isLead} />
          )}
        </div>
      )}
    </article>
  );
}

function TaskTableRow({ t }: { t: TeamTask }) {
  const due     = t.ccTcd || t.dueDate;
  const dueIn   = daysUntil(due);
  const overdue = due && new Date(due) < new Date() && t.status !== 'done';

  return (
    <tr className="group hover:bg-slate-50/80 transition-colors">
      <td className="px-4 py-2.5">
        <Link href={`/tasks/${t.id}`}
          className="text-xs text-slate-800 font-medium hover:text-blue-700 line-clamp-1 group-hover:underline underline-offset-2">
          {t.title}
        </Link>
        {t.gxpCritical && <span className="ml-1.5 text-[9px] text-amber-600 font-bold">· GxP</span>}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        {t.subtaskCount > 0 ? (
          <span className="text-[11px] text-slate-500 font-medium">{t.subtasksDone}/{t.subtaskCount}</span>
        ) : <span className="text-slate-300 text-xs">—</span>}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        {due ? (
          <span className={`text-[11px] ${overdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
            {formatDate(due)}
            {dueIn !== null && (
              <span className="text-[9px] text-slate-400 ml-1">
                {dueIn < 0 && t.status !== 'done' ? `(${Math.abs(dueIn)}d late)`
                  : dueIn === 0 && t.status !== 'done' ? '(today)' : ''}
              </span>
            )}
          </span>
        ) : <span className="text-slate-300 text-xs">—</span>}
      </td>
      <td className="px-2 py-2.5">
        {t.assigneeName ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={t.assigneeName} size={18} />
            <span className="text-[11px] text-slate-600 truncate max-w-[80px]">{t.assigneeName}</span>
          </div>
        ) : <span className="text-slate-300 text-xs">—</span>}
      </td>
      <td className="px-2 py-2.5">
        <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
          {STATUS_LABEL[t.status] || t.status}
        </span>
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        {t.completedAt
          ? <span className="text-[11px] text-emerald-700 font-medium">{formatDate(t.completedAt)}</span>
          : <span className="text-slate-300 text-xs">—</span>}
      </td>
    </tr>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  MY TASKS PANEL — tasks assigned to the current user (all roles)           */
/* ────────────────────────────────────────────────────────────────────────── */
function MyTasksPanel({ tasks, myId }: { tasks: TeamTask[]; myId: string }) {
  const myTasks = tasks.filter(t => t.assigneeId === myId && t.status !== 'done');
  const myDone  = tasks.filter(t => t.assigneeId === myId && t.status === 'done').length;
  const myOverdue = myTasks.filter(t => {
    const due = t.ccTcd || t.dueDate;
    return due && new Date(due) < new Date();
  }).length;

  if (myTasks.length === 0 && myDone === 0) return null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <CheckCircle2 size={13} className="text-slate-400" />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">My tasks</h3>
        <span className="ml-auto text-[10px] font-bold text-slate-300">{myTasks.length} open</span>
        {myOverdue > 0 && (
          <span className="text-[10px] font-bold text-red-400">{myOverdue} overdue</span>
        )}
      </div>
      {myTasks.length === 0 ? (
        <div className="py-7 text-center">
          <CheckCircle2 size={18} className="mx-auto text-emerald-300 mb-1.5" />
          <div className="text-[11px] text-slate-400">All caught up — {myDone} done.</div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
          {myTasks.slice(0, 15).map(t => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            const overdue = due && new Date(due) < new Date() && t.status !== 'done';
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`}
                  className="block px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[t.status] ? '' : 'bg-slate-300'}`}
                      style={{ background: t.status === 'in_progress' ? '#3B82F6' : t.status === 'review' ? '#8B5CF6' : t.status === 'blocked' ? '#EF4444' : '#94A3B8' }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-700 line-clamp-1 group-hover:text-blue-700">
                        {t.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                        <span className="font-semibold">{t.projectCode}</span>
                        {due && (
                          <>
                            <span>·</span>
                            <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                              {dueIn === null ? formatDate(due)
                                : dueIn < 0 ? `${Math.abs(dueIn)}d overdue`
                                : dueIn === 0 ? 'today'
                                : `in ${dueIn}d`}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
          {myTasks.length > 15 && (
            <li className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-50">
              +{myTasks.length - 15} more — <Link href="/my-day" className="text-blue-600 font-semibold">view in My Day →</Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  ACTIONS PANEL — right column top, due/overdue with filter chips           */
/* ────────────────────────────────────────────────────────────────────────── */
function ActionsPanel({ tasks }: { tasks: TeamTask[] }) {
  const [filter, setFilter] = useState<ActionFilter>('week');
  const [untilDate, setUntilDate] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);

  // Compute window
  let windowEnd: Date | null = null;
  if (filter === 'week') {
    windowEnd = new Date(startOfToday); windowEnd.setDate(windowEnd.getDate() + 7);
  } else if (filter === 'nextWeek') {
    windowEnd = new Date(startOfToday); windowEnd.setDate(windowEnd.getDate() + 14);
  } else if (filter === 'month') {
    windowEnd = new Date(startOfToday); windowEnd.setDate(windowEnd.getDate() + 30);
  } else if (filter === 'untilDate' && untilDate) {
    windowEnd = new Date(untilDate + 'T23:59:59');
  }

  const overdue = tasks.filter(t => {
    if (t.status === 'done') return false;
    const due = t.ccTcd || t.dueDate;
    return due && new Date(due) < startOfToday;
  });

  const due = windowEnd
    ? tasks.filter(t => {
        if (t.status === 'done') return false;
        const d = t.ccTcd || t.dueDate;
        if (!d) return false;
        const date = new Date(d);
        return date >= startOfToday && date <= windowEnd!;
      })
    : [];

  // Sort each by due ascending
  const sortByDue = (a: TeamTask, b: TeamTask) => {
    const da = a.ccTcd ? new Date(a.ccTcd).getTime() : a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.ccTcd ? new Date(b.ccTcd).getTime() : b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  };
  overdue.sort(sortByDue);
  due.sort(sortByDue);

  const FILTERS: { key: ActionFilter; label: string }[] = [
    { key: 'week',      label: 'This week' },
    { key: 'nextWeek',  label: 'Next week' },
    { key: 'month',     label: 'This month' },
    { key: 'untilDate', label: 'Until…' },
  ];

  const inner = (
    <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-2.5">
          <TrendingUp size={13} className="text-slate-400" />
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Actions</h3>
          {!expanded && <span className="ml-auto"><ExpandButton onClick={() => setExpanded(true)} /></span>}
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                filter === f.key
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        {filter === 'untilDate' && (
          <div className="mt-2.5">
            <DatePicker
              value={untilDate}
              onChange={setUntilDate}
              placeholder="Pick an end date"
              size="sm"
              minDate={new Date()}
            />
          </div>
        )}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: expanded ? 'calc(100vh - 220px)' : '60vh' }}>
        {/* Overdue group */}
        {overdue.length > 0 && (
          <ActionGroup
            title="Overdue"
            count={overdue.length}
            icon={<AlertTriangle size={11} className="text-red-500" />}
            dotClass="bg-red-400"
            tasks={overdue}
            isOverdue
            showAll={expanded}
          />
        )}

        {/* Due group */}
        <ActionGroup
          title="Due"
          count={due.length}
          icon={<Clock size={11} className="text-blue-500" />}
          dotClass="bg-blue-400"
          tasks={due}
          showAll={expanded}
          emptyHint={filter === 'untilDate' && !untilDate ? 'Pick a date to see upcoming actions.' : 'Nothing due — all clear.'}
        />
      </div>
    </section>
  );

  return expanded
    ? <FullScreenOverlay title="Actions" icon={<TrendingUp size={14} className="text-blue-500" />}
        onClose={() => setExpanded(false)}>{inner}</FullScreenOverlay>
    : inner;
}

function ActionGroup({
  title, count, icon, dotClass, tasks, isOverdue, emptyHint, showAll,
}: {
  title: string; count: number; icon: React.ReactNode; dotClass: string;
  tasks: TeamTask[]; isOverdue?: boolean; emptyHint?: string; showAll?: boolean;
}) {
  const limit = showAll ? tasks.length : 12;
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50/40 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
        </div>
        <span className="text-[10px] font-bold text-slate-400">{count}</span>
      </div>
      {tasks.length === 0 ? (
        <div className="px-4 py-5 text-center">
          <CheckCircle2 size={16} className="mx-auto text-emerald-300 mb-1.5" />
          <div className="text-[11px] text-slate-400">{emptyHint || 'All clear'}</div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50">
          {tasks.slice(0, limit).map(t => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`}
                  className="block px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-700 line-clamp-1 group-hover:text-blue-700">
                        {t.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 flex-wrap">
                        <span className="font-semibold">{t.projectCode}</span>
                        {due && (
                          <>
                            <span>·</span>
                            <span className={isOverdue ? 'text-red-500 font-semibold' : ''}>
                              {dueIn === null ? formatDate(due)
                                : dueIn < 0 ? `${Math.abs(dueIn)}d overdue`
                                : dueIn === 0 ? 'today'
                                : `${dueIn}d`}
                            </span>
                          </>
                        )}
                        {t.assigneeName && (
                          <>
                            <span>·</span>
                            <span>{t.assigneeName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
          {tasks.length > limit && (
            <li className="px-4 py-2 text-[10px] text-slate-400">+{tasks.length - limit} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  CONTRIBUTORS PANEL — right column bottom, per-person task details          */
/* ────────────────────────────────────────────────────────────────────────── */
function ContributorsPanel({
  people, tasksByAssignee,
}: { people: DashPerson[]; tasksByAssignee: Map<string, TeamTask[]> }) {
  const [expanded, setExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false); // collapsed by default

  if (people.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        <div className="px-4 py-3 flex items-center gap-2">
          <UsersIcon size={13} className="text-slate-400" />
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Individual Contributors</h3>
        </div>
      </section>
    );
  }

  // Sort: most loaded first
  const sorted = [...people].sort((a, b) => b.loadScore - a.loadScore);

  const inner = (
    <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div
        className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50/60 select-none transition-colors"
        onClick={() => setPanelOpen(o => !o)}
      >
        <UsersIcon size={13} className="text-slate-400" />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Individual Contributors
        </h3>
        <span className="ml-auto text-[10px] text-slate-300 font-semibold">{people.length}</span>
        {!expanded && (
          <span onClick={e => e.stopPropagation()}>
            <ExpandButton onClick={() => setExpanded(true)} />
          </span>
        )}
        <ChevronDown size={12} className="text-slate-400 transition-transform duration-200"
          style={{ transform: panelOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </div>

      {panelOpen && (
        <ul className="divide-y divide-slate-50 border-t border-slate-100">
          {sorted.map(p => (
            <ContributorRow key={p.id} person={p} tasks={tasksByAssignee.get(p.id) || []} />
          ))}
        </ul>
      )}
    </section>
  );

  return expanded
    ? <FullScreenOverlay title="Individual Contributors" icon={<UsersIcon size={14} className="text-blue-500" />}
        onClose={() => setExpanded(false)}>{inner}</FullScreenOverlay>
    : inner;
}

function ContributorRow({ person, tasks }: { person: DashPerson; tasks: TeamTask[] }) {
  const [open, setOpen] = useState(false);

  // Sort tasks: in_progress first, then by due date
  const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3 };
  const sorted = [...tasks].sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    if (s !== 0) return s;
    const da = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
    return da - db;
  });

  const loadBadge = {
    overloaded: 'bg-red-50 text-red-600',
    busy:       'bg-amber-50 text-amber-700',
    healthy:    'bg-emerald-50 text-emerald-700',
  }[person.loadLevel];

  const loadLabel = { overloaded: 'Overloaded', busy: 'Busy', healthy: 'Steady' }[person.loadLevel];

  return (
    <li>
      <div
        className="px-4 py-2.5 cursor-pointer hover:bg-slate-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <Avatar name={person.name} size={26} />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-slate-800 truncate">{person.name}</div>
            <div className="text-[10px] text-slate-400 truncate">
              {person.openTasks} open
              {person.overdueCount > 0 && <span className="text-red-600 font-semibold ml-1.5">· {person.overdueCount} overdue</span>}
              {person.completedThisWeek > 0 && <span className="text-emerald-600 ml-1.5">· {person.completedThisWeek} done·7d</span>}
            </div>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${loadBadge}`}>
            {loadLabel}
          </span>
          <button className="p-0.5 text-slate-400 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <ChevronDown size={12} />
          </button>
        </div>
      </div>

      {open && (
        <div className="pb-2 fade-in-soft">
          {sorted.length === 0 ? (
            <div className="px-4 pb-3 text-[11px] text-slate-400 italic">
              No open assignments — capacity available.
            </div>
          ) : (
            <ul className="px-4 space-y-2 pb-1">
              {sorted.slice(0, 5).map(t => {
                const due = t.ccTcd || t.dueDate;
                const dueIn = daysUntil(due);
                const overdue = due && new Date(due) < new Date();
                return (
                  <li key={t.id} className="text-[11px] bg-slate-50/60 rounded-lg p-2 border border-slate-100">
                    <Link href={`/tasks/${t.id}`}
                      className="font-semibold text-slate-700 hover:text-blue-700 line-clamp-1 block">
                      {t.title}
                    </Link>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold">{t.projectCode}</span>
                      <span>·</span>
                      <span className={`px-1 py-0 rounded ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'} text-[9px] font-bold`}>
                        {STATUS_LABEL[t.status] || t.status}
                      </span>
                      {t.subtaskCount > 0 && (
                        <>
                          <span>·</span>
                          <span>{t.subtasksDone}/{t.subtaskCount} subtasks</span>
                        </>
                      )}
                      {due && (
                        <>
                          <span>·</span>
                          <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                            {dueIn === null ? formatDate(due)
                              : dueIn < 0 ? `${Math.abs(dueIn)}d late`
                              : dueIn === 0 ? 'today'
                              : `${dueIn}d`}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
              {sorted.length > 5 && (
                <li className="text-[10px] text-slate-400 pt-1">+{sorted.length - 5} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

