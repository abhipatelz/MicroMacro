'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Avatar, formatDate, daysUntil, ProgressBar,
  LIFECYCLE_LABELS, STATUS_COLORS,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { useIsLead, useIsAdmin } from '@/components/CurrentUserContext';
import {
  AlertTriangle, FolderKanban, CheckCircle2, Users as UsersIcon,
  ChevronDown, TrendingUp, Clock, Sparkles, ArrowRight, UserPlus, Plus, Circle,
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

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do', in_progress: 'In progress', review: 'Review',
  blocked: 'Blocked', done: 'Done',
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

  const ongoingProjects = useMemo(() =>
    dash.projects.filter(p =>
      p.status === 'in_progress' || p.status === 'planning' || p.status === 'on_hold',
    ),
  [dash]);

  const tasksByProject = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of dash.teamTasks) {
      if (!m.has(t.projectId)) m.set(t.projectId, []);
      m.get(t.projectId)!.push(t);
    }
    return m;
  }, [dash]);

  const tasksByAssignee = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of dash.teamTasks) {
      if (t.status === 'done' || !t.assigneeId) continue;
      if (!m.has(t.assigneeId)) m.set(t.assigneeId, []);
      m.get(t.assigneeId)!.push(t);
    }
    return m;
  }, [dash]);

  const firstName  = (dash.user.name || '').split(' ')[0] || 'there';
  const today      = new Date();
  const totalOpen     = dash.teamTasks.filter(t => t.status !== 'done').length;
  const totalOverdue  = dash.teamTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < today).length;

  return (
    <div className="pb-12 max-w-[1440px]">

      {/* ── Greeting ────────────────────────────────────────────────────── */}
      <div className="mb-6 pt-1">
        <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">
          <span className="brand-shimmer-text" suppressHydrationWarning>{greeting()}, {firstName}.</span>
        </h1>
      </div>

      {isFirstRun ? (
        <FirstRunGuide hasTeam={dash.people.length > 0} />
      ) : (
        <>
          {/* ── Summary strip ──────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2.5 mb-6">
            <SummaryChip label="Ongoing projects" value={ongoingProjects.length} accent="blue"  href="/projects" />
            <SummaryChip label="Open tasks"       value={totalOpen}              accent="slate" href="/projects" />
            <SummaryChip label="Overdue"          value={totalOverdue}           accent={totalOverdue > 0 ? 'red' : 'slate'} href="/projects" />
            <SummaryChip label={dash.teamCount === 1 ? 'Team' : 'Teams'} value={dash.teamCount} accent="green" href="/teams" />
          </div>
        </>
      )}

      {/* ── Main layout: 2/3 projects · 1/3 actions+contributors ──────── */}
      {!isFirstRun && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-5 items-start">

          {/* Left column — Projects */}
          <ProjectsColumn
            projects={ongoingProjects}
            tasksByProject={tasksByProject}
          />

          {/* Right column — Actions + Contributors. The "Actions" header
              mirrors the Projects column header so both cards start on the
              same line. */}
          <div className="xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto pr-1">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={14} className="text-slate-400" />
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Actions</h2>
            </div>
            <ActionsPanel tasks={dash.teamTasks} />
            <div className="mt-4">
              <ContributorsPanel people={dash.people} tasksByAssignee={tasksByAssignee} />
            </div>
          </div>
        </div>
      )}

      {/* First-time tour for new leads */}
      <FirstTimeTour alreadySeen={hasSeenTour} />
    </div>
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
  const isAdmin = useIsAdmin();
  const isLead  = useIsLead();
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderKanban size={14} className="text-slate-400" />
          {/* Never "Projects you lead" — a lead's team can own projects
             created by someone else. "Your team's projects" is accurate;
             admin sees the whole workspace. */}
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
            {isAdmin ? 'All projects' : 'Your team’s projects'}
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

function ProjectRow({
  project, tasks, defaultOpen,
}: { project: DashProject; tasks: TeamTask[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-100">
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-4 py-2">Task</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2">Subtasks</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2">TCD</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2">Assigned</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2">Status</th>
                    <th className="text-left text-[9px] font-bold uppercase tracking-wider text-slate-400 px-2 py-2">Completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {sortedTasks.slice(0, 20).map(t => <TaskTableRow key={t.id} t={t} />)}
                </tbody>
              </table>
              {sortedTasks.length > 20 && (
                <div className="px-4 py-2 text-[10px] text-slate-400 border-t border-slate-50">
                  Showing 20 of {sortedTasks.length} tasks — <Link href={`/projects/${project.id}`} className="text-blue-600 font-semibold">view all in project →</Link>
                </div>
              )}
            </div>
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
/*  ACTIONS PANEL — right column top, due/overdue with filter chips           */
/* ────────────────────────────────────────────────────────────────────────── */
function ActionsPanel({ tasks }: { tasks: TeamTask[] }) {
  const [filter, setFilter] = useState<ActionFilter>('week');
  const [untilDate, setUntilDate] = useState<string | null>(null);

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

  // Open work that has no target date yet — surfaced so the panel is never
  // empty just because tasks haven't been scheduled. Prompts the manager to
  // set due dates (which then graduate into the Overdue / Due groups).
  const PRIORITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const STATUS_RANK: Record<string, number> = { in_progress: 0, blocked: 1, review: 2, todo: 3 };
  const noDue = tasks
    .filter(t => t.status !== 'done' && !(t.ccTcd || t.dueDate))
    .sort((a, b) => {
      const p = (PRIORITY_RANK[a.priority || 'medium'] ?? 2) - (PRIORITY_RANK[b.priority || 'medium'] ?? 2);
      if (p !== 0) return p;
      return (STATUS_RANK[a.status || 'todo'] ?? 3) - (STATUS_RANK[b.status || 'todo'] ?? 3);
    });

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

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
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

      <div className="max-h-[60vh] overflow-y-auto">
        {/* Overdue group */}
        {overdue.length > 0 && (
          <ActionGroup
            title="Overdue"
            count={overdue.length}
            icon={<AlertTriangle size={11} className="text-red-500" />}
            dotClass="bg-red-400"
            tasks={overdue}
            isOverdue
          />
        )}

        {/* Due group */}
        <ActionGroup
          title="Due"
          count={due.length}
          icon={<Clock size={11} className="text-blue-500" />}
          dotClass="bg-blue-400"
          tasks={due}
          emptyHint={filter === 'untilDate' && !untilDate ? 'Pick a date to see upcoming actions.' : 'Nothing scheduled in this window.'}
        />

        {/* No-due-date group — open work that still needs a target date */}
        {noDue.length > 0 && (
          <ActionGroup
            title="No due date"
            count={noDue.length}
            icon={<Circle size={10} className="text-slate-400" />}
            dotClass="bg-slate-300"
            tasks={noDue}
            showPriority
          />
        )}
      </div>
    </section>
  );
}

const PRIORITY_CHIP: Record<string, { label: string; cls: string }> = {
  critical: { label: 'Critical', cls: 'text-red-600 bg-red-50' },
  high:     { label: 'High',     cls: 'text-amber-600 bg-amber-50' },
  medium:   { label: 'Medium',   cls: 'text-slate-500 bg-slate-100' },
  low:      { label: 'Low',      cls: 'text-slate-400 bg-slate-50' },
};

function ActionGroup({
  title, count, icon, dotClass, tasks, isOverdue, emptyHint, showPriority,
}: {
  title: string; count: number; icon: React.ReactNode; dotClass: string;
  tasks: TeamTask[]; isOverdue?: boolean; emptyHint?: string; showPriority?: boolean;
}) {
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
          {tasks.slice(0, 12).map(t => {
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
                        {showPriority && t.priority && (
                          <>
                            <span>·</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded ${(PRIORITY_CHIP[t.priority] || PRIORITY_CHIP.medium).cls}`}>
                              {(PRIORITY_CHIP[t.priority] || PRIORITY_CHIP.medium).label}
                            </span>
                          </>
                        )}
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
          {tasks.length > 12 && (
            <li className="px-4 py-2 text-[10px] text-slate-400">+{tasks.length - 12} more</li>
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
  if (people.length === 0) {
    return (
      <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <UsersIcon size={13} className="text-slate-400" />
          <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Individual Contributors</h3>
        </div>
        <div className="py-8 text-center text-xs text-slate-400">No team members yet.</div>
      </section>
    );
  }

  // Sort: most loaded first
  const sorted = [...people].sort((a, b) => b.loadScore - a.loadScore);

  return (
    <section className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <UsersIcon size={13} className="text-slate-400" />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
          Individual Contributors
        </h3>
        <span className="ml-auto text-[10px] text-slate-300 font-semibold">{people.length}</span>
      </div>

      <ul className="divide-y divide-slate-50">
        {sorted.map(p => (
          <ContributorRow key={p.id} person={p} tasks={tasksByAssignee.get(p.id) || []} />
        ))}
      </ul>
    </section>
  );
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

