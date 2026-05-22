'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import {
  Avatar, LifecycleTag, formatDate, daysUntil, ProgressBar,
} from '@/components/ui';
import {
  AlertTriangle, Clock, Calendar, FolderKanban, ChevronRight,
  CheckCircle2, Users as UsersIcon,
} from 'lucide-react';

/* ── Types matching API responses ─────────────────────────────────────────── */
interface DashTask {
  id: string; projectId: string; projectCode?: string; projectName?: string;
  title: string; status: string; priority?: string;
  dueDate?: string | null; gxpCritical?: boolean;
}
interface DashResp {
  user: { id: string; name: string; email: string; role: string };
  summary: { totalAssigned: number; completed: number; overdue: number; dueThisWeek: number };
  tasks: DashTask[];
}

interface FullProject {
  id: string; code: string; name: string; lifecycle?: string;
  status: string; priority?: string;
  ownerId?: string; ownerName?: string;
  teamName?: string | null;
  dueDate?: string | null; startDate?: string | null;
  taskCount?: number; tasksDone?: number;
  gxpImpact?: string;
}

interface ProjectInsight {
  id: string; score: number; health: 'healthy' | 'at_risk' | 'critical';
  openTasks: number; overdueCount: number;
  completedThisWeek: number; daysUntilDue: number | null;
}
interface PersonInsight {
  id: string; name: string; title: string;
  openTasks: number; overdueCount: number; completedThisWeek: number;
  loadScore: number; loadLevel: 'healthy' | 'busy' | 'overloaded';
}
interface InsightsResp { projects: ProjectInsight[]; people: PersonInsight[] }

/* ── Helpers ──────────────────────────────────────────────────────────────── */
const HEALTH_COLOR: Record<string, string> = {
  healthy:  'bg-green-50 text-green-700 border-green-100',
  at_risk:  'bg-amber-50 text-amber-700 border-amber-100',
  critical: 'bg-red-50 text-red-700 border-red-100',
};
const HEALTH_LABEL: Record<string, string> = {
  healthy: 'On track', at_risk: 'At risk', critical: 'Critical',
};
const LOAD_COLOR: Record<string, string> = {
  healthy:    'bg-emerald-50 text-emerald-700',
  busy:       'bg-amber-50 text-amber-700',
  overloaded: 'bg-red-50 text-red-700',
};
const LOAD_LABEL: Record<string, string> = {
  healthy: 'Steady', busy: 'Busy', overloaded: 'Overloaded',
};

function bucketTasks(tasks: DashTask[]) {
  const now    = new Date();
  const endToday = new Date(now); endToday.setHours(23, 59, 59, 999);
  const in7    = new Date(endToday.getTime() + 7  * 86400000);
  const in14   = new Date(endToday.getTime() + 14 * 86400000);
  const overdue: DashTask[] = [];
  const thisWeek: DashTask[] = [];
  const nextWeek: DashTask[] = [];
  const later:    DashTask[] = [];
  for (const t of tasks) {
    if (t.status === 'done') continue;
    if (!t.dueDate) { later.push(t); continue; }
    const d = new Date(t.dueDate);
    if      (d < now)     overdue.push(t);
    else if (d <= in7)    thisWeek.push(t);
    else if (d <= in14)   nextWeek.push(t);
    else                  later.push(t);
  }
  return { overdue, thisWeek, nextWeek, later };
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function Dashboard() {
  const [dash,     setDash]     = useState<DashResp | null>(null);
  const [insights, setInsights] = useState<InsightsResp | null>(null);
  const [projects, setProjects] = useState<FullProject[] | null>(null);

  useEffect(() => {
    Promise.all([
      api('/dashboard').catch(() => null),
      api('/insights').catch(() => null),
      api('/projects').catch(() => []),
    ]).then(([d, i, p]: any) => {
      setDash(d);
      setInsights(i ?? { projects: [], people: [] });
      setProjects(Array.isArray(p) ? p : []);
    });
  }, []);

  const buckets = useMemo(() => bucketTasks(dash?.tasks ?? []), [dash?.tasks]);

  // Active projects come first, then planning, then everything else.
  const sortedProjects = useMemo(() => {
    if (!projects) return [];
    const order: Record<string, number> = { in_progress: 0, planning: 1, on_hold: 2, completed: 3, cancelled: 4 };
    return [...projects].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [projects]);

  const projectInsightMap = useMemo(() => {
    const m = new Map<string, ProjectInsight>();
    for (const p of insights?.projects ?? []) m.set(p.id, p);
    return m;
  }, [insights]);

  if (!dash || !insights || !projects) return <LoadingSkeleton />;

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="pb-12 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black tracking-tight text-slate-900">
          Hello, {dash.user.name.split(' ')[0]}
        </h1>
        <p className="text-xs text-slate-400 mt-1">{today}</p>
      </div>

      {/* Two-column layout: main content + sticky pending-tasks rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6 min-w-0">
          <ProjectsPanel projects={sortedProjects} insightMap={projectInsightMap} />
          <PeoplePanel people={insights.people} />
        </div>
        <PendingTasksRail buckets={buckets} />
      </div>
    </div>
  );
}

/* ── Projects panel ───────────────────────────────────────────────────────── */
function ProjectsPanel({
  projects, insightMap,
}: { projects: FullProject[]; insightMap: Map<string, ProjectInsight> }) {
  if (projects.length === 0) {
    return (
      <Section title="Projects" count={0} icon={FolderKanban}>
        <div className="text-center py-10 text-sm text-slate-400">
          No projects yet. <Link href="/projects" className="text-blue-600 font-semibold">Create one →</Link>
        </div>
      </Section>
    );
  }
  return (
    <Section
      title="Projects"
      count={projects.length}
      icon={FolderKanban}
      action={<Link href="/projects" className="text-xs font-semibold text-blue-600 hover:text-blue-700">All projects →</Link>}
    >
      <div className="divide-y divide-slate-100">
        {projects.map(p => <ProjectRow key={p.id} p={p} insight={insightMap.get(p.id)} />)}
      </div>
    </Section>
  );
}

function ProjectRow({ p, insight }: { p: FullProject; insight?: ProjectInsight }) {
  const total = p.taskCount ?? 0;
  const done  = p.tasksDone ?? 0;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;
  const open  = insight?.openTasks ?? Math.max(0, total - done);
  const overdue = insight?.overdueCount ?? 0;
  const dueIn = daysUntil(p.dueDate);
  const health = insight?.health ?? null;

  return (
    <Link
      href={`/projects/${p.id}`}
      className="grid grid-cols-12 gap-3 items-center px-4 py-3.5 hover:bg-slate-50 transition-colors"
    >
      {/* Name + code + lifecycle */}
      <div className="col-span-12 md:col-span-5 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-bold text-slate-400 tracking-wider">{p.code}</span>
          {p.lifecycle && <LifecycleTag lifecycle={p.lifecycle} />}
          {health && (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${HEALTH_COLOR[health]}`}>
              {HEALTH_LABEL[health]}
            </span>
          )}
        </div>
        <div className="text-sm font-semibold text-slate-800 truncate">{p.name}</div>
        {p.ownerName && (
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
            <Avatar name={p.ownerName} size={14} /> {p.ownerName}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="col-span-6 md:col-span-3">
        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
          <span>{done}/{total} done</span>
          <span className="font-semibold text-slate-700">{pct}%</span>
        </div>
        <ProgressBar value={pct} />
      </div>

      {/* Open / overdue counts */}
      <div className="col-span-3 md:col-span-2 text-xs">
        <div className="text-slate-500">{open} open</div>
        {overdue > 0 && <div className="text-red-600 font-semibold">{overdue} overdue</div>}
      </div>

      {/* Due date */}
      <div className="col-span-3 md:col-span-2 text-xs text-right">
        {p.dueDate ? (
          <>
            <div className={dueIn !== null && dueIn < 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
              {formatDate(p.dueDate)}
            </div>
            <div className="text-[10px] text-slate-400">
              {dueIn === null ? '' : dueIn < 0 ? `${Math.abs(dueIn)}d late` : dueIn === 0 ? 'Today' : `${dueIn}d left`}
            </div>
          </>
        ) : <span className="text-slate-300">—</span>}
      </div>
    </Link>
  );
}

/* ── People workload panel ────────────────────────────────────────────────── */
function PeoplePanel({ people }: { people: PersonInsight[] }) {
  if (people.length === 0) {
    return (
      <Section title="People" count={0} icon={UsersIcon}>
        <div className="text-center py-10 text-sm text-slate-400">No team members yet.</div>
      </Section>
    );
  }
  const maxLoad = Math.max(1, ...people.map(p => p.loadScore));
  return (
    <Section title="Team workload" count={people.length} icon={UsersIcon}>
      <div className="divide-y divide-slate-100">
        {people.map(p => (
          <div key={p.id} className="grid grid-cols-12 gap-3 items-center px-4 py-3">
            <div className="col-span-12 md:col-span-4 flex items-center gap-2 min-w-0">
              <Avatar name={p.name} size={26} />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800 truncate">{p.name}</div>
                {p.title && <div className="text-[11px] text-slate-400 truncate">{p.title}</div>}
              </div>
            </div>

            <div className="col-span-4 md:col-span-2 text-xs">
              <div className="text-slate-500">Open</div>
              <div className="text-sm font-bold text-slate-800">{p.openTasks}</div>
            </div>
            <div className="col-span-4 md:col-span-2 text-xs">
              <div className="text-slate-500">Overdue</div>
              <div className={`text-sm font-bold ${p.overdueCount > 0 ? 'text-red-600' : 'text-slate-300'}`}>
                {p.overdueCount}
              </div>
            </div>
            <div className="col-span-4 md:col-span-2 text-xs">
              <div className="text-slate-500">Done · 7d</div>
              <div className="text-sm font-bold text-emerald-600">{p.completedThisWeek}</div>
            </div>

            <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-2">
              <div className="hidden md:block w-16 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-1 rounded-full ${
                    p.loadLevel === 'overloaded' ? 'bg-red-500'
                    : p.loadLevel === 'busy'    ? 'bg-amber-500'
                                                : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.round((p.loadScore / maxLoad) * 100))}%` }}
                />
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${LOAD_COLOR[p.loadLevel]}`}>
                {LOAD_LABEL[p.loadLevel]}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ── Pending tasks rail (sticky on xl+) ───────────────────────────────────── */
function PendingTasksRail({ buckets }: {
  buckets: { overdue: DashTask[]; thisWeek: DashTask[]; nextWeek: DashTask[]; later: DashTask[] };
}) {
  const totalOpen = buckets.overdue.length + buckets.thisWeek.length + buckets.nextWeek.length + buckets.later.length;
  return (
    <aside className="xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
      <div className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-slate-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Pending tasks</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400">{totalOpen}</span>
        </div>

        {totalOpen === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 size={20} className="mx-auto text-emerald-400 mb-2" />
            <div className="text-sm font-semibold text-slate-600">All clear</div>
            <div className="text-xs text-slate-400 mt-1">No open tasks assigned to you.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <Bucket title="Overdue"     accent="red"    items={buckets.overdue} />
            <Bucket title="This week"   accent="amber"  items={buckets.thisWeek} />
            <Bucket title="Next week"   accent="blue"   items={buckets.nextWeek} />
            <Bucket title="Later"       accent="slate"  items={buckets.later} />
          </div>
        )}
      </div>
    </aside>
  );
}

function Bucket({
  title, accent, items,
}: { title: string; accent: 'red' | 'amber' | 'blue' | 'slate'; items: DashTask[] }) {
  if (items.length === 0) return null;
  const dotColor = { red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', slate: '#94a3b8' }[accent];
  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: dotColor }} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</span>
        </div>
        <span className="text-[11px] font-semibold text-slate-400">{items.length}</span>
      </div>
      <ul>
        {items.slice(0, 6).map(t => <TaskRow key={t.id} t={t} />)}
        {items.length > 6 && (
          <li className="px-4 py-2 text-[11px] text-slate-400">+{items.length - 6} more</li>
        )}
      </ul>
    </div>
  );
}

function TaskRow({ t }: { t: DashTask }) {
  const dueIn = daysUntil(t.dueDate);
  return (
    <li>
      <Link
        href={`/tasks/${t.id}`}
        className="block px-4 py-2.5 hover:bg-slate-50 transition-colors group"
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-slate-800 leading-snug group-hover:text-blue-700 line-clamp-2">{t.title}</div>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400">
              {t.projectCode && <span className="font-semibold">{t.projectCode}</span>}
              {t.dueDate && (
                <>
                  <span>·</span>
                  <span className={dueIn !== null && dueIn < 0 ? 'text-red-600 font-semibold' : ''}>
                    {dueIn === null ? formatDate(t.dueDate)
                      : dueIn < 0 ? `${Math.abs(dueIn)}d late`
                      : dueIn === 0 ? 'today'
                      : `${dueIn}d`}
                  </span>
                </>
              )}
              {t.gxpCritical && <span className="text-amber-600 font-bold">· GxP</span>}
            </div>
          </div>
          <ChevronRight size={14} className="text-slate-300 group-hover:text-blue-500 shrink-0 mt-0.5" />
        </div>
      </Link>
    </li>
  );
}

/* ── Reusable section card ────────────────────────────────────────────────── */
function Section({
  title, count, icon: Icon, action, children,
}: { title: string; count?: number; icon?: any; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200/80 overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.05)' }}>
      <header className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-slate-400" />}
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h2>
          {typeof count === 'number' && (
            <span className="text-[10px] font-bold text-slate-400">{count}</span>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

/* ── Loading state ────────────────────────────────────────────────────────── */
function LoadingSkeleton() {
  return (
    <div className="pb-12 max-w-[1400px]">
      <div className="mb-6">
        <div className="skeleton h-7 w-44 mb-2" />
        <div className="skeleton h-3 w-32" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        <div className="space-y-6">
          <div className="card p-6 space-y-3">
            <div className="skeleton h-4 w-24" />
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
          <div className="card p-6 space-y-3">
            <div className="skeleton h-4 w-24" />
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
          </div>
        </div>
        <div className="card p-6 space-y-3">
          <div className="skeleton h-4 w-32" />
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}
        </div>
      </div>
    </div>
  );
}
