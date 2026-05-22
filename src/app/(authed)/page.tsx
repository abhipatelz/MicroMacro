'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Avatar, LifecycleTag, formatDate, daysUntil, ProgressBar } from '@/components/ui';
import {
  AlertTriangle, Clock, FolderKanban, CheckCircle2, Users as UsersIcon,
  ChevronRight, TrendingUp,
} from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface DashTask {
  id: string; projectId: string; projectCode?: string; projectName?: string;
  title: string; status: string; priority?: string;
  dueDate?: string | null; gxpCritical?: boolean;
}

interface TeamTask {
  id: string; title: string; status: string; priority?: string;
  dueDate?: string | null; ccTcd?: string | null;
  projectId: string; projectCode: string; projectName: string;
  assigneeId?: string | null; assigneeName?: string | null;
  subtaskCount: number; subtasksDone: number; gxpCritical?: boolean;
}

interface DashProject {
  id: string; code: string; name: string; lifecycle?: string;
  status: string; priority?: string;
  ownerId?: string; ownerName?: string;
  teamName?: string | null;
  dueDate?: string | null; startDate?: string | null;
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
  tasks: DashTask[];
  teamTasks: TeamTask[];
  people: DashPerson[];
}

/* ── Constants ────────────────────────────────────────────────────────────── */
const HEALTH_COLOR: Record<string, string> = {
  healthy:  'bg-green-50 text-green-700',
  at_risk:  'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
};
const HEALTH_DOT: Record<string, string> = {
  healthy: 'bg-green-400', at_risk: 'bg-amber-400', critical: 'bg-red-500',
};
const HEALTH_LABEL: Record<string, string> = {
  healthy: 'On track', at_risk: 'At risk', critical: 'Critical',
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do', in_progress: 'In progress', review: 'Review',
  blocked: 'Blocked', done: 'Done',
};
const STATUS_COLOR: Record<string, string> = {
  todo:        'bg-slate-100 text-slate-500',
  in_progress: 'bg-blue-50 text-blue-700',
  review:      'bg-purple-50 text-purple-700',
  blocked:     'bg-red-50 text-red-600',
  done:        'bg-green-50 text-green-700',
};

type ActionFilter = 'overdue' | 'week' | 'month';

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [dash, setDash] = useState<DashResp | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>('week');

  useEffect(() => {
    api<DashResp>('/lead-dashboard').then(setDash).catch(() => setDash({
      user: { id: '', name: '', email: '', role: '' },
      projects: [], tasks: [], teamTasks: [], people: [],
    }));
  }, []);

  const sortedProjects = useMemo(() => {
    if (!dash) return [];
    const order: Record<string, number> = { in_progress: 0, planning: 1, on_hold: 2, completed: 3, cancelled: 4 };
    return [...dash.projects].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [dash]);

  const actionTasks = useMemo(() => {
    if (!dash) return [];
    const now = new Date();
    const end = new Date(now);
    if (actionFilter === 'overdue') {
      return dash.teamTasks.filter(t => t.dueDate && new Date(t.dueDate) < now);
    }
    if (actionFilter === 'week') {
      end.setDate(end.getDate() + 7);
      return dash.teamTasks.filter(t => {
        if (!t.dueDate) return false;
        const d = new Date(t.dueDate);
        return d >= now && d <= end;
      }).concat(dash.teamTasks.filter(t => t.dueDate && new Date(t.dueDate) < now));
    }
    // month
    end.setDate(end.getDate() + 30);
    return dash.teamTasks.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d <= end;
    });
  }, [dash, actionFilter]);

  if (!dash) return <LoadingSkeleton />;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const totalOverdue = dash.teamTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;

  return (
    <div className="pb-12 max-w-[1440px]">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Hello, {dash.user.name.split(' ')[0]}
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">{today}</p>
        </div>
        {totalOverdue > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
            <AlertTriangle size={13} />
            {totalOverdue} overdue {totalOverdue === 1 ? 'task' : 'tasks'}
          </div>
        )}
      </div>

      {/* Summary strip */}
      <div className="flex flex-wrap gap-3 mb-5">
        {[
          { label: 'Projects',    value: sortedProjects.length, color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Open tasks',  value: dash.teamTasks.length, color: 'text-slate-700', bg: 'bg-slate-100' },
          { label: 'Overdue',     value: totalOverdue,           color: totalOverdue > 0 ? 'text-red-600' : 'text-slate-400', bg: totalOverdue > 0 ? 'bg-red-50' : 'bg-slate-100' },
          { label: 'Team',        value: dash.people.length,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
        ].map(s => (
          <div key={s.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${s.bg}`}>
            <span className={`text-sm font-black ${s.color}`}>{s.value}</span>
            <span className="text-xs text-slate-500 font-medium">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Main layout: left content + right sidebar */}
      <div className="flex gap-6 items-start">

        {/* ── Left column ──────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Projects: horizontal scroll card rail */}
          <ProjectsRail projects={sortedProjects} />

          {/* Tasks table */}
          <TasksTable teamTasks={dash.teamTasks} />

        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <div className="w-[300px] shrink-0 space-y-4 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
          <ActionsPanel tasks={actionTasks} filter={actionFilter} onFilter={setActionFilter} />
          <PeoplePanel people={dash.people} />
        </div>

      </div>
    </div>
  );
}

/* ── Projects rail ────────────────────────────────────────────────────────── */
function ProjectsRail({ projects }: { projects: DashProject[] }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FolderKanban size={14} className="text-slate-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Projects <span className="text-slate-300 font-normal ml-1">{projects.length}</span>
          </h2>
        </div>
        <Link href="/projects" className="text-xs font-semibold text-blue-600 hover:text-blue-700">
          All projects →
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 text-center py-10 text-sm text-slate-400"
          style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          No projects yet.{' '}
          <Link href="/projects/new" className="text-blue-600 font-semibold">Create one →</Link>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-0.5 px-0.5 snap-x">
          {projects.map(p => <ProjectCard key={p.id} p={p} />)}
        </div>
      )}
    </section>
  );
}

function ProjectCard({ p }: { p: DashProject }) {
  const total = p.taskCount ?? 0;
  const done  = p.tasksDone ?? 0;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const dueIn = daysUntil(p.dueDate);

  return (
    <Link
      href={`/projects/${p.id}`}
      className="snap-start shrink-0 w-[220px] bg-white rounded-xl border border-slate-200/80 p-4 hover:border-blue-200 hover:shadow-sm transition-all group"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
    >
      {/* Code + health dot */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 tracking-wider">{p.code}</span>
        <span className={`w-2 h-2 rounded-full ${HEALTH_DOT[p.health]}`} title={HEALTH_LABEL[p.health]} />
      </div>

      {/* Name */}
      <div className="text-sm font-bold text-slate-800 leading-snug mb-1 line-clamp-2 group-hover:text-blue-700">
        {p.name}
      </div>

      {/* Lifecycle tag */}
      {p.lifecycle && <LifecycleTag lifecycle={p.lifecycle} />}

      {/* Progress */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
          <span>{done}/{total} tasks</span>
          <span className="font-semibold text-slate-600">{pct}%</span>
        </div>
        <ProgressBar value={pct} />
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between mt-3 text-[10px]">
        <span className={`px-1.5 py-0.5 rounded font-semibold ${HEALTH_COLOR[p.health]}`}>
          {HEALTH_LABEL[p.health]}
        </span>
        {p.dueDate ? (
          <span className={dueIn !== null && dueIn < 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}>
            {dueIn === null ? formatDate(p.dueDate)
              : dueIn < 0 ? `${Math.abs(dueIn)}d late`
              : dueIn === 0 ? 'Due today'
              : `${dueIn}d left`}
          </span>
        ) : <span className="text-slate-300">No due date</span>}
      </div>
    </Link>
  );
}

/* ── Tasks table ──────────────────────────────────────────────────────────── */
function TasksTable({ teamTasks }: { teamTasks: TeamTask[] }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return teamTasks;
    const q = search.toLowerCase();
    return teamTasks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.projectCode.toLowerCase().includes(q) ||
      t.projectName.toLowerCase().includes(q) ||
      (t.assigneeName || '').toLowerCase().includes(q)
    );
  }, [teamTasks, search]);

  return (
    <section className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-slate-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Tasks <span className="text-slate-300 font-normal ml-1">{teamTasks.length}</span>
          </h2>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 w-40 focus:outline-none focus:border-blue-300 focus:ring-1 focus:ring-blue-100"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 text-center">
          <CheckCircle2 size={20} className="mx-auto text-emerald-400 mb-2" />
          <div className="text-sm font-semibold text-slate-600">
            {teamTasks.length === 0 ? 'No open tasks' : 'No results'}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 px-4 py-2.5 w-[40%]">Task</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2.5">Due / TCD</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2.5">Assigned to</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2.5">Subtasks</th>
                <th className="text-left text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-2.5">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.slice(0, 40).map(t => <TaskTableRow key={t.id} t={t} />)}
            </tbody>
          </table>
          {filtered.length > 40 && (
            <div className="px-4 py-3 text-xs text-slate-400 border-t border-slate-100">
              Showing 40 of {filtered.length} tasks
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TaskTableRow({ t }: { t: TeamTask }) {
  const due   = t.ccTcd || t.dueDate;
  const dueIn = daysUntil(due);
  const overdue = due && new Date(due) < new Date();

  return (
    <tr className="group hover:bg-slate-50/80 transition-colors">
      {/* Task name + project code */}
      <td className="px-4 py-3">
        <div className="flex items-start gap-2 min-w-0">
          <div className="min-w-0">
            <Link href={`/tasks/${t.id}`}
              className="text-sm text-slate-800 font-medium hover:text-blue-700 line-clamp-1 group-hover:underline underline-offset-2">
              {t.title}
            </Link>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
              <Link href={`/projects/${t.projectId}`}
                className="font-semibold text-slate-500 hover:text-blue-600">{t.projectCode}</Link>
              {t.gxpCritical && <span className="text-amber-600 font-bold">· GxP</span>}
            </div>
          </div>
        </div>
      </td>

      {/* Due date */}
      <td className="px-3 py-3 whitespace-nowrap">
        {due ? (
          <span className={`text-xs font-medium ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
            {formatDate(due)}
            {dueIn !== null && (
              <span className="text-[10px] text-slate-400 ml-1">
                {dueIn < 0 ? `(${Math.abs(dueIn)}d late)` : dueIn === 0 ? '(today)' : ''}
              </span>
            )}
          </span>
        ) : <span className="text-slate-300 text-xs">—</span>}
      </td>

      {/* Assignee */}
      <td className="px-3 py-3">
        {t.assigneeName ? (
          <div className="flex items-center gap-1.5">
            <Avatar name={t.assigneeName} size={20} />
            <span className="text-xs text-slate-600 truncate max-w-[100px]">{t.assigneeName}</span>
          </div>
        ) : <span className="text-slate-300 text-xs">Unassigned</span>}
      </td>

      {/* Subtasks */}
      <td className="px-3 py-3 whitespace-nowrap">
        {t.subtaskCount > 0 ? (
          <span className="text-xs text-slate-500">
            {t.subtasksDone}/{t.subtaskCount}
          </span>
        ) : <span className="text-slate-300 text-xs">—</span>}
      </td>

      {/* Status badge */}
      <td className="px-3 py-3">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status] || 'bg-slate-100 text-slate-500'}`}>
          {STATUS_LABEL[t.status] || t.status}
        </span>
      </td>

      {/* Arrow */}
      <td className="pr-3">
        <Link href={`/tasks/${t.id}`}>
          <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-400" />
        </Link>
      </td>
    </tr>
  );
}

/* ── Actions panel (right sidebar) ───────────────────────────────────────── */
function ActionsPanel({
  tasks, filter, onFilter,
}: { tasks: TeamTask[]; filter: ActionFilter; onFilter: (f: ActionFilter) => void }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="px-4 pt-3 pb-2 border-b border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={13} className="text-slate-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Actions</h3>
        </div>
        <div className="flex gap-1">
          {(['overdue', 'week', 'month'] as ActionFilter[]).map(f => (
            <button key={f}
              onClick={() => onFilter(f)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}>
              {f === 'overdue' ? 'Overdue' : f === 'week' ? 'Next week' : 'This month'}
            </button>
          ))}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle2 size={18} className="mx-auto text-emerald-400 mb-2" />
          <div className="text-xs font-semibold text-slate-500">All clear</div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50 max-h-64 overflow-y-auto">
          {tasks.slice(0, 15).map(t => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            const overdue = due && new Date(due) < new Date();
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`}
                  className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50 transition-colors group">
                  <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${overdue ? 'bg-red-400' : 'bg-blue-400'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-700 line-clamp-1 group-hover:text-blue-700">
                      {t.title}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                      <span className="font-semibold">{t.projectCode}</span>
                      {due && (
                        <>
                          <span>·</span>
                          <span className={overdue ? 'text-red-500 font-semibold' : ''}>
                            {dueIn === null ? formatDate(due)
                              : dueIn < 0 ? `${Math.abs(dueIn)}d overdue`
                              : dueIn === 0 ? 'Today'
                              : `${dueIn}d`}
                          </span>
                        </>
                      )}
                    </div>
                    {t.assigneeName && (
                      <div className="text-[10px] text-slate-400 mt-0.5">{t.assigneeName}</div>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
          {tasks.length > 15 && (
            <li className="px-4 py-2 text-[10px] text-slate-400">+{tasks.length - 15} more</li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ── People panel ─────────────────────────────────────────────────────────── */
function PeoplePanel({ people }: { people: DashPerson[] }) {
  if (people.length === 0) {
    return (
      <section className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <UsersIcon size={13} className="text-slate-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">People</h3>
        </div>
        <div className="py-8 text-center text-xs text-slate-400">No team members yet.</div>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <UsersIcon size={13} className="text-slate-400" />
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          People <span className="text-slate-300 font-normal ml-1">{people.length}</span>
        </h3>
      </div>
      <ul className="divide-y divide-slate-50">
        {people.map(p => (
          <li key={p.id} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1.5">
              <Avatar name={p.name} size={22} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800 truncate">{p.name}</div>
                {p.title && <div className="text-[10px] text-slate-400 truncate">{p.title}</div>}
              </div>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${
                p.loadLevel === 'overloaded' ? 'bg-red-50 text-red-600'
                : p.loadLevel === 'busy'    ? 'bg-amber-50 text-amber-600'
                                            : 'bg-emerald-50 text-emerald-700'
              }`}>
                {p.loadLevel === 'overloaded' ? 'Overloaded' : p.loadLevel === 'busy' ? 'Busy' : 'Steady'}
              </span>
            </div>
            <div className="flex gap-3 text-[10px] text-slate-500 pl-7">
              <div>
                <span className="font-bold text-slate-700">{p.openTasks}</span> open
              </div>
              {p.overdueCount > 0 && (
                <div className="text-red-600 font-semibold">{p.overdueCount} overdue</div>
              )}
              <div>
                <span className="font-bold text-emerald-600">{p.completedThisWeek}</span> done·7d
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Loading skeleton ─────────────────────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="pb-12 max-w-[1440px]">
      <div className="mb-6">
        <div className="skeleton h-7 w-44 mb-2" />
        <div className="skeleton h-3 w-32" />
      </div>
      <div className="flex gap-6">
        <div className="flex-1 space-y-5">
          <div className="flex gap-3 overflow-hidden">
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-36 w-[220px] shrink-0 rounded-xl" />)}
          </div>
          <div className="card p-4 space-y-3">
            <div className="skeleton h-4 w-24" />
            {[1,2,3,4,5].map(i => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
        </div>
        <div className="w-[300px] shrink-0 space-y-4">
          <div className="card p-4 space-y-3">
            <div className="skeleton h-4 w-20" />
            {[1,2,3,4].map(i => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
          <div className="card p-4 space-y-3">
            <div className="skeleton h-4 w-16" />
            {[1,2,3].map(i => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        </div>
      </div>
    </div>
  );
}
