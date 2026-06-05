'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  formatDate, daysUntil, ProgressBar,
  LIFECYCLE_LABELS, STATUS_COLORS,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { UserAvatar } from '@/components/AvatarRegistry';
import { useIsLead } from '@/components/CurrentUserContext';
import dynamic from 'next/dynamic';
// Lazy — only the lead's contributor-activity modal needs it, so it stays out
// of the main dashboard bundle (helps FCP/LCP).
const ActivityGraph = dynamic(
  () => import('@/components/ActivityGraph').then(m => m.ActivityGraph),
  { ssr: false, loading: () => <div className="h-40 rounded-xl bg-slate-50 animate-pulse" /> },
);

function warmActivityGraph(userId?: string) {
  void import('@/components/ActivityGraph').then((m) => m.preloadActivityGraphData({ userId }));
}
import {
  AlertTriangle, FolderKanban, CheckCircle2, Users as UsersIcon,
  ChevronDown, TrendingUp, Clock, Sparkles, ArrowRight, UserPlus, Plus,
  Maximize2, X, BarChart3,
} from 'lucide-react';
// Lazy — the bird's-eye view is a heavy SVG layout component and most
// visits won't open it. Keep it out of the dashboard's first paint.
const BirdsEyeView = dynamic(
  () => import('@/components/BirdsEyeView').then((m) => m.BirdsEyeView),
  { ssr: false, loading: () => null },
);
import type { BirdsEyeData } from '@/components/BirdsEyeView';
import { BirdEyeButton } from '@/components/BirdEyeButton';
import { FlowSignalStrip, type FlowSignalPayload } from '@/components/FlowSignalStrip';

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
  healthReasons?: string[];
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
  flowSignal?: FlowSignalPayload | null;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
// Festivals worth a warm one-off greeting. Fixed-date national/global days are
// keyed by MM-DD; movable feasts (Diwali, Holi — lunar) are keyed by full
// YYYY-MM-DD for the years the app is in active use, since their Gregorian
// date shifts each year. Pragati is built for an Indian pharma context, so the
// list leans that way while still covering the universal New Year / Christmas.
type Festival = { title: string; emoji: string; note: string };
const FIXED_FESTIVALS: Record<string, Festival> = {
  '01-01': { title: 'Happy New Year',          emoji: '🎆', note: 'A fresh year, a clean slate — let’s make it count.' },
  '01-26': { title: 'Happy Republic Day',      emoji: '🇮🇳', note: 'Compliance and care — values worth celebrating today.' },
  '08-15': { title: 'Happy Independence Day',  emoji: '🇮🇳', note: 'Freedom and discipline, hand in hand. Have a proud day.' },
  '10-02': { title: 'Gandhi Jayanti',          emoji: '🕊️', note: 'Quality is doing it right when no one is watching.' },
  '12-25': { title: 'Merry Christmas',         emoji: '🎄', note: 'Wishing you a warm, restful holiday.' },
  '12-31': { title: 'Happy New Year’s Eve',    emoji: '🥂', note: 'One last push, then a well-earned celebration.' },
};
const MOVABLE_FESTIVALS: Record<string, Festival> = {
  // Diwali
  '2025-10-21': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  '2026-11-08': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  '2027-10-29': { title: 'Happy Diwali', emoji: '🪔', note: 'May your year ahead be bright and prosperous.' },
  // Holi
  '2025-03-14': { title: 'Happy Holi', emoji: '🎨', note: 'A splash of colour to your day!' },
  '2026-03-03': { title: 'Happy Holi', emoji: '🎨', note: 'A splash of colour to your day!' },
  '2027-03-22': { title: 'Happy Holi', emoji: '🎨', note: 'A splash of colour to your day!' },
};
function festivalFor(now = new Date()): Festival | null {
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const ymd = `${now.getFullYear()}-${mm}-${dd}`;
  return MOVABLE_FESTIVALS[ymd] || FIXED_FESTIVALS[`${mm}-${dd}`] || null;
}

// A warm, genuine salutation. Festivals take priority; otherwise it's a proper
// time-of-day greeting (clear and human — not the old "Keep it moving" filler),
// with light day-of-week flavour so Monday and Friday don't read the same.
function greeting(now = new Date()): string {
  const fest = festivalFor(now);
  if (fest) return `${fest.title}`;
  const h = now.getHours();
  if (h < 5)  return 'Still up';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good evening';
}
// A meaningful one-liner driven by the user's actual state — not filler. On a
// festival day we lead with the festive note before nudging toward the work.
function greetingSubline({ open, overdue, dueToday, now = new Date() }: { open: number; overdue: number; dueToday: number; now?: Date }) {
  const fest = festivalFor(now);
  if (fest && open === 0) return fest.note;
  if (overdue > 0) return `${overdue} task${overdue === 1 ? '' : 's'} past due — clear ${overdue === 1 ? 'it' : 'the backlog'} and move forward.`;
  if (dueToday > 0) return `${dueToday} landing today. Let's make it count.`;
  if (open === 0) return 'All clear — nothing open. Take a breath. ✦';
  const day = now.getDay();
  if (day === 1) return `${open} open. What matters most this week?`;
  if (day === 5) return `${open} open heading into the weekend. Finish strong.`;
  if (day === 0 || day === 6) return `${open} on the board. You've got this.`;
  return `${open} in flight.`;
}

const STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

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

/**
 * Project the lead-dashboard payload into the BirdsEyeView's shape. We pull
 * teams from the per-project `teamName` (the lead-dashboard endpoint already
 * resolved it), de-duplicate by name, and map projects + tasks 1:1.
 */
function buildBirdsEyeDataFromDash(dash: DashResp): BirdsEyeData {
  // Build a synthetic team id from name. Lead-dashboard doesn't return team
  // ids on projects, so we group by name — that's fine for visualisation.
  const teamIdByName = new Map<string, string>();
  const teams: { id: string; name: string; ownerName?: string | null }[] = [];
  for (const p of dash.projects) {
    const name = (p.teamName || '').trim();
    if (!name) continue;
    if (!teamIdByName.has(name)) {
      const id = `team:${name}`;
      teamIdByName.set(name, id);
      teams.push({ id, name });
    }
  }
  return {
    rootLabel: `${dash.user.name}'s workspace`,
    rootSubLabel: `${dash.teamCount} team${dash.teamCount === 1 ? '' : 's'} · ${dash.projects.length} project${dash.projects.length === 1 ? '' : 's'} · ${dash.teamTasks.length} task${dash.teamTasks.length === 1 ? '' : 's'}`,
    scope: 'workspace',
    teams,
    projects: dash.projects.map((p) => ({
      id: p.id, code: p.code, name: p.name,
      teamId: p.teamName ? (teamIdByName.get(p.teamName) ?? null) : null,
      health: p.health,
      taskCount: p.taskCount ?? 0,
      tasksDone: p.tasksDone ?? 0,
      dueDate: p.dueDate ?? null,
      ownerName: p.ownerName ?? null,
    })),
    tasks: dash.teamTasks.map((t) => ({
      id: t.id, title: t.title, projectId: t.projectId,
      status: t.status,
      assigneeName: t.assigneeName ?? null,
      dueDate: (t.ccTcd || t.dueDate) ?? null,
    })),
  };
}

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function DashboardClient({
  initialData,
}: { initialData: DashResp }) {
  const dash = initialData;
  const isLead = useIsLead();
  const [summaryModal, setSummaryModal] = useState<null | 'open' | 'overdue'>(null);
  // Bird's-eye view — the lead's whole workspace as a packed tree. Opened
  // from the small compass icon in the greeting row.
  const [birdsEyeOpen, setBirdsEyeOpen] = useState(false);

  // First-run: a lead/admin whose workspace has no projects yet. Show a
  // guided setup path instead of a wall of empty panels — this is the
  // first thing a brand-new admin sees, so it should point the way.
  const isFirstRun = isLead && dash.projects.length === 0;

  // ICs see their own task counts in side panels (My Tasks, Due Center) but the
  // expanded project view shows the *full* pipeline so they have the same
  // visibility their lead does into how their project is progressing. Leads
  // and admins always see everything.
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

  const openTasks = useMemo(() => visibleTasks.filter(t => t.status !== 'done'), [visibleTasks]);

  const overdueTasks = useMemo(() => openTasks.filter(t => {
    const due = t.ccTcd || t.dueDate;
    return due && new Date(due) < new Date();
  }), [openTasks]);

  // Expanded project view: everyone sees the whole project's tasks, so an IC
  // can see the path of work around their own assignments — not just their
  // own row in isolation.
  const tasksByProject = useMemo(() => {
    const m = new Map<string, TeamTask[]>();
    for (const t of dash.teamTasks) {
      if (!m.has(t.projectId)) m.set(t.projectId, []);
      m.get(t.projectId)!.push(t);
    }
    return m;
  }, [dash.teamTasks]);

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
      <div className="mb-4 sm:mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[1.75rem] sm:text-[1.9rem] font-black tracking-tight leading-tight text-slate-800 dark:text-white/90">
            <span suppressHydrationWarning>
              {greeting()},{' '}
              <span className="text-blue-700 dark:text-blue-400">{firstName}.</span>
            </span>
          </h1>
        </div>
        {/* Bird's-eye view trigger. */}
        {!isFirstRun && (
          <BirdEyeButton scopeKey="dashboard" onClick={() => setBirdsEyeOpen(true)} className="shrink-0" />
        )}
      </div>
      {/* Subline removed. The summary chips below (Ongoing / Open / Overdue
          / Teams) already convey workspace state at a glance; an extra
          sentence above them was repeating the same numbers in prose. */}
      {/* Bird's-eye view modal — mounted at the page level so the SVG
          tree gets its own scroll area regardless of where the trigger
          was clicked from. */}
      {birdsEyeOpen && (
        <BirdsEyeView
          onClose={() => setBirdsEyeOpen(false)}
          data={buildBirdsEyeDataFromDash(dash)}
        />
      )}

      {isFirstRun ? (
        <FirstRunGuide hasTeam={dash.people.length > 0} />
      ) : (
        <>
          {/* ── Quick check / Needs attention strip ────────────────────────
              Renders nothing when there's nothing to surface — silence is
              the correct product state. */}
          <FlowSignalStrip data={dash.flowSignal} />

          {/* ── Summary strip ──────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 mb-5">
            <SummaryChip label="Ongoing projects" value={ongoingProjects.length} accent="blue"  href="/projects" />
            <SummaryChip label="Open tasks"       value={openTasks.length}       accent="slate" onClick={() => setSummaryModal('open')} />
            <SummaryChip label="Overdue"          value={overdueTasks.length}    accent={overdueTasks.length > 0 ? 'red' : 'slate'} onClick={() => setSummaryModal('overdue')} />
            <SummaryChip label={dash.teamCount === 1 ? 'Team' : 'Teams'} value={dash.teamCount} accent="green" href="/teams" />
          </div>
          {summaryModal && (
            <SummaryTaskPopup
              title={summaryModal === 'open' ? 'Open tasks' : 'Overdue tasks'}
              subtitle={summaryModal === 'open' ? 'Everything still moving across your visible work.' : 'Work that has crossed its target/due date.'}
              tone={summaryModal === 'overdue' ? 'red' : 'blue'}
              tasks={summaryModal === 'open' ? openTasks : overdueTasks}
              onClose={() => setSummaryModal(null)}
            />
          )}
        </>
      )}

      {/* ── Main layout: Projects (left) · Due Center (right, same row) ───── */}
      {!isFirstRun && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">

          {/* Left column — Projects */}
          <ProjectsColumn
            projects={ongoingProjects}
            tasksByProject={tasksByProject}
          />

          {/* Right column — Due Center + "My tasks" (for leads: also Contributors).
             Headers in both columns share the same vertical baseline so the
             dashboard reads as a single inline strip rather than two stacked
             layouts. The Due Center header carries the same uppercase tracking
             treatment as "Your team's projects" on the left.
             Flows with the page (no sticky/own-scroll): the previous
             sticky+max-height+overflow combo clipped the Individual
             Contributors list and made it feel like it "broke" mid-scroll
             when the column was taller than the viewport. */}
          <div className="space-y-4 pr-1">
            <UpNextPanel tasks={visibleTasks} />
            <MyTasksPanel tasks={visibleTasks} myId={myId} />
            {/* Leads see workload across their ICs. Contributors don't need a
               per-project rollup of their own work here — "My tasks" above
               already covers that, and the expanded project rows on the left
               show the whole pipeline. */}
            {isLead && <ContributorsPanel people={dash.people} tasksByAssignee={tasksByAssignee} />}
          </div>
        </div>
      )}

      {/* Onboarding tour is mounted centrally in AppShell so every role
          sees it on whichever page they land on. */}
    </div>
  );
}

/* ── Full-screen overlay ──────────────────────────────────────────────────
   Lets the Due Center and Contributors panels expand to a distraction-free,
   full-page view (#12). Click the backdrop or the ✕ to close. */
function FullScreenOverlay({
  title, icon, onClose, children,
}: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center p-3 sm:p-8 overflow-auto"
      onClick={onClose}>
      <div className="bg-white dark:bg-[#262624] rounded-2xl w-full max-w-4xl my-2 shadow-2xl dark:border dark:border-white/[0.08]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.07] sticky top-0 bg-white dark:bg-[#262624] rounded-t-2xl z-10">
          {icon}
          <h3 className="text-sm font-bold text-slate-800 dark:text-white/85">{title}</h3>
          <button onClick={onClose} title="Close"
            className="ml-auto p-1.5 rounded-lg text-slate-400 dark:text-white/35 hover:text-slate-700 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
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

/* ── Shared right-column panel header ─────────────────────────────────────
   One header geometry for Up Next / My Tasks / Individual Contributors so the
   right rail reads as one aligned set rather than three slightly-different
   cards. A tinted icon tile + uppercase label + count, with an optional
   trailing slot (overdue badge, maximize, chevron). */
function PanelHeader({
  icon, tint, title, count, countSuffix, trailing, onClick,
}: {
  icon: React.ReactNode;
  tint: { bg: string; fg: string };
  title: string;
  count?: number | string;
  countSuffix?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`px-4 h-12 flex items-center gap-2.5 border-b border-slate-100 dark:border-white/[0.05] ${
        onClick ? 'cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] select-none transition-colors' : ''
      }`}
    >
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
        style={{ background: tint.bg, color: tint.fg }}>
        {icon}
      </span>
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-white/45">{title}</h3>
      {count != null && (
        <span className="text-[10px] font-bold text-slate-400 dark:text-white/25 tabular-nums">
          {count}{countSuffix}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1.5">{trailing}</div>
    </div>
  );
}

const PANEL_TINTS = {
  blue:    { bg: 'rgba(21,101,192,0.10)',  fg: '#1565C0' },
  emerald: { bg: 'rgba(16,185,129,0.12)',  fg: '#059669' },
  violet:  { bg: 'rgba(124,58,237,0.12)',  fg: '#7c3aed' },
} as const;

/* ── Summary chip ────────────────────────────────────────────────────────── */
function SummaryChip({
  label, value, accent, href, onClick,
}: { label: string; value: number; accent: 'blue' | 'red' | 'slate' | 'green'; href?: string; onClick?: () => void }) {
  const styles = {
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
    red:   'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    slate: 'bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/55',
    green: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  }[accent];
  const className = `inline-flex items-center gap-1.5 h-8 px-3 rounded-lg transition-all hover:brightness-95 hover:shadow-sm ${styles}`;
  const content = (
    <>
      <span className="text-[13px] font-black tabular-nums">{value}</span>
      <span className="text-[12px] font-medium opacity-80">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className} aria-label={`Show ${label.toLowerCase()}`}>
        {content}
      </button>
    );
  }

  return <Link href={href || '#'} className={className}>{content}</Link>;
}

/** Compress a verbose project code (CHANGE_CONTROL-2026-0011) into a
 *  badge-friendly short form (CC-26-0011). Keeps a stable mapping for the
 *  prefixes we actually use; anything else falls back to first letters. */
function shortProjectCode(code: string): string {
  if (!code) return '';
  const PREFIX: Record<string, string> = {
    CHANGE_CONTROL: 'CC', SOFTWARE_CHANGE: 'SC', DEVIATION: 'DEV',
    CAPA: 'CAPA', DEVIATION_CAPA: 'DEV/CAPA', SOP: 'SOP', AUDIT: 'AUD',
    VALIDATION: 'VAL', CSV: 'CSV', AGILE: 'AGI', SOFTWARE_RELEASE: 'REL',
    PRODUCT_LAUNCH: 'LAU', RESEARCH: 'RES', GENERIC: 'PRJ', PRSN: 'PRSN',
  };
  const m = code.match(/^([A-Z_]+)-?(\d{2,4})?-?(\d+)?$/);
  if (!m) return code.length > 14 ? code.slice(0, 13) + '…' : code;
  const prefix = PREFIX[m[1]] ?? m[1].split('_').map((w) => w[0]).join('');
  const year = m[2] ? m[2].slice(-2) : '';
  const num  = m[3] || '';
  return [prefix, year, num].filter(Boolean).join('-');
}

function SummaryTaskPopup({
  title, subtitle, tasks, tone, onClose,
}: { title: string; subtitle: string; tasks: TeamTask[]; tone: 'blue' | 'red'; onClose: () => void }) {
  const sorted = [...tasks].sort((a, b) => {
    const ad = a.ccTcd || a.dueDate;
    const bd = b.ccTcd || b.dueDate;
    return (ad ? new Date(ad).getTime() : Infinity) - (bd ? new Date(bd).getTime() : Infinity);
  });
  const icon = tone === 'red'
    ? <AlertTriangle size={14} className="text-red-500" />
    : <CheckCircle2 size={14} className="text-blue-500" />;

  return (
    <FullScreenOverlay title={title} icon={icon} onClose={onClose}>
      <div className="px-5 pb-5">
        <div className={`mb-3 rounded-xl border px-3 py-2.5 ${tone === 'red' ? 'border-red-100 bg-red-50 text-red-700' : 'border-blue-100 bg-blue-50 text-blue-700'}`}>
          <div className="text-xs font-bold">{sorted.length} task{sorted.length === 1 ? '' : 's'}</div>
          <div className="text-[11px] opacity-75 mt-0.5">{subtitle}</div>
        </div>
        {sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Nothing to list here.</div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-100 dark:border-white/[0.07] overflow-hidden">
            {sorted.map((t) => {
              const due = t.ccTcd || t.dueDate;
              const dueIn = daysUntil(due);
              const overdue = due && new Date(due) < new Date();
              return (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} onClick={onClose}
                    className={`block px-4 py-3 transition-colors ${overdue ? 'hover:bg-red-50/60' : 'hover:bg-slate-50/60'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold text-slate-800 dark:text-white/80 line-clamp-1">{t.title}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-white/35 flex-wrap">
                          <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-white/55"
                                title={t.projectCode}>
                            {shortProjectCode(t.projectCode)}
                          </span>
                          {t.assigneeName && <><span>·</span><span>{t.assigneeName}</span></>}
                          {due && (
                            <>
                              <span>·</span>
                              <span className={overdue ? 'text-red-600 font-semibold' : ''}>
                                {dueIn === null ? formatDate(due) : dueIn < 0 ? `${Math.abs(dueIn)}d overdue` : dueIn === 0 ? 'today' : `in ${dueIn}d`}
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
          </ul>
        )}
      </div>
    </FullScreenOverlay>
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
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400',
    teal:  'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400',
    green: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-blue-500" />
        <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-white/35">
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
              className="fluid-card group bg-white dark:bg-[#2a2a28] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] p-5 flex flex-col"
              style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${tints[s.tint]}`}>
                  <Icon size={17} />
                </div>
                {s.done ? (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                ) : (
                  <span className="text-[11px] font-bold text-slate-300 dark:text-white/20">STEP {i + 1}</span>
                )}
              </div>
              <div className="font-bold text-slate-800 dark:text-white/80 text-sm mb-1 flex items-center gap-1">
                {s.title}
              </div>
              <p className="text-xs text-slate-500 dark:text-white/40 leading-relaxed flex-1">{s.body}</p>
              <div className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1 group-hover:gap-1.5 transition-all">
                {s.done ? 'Review' : 'Start'} <ArrowRight size={13} />
              </div>
            </Link>
          );
        })}
      </div>
      <p className="text-xs text-slate-400 dark:text-white/25 mt-3 text-center">
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
  const [showExpandNudge, setShowExpandNudge] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setShowExpandNudge(false), 2800);
    return () => window.clearTimeout(t);
  }, []);
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <FolderKanban size={14} className="text-slate-400 shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wider sm:tracking-[0.14em] text-slate-500 truncate">
            Your team’s projects
          </h2>
          <span className="text-[10px] text-slate-300 font-semibold shrink-0">{projects.length}</span>
        </div>
        <Link href="/projects" className="text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0 whitespace-nowrap">
          All projects →
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] text-center py-12 px-6"
          style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
          <FolderKanban size={26} className="mx-auto text-slate-300 dark:text-white/20 mb-3" />
          <div className="text-sm font-semibold text-slate-600 dark:text-white/55 mb-1">No ongoing projects</div>
          <div className="text-xs text-slate-400 dark:text-white/30 max-w-xs mx-auto leading-relaxed">
            {isLead
              ? 'Spin up a project to start tracking work — it will show up here with all its tasks.'
              : "Once a lead assigns you to a team and a project, it will show up here with the tasks you're on."}
          </div>
          <Link
            href={isLead ? '/projects/new' : '/my-day'}
            className="btn-primary text-xs mt-4 inline-flex"
          >
            {isLead ? '+ New project' : 'Open My Day'}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p, index) => (
            <ProjectRow
              key={p.id}
              project={p}
              tasks={tasksByProject.get(p.id) || []}
              nudgeExpand={showExpandNudge && index === 0}
            />
          ))}
        </div>
      )}
    </section>
  );
}


/* Inline vertical task list inside an expanded project row. Tasks are shown in
   a single, deterministic order: by CC Target Completion Date (TCD), then due
   date, soonest first — so the most time-critical work is always at the top
   and the view is identical for every viewer on every reload. (We deliberately
   removed dashboard drag-reordering: a quick bird's-eye list shouldn't carry
   hidden per-user state, and TCD order is the one an auditor expects.) */
function DashboardTaskFlow({ tasks, projectId }: { tasks: TeamTask[]; projectId: string }) {
  const sorted = useMemo(() => {
    const keyOf = (t: TeamTask) => {
      const d = t.ccTcd || t.dueDate;
      return d ? new Date(d).getTime() : Number.POSITIVE_INFINITY;
    };
    return [...tasks].sort((a, b) => keyOf(a) - keyOf(b));
  }, [tasks]);

  const visible   = sorted.slice(0, 20);
  const doneCount = sorted.filter((t) => t.status === 'done').length;

  return (
    <ul>
      {/* ── Section divider ─────────────────────────────────────────── */}
      <li aria-hidden className="px-4 pt-3 pb-2 bg-slate-50/50 dark:bg-white/[0.02]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-white/40">
            Tasks by target date
          </span>
          <div className="flex items-center gap-2 min-w-[120px]">
            <div className="flex-1 h-1 rounded-full bg-slate-200/70 dark:bg-white/[0.08] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: sorted.length ? `${Math.round((doneCount / sorted.length) * 100)}%` : '0%',
                  background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                }}
              />
            </div>
            <span className="text-[9.5px] font-bold text-slate-500 dark:text-white/40 tabular-nums shrink-0">
              {doneCount} / {sorted.length}
            </span>
          </div>
        </div>
      </li>

      {visible.map((t) => {
        const isDone    = t.status === 'done';
        const due       = t.ccTcd || t.dueDate;
        const dueIn     = daysUntil(due);
        const isOverdue = !isDone && !!due && dueIn !== null && dueIn < 0;
        const isBlocked = t.status === 'blocked';

        /* Dot colour — five-value system:
           green=done (check icon), red=overdue|blocked, amber=due≤3d,
           blue=active, grey=todo/future/undated */
        const [dotColor, dotTitle] = ((): [string, string] => {
          if (isBlocked) return ['#ef4444', 'Blocked'];
          if (isOverdue) return ['#ef4444', 'Overdue'];
          if (dueIn !== null && dueIn <= 3) return ['#d97706', 'Due soon'];
          if (t.status === 'in_progress') return ['#1565C0', 'In progress'];
          if (t.status === 'review')      return ['#1565C0', 'In review'];
          return ['#94a3b8', 'To do'];
        })();

        // Human-friendly date copy: stays as a short month/day for far-out
        // dates, switches to "in Nd" within a week, "today", or "Nd over" so
        // urgency reads at a glance without a separate badge.
        const dateLabel = !due ? null
          : isDone ? formatDate(due)
          : dueIn === null ? formatDate(due)
          : dueIn < 0 ? `${Math.abs(dueIn)}d over`
          : dueIn === 0 ? 'Today'
          : dueIn <= 7 ? `in ${dueIn}d`
          : formatDate(due);
        const dateTone = isDone
          ? 'text-slate-300 dark:text-white/20'
          : isOverdue
            ? 'text-red-600 dark:text-red-400 font-bold'
            : dueIn !== null && dueIn <= 3
              ? 'text-amber-700 dark:text-amber-400 font-bold'
              : 'text-slate-400 dark:text-white/28';

        return (
          <li key={t.id} className="border-t border-slate-50 dark:border-white/[0.03]">
            {/* Whole row is the link — no redundant "Open" affordance. Larger
                tap target, less visual noise, and a clear hover affordance
                via background + title colour change. */}
            <Link
              href={`/tasks/${t.id}`}
              className="group flex items-start gap-2.5 px-4 py-2.5 hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors"
            >
              {/* Status indicator */}
              <div className="shrink-0 mt-[3px]">
                {isDone ? (
                  <CheckCircle2 size={14} className="text-emerald-500" />
                ) : (
                  <span
                    title={dotTitle}
                    aria-label={dotTitle}
                    className="block w-2 h-2 rounded-full"
                    style={{ background: dotColor, boxShadow: `0 0 0 2px ${dotColor}1f` }}
                  />
                )}
              </div>

              {/* Row content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex-1 min-w-0 text-[13px] font-semibold line-clamp-1 leading-snug ${
                      isDone
                        ? 'line-through decoration-slate-300 dark:decoration-white/20 text-slate-500 dark:text-white/40'
                        : 'text-slate-800 dark:text-white/82 group-hover:text-blue-700 dark:group-hover:text-blue-400'
                    }`}
                  >
                    {t.title}
                  </span>

                  {/* Exception badges — only when action is needed */}
                  {isOverdue && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded">
                      Overdue
                    </span>
                  )}
                  {isBlocked && !isOverdue && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded">
                      Blocked
                    </span>
                  )}
                  {!t.assigneeName && !isDone && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 px-1.5 py-0.5 rounded">
                      Unassigned
                    </span>
                  )}

                  {/* Due date */}
                  {dateLabel && (
                    <span className={`shrink-0 text-[10.5px] tabular-nums ${dateTone}`}>
                      {dateLabel}
                    </span>
                  )}
                </div>

                {/* Assignee — small avatar + name. Skipped when the row is
                    flagged "Unassigned" above, and kept compact so the
                    metadata line doesn't compete with the title. */}
                {t.assigneeName && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-white/35">
                    <UserAvatar userId={t.assigneeId} name={t.assigneeName} size={16} />
                    <span className="truncate">{t.assigneeName}</span>
                  </div>
                )}
              </div>
            </Link>
          </li>
        );
      })}

      {sorted.length > 20 && (
        <li className="border-t border-slate-50 dark:border-white/[0.03]">
          <Link
            href={`/projects/${projectId}`}
            className="group flex items-center justify-between gap-3 px-4 py-2.5 text-[10.5px] hover:bg-slate-50/70 dark:hover:bg-white/[0.03] transition-colors"
          >
            <span className="text-slate-400 dark:text-white/28">
              Showing 20 of {sorted.length} tasks
            </span>
            <span className="text-blue-600 dark:text-blue-400 font-semibold group-hover:translate-x-0.5 transition-transform">
              Open project board →
            </span>
          </Link>
        </li>
      )}
    </ul>
  );
}

function ProjectRow({
  project, tasks, nudgeExpand = false,
}: { project: DashProject; tasks: TeamTask[]; nudgeExpand?: boolean }) {
  // Collapsed by default — the dashboard should land quiet. The user expands
  // only what they want to inspect.
  const [open, setOpen] = useState(false);
  const health = HEALTH_META[project.health];
  const total  = project.taskCount ?? 0;
  const done   = project.tasksDone ?? 0;
  const pct    = total > 0 ? Math.round(done / total * 100) : 0;
  const dueIn  = daysUntil(project.dueDate);
  const cat    = project.lifecycle && project.lifecycle !== 'generic' ? (LIFECYCLE_LABELS[project.lifecycle] || project.lifecycle) : null;

  // Human-readable due summary. Renders as one short phrase that conveys
  // "when is this expected to land" without a verbose "Due Jul 3 · 30d left"
  // strip running across the row.
  const dueLabel = !project.dueDate ? null
    : dueIn === null ? formatDate(project.dueDate)
    : dueIn < 0  ? `${Math.abs(dueIn)}d overdue`
    : dueIn === 0 ? 'Due today'
    : dueIn <= 7  ? `${dueIn}d left`
    : `Due ${formatDate(project.dueDate)}`;
  const dueUrgent = dueIn !== null && (dueIn < 0 || dueIn === 0);

  return (
    <article className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden transition-all"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      {/* Collapsed-state header — two readable rows, never a 5-piece chip strip.
          Row 1: title + identity badges (code, lifecycle, health). Row 2: the
          essential metrics — progress, tasks-done, due, owner. */}
      <header
        onClick={() => setOpen(o => !o)}
        className="px-4 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors select-none"
      >
        <button
          className={`p-0.5 text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 transition-transform rounded-full shrink-0 ${nudgeExpand && !open ? 'pragati-row-expand-blink' : ''}`}
          aria-label={open ? 'Collapse project tasks' : 'Expand project tasks'}
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          <ChevronDown size={14} />
        </button>

        {/* Three-level hierarchy:
             1. Title (largest, dark)
             2. Reference code (small, muted — its own line)
             3. Tags + single muted metadata strip */}
        <div className="flex-1 min-w-0">
          <Link href={`/projects/${project.id}`} onClick={e => e.stopPropagation()}
            className="block text-[15px] font-bold text-slate-800 dark:text-white/85 hover:text-blue-700 dark:hover:text-blue-400 line-clamp-2 sm:truncate leading-snug">
            {project.name}
          </Link>
          <div className="text-[10px] font-bold text-slate-400/80 dark:text-white/25 tracking-wider mt-0.5">
            {project.code}
          </div>
          {/* Identity + metadata pills — replaces the dot-separated strip so
              each fact reads as its own chip and the row scans cleanly. */}
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            {cat && (
              <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 rounded">
                {cat}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${health.bg} ${health.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} aria-hidden />
              {health.label}
            </span>
            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 dark:text-white/50 bg-slate-50 dark:bg-white/[0.04] px-1.5 py-0.5 rounded">
              <span className="text-slate-800 dark:text-white/80 tabular-nums">{done}/{total}</span>
              <span className="text-slate-400 dark:text-white/30">tasks</span>
            </span>
            {dueLabel && (
              <span className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-1.5 py-0.5 rounded ${
                dueUrgent
                  ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10'
                  : 'text-slate-600 dark:text-white/50 bg-slate-50 dark:bg-white/[0.04]'
              }`}>
                {dueLabel}
              </span>
            )}
            {project.overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded">
                {project.overdueCount} overdue
              </span>
            )}
            {project.ownerName && (
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-slate-600 dark:text-white/50 bg-slate-50 dark:bg-white/[0.04] pl-0.5 pr-1.5 py-0.5 rounded">
                <UserAvatar userId={project.ownerId} name={project.ownerName} size={14} />
                <span className="truncate max-w-[140px]">{project.ownerName}</span>
              </span>
            )}
          </div>
        </div>

        {/* Progress + percentage — vertically centred next to the row */}
        <div className="w-14 sm:w-28 shrink-0 flex flex-col items-end justify-center gap-1">
          <ProgressBar value={pct} />
          <div className="text-[10px] text-slate-400 dark:text-white/30 font-semibold tabular-nums">{pct}%</div>
        </div>
      </header>

      {/* Tasks table */}
      {open && (
        <div className="border-t border-slate-100 dark:border-white/[0.05] fade-in-soft">
          {tasks.length === 0 ? (
            <div className="py-10 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-50 dark:bg-white/[0.04] mb-2">
                <CheckCircle2 size={18} className="text-slate-300 dark:text-white/25" />
              </div>
              <div className="text-[12px] font-semibold text-slate-500 dark:text-white/45">No tasks yet for this project.</div>
              <Link
                href={`/projects/${project.id}`}
                className="inline-flex items-center gap-1 mt-2 text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700"
              >
                Open the project board →
              </Link>
            </div>
          ) : (
            <DashboardTaskFlow tasks={tasks} projectId={project.id} />
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
            <UserAvatar userId={t.assigneeId} name={t.assigneeName} size={18} />
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
    <section className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <PanelHeader
        icon={<CheckCircle2 size={13} />}
        tint={PANEL_TINTS.emerald}
        title="My tasks"
        count={myTasks.length}
        countSuffix=" open"
        trailing={myOverdue > 0
          ? <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full">{myOverdue} overdue</span>
          : null}
      />
      {myTasks.length === 0 ? (
        <div className="py-7 text-center">
          <CheckCircle2 size={18} className="mx-auto text-emerald-300 mb-1.5" />
          <div className="text-[11px] text-slate-400 dark:text-white/25">All caught up — {myDone} done.</div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.04] max-h-72 overflow-y-auto">
          {myTasks.slice(0, 15).map(t => {
            const due = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            const overdue = due && new Date(due) < new Date() && t.status !== 'done';
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`}
                  className={`block px-4 py-2.5 transition-colors group ${overdue ? 'hover:bg-red-50/45 dark:hover:bg-red-500/[0.05]' : 'hover:bg-slate-50/60 dark:hover:bg-white/[0.025]'}`}>
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLORS[t.status] ? '' : 'bg-slate-300'}`}
                      style={{ background: t.status === 'in_progress' ? '#3B82F6' : t.status === 'review' ? '#8B5CF6' : t.status === 'blocked' ? '#EF4444' : '#94A3B8' }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-slate-700 dark:text-white/70 line-clamp-1 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                        {t.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-400 dark:text-white/30 flex-wrap">
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
                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 opacity-80 ${STATUS_COLORS[t.status] || 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABEL[t.status] || t.status}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
          {myTasks.length > 15 && (
            <li className="px-4 py-2 text-[10px] text-slate-400 dark:text-white/30 border-t border-slate-50 dark:border-white/[0.04]">
              +{myTasks.length - 15} more — <Link href="/my-day" className="text-blue-600 font-semibold">view in My Day →</Link>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/*  UP NEXT PANEL — right column top, due/overdue with filter chips             */
/*  Named for what it answers: "what's coming up?" It surfaces overdue work     */
/*  first (red), then upcoming due tasks in the chosen window. The name beats   */
/*  the previous "Actions" / "Work Hub" / "Due Center" iterations because it    */
/*  reads as immediately purposeful — a lead glancing at the dashboard knows    */
/*  what they're being asked to look at.                                        */
/* ────────────────────────────────────────────────────────────────────────── */
function UpNextPanel({ tasks }: { tasks: TeamTask[] }) {
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
    // End of the current calendar month, not a rolling 30-day window
    windowEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
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

  const totalCount = overdue.length + due.length;
  const inner = (
    <section className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      {/* Header — shared geometry with My Tasks / Contributors. Hidden when
          shown inside the full-screen overlay (which supplies its own title),
          so "Up Next" isn't printed twice. */}
      {!expanded && (
        <PanelHeader
          icon={<TrendingUp size={13} />}
          tint={PANEL_TINTS.blue}
          title="Up Next"
          count={totalCount}
          trailing={
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label="Expand Up Next"
              className="p-1 -mr-1 rounded text-slate-400 hover:text-slate-700 dark:text-white/30 dark:hover:text-white/70 hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
            >
              <Maximize2 size={12} />
            </button>
          }
        />
      )}
      <div className="overflow-y-auto" style={{ maxHeight: expanded ? 'calc(100vh - 220px)' : '60vh' }}>
        {/* Overdue group — sits at the top: nothing to filter, just the
            tasks that have slipped past their date. */}
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

        {/* Due group — header first, then the window filters (they control
            this group), then the list. Reading order matches the question:
            "what's due, and over what window?". */}
        <div>
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50/40 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.05]">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-blue-500" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/35">Due</span>
              {due.length > 0 && <span className="text-[9px] font-bold text-slate-300 dark:text-white/20">nearest first</span>}
            </div>
            <span className="text-[10px] font-bold text-slate-400 dark:text-white/25">{due.length}</span>
          </div>
          <div className="px-4 pt-2 pb-2 border-b border-slate-100 dark:border-white/[0.05]">
            <div className="flex gap-1 flex-wrap">
              {FILTERS.map(f => (
                <button key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                    filter === f.key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-50 dark:bg-white/[0.04] text-slate-500 dark:text-white/35 hover:bg-slate-100 dark:hover:bg-white/[0.08]'
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
          <ActionGroup
            title=""
            count={due.length}
            icon={null}
            dotClass="bg-blue-400"
            tasks={due}
            showAll={expanded}
            emptyHint={filter === 'untilDate' && !untilDate ? 'Pick a date to see upcoming work.' : 'Nothing due — all clear.'}
            hideHeader
          />
        </div>
      </div>
    </section>
  );

  return expanded
    ? <FullScreenOverlay title="Up Next" icon={<TrendingUp size={14} className="text-blue-500" />}
        onClose={() => setExpanded(false)}>{inner}</FullScreenOverlay>
    : inner;
}

function ActionGroup({
  title, count, icon, tasks, isOverdue, emptyHint, showAll, hideHeader,
}: {
  title: string; count: number; icon: React.ReactNode; dotClass?: string;
  tasks: TeamTask[]; isOverdue?: boolean; emptyHint?: string; showAll?: boolean;
  /** When true, the small group header is suppressed — the parent has
   *  already rendered its own (e.g. the Up Next panel pulls the Due header
   *  out so the filter chips can sit between it and the list). */
  hideHeader?: boolean;
}) {
  const limit = showAll ? tasks.length : 12;
  return (
    <div>
      {!hideHeader && (
        <div className="flex items-center justify-between px-4 py-2 bg-slate-50/40 dark:bg-white/[0.03] border-b border-slate-100 dark:border-white/[0.05]">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-white/35">{title}</span>
            {count > 0 && <span className="text-[9px] font-bold text-slate-300 dark:text-white/20">nearest first</span>}
          </div>
          <span className="text-[10px] font-bold text-slate-400 dark:text-white/25">{count}</span>
        </div>
      )}
      {tasks.length === 0 ? (
        <div className="px-4 py-6 text-center">
          <CheckCircle2 size={18} className="mx-auto text-emerald-300 mb-1.5" />
          <div className="text-[11px] text-slate-400 dark:text-white/25">{emptyHint || 'All clear'}</div>
        </div>
      ) : (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.04]">
          {tasks.slice(0, limit).map(t => {
            const due   = t.ccTcd || t.dueDate;
            const dueIn = daysUntil(due);
            // Pill summarising urgency. Overdue is red; today is amber;
            // anything else is the neutral grey of "in the future".
            const pill = (() => {
              if (dueIn === null) return { label: due ? formatDate(due) : '—', cls: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/45' };
              if (dueIn < 0)  return { label: `${Math.abs(dueIn)}d late`, cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' };
              if (dueIn === 0) return { label: 'Today',                    cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' };
              if (dueIn <= 2) return { label: `${dueIn}d`,                 cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' };
              return                  { label: `${dueIn}d`,                 cls: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/45' };
            })();
            return (
              <li key={t.id}>
                <Link href={`/tasks/${t.id}`}
                  className={`block px-4 py-2.5 transition-colors group ${
                    isOverdue
                      ? 'hover:bg-red-50/45 dark:hover:bg-red-500/[0.05]'
                      : 'hover:bg-slate-50/60 dark:hover:bg-white/[0.025]'
                  }`}>
                  <div className="flex items-center gap-2">
                    {/* Title + project code on row 1 — code is a chip, not a
                        trailing word, so it reads as identity, not metadata. */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="text-[12.5px] font-semibold text-slate-700 dark:text-white/85 line-clamp-1 group-hover:text-blue-700 dark:group-hover:text-blue-300">
                          {t.title}
                        </div>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400 dark:text-white/30 flex-wrap">
                        {t.projectCode && (
                          <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-white/40">
                            {t.projectCode}
                          </span>
                        )}
                        {t.assigneeName && (
                          <>
                            <span className="text-slate-300 dark:text-white/15">·</span>
                            <span className="truncate max-w-[120px]">{t.assigneeName}</span>
                          </>
                        )}
                        {due && (
                          <>
                            <span className="text-slate-300 dark:text-white/15">·</span>
                            <span>{formatDate(due)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Urgency pill — colour-coded so a scan picks out the
                        red and amber rows first. */}
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${pill.cls}`}>
                      {pill.label}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
          {tasks.length > limit && (
            <li className="px-4 py-2 text-[10px] text-slate-400 dark:text-white/30">+{tasks.length - limit} more</li>
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
  // Collapsed by default — keeps the dashboard quiet on landing; the lead
  // expands when they want a contributor-by-contributor breakdown.
  const [panelOpen, setPanelOpen] = useState(false);
  const [showExpandNudge, setShowExpandNudge] = useState(true);
  // The contributor whose activity graph is being viewed (lead-only deep-dive,
  // same gesture as the team & people pages).
  const [activityPerson, setActivityPerson] = useState<DashPerson | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setShowExpandNudge(false), 2800);
    return () => window.clearTimeout(t);
  }, []);

  if (people.length === 0) {
    return (
      <section className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
        style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
        <PanelHeader icon={<UsersIcon size={13} />} tint={PANEL_TINTS.violet} title="Individual Contributors" />
      </section>
    );
  }

  // Sort: most loaded first
  const sorted = [...people].sort((a, b) => b.loadScore - a.loadScore);

  return (
    <section className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <PanelHeader
        icon={<UsersIcon size={13} />}
        tint={PANEL_TINTS.violet}
        title="Individual Contributors"
        count={people.length}
        onClick={() => setPanelOpen(o => !o)}
        trailing={
          <ChevronDown
            size={14}
            className={`text-violet-500 dark:text-violet-400 transition-transform duration-200 ${showExpandNudge && !panelOpen ? 'pragati-row-expand-blink' : ''}`}
            style={{ transform: panelOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        }
      />

      {panelOpen && (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.04] border-t border-slate-100 dark:border-white/[0.05]">
          {sorted.map(p => (
            <ContributorRow key={p.id} person={p} tasks={tasksByAssignee.get(p.id) || []}
              onViewActivity={() => setActivityPerson(p)} />
          ))}
        </ul>
      )}

      {activityPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 overlay-in"
          onClick={() => setActivityPerson(null)}>
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-[820px] max-h-[calc(100vh-2rem)] overflow-y-auto modal-in"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-5">
              <UserAvatar userId={activityPerson.id} name={activityPerson.name} size={44} />
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-black text-slate-900 truncate">{activityPerson.name}</h3>
                <div className="text-xs text-slate-400 mt-0.5">Performance overview</div>
              </div>
              <button onClick={() => setActivityPerson(null)} className="text-slate-300 hover:text-slate-500 ml-2 mt-0.5"><X size={18} /></button>
            </div>
            <ActivityGraph userId={activityPerson.id} name={activityPerson.name} />
          </div>
        </div>
      )}
    </section>
  );
}

/* ── My Focus (IC counterpart to ContributorsPanel) ────────────────────────
   A per-project rollup of the contributor's own open tasks. Mirrors the
   visual shape of ContributorsPanel so the right column reads the same for
   both roles — three stacked panels, same header style, same collapse
   affordance — even though the content is role-appropriate. */
function MyFocusPanel({
  tasks, projects, myId,
}: { tasks: TeamTask[]; projects: any[]; myId: string }) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [showExpandNudge, setShowExpandNudge] = useState(true);

  useEffect(() => {
    const t = window.setTimeout(() => setShowExpandNudge(false), 2800);
    return () => window.clearTimeout(t);
  }, []);

  const myOpen = tasks.filter((t) => t.assigneeId === myId && t.status !== 'done');
  if (myOpen.length === 0) return null;

  const projMap = new Map(projects.map((p: any) => [p.id, p]));
  const byProject = new Map<string, TeamTask[]>();
  for (const t of myOpen) {
    if (!byProject.has(t.projectId)) byProject.set(t.projectId, []);
    byProject.get(t.projectId)!.push(t);
  }
  const rows = [...byProject.entries()]
    .map(([projectId, ts]) => ({
      projectId,
      project: projMap.get(projectId),
      tasks: ts,
      overdue: ts.filter((t) => {
        const due = t.ccTcd || t.dueDate;
        return due && new Date(due) < new Date();
      }).length,
    }))
    .sort((a, b) => b.overdue - a.overdue || b.tasks.length - a.tasks.length);

  return (
    <section className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/[0.07] overflow-hidden"
      style={{ boxShadow: '0 1px 3px rgba(15,23,42,0.04)' }}>
      <div
        className="px-4 py-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] select-none transition-colors"
        onClick={() => setPanelOpen((o) => !o)}
      >
        <FolderKanban size={13} className="text-slate-400 dark:text-white/30" />
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-white/35">Focus by project</h3>
        <span className="ml-auto text-[10px] text-slate-300 dark:text-white/20 font-semibold">{rows.length}</span>
        <ChevronDown
          size={12}
          className={`text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 transition-transform duration-200 rounded-full ${showExpandNudge && !panelOpen ? 'pragati-row-expand-blink' : ''}`}
          style={{ transform: panelOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </div>

      {panelOpen && (
        <ul className="divide-y divide-slate-50 dark:divide-white/[0.04] border-t border-slate-100 dark:border-white/[0.05]">
          {rows.map((r) => (
            <li key={r.projectId}>
              <Link href={`/projects/${r.projectId}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-700 dark:text-white/70 truncate">
                    {r.project?.name || 'Project'}
                  </div>
                  {r.project?.code && (
                    <div className="text-[10px] font-mono text-slate-400 dark:text-white/30 mt-0.5">{r.project.code}</div>
                  )}
                </div>
                <span className="text-[10px] font-bold text-slate-500 dark:text-white/35 shrink-0">{r.tasks.length} open</span>
                {r.overdue > 0 && (
                  <span className="text-[10px] font-bold text-red-500 shrink-0">{r.overdue} overdue</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ContributorRow({ person, tasks, onViewActivity }: { person: DashPerson; tasks: TeamTask[]; onViewActivity?: () => void }) {
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
    overloaded: 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400',
    busy:       'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
    healthy:    'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  }[person.loadLevel];

  const loadLabel = { overloaded: 'Overloaded', busy: 'Busy', healthy: 'Steady' }[person.loadLevel];

  return (
    <li>
      <div
        className="group px-4 py-2.5 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-white/[0.03] transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <UserAvatar userId={person.id} name={person.name} size={26} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800 dark:text-white/75 truncate">{person.name}</span>
              {/* Activity deep-dive — same gesture as the team & people pages.
                  Always visible (no hover-reveal) so a viewer doesn't need to
                  discover that the row is clickable. */}
              {onViewActivity && (
                <button
                  onMouseEnter={() => warmActivityGraph(person.id)}
                  onFocus={() => warmActivityGraph(person.id)}
                  onClick={(e) => { e.stopPropagation(); warmActivityGraph(person.id); onViewActivity(); }}
                  title={`View ${person.name}'s activity`}
                  className="text-slate-400 dark:text-white/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shrink-0">
                  <BarChart3 size={13} />
                </button>
              )}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-white/30 truncate">
              {person.openTasks} open
              {person.overdueCount > 0 && <span className="text-red-600 dark:text-red-400 font-semibold ml-1.5">· {person.overdueCount} overdue</span>}
              {person.completedThisWeek > 0 && <span className="text-emerald-600 dark:text-emerald-400 ml-1.5">· {person.completedThisWeek} done·7d</span>}
            </div>
          </div>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${loadBadge}`}>
            {loadLabel}
          </span>
          <button className="p-0.5 text-emerald-500 hover:text-emerald-600 dark:text-emerald-400 transition-transform"
            style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
            <ChevronDown size={12} />
          </button>
        </div>
      </div>

      {open && (
        <div className="pb-2 fade-in-soft">
          {sorted.length === 0 ? (
            <div className="px-4 pb-3 text-[11px] text-slate-400 dark:text-white/25 italic">
              No open assignments — capacity available.
            </div>
          ) : (
            <ul className="px-4 space-y-2 pb-1">
              {sorted.slice(0, 5).map(t => {
                const due = t.ccTcd || t.dueDate;
                const dueIn = daysUntil(due);
                const overdue = due && new Date(due) < new Date();
                return (
                  <li key={t.id} className="text-[11px] bg-slate-50/60 dark:bg-white/[0.03] rounded-lg p-2 border border-slate-100 dark:border-white/[0.05]">
                    <Link href={`/tasks/${t.id}`}
                      className="font-semibold text-slate-700 dark:text-white/70 hover:text-blue-700 dark:hover:text-blue-400 line-clamp-1 block">
                      {t.title}
                    </Link>
                    <div className="text-[10px] text-slate-400 dark:text-white/30 mt-0.5 flex items-center gap-1.5 flex-wrap">
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
                <li className="text-[10px] text-slate-400 dark:text-white/30 pt-1">+{sorted.length - 5} more</li>
              )}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

