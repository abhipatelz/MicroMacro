'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ZoomIn,
  ZoomOut,
  Scan,
  Download,
  FileDown,
  Layers,
  RotateCcw,
  Pencil,
  Check,
  Brush,
  Eraser,
  Plus,
  Search,
} from 'lucide-react';
import { api } from '@/lib/client/api';
import { DatePicker } from '@/components/DatePicker';
import { Select } from '@/components/Select';
import { notifyCalendarChange } from '@/components/SidebarCalendar';

/**
 * Bird's-Eye View — a clean, executive top-down map of a workspace / team /
 * project. Renders as a packed org-chart with curved connectors. No external
 * graph library — a pure-SVG layout keeps the bundle small and means the
 * export pipeline (print → save-as-PDF, save-as-SVG) sees identical pixels to
 * the on-screen view.
 *
 * Hierarchy by scope:
 *   workspace → teams → projects → tasks (tasks stacked vertically per project)
 *   team      → projects → tasks
 *   project   → phases   → tasks
 *
 * The tree is *deterministic* (alphabetical at each level, then by status) so
 * opening the same view from two sessions paints the same shape. It changes
 * only when the underlying work changes, never because of layout jitter — that
 * reproducibility is what makes it a trustworthy reference for a review.
 *
 * Layout invariants the rest of the file relies on:
 *   • Parents are horizontally centred over their children (no overlap).
 *   • Tasks never fan sideways — one project owns exactly one task column, so a
 *     30-task project lengthens its own column instead of distorting the tree.
 *   • The initial view auto-fits the viewport and centres horizontally, so a
 *     sparse tree (1 team · 1 project) is centred rather than pinned to a
 *     narrow left gutter.
 */

export interface BirdsEyeTeam {
  id: string;
  name: string;
  ownerName?: string | null;
}

export interface BirdsEyeProject {
  id: string;
  code: string;
  name: string;
  teamId?: string | null;
  health: 'healthy' | 'at_risk' | 'critical';
  taskCount: number;
  tasksDone: number;
  dueDate?: string | null;
  ownerName?: string | null;
}

export interface BirdsEyeTask {
  id: string;
  title: string;
  projectId: string;
  status: string;
  assigneeName?: string | null;
  dueDate?: string | null;
  /** Project-scope only: groups tasks under a phase row. Ignored elsewhere. */
  phaseName?: string | null;
  /** Explicit project-detail ordering, retained in project-scope exports. */
  position?: number;
  phasePosition?: number;
  subtaskCount?: number;
  subtasksDone?: number;
  /** First few subtask titles for inline rendering inside the task node. */
  subtaskTitles?: string[];
}

export interface BirdsEyeData {
  rootLabel: string; // e.g. "Abhi Patel's workspace" or "BOT Automation"
  rootSubLabel?: string;
  teams: BirdsEyeTeam[]; // can be empty for project-only view
  projects: BirdsEyeProject[];
  tasks: BirdsEyeTask[];
  /** Which level the root represents — drives node-shape choices. */
  scope: 'workspace' | 'team' | 'project';
}

/* ── Status / health palette ───────────────────────────────────────────────
   Kept deliberately muted: a pale fill with a saturated 1px edge. Status is
   communicated by the edge, not a loud block of colour, so a dense board reads
   as a calm executive overview rather than a developer graph. */
const STATUS_FILL: Record<string, string> = {
  todo: '#f8fafc',
  in_progress: '#eff6ff',
  review: '#fffbeb',
  blocked: '#fef2f2',
  done: '#f0fdf4',
};
const STATUS_STROKE: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  review: '#f59e0b',
  blocked: '#ef4444',
  done: '#22c55e',
};
const STATUS_DOT = STATUS_STROKE;
const HEALTH_FILL: Record<string, string> = {
  healthy: '#f0fdf4',
  at_risk: '#fffbeb',
  critical: '#fef2f2',
};
const HEALTH_STROKE: Record<string, string> = {
  healthy: '#16a34a',
  at_risk: '#d97706',
  critical: '#dc2626',
};

interface PositionedNode {
  kind: 'root' | 'team' | 'project' | 'phase' | 'task' | 'count';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub?: string;
  /** Pre-wrapped title lines, computed at layout time so the node box and the
   *  text agree on how many rows are drawn. */
  titleLines?: string[];
  data?: any;
  /** Whether inline subtask list is visible (computed in fitTaskHeight). */
  showSubtasks?: boolean;
}

interface Edge {
  from: string;
  to: string;
}

// Top-down org-chart geometry. Nodes shrink at deeper levels so a wide tree
// stays scannable from above. Sizes tuned to keep the default (tasks-collapsed)
// view clean — individual projects expand to show task detail on demand.
const NODE_WIDTH = { root: 280, team: 226, project: 240, phase: 210, task: 220, count: 202 } as const;
const NODE_HEIGHT = { root: 68, team: 66, project: 68, phase: 58, task: 46, count: 32 } as const;
// Air between things is what separates "aerial view" from "circuit diagram".
// These gaps were widened after the dense first pass read as congested: the
// auto-fit always frames the whole tree anyway, so extra whitespace costs a
// little zoom, not screen space — and buys a lot of scannability.
const LEVEL_GAP_Y = 88; // vertical distance between depth levels
const SIBLING_GAP_X = 32; // horizontal distance between siblings of the same parent
const SUBTREE_GAP_X = 58; // extra horizontal gap between sibling subtrees
const TASK_STACK_GAP_Y = 12; // vertical spacing inside a project's task stack
const PADDING = 64; // canvas padding around the whole tree

function nodeKey(kind: string, id: string) {
  return `${kind}:${id}`;
}

/** Greedy word-wrap for SVG text. Returns up to `maxLines` lines, ellipsising
 *  the final line if the text overflows. Sized by an average glyph width so the
 *  box drawn around it is wide enough without measuring the DOM. */
function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  if (!text) return [''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  // If we ran out of room mid-text, mark the truncation on the last line.
  const consumed = lines.join(' ').length;
  if (consumed < text.replace(/\s+/g, ' ').length && lines.length) {
    let last = lines[lines.length - 1];
    if (last.length > maxChars - 1) last = last.slice(0, maxChars - 1);
    lines[lines.length - 1] = last.replace(/[\s.]+$/, '') + '…';
  }
  return lines.length ? lines : [''];
}

function truncateText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/**
 * Pure layout pass. Returns absolute coordinates for every node + the edges
 * between them. Deterministic (alphabetical) so the export and the on-screen
 * view share pixel coordinates. Direction is strictly top-down.
 */
function layout(
  data: BirdsEyeData,
  opts: { collapseTasks: boolean; collapsedIds?: ReadonlySet<string> },
): {
  nodes: PositionedNode[];
  edges: Edge[];
  width: number;
  height: number;
} {
  const nodes: PositionedNode[] = [];
  const edges: Edge[] = [];

  // Group projects by team. Projects with no team fall into a synthetic bucket
  // so they still appear in the workspace view.
  const projectsByTeam = new Map<string, BirdsEyeProject[]>();
  const teamMap = new Map<string, BirdsEyeTeam>();
  for (const t of data.teams) teamMap.set(t.id, t);
  for (const p of data.projects) {
    const k = p.teamId || '_untethered_';
    if (!projectsByTeam.has(k)) projectsByTeam.set(k, []);
    projectsByTeam.get(k)!.push(p);
  }
  for (const list of projectsByTeam.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  // Group tasks by project, ordered by status (active first → done last) so a
  // project always renders its column the same way.
  const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };
  const sortTasks = (a: BirdsEyeTask, b: BirdsEyeTask) => {
    const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
    return s !== 0 ? s : a.title.localeCompare(b.title);
  };
  const tasksByProject = new Map<string, BirdsEyeTask[]>();
  for (const t of data.tasks) {
    if (!tasksByProject.has(t.projectId)) tasksByProject.set(t.projectId, []);
    tasksByProject.get(t.projectId)!.push(t);
  }
  for (const list of tasksByProject.values()) list.sort(sortTasks);

  type Subtree = { node: PositionedNode; children: Subtree[]; width: number; tasks?: PositionedNode[] };

  // Build a vertical task stack of PositionedNodes (positions filled later).
  function taskStack(tasks: BirdsEyeTask[], keyPrefix: string): PositionedNode[] {
    const out: PositionedNode[] = [];
    if (opts.collapseTasks && tasks.length > 0) {
      const done = tasks.filter((t) => t.status === 'done').length;
      out.push({
        kind: 'count',
        id: `count:${keyPrefix}`,
        x: 0,
        y: 0,
        width: NODE_WIDTH.count,
        height: NODE_HEIGHT.count,
        label: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
        sub: `${done}/${tasks.length} done`,
      });
      return out;
    }
    const TASK_CAP = 80;
    for (const t of tasks.slice(0, TASK_CAP)) {
      out.push({
        kind: 'task',
        id: nodeKey('task', t.id),
        x: 0,
        y: 0,
        width: NODE_WIDTH.task,
        height: NODE_HEIGHT.task,
        label: t.title,
        titleLines: wrapText(t.title, 30, 2),
        sub: [t.assigneeName, t.status?.replace(/_/g, ' ')].filter(Boolean).join(' · '),
        data: t,
      });
    }
    if (tasks.length > TASK_CAP) {
      out.push({
        kind: 'count',
        id: `more:${keyPrefix}`,
        x: 0,
        y: 0,
        width: NODE_WIDTH.count,
        height: NODE_HEIGHT.count,
        label: `+${tasks.length - TASK_CAP} more — use Group tasks`,
      });
    }
    return out;
  }

  // Re-measure a node's height to fit its wrapped title + optional inline
  // subtask list. Subtask rows are shown when the task has subtask titles AND
  // the node is NOT collapsed in collapsedIds.
  function fitTaskHeight(n: PositionedNode) {
    const t = n.data as BirdsEyeTask | undefined;
    const lines = n.titleLines?.length || 1;
    const subRows = n.sub ? 1 : 0;
    const rawTitles = t?.subtaskTitles;
    const hasSubData = rawTitles && rawTitles.length > 0;
    const taskCollapsed = collapsedIds.has(n.id);
    n.showSubtasks = hasSubData && !taskCollapsed;
    if (n.showSubtasks) {
      const visibleRows = Math.min(3, rawTitles!.length);
      // title rows + assignee row + subtask rows + progress strip
      n.height = 14 + lines * 15 + subRows * 12 + visibleRows * 12 + 10;
    } else {
      n.height = 14 + lines * 15 + subRows * 13;
    }
  }

  const collapsedIds = opts.collapsedIds || new Set<string>();

  function buildProjectSubtree(p: BirdsEyeProject): Subtree {
    const id = nodeKey('project', p.id);
    const collapsed = collapsedIds.has(id);
    const tasks = collapsed ? [] : tasksByProject.get(p.id) || [];
    const taskNodes = taskStack(tasks, p.id);
    taskNodes.forEach((t) => {
      if (t.kind === 'task') fitTaskHeight(t);
    });
    const projectNode: PositionedNode = {
      kind: 'project',
      id,
      x: 0,
      y: 0,
      width: NODE_WIDTH.project,
      height: NODE_HEIGHT.project,
      label: p.name,
      titleLines: wrapText(p.name, 28, 2),
      sub: `${p.code} · ${p.tasksDone}/${p.taskCount} done`,
      data: p,
    };
    return { node: projectNode, children: [], width: NODE_WIDTH.project, tasks: taskNodes };
  }

  function buildTeamSubtree(team: BirdsEyeTeam, teamProjects: BirdsEyeProject[]): Subtree {
    const id = nodeKey('team', team.id);
    const collapsed = collapsedIds.has(id);
    const teamNode: PositionedNode = {
      kind: 'team',
      id,
      x: 0,
      y: 0,
      width: NODE_WIDTH.team,
      height: NODE_HEIGHT.team,
      label: team.name,
      titleLines: wrapText(team.name, 26, 2),
      sub: team.ownerName ? `Lead · ${team.ownerName}` : undefined,
      data: team,
    };
    const children = collapsed ? [] : teamProjects.map(buildProjectSubtree);
    const childrenW =
      children.length === 0
        ? NODE_WIDTH.team
        : children.reduce((sum, c) => sum + c.width + SIBLING_GAP_X, -SIBLING_GAP_X);
    return { node: teamNode, children, width: Math.max(NODE_WIDTH.team, childrenW) };
  }

  // Project scope: phases become the horizontal level, each owning a task
  // column — so the view reads Project → Phases → Tasks.
  function buildPhaseSubtrees(): Subtree[] {
    const byPhase = new Map<string, BirdsEyeTask[]>();
    const order: string[] = [];
    const projectOrder = [...data.tasks].sort(
      (a, b) =>
        (a.phasePosition ?? Number.MAX_SAFE_INTEGER) - (b.phasePosition ?? Number.MAX_SAFE_INTEGER) ||
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER),
    );
    for (const t of projectOrder) {
      const name = (t.phaseName && t.phaseName.trim()) || 'Unphased';
      if (!byPhase.has(name)) {
        byPhase.set(name, []);
        order.push(name);
      }
      byPhase.get(name)!.push(t);
    }
    return order.map((name, i) => {
      const phaseId = `phase:${i}`;
      const collapsed = collapsedIds.has(phaseId);
      const tasks = byPhase.get(name)!;
      const visibleTasks = collapsed ? [] : tasks;
      const taskNodes = taskStack(visibleTasks, `phase-${i}`);
      taskNodes.forEach((t) => {
        if (t.kind === 'task') fitTaskHeight(t);
      });
      const phaseNode: PositionedNode = {
        kind: 'phase',
        id: phaseId,
        x: 0,
        y: 0,
        width: NODE_WIDTH.phase,
        height: NODE_HEIGHT.phase,
        label: name,
        titleLines: wrapText(name, 26, 2),
        sub: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
      };
      return { node: phaseNode, children: [], width: NODE_WIDTH.phase, tasks: taskNodes };
    });
  }

  // Build the forest of root children.
  const subtrees: Subtree[] = [];
  if (data.scope === 'workspace') {
    const sortedTeams = [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const t of sortedTeams) subtrees.push(buildTeamSubtree(t, projectsByTeam.get(t.id) || []));
    const untethered = projectsByTeam.get('_untethered_') || [];
    if (untethered.length) {
      subtrees.push(buildTeamSubtree({ id: '_untethered_', name: 'Untethered projects' }, untethered));
    }
  } else if (data.scope === 'team') {
    for (const p of [...data.projects].sort((a, b) => a.name.localeCompare(b.name)))
      subtrees.push(buildProjectSubtree(p));
  } else {
    subtrees.push(...buildPhaseSubtrees());
  }

  const startY = PADDING;

  // Position a subtree (and its descendants) with the given left edge + top.
  function placeSubtreeAt(s: Subtree, leftX: number, topY: number) {
    s.node.x = leftX + (s.width - s.node.width) / 2;
    s.node.y = topY;
    nodes.push(s.node);

    if (s.tasks && s.tasks.length) {
      let stackY = topY + s.node.height + LEVEL_GAP_Y / 2;
      for (const t of s.tasks) {
        t.x = s.node.x + (s.node.width - t.width) / 2;
        t.y = stackY;
        nodes.push(t);
        edges.push({ from: s.node.id, to: t.id });
        stackY += t.height + TASK_STACK_GAP_Y;
      }
    }

    if (s.children.length) {
      const childTop = topY + s.node.height + LEVEL_GAP_Y;
      const childSpan = s.children.reduce((sum, c) => sum + c.width + SIBLING_GAP_X, -SIBLING_GAP_X);
      let cursor = leftX + (s.width - childSpan) / 2;
      for (const c of s.children) {
        placeSubtreeAt(c, cursor, childTop);
        edges.push({ from: s.node.id, to: c.node.id });
        cursor += c.width + SIBLING_GAP_X;
      }
    }
  }

  const forestW =
    subtrees.length === 0
      ? NODE_WIDTH.root
      : subtrees.reduce((sum, s) => sum + s.width + SUBTREE_GAP_X, -SUBTREE_GAP_X);
  const totalW = Math.max(NODE_WIDTH.root, forestW);

  const rootNode: PositionedNode = {
    kind: 'root',
    id: 'root',
    x: PADDING + (totalW - NODE_WIDTH.root) / 2,
    y: startY,
    width: NODE_WIDTH.root,
    height: NODE_HEIGHT.root,
    label: data.rootLabel,
    titleLines: wrapText(data.rootLabel, 30, 2),
    sub: data.rootSubLabel,
  };
  nodes.push(rootNode);

  let cursorX = PADDING + (totalW - forestW) / 2;
  const childTop = startY + NODE_HEIGHT.root + LEVEL_GAP_Y;
  for (const s of subtrees) {
    placeSubtreeAt(s, cursorX, childTop);
    edges.push({ from: 'root', to: s.node.id });
    cursorX += s.width + SUBTREE_GAP_X;
  }

  let maxX = 0,
    maxY = 0;
  for (const n of nodes) {
    if (n.x + n.width > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }
  return { nodes, edges, width: maxX + PADDING, height: maxY + PADDING };
}

/* ── Node rendering ────────────────────────────────────────────────────────
   Each level has a distinct silhouette: the workspace root is the boldest, a
   gradient pill; teams/phases are secondary tinted cards; projects carry a
   health edge; tasks are compact status cards. A native <title> on every node
   gives the full, untruncated text on hover. */
function MultiText({
  x,
  lines,
  fontSize,
  lineHeight,
  fill,
  weight,
  anchor,
}: {
  x: number;
  lines: string[];
  fontSize: number;
  lineHeight: number;
  fill: string;
  weight: number;
  anchor?: 'middle' | 'start';
}) {
  return (
    <>
      {lines.map((ln, i) => (
        <tspan
          key={i}
          x={x}
          dy={i === 0 ? 0 : lineHeight}
          fontSize={fontSize}
          fontWeight={weight}
          fill={fill}
          textAnchor={anchor || 'start'}
        >
          {ln}
        </tspan>
      ))}
    </>
  );
}

function NodeShape({ n }: { n: PositionedNode }) {
  const lines = n.titleLines && n.titleLines.length ? n.titleLines : [n.label];
  const fullTitle = `${n.label}${n.sub ? `\n${n.sub}` : ''}`;

  if (n.kind === 'root') {
    const cx = n.x + n.width / 2;
    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={16}
          fill="url(#beRootGrad)"
          stroke="#0f5db5"
          strokeWidth={1.5}
          filter="url(#beNodeShadow)"
        />
        <text textAnchor="middle" y={n.y + (n.sub ? 28 : 34)}>
          <MultiText
            x={cx}
            lines={lines}
            fontSize={15}
            lineHeight={17}
            fill="#ffffff"
            weight={800}
            anchor="middle"
          />
        </text>
        {n.sub && (
          <text
            x={cx}
            y={n.y + n.height - 14}
            textAnchor="middle"
            fontSize={11}
            fill="rgba(255,255,255,0.88)"
          >
            {truncateText(n.sub, 40)}
          </text>
        )}
      </g>
    );
  }

  if (n.kind === 'team') {
    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={12}
          fill="#eef2ff"
          stroke="#4f46e5"
          strokeWidth={1.25}
          filter="url(#beNodeShadow)"
        />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill="#4f46e5" />
        <text x={n.x + 14} y={n.y + 22}>
          <MultiText x={n.x + 14} lines={lines} fontSize={13} lineHeight={15} fill="#312e81" weight={700} />
        </text>
        {n.sub && (
          <text x={n.x + 14} y={n.y + n.height - 12} fontSize={10.5} fill="#6366f1">
            {truncateText(n.sub, 32)}
          </text>
        )}
      </g>
    );
  }

  if (n.kind === 'phase') {
    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={11}
          fill="#f1f5f9"
          stroke="#64748b"
          strokeWidth={1.1}
          filter="url(#beNodeShadow)"
        />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill="#64748b" />
        <text x={n.x + 13} y={n.y + 19}>
          <MultiText x={n.x + 13} lines={lines} fontSize={12} lineHeight={14} fill="#0f172a" weight={700} />
        </text>
        {n.sub && (
          <text x={n.x + 13} y={n.y + n.height - 11} fontSize={10} fill="#64748b">
            {truncateText(n.sub, 30)}
          </text>
        )}
      </g>
    );
  }

  if (n.kind === 'project') {
    const p = n.data as BirdsEyeProject;
    const fill = HEALTH_FILL[p?.health || 'healthy'];
    const stroke = HEALTH_STROKE[p?.health || 'healthy'];
    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={12}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.4}
          filter="url(#beNodeShadow)"
        />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill={stroke} />
        <text x={n.x + 14} y={n.y + 22}>
          <MultiText x={n.x + 14} lines={lines} fontSize={13} lineHeight={15} fill="#0f172a" weight={700} />
        </text>
        {n.sub &&
          (() => {
            // The "+ add task" button occupies the bottom-right corner; clip
            // the mono sub-line so a long reference code never runs beneath
            // it (the full text stays available in the hover <title>).
            const maxChars = Math.max(8, Math.floor((n.width - 14 - 30) / 6.1));
            const subText =
              n.sub.length > maxChars ? n.sub.slice(0, maxChars - 1).replace(/[\s·]+$/, '') + '…' : n.sub;
            return (
              <text
                x={n.x + 14}
                y={n.y + n.height - 12}
                fontSize={10}
                fill="#475569"
                fontFamily="ui-monospace,monospace"
              >
                {subText}
              </text>
            );
          })()}
      </g>
    );
  }

  if (n.kind === 'task') {
    const t = n.data as BirdsEyeTask;
    const fill = STATUS_FILL[t?.status || 'todo'];
    const stroke = STATUS_STROKE[t?.status || 'todo'];
    const dot = STATUS_DOT[t?.status || 'todo'];
    const subtaskTitles = n.showSubtasks ? (t?.subtaskTitles || []).slice(0, 3) : [];
    // Y offset where the title block ends — subtask rows start here
    const titleEndY = n.y + 16 + (n.titleLines?.length || 1) * 15;
    const hasProgress = n.showSubtasks && (t?.subtaskCount ?? 0) > 0;
    const progressRatio = hasProgress
      ? Math.max(0, Math.min(1, (t!.subtasksDone ?? 0) / (t!.subtaskCount ?? 1)))
      : 0;

    return (
      <g>
        <title>{fullTitle}</title>
        <rect
          x={n.x}
          y={n.y}
          width={n.width}
          height={n.height}
          rx={9}
          fill={fill}
          stroke={stroke}
          strokeWidth={1}
          filter="url(#beNodeShadow)"
        />
        {/* Status dot */}
        <circle cx={n.x + 12} cy={n.y + 14} r={3.5} fill={dot} />
        {/* Task title */}
        <text x={n.x + 22} y={n.y + 17}>
          <MultiText x={n.x + 22} lines={lines} fontSize={11.5} lineHeight={14} fill="#0f172a" weight={600} />
        </text>
        {/* Assignee / date — only when there's no subtask list below */}
        {n.sub && !n.showSubtasks && (
          <text x={n.x + 12} y={n.y + n.height - 8} fontSize={9.5} fill="#64748b">
            {n.sub}
          </text>
        )}
        {/* Inline subtask list */}
        {subtaskTitles.map((st, i) => (
          <text key={i} x={n.x + 16} y={titleEndY + i * 12} fontSize={8.5} fill="#64748b">
            <tspan fill={dot} fontSize={6} dy={0}>
              ■
            </tspan>
            <tspan dx={3}>{st.length > 26 ? st.slice(0, 25) + '…' : st}</tspan>
          </text>
        ))}
        {/* Subtask progress bar */}
        {hasProgress && (
          <>
            <rect
              x={n.x + 12}
              y={n.y + n.height - 8}
              width={n.width - 24}
              height={2.5}
              rx={1.25}
              fill="#e2e8f0"
            />
            <rect
              x={n.x + 12}
              y={n.y + n.height - 8}
              width={(n.width - 24) * progressRatio}
              height={2.5}
              rx={1.25}
              fill={dot}
              opacity={0.75}
            />
          </>
        )}
      </g>
    );
  }

  // count chip
  return (
    <g>
      <title>{n.label}</title>
      <rect
        x={n.x}
        y={n.y}
        width={n.width}
        height={n.height}
        rx={10}
        fill="#f8fafc"
        stroke="#cbd5e1"
        strokeDasharray="4,3"
        strokeWidth={1}
      />
      <text
        x={n.x + n.width / 2}
        y={n.y + (n.sub ? 17 : 24)}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
        fill="#475569"
      >
        {n.label}
      </text>
      {n.sub && (
        <text x={n.x + n.width / 2} y={n.y + 31} textAnchor="middle" fontSize={9.5} fill="#64748b">
          {n.sub}
        </text>
      )}
    </g>
  );
}

/** Smooth cubic-Bézier between two node anchors: exits the bottom-centre of
 *  `from`, enters the top-centre of `to`. */
function edgePath(from: PositionedNode, to: PositionedNode): string {
  const x1 = from.x + from.width / 2;
  const y1 = from.y + from.height;
  const x2 = to.x + to.width / 2;
  const y2 = to.y;
  const mid = (y1 + y2) / 2;
  return `M ${x1},${y1} C ${x1},${mid} ${x2},${mid} ${x2},${y2}`;
}

/* ── Component ─────────────────────────────────────────────────────────────
   Renders inside a portal so the modal sits above the app sidebar/header and
   the Bird's-eye header is never clipped. */
export function BirdsEyeView({
  data,
  onClose,
  onChange,
}: {
  data: BirdsEyeData;
  onClose: () => void;
  /** Fires after a Bird's-Eye edit (assignee/TCD) persists — lets the host
   *  page re-fetch its data without forcing a hard reload. */
  onChange?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  // Default collapsed — shows compact count chips per project so the initial
  // view is clean. The user can expand all tasks with "Show tasks" or collapse
  // individual project task stacks with the − button on each project node.
  const [collapseTasks, setCollapseTasks] = useState(data.scope !== 'project');
  const [editing, setEditing] = useState<{ node: PositionedNode; clientX: number; clientY: number } | null>(
    null,
  );
  const [addingTaskFor, setAddingTaskFor] = useState<{
    node: PositionedNode;
    clientX: number;
    clientY: number;
  } | null>(null);
  // Per-node drag overrides {id → {dx,dy}} — applied on top of the computed
  // layout. localStorage-backed per scope+root so the user's arrangement is
  // preserved across opens but doesn't bleed between views.
  const overrideKey = `pragati-bve-pos:${data.scope}:${data.rootLabel}`;
  const collapseKey = `pragati-bve-collapsed:${data.scope}:${data.rootLabel}`;
  const brushKey = `pragati-bve-brush:${data.scope}:${data.rootLabel}`;
  const [overrides, setOverrides] = useState<Record<string, { dx: number; dy: number }>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      return JSON.parse(localStorage.getItem(overrideKey) || '{}');
    } catch {
      return {};
    }
  });
  // Set of collapsed node ids — when a node is collapsed its subtree (children
  // and/or tasks) is hidden. Persists per scope.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(localStorage.getItem(collapseKey) || '[]'));
    } catch {
      return new Set();
    }
  });
  const [svgExportPending, setSvgExportPending] = useState(false);
  const svgExportRestore = useRef<{ collapseTasks: boolean; collapsedIds: Set<string> } | null>(null);
  // Brush / annotation layer — freeform polylines over the canvas so a lead
  // can sketch on top of the structure during a brainstorm. Persists per scope.
  type BrushStroke = { color: string; width: number; points: { x: number; y: number }[] };
  const [brushOn, setBrushOn] = useState(false);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      return JSON.parse(localStorage.getItem(brushKey) || '[]');
    } catch {
      return [];
    }
  });
  const [brushColor, setBrushColor] = useState('#1565C0');
  const liveStroke = useRef<BrushStroke | null>(null);
  const [, forceLive] = useState(0); // re-render trigger for live stroke painting
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has taken manual control of the zoom; until they
  // do, we keep auto-fitting on resize so the first paint always frames the tree.
  const userZoomed = useRef(false);
  // Find-on-canvas: a query dims everything that doesn't match so the matches
  // pop without re-laying-out the tree (positions stay stable — that's what
  // keeps the view trustworthy as a spatial reference).
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  // Status spotlight — clicking a legend chip dims tasks not in that status.
  // null = no filter. Single-select; clicking the active chip clears it.
  const [statusFocus, setStatusFocus] = useState<string | null>(null);
  // Minimap viewport tracking — scroll/size of the canvas, sampled via rAF so
  // panning never pays for a React render per scroll event.
  const [viewportBox, setViewportBox] = useState({ sl: 0, st: 0, cw: 0, ch: 0 });
  const viewportRaf = useRef(0);
  const sampleViewport = useCallback(() => {
    cancelAnimationFrame(viewportRaf.current);
    viewportRaf.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setViewportBox({ sl: el.scrollLeft, st: el.scrollTop, cw: el.clientWidth, ch: el.clientHeight });
    });
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Layered escape: close the popover, then the search, then the view.
        if (editing) setEditing(null);
        else if (document.activeElement === searchRef.current) {
          setQuery('');
          searchRef.current?.blur();
        } else onClose();
        return;
      }
      // Power-user keys — never steal keystrokes from a focused field.
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === '+' || e.key === '=') zoomBy(0.1);
      else if (e.key === '-') zoomBy(-0.1);
      else if (e.key === '0' || e.key.toLowerCase() === 'f') resetView();
      else if (e.key.toLowerCase() === 'b') setBrushOn((v) => !v);
      else if (e.key.toLowerCase() === 't') {
        userZoomed.current = false;
        setCollapseTasks((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // zoomBy/resetView are stable in behaviour (setState + refs); listing the
    // states they close over would re-bind the listener every zoom tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, editing]);

  // Persist overrides whenever they change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(overrideKey, JSON.stringify(overrides));
    } catch {}
  }, [overrides, overrideKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(collapseKey, JSON.stringify(Array.from(collapsedIds)));
    } catch {}
  }, [collapsedIds, collapseKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(brushKey, JSON.stringify(brushStrokes));
    } catch {}
  }, [brushStrokes, brushKey]);

  const {
    nodes: baseNodes,
    edges,
    width: baseWidth,
    height: baseHeight,
  } = useMemo(() => layout(data, { collapseTasks, collapsedIds }), [data, collapseTasks, collapsedIds]);

  // Apply drag overrides to the computed layout (and expand canvas if dragged
  // beyond its bounds so edges & scroll still reach the moved node).
  const { nodes, width, height } = useMemo(() => {
    let w = baseWidth,
      h = baseHeight;
    const arr = baseNodes.map((n) => {
      const o = overrides[n.id];
      if (!o) return n;
      const moved = { ...n, x: n.x + o.dx, y: n.y + o.dy };
      if (moved.x + moved.width + PADDING > w) w = moved.x + moved.width + PADDING;
      if (moved.y + moved.height + PADDING > h) h = moved.y + moved.height + PADDING;
      return moved;
    });
    return { nodes: arr, width: w, height: h };
  }, [baseNodes, baseWidth, baseHeight, overrides]);

  const nodeIndex = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  // ── Spotlight ────────────────────────────────────────────────────────────
  // Search and the legend's status focus dim what doesn't match instead of
  // removing it: positions never change, so the user's spatial memory of the
  // tree survives the filter. `null` = no spotlight, everything full-strength.
  const queryNorm = query.trim().toLowerCase();
  const litIds = useMemo(() => {
    if (!queryNorm && !statusFocus) return null;
    const lit = new Set<string>();
    for (const n of nodes) {
      if (n.kind === 'root') {
        lit.add(n.id);
        continue;
      }
      const text = `${n.label} ${n.sub || ''}`.toLowerCase();
      const queryOk = !queryNorm || text.includes(queryNorm);
      // Status focus only judges task cards — teams/projects/phases stay lit
      // as the scaffolding that gives the matching tasks their context.
      const statusOk = !statusFocus || n.kind !== 'task' || (n.data as BirdsEyeTask).status === statusFocus;
      if (queryOk && statusOk) lit.add(n.id);
    }
    return lit;
  }, [nodes, queryNorm, statusFocus]);

  const queryMatchCount = useMemo(() => {
    if (!queryNorm) return 0;
    let c = 0;
    for (const n of nodes) {
      if (n.kind === 'root') continue;
      if (`${n.label} ${n.sub || ''}`.toLowerCase().includes(queryNorm)) c++;
    }
    return c;
  }, [nodes, queryNorm]);

  // Enter in the search box flies to the first match (top-most, then left-most).
  const jumpToFirstMatch = useCallback(() => {
    if (!queryNorm) return;
    const el = scrollRef.current;
    if (!el) return;
    const first = [...nodes]
      .filter((n) => n.kind !== 'root' && `${n.label} ${n.sub || ''}`.toLowerCase().includes(queryNorm))
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    if (!first) return;
    el.scrollTo({
      left: (first.x + first.width / 2) * zoom - el.clientWidth / 2,
      top: (first.y + first.height / 2) * zoom - el.clientHeight / 2,
      behavior: 'smooth',
    });
  }, [nodes, queryNorm, zoom]);

  // Compute the zoom that frames the whole tree in the current viewport, then
  // centre it. Capped at 1× (we never blow content up past natural size on a
  // sparse tree) and floored so a huge tree stays legible.
  const fitToViewport = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const availW = el.clientWidth;
    const availH = el.clientHeight;
    if (!availW || !availH) return;
    const z = Math.min(availW / width, availH / height, 1);
    const clamped = Math.max(0.3, Math.round(z * 100) / 100);
    setZoom(clamped);
    // Centre after the scaled size settles.
    requestAnimationFrame(() => {
      const e2 = scrollRef.current;
      if (!e2) return;
      e2.scrollLeft = Math.max(0, (width * clamped - e2.clientWidth) / 2);
      e2.scrollTop = 0;
    });
  }, [width, height]);

  // Auto-fit on first paint and whenever the layout changes — unless the user
  // has taken manual zoom control.
  useLayoutEffect(() => {
    if (!mounted) return;
    if (!userZoomed.current) fitToViewport();
  }, [mounted, fitToViewport, collapseTasks]);

  // Keep it fitted across viewport/orientation changes (pre-manual-zoom).
  useEffect(() => {
    if (!mounted) return;
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (!userZoomed.current) fitToViewport();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted, fitToViewport]);

  // Keep the minimap's viewport rectangle honest across zoom, layout and
  // container-size changes (scrolling is handled by onScroll on the canvas).
  useEffect(() => {
    if (mounted) sampleViewport();
  }, [mounted, zoom, width, height, sampleViewport]);

  const zoomBy = (delta: number) => {
    userZoomed.current = true;
    setZoom((z) => Math.min(2, Math.max(0.3, Math.round((z + delta) * 100) / 100)));
  };
  const resetView = () => {
    userZoomed.current = false;
    fitToViewport();
  };

  // Pointer handling — two modes share one set of handlers:
  //   • Node drag  : press on a [data-be-node] element moves only that node.
  //                  Suppresses the native <a> click on release so the node
  //                  isn't navigated to after a drag.
  //   • Canvas pan : press on blank space scrolls the viewport, as before.
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const drag = useRef<{
    id: string;
    startX: number;
    startY: number;
    baseDx: number;
    baseDy: number;
    moved: boolean;
  } | null>(null);

  // Translate viewport pointer coords into SVG coords (accounts for zoom + scroll).
  function toSvgPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return { x: (clientX - rect.left) / zoom, y: (clientY - rect.top) / zoom };
  }

  function toggleCollapsed(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const onPointerDown = (e: React.PointerEvent) => {
    // Brush mode — any press on the canvas starts a stroke.
    if (brushOn) {
      const p = toSvgPoint(e.clientX, e.clientY);
      if (!p) return;
      liveStroke.current = { color: brushColor, width: 2.5, points: [p] };
      forceLive((n) => n + 1);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const target = e.target as HTMLElement;
    // Action affordances (collapse/expand toggle, add-task, edit) handle their
    // own onClick. If we started a drag + pointer-capture here, the capture
    // would re-target the follow-up `click` to the scroll container and the
    // button's handler would never fire — which is exactly why hide/expand
    // appeared dead. Bail so the native click reaches the <g> handler.
    if (target.closest('[data-be-action]')) return;
    const nodeEl = target.closest('[data-be-node]') as HTMLElement | null;
    if (nodeEl) {
      const id = nodeEl.getAttribute('data-be-node') || '';
      // Root is fixed (it's the brand anchor); count chips aren't user-data.
      const kind = nodeEl.getAttribute('data-be-kind');
      if (kind === 'root' || kind === 'count') return;
      const existing = overrides[id] || { dx: 0, dy: 0 };
      drag.current = {
        id,
        startX: e.clientX,
        startY: e.clientY,
        baseDx: existing.dx,
        baseDy: existing.dy,
        moved: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    pan.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (liveStroke.current) {
      e.preventDefault();
      e.stopPropagation();
      const p = toSvgPoint(e.clientX, e.clientY);
      if (!p) return;
      const last = liveStroke.current.points[liveStroke.current.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) < 2) return;
      liveStroke.current.points.push(p);
      forceLive((n) => n + 1);
      return;
    }
    if (drag.current) {
      const dx = (e.clientX - drag.current.startX) / zoom;
      const dy = (e.clientY - drag.current.startY) / zoom;
      if (!drag.current.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) drag.current.moved = true;
      if (drag.current.moved) {
        setOverrides((o) => ({
          ...o,
          [drag.current!.id]: { dx: drag.current!.baseDx + dx, dy: drag.current!.baseDy + dy },
        }));
      }
      return;
    }
    if (!pan.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = pan.current.left - (e.clientX - pan.current.x);
    el.scrollTop = pan.current.top - (e.clientY - pan.current.y);
  };

  const endPointer = (e: React.PointerEvent) => {
    if (liveStroke.current) {
      // Capture the stroke into a local BEFORE clearing the ref. React may run
      // the setBrushStrokes updater during the next render (automatic
      // batching) — by then liveStroke.current is null, which would push a
      // null into the list and crash the polyline map on the following paint.
      const stroke = liveStroke.current;
      liveStroke.current = null;
      if (stroke.points.length >= 2) {
        setBrushStrokes((s) => [...s, stroke]);
      }
      forceLive((n) => n + 1);
      return;
    }
    // Suppress the click on the underlying <a> if the user actually dragged
    // — otherwise releasing the drag opens the task page.
    if (drag.current?.moved) {
      const stopClick = (ev: MouseEvent) => {
        ev.stopPropagation();
        ev.preventDefault();
        window.removeEventListener('click', stopClick, true);
      };
      window.addEventListener('click', stopClick, true);
    }
    drag.current = null;
    pan.current = null;
  };

  function resetLayout() {
    setOverrides({});
  }
  function clearBrush() {
    if (brushStrokes.length === 0) return;
    if (!confirm('Erase all annotations on this view?')) return;
    setBrushStrokes([]);
  }

  const exportSvg = useCallback(() => {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
    clone.insertBefore(bg, clone.firstChild);
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([`<?xml version="1.0"?>\n${xml}`], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pragati-birds-eye-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, [height, width]);

  function requestExpandedSvgExport() {
    if (svgExportPending) return;
    svgExportRestore.current = {
      collapseTasks,
      collapsedIds: new Set(collapsedIds),
    };
    setSvgExportPending(true);
    // The SVG must be laid out from expanded state before it is cloned.
    setCollapseTasks(false);
    setCollapsedIds(new Set());
  }

  useEffect(() => {
    if (!svgExportPending || collapseTasks || collapsedIds.size > 0) return;
    const timer = window.setTimeout(() => {
      exportSvg();
      const restore = svgExportRestore.current;
      if (restore) {
        setCollapseTasks(restore.collapseTasks);
        setCollapsedIds(restore.collapsedIds);
      }
      svgExportRestore.current = null;
      setSvgExportPending(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [svgExportPending, collapseTasks, collapsedIds, exportSvg]);

  function printAsPdf() {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(data.rootLabel)} — Bird's-eye</title>
      <style>@page { size: landscape; margin: 12mm; } body { margin: 0; font-family: -apple-system, system-ui, sans-serif; } header { padding: 12px 16px; border-bottom: 2px solid #1565C0; } header h1 { margin: 0; font-size: 18px; color: #0f172a; } header p { margin: 4px 0 0; font-size: 11px; color: #64748b; } main { padding: 12px; } svg { max-width: 100%; height: auto; } #pragati-print-bar { position: fixed; right: 16px; bottom: 16px; z-index: 99999; display: flex; gap: 8px; font-family: -apple-system, system-ui, sans-serif; } @media print { #pragati-print-bar { display:none !important; } }</style>
      </head><body>
      <header><h1>${escapeHtml(data.rootLabel)} — Bird&apos;s-eye view</h1><p>Generated ${new Date().toLocaleString()}${data.rootSubLabel ? ` · ${escapeHtml(data.rootSubLabel)}` : ''}</p></header>
      <main>${xml}</main>
      <div id="pragati-print-bar"><button onclick="window.print()" style="background:linear-gradient(135deg,#1565C0,#2E7D32);color:#fff;border:0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer">Save as PDF / Print</button><button onclick="window.close()" style="background:#fff;color:#475569;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:600;cursor:pointer">Close</button></div>
      </body></html>`);
    w.document.close();
    w.focus();
  }

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm overlay-in" onClick={onClose}>
      {/* Opening choreography — the card swoops in while the tree itself
          settles from a higher "altitude" (scaled up, slightly transparent)
          down to its fitted size: the literal feeling of a bird's-eye view
          opening up beneath you. GPU-only (transform + opacity). */}
      <style>{`
        @keyframes be-swoop {
          from { opacity: 0; transform: translateY(18px) scale(0.975); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes be-aerial {
          from { opacity: 0; transform: scale(1.32); }
          to   { opacity: 1; transform: scale(1); }
        }
        .be-swoop  { animation: be-swoop 0.42s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .be-aerial { animation: be-aerial 0.7s 0.06s cubic-bezier(0.22, 1, 0.36, 1) both; transform-origin: 50% 16%; }
        .be-node-g { transition: opacity 0.25s ease; }
        @media (prefers-reduced-motion: reduce) {
          .be-swoop, .be-aerial { animation-duration: 0.01ms !important; }
          .be-node-g { transition: none !important; }
        }
      `}</style>
      <div
        className="absolute inset-2 sm:inset-6 rounded-2xl bg-white shadow-2xl flex flex-col be-swoop overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — full-width band above the canvas. Title block left, controls
            right; both wrap independently so neither is clipped on a phone. */}
        <div className="shrink-0 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">
              Bird&apos;s-eye view
            </div>
            <div className="text-base sm:text-lg font-black text-slate-900 leading-tight break-words">
              {data.rootLabel}
            </div>
            {data.rootSubLabel && (
              <div className="text-[11px] text-slate-500 truncate">{data.rootSubLabel}</div>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:shrink-0">
            {/* Find on canvas — dims everything that doesn't match; Enter flies
                to the first hit. `/` focuses from anywhere in the view. */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') jumpToFirstMatch();
                }}
                placeholder="Find  ( / )"
                aria-label="Find a team, project or task on the canvas"
                className="w-[124px] sm:w-[150px] pl-8 pr-7 py-1.5 text-[12px] rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 transition"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
                  title="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {queryNorm && (
              <span className="text-[10px] font-bold text-slate-400 tabular-nums whitespace-nowrap">
                {queryMatchCount} match{queryMatchCount === 1 ? '' : 'es'}
              </span>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={() => {
                userZoomed.current = false;
                setCollapseTasks((v) => !v);
              }}
              title={
                collapseTasks
                  ? 'Expand all projects to show individual tasks'
                  : 'Collapse each project to a task-count summary'
              }
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                collapseTasks
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Layers size={13} /> {collapseTasks ? 'Expand tasks' : 'Group tasks'}
            </button>
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={() => zoomBy(-0.1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Zoom out"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-[11px] font-bold text-slate-600 tabular-nums w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => zoomBy(0.1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Zoom in"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={resetView}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
              title="Reset · fit to screen"
            >
              <Scan size={15} />
            </button>
            {Object.keys(overrides).length > 0 && (
              <button
                onClick={resetLayout}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Reset node positions to the computed layout"
              >
                <RotateCcw size={15} />
              </button>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={() => setBrushOn((v) => !v)}
              title={brushOn ? 'Exit brush — back to pan/drag' : 'Brush — draw notes & arrows on the canvas'}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                brushOn
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Brush size={13} /> Brush
            </button>
            {brushOn && (
              <>
                <div className="flex items-center gap-0.5 mx-0.5">
                  {['#1565C0', '#22c55e', '#f59e0b', '#ef4444', '#0f172a'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setBrushColor(c)}
                      title={`Use ${c}`}
                      className={`w-5 h-5 rounded-full transition-transform ${brushColor === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                      style={{ background: c }}
                      aria-label={`Use ${c}`}
                    />
                  ))}
                </div>
                {brushStrokes.length > 0 && (
                  <button
                    onClick={clearBrush}
                    title="Erase all brush strokes"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <Eraser size={14} />
                  </button>
                )}
              </>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={requestExpandedSvgExport}
              disabled={svgExportPending}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              title="Download SVG with all nodes expanded"
            >
              <Download size={15} className={svgExportPending ? 'animate-pulse' : ''} />
            </button>
            <button
              onClick={printAsPdf}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="Export as PDF"
            >
              <FileDown size={13} />
              <span className="hidden sm:inline">Export PDF</span>
            </button>
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Close"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Canvas — scroll + drag to pan. Inner wrapper is min-w-full so a tree
            narrower than the viewport is centred; a wider one scrolls to both
            edges without clipping. */}
        <div
          ref={scrollRef}
          className={`flex-1 overflow-auto select-none bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] [background-size:22px_22px] bg-slate-50 dark:bg-[#1f1e1d] ${
            brushOn ? 'cursor-crosshair touch-none' : 'cursor-grab active:cursor-grabbing'
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerLeave={endPointer}
          onScroll={sampleViewport}
        >
          <div className="inline-block min-w-full">
            <div className="flex justify-center">
              <div className="be-aerial" style={{ width: width * zoom, height: height * zoom }}>
                <svg
                  ref={svgRef}
                  width={width}
                  height={height}
                  viewBox={`0 0 ${width} ${height}`}
                  xmlns="http://www.w3.org/2000/svg"
                  style={{
                    display: 'block',
                    width: width * zoom,
                    height: height * zoom,
                    touchAction: brushOn ? 'none' : 'auto',
                  }}
                >
                  <defs>
                    {/* Match the app's 3-stop brand gradient so the workspace
                        root reads as the same identity as the sidebar wordmark. */}
                    <linearGradient id="beRootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#1565C0" />
                      <stop offset="50%" stopColor="#1976D2" />
                      <stop offset="100%" stopColor="#2E7D32" />
                    </linearGradient>
                    {/* Soft drop shadow lifts every card off the dotted canvas
                        so the tree reads with depth instead of as flat stickers. */}
                    <filter id="beNodeShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow
                        dx="0"
                        dy="1.5"
                        stdDeviation="2.5"
                        floodColor="#1e293b"
                        floodOpacity="0.10"
                      />
                    </filter>
                  </defs>
                  <g pointerEvents={brushOn ? 'none' : undefined}>
                    {edges.map((e, i) => {
                      const a = nodeIndex.get(e.from);
                      const b = nodeIndex.get(e.to);
                      if (!a || !b) return null;
                      // Clicking a connector expands/hides the subtree hanging
                      // off it — the child's own subtree when the child is
                      // collapsible, otherwise the parent's stack (so a
                      // project → task edge folds the whole task column).
                      const collapsibleChild =
                        b.kind === 'team' || b.kind === 'project' || b.kind === 'phase';
                      const toggleId = collapsibleChild ? b.id : a.id;
                      const d = edgePath(a, b);
                      // Edges follow the spotlight: a connector into a dimmed
                      // node fades with it so lit branches read as paths.
                      const edgeDim = litIds && (!litIds.has(a.id) || !litIds.has(b.id));
                      return (
                        <g
                          key={i}
                          data-be-action="edge-toggle"
                          className="be-node-g"
                          opacity={edgeDim ? 0.18 : 1}
                          onClick={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            toggleCollapsed(toggleId);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <title>Expand / hide this branch</title>
                          {/* Softer, thinner connectors — calmer than a hard slate line. */}
                          <path d={d} fill="none" stroke="#cbd6e4" strokeWidth={1.25} strokeOpacity={0.85} />
                          {/* Invisible wide twin of the connector — a comfortable
                            click target without thickening the visible line. */}
                          <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
                        </g>
                      );
                    })}
                  </g>
                  <g pointerEvents={brushOn ? 'none' : undefined}>
                    {nodes.map((n) => {
                      const navHref =
                        n.kind === 'task'
                          ? `/tasks/${(n.data as BirdsEyeTask).id}`
                          : n.kind === 'project'
                            ? `/projects/${(n.data as BirdsEyeProject).id}`
                            : n.kind === 'team'
                              ? `/teams/${(n.data as BirdsEyeTeam).id}`
                              : null;
                      const isTask = n.kind === 'task';
                      // Task nodes with subtasks are also collapsible — clicking
                      // hides/shows the inline subtask list inside the node.
                      const canCollapse =
                        n.kind === 'team' ||
                        n.kind === 'project' ||
                        n.kind === 'phase' ||
                        (isTask && !!(n.data as BirdsEyeTask)?.subtaskTitles?.length);
                      const canAddTask = n.kind === 'project' || n.kind === 'phase';
                      const isCollapsed = collapsedIds.has(n.id);
                      const dragProps = {
                        'data-be-node': n.id,
                        'data-be-kind': n.kind,
                        style: { cursor: n.kind === 'root' || n.kind === 'count' ? 'default' : 'grab' },
                      } as const;
                      const shape = <NodeShape key={`s-${n.id}`} n={n} />;

                      // Task nodes get an inline edit affordance — a tiny pencil
                      // button in the top-right corner of the card. Clicking it
                      // pops the inline editor with assignee + TCD fields.
                      const editBtn = isTask ? (
                        <g
                          data-be-action="edit"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditing({ node: n, clientX: (e as any).clientX, clientY: (e as any).clientY });
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <circle
                            cx={n.x + n.width - 11}
                            cy={n.y + 11}
                            r={8}
                            fill="#ffffff"
                            stroke="#cbd5e1"
                            strokeWidth={0.8}
                          />
                          <path
                            d={`M ${n.x + n.width - 14} ${n.y + 13} l 4 -4 l 2 2 l -4 4 z M ${n.x + n.width - 10} ${n.y + 9} l 1 1`}
                            stroke="#475569"
                            strokeWidth={0.9}
                            fill="none"
                            strokeLinecap="round"
                          />
                        </g>
                      ) : null;

                      // Collapse/expand toggle — top-right for team/project/phase,
                      // bottom-right for task nodes (which already have the edit
                      // pencil in the top-right corner).
                      const collapseCx = isTask ? n.x + n.width - 11 : n.x + n.width - 11;
                      const collapseCy = isTask ? n.y + n.height - 11 : n.y + 11;
                      const collapseBtn = canCollapse ? (
                        <g
                          data-be-action="collapse"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleCollapsed(n.id);
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <title>{isCollapsed ? 'Expand' : 'Collapse'}</title>
                          <circle
                            cx={collapseCx}
                            cy={collapseCy}
                            r={8}
                            fill="#ffffff"
                            stroke="#cbd5e1"
                            strokeWidth={0.8}
                          />
                          {isCollapsed ? (
                            <>
                              <line
                                x1={collapseCx - 4}
                                y1={collapseCy}
                                x2={collapseCx + 4}
                                y2={collapseCy}
                                stroke="#1565C0"
                                strokeWidth={1.6}
                                strokeLinecap="round"
                              />
                              <line
                                x1={collapseCx}
                                y1={collapseCy - 4}
                                x2={collapseCx}
                                y2={collapseCy + 4}
                                stroke="#1565C0"
                                strokeWidth={1.6}
                                strokeLinecap="round"
                              />
                            </>
                          ) : (
                            <line
                              x1={collapseCx - 4}
                              y1={collapseCy}
                              x2={collapseCx + 4}
                              y2={collapseCy}
                              stroke="#475569"
                              strokeWidth={1.6}
                              strokeLinecap="round"
                            />
                          )}
                        </g>
                      ) : null;

                      // "+" add-task affordance — bottom-right corner of project/phase
                      // nodes. Opens an inline new-task popover that posts to /tasks.
                      const addBtn = canAddTask ? (
                        <g
                          data-be-action="add"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAddingTaskFor({
                              node: n,
                              clientX: (e as any).clientX,
                              clientY: (e as any).clientY,
                            });
                          }}
                          style={{ cursor: 'pointer' }}
                        >
                          <title>Add a task under this {n.kind}</title>
                          <circle cx={n.x + n.width - 11} cy={n.y + n.height - 11} r={8.5} fill="#1565C0" />
                          <line
                            x1={n.x + n.width - 15}
                            y1={n.y + n.height - 11}
                            x2={n.x + n.width - 7}
                            y2={n.y + n.height - 11}
                            stroke="#ffffff"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                          />
                          <line
                            x1={n.x + n.width - 11}
                            y1={n.y + n.height - 15}
                            x2={n.x + n.width - 11}
                            y2={n.y + n.height - 7}
                            stroke="#ffffff"
                            strokeWidth={1.7}
                            strokeLinecap="round"
                          />
                        </g>
                      ) : null;

                      // Clicking the centre of a collapsible card expands/hides
                      // its subtree (same as the − toggle). Navigation for those
                      // cards moves to the dedicated ↗ button so a body click
                      // never surprises with a new tab. Non-collapsible cards
                      // (tasks without subtasks) keep click-to-open.
                      const openBtn =
                        navHref && canCollapse ? (
                          <g
                            data-be-action="open"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(navHref, '_blank', 'noopener,noreferrer');
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <title>
                              Open this{' '}
                              {n.kind === 'team' ? 'team' : n.kind === 'project' ? 'project' : 'task'} page
                            </title>
                            <circle
                              cx={n.x + n.width - 30}
                              cy={n.y + 11}
                              r={8}
                              fill="#ffffff"
                              stroke="#cbd5e1"
                              strokeWidth={0.8}
                            />
                            <path
                              d={`M ${n.x + n.width - 33} ${n.y + 14} L ${n.x + n.width - 27} ${n.y + 8} M ${n.x + n.width - 31} ${n.y + 8} h 4 v 4`}
                              stroke="#475569"
                              strokeWidth={1.1}
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </g>
                        ) : null;

                      const body = canCollapse ? (
                        <g
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            toggleCollapsed(n.id);
                          }}
                        >
                          {shape}
                        </g>
                      ) : navHref ? (
                        <a href={navHref} target="_blank" rel="noreferrer">
                          {shape}
                        </a>
                      ) : (
                        shape
                      );

                      // Spotlight: anything outside the current search/status
                      // focus fades back instead of disappearing — positions
                      // hold steady so spatial memory survives the filter.
                      const dimmed = litIds && !litIds.has(n.id);
                      return (
                        <g key={n.id} {...dragProps} className="be-node-g" opacity={dimmed ? 0.13 : 1}>
                          {body}
                          {openBtn}
                          {collapseBtn}
                          {addBtn}
                          {editBtn}
                        </g>
                      );
                    })}
                  </g>

                  {/* Brush / annotation layer — painted over the tree so notes
                      sit on top. Persisted strokes + the in-progress stroke. */}
                  <g pointerEvents="none">
                    {brushStrokes.map((s, i) => (
                      <polyline
                        key={i}
                        points={s.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={s.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {liveStroke.current && liveStroke.current.points.length > 1 && (
                      <polyline
                        points={liveStroke.current.points.map((p) => `${p.x},${p.y}`).join(' ')}
                        fill="none"
                        stroke={liveStroke.current.color}
                        strokeWidth={liveStroke.current.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.8}
                      />
                    )}
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Minimap — the bird's-eye of the bird's-eye. A scaled silhouette of
            the whole tree with the current viewport framed; click or drag
            anywhere on it to fly there. Only shown when the tree actually
            overflows the viewport — on a fully-visible tree it's just noise. */}
        {(() => {
          if (nodes.length < 9) return null;
          const overflowing =
            viewportBox.cw > 0 && (width * zoom > viewportBox.cw + 4 || height * zoom > viewportBox.ch + 4);
          if (!overflowing) return null;
          const scale = Math.min(176 / width, 132 / height);
          const mmW = Math.max(60, Math.round(width * scale));
          const mmH = Math.max(44, Math.round(height * scale));
          const MM_KIND_FILL: Record<string, string> = {
            root: '#1565C0',
            team: '#a5b4fc',
            phase: '#cbd5e1',
            count: '#e2e8f0',
          };
          const flyTo = (e: React.PointerEvent<SVGSVGElement>) => {
            const el = scrollRef.current;
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            if (!el) return;
            const cx = ((e.clientX - rect.left) / mmW) * width;
            const cy = ((e.clientY - rect.top) / mmH) * height;
            el.scrollLeft = cx * zoom - el.clientWidth / 2;
            el.scrollTop = cy * zoom - el.clientHeight / 2;
          };
          return (
            <div
              className="hidden sm:block absolute right-4 bottom-12 z-10 rounded-xl border border-slate-200 bg-white/92 backdrop-blur shadow-lg overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <svg
                width={mmW}
                height={mmH}
                viewBox={`0 0 ${width} ${height}`}
                className="block cursor-pointer"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  flyTo(e);
                }}
                onPointerMove={(e) => {
                  if (e.buttons === 1) flyTo(e);
                }}
              >
                {nodes.map((n) => {
                  const fill =
                    n.kind === 'task'
                      ? STATUS_STROKE[(n.data as BirdsEyeTask).status] || '#94a3b8'
                      : n.kind === 'project'
                        ? (n.data as BirdsEyeProject).health === 'critical'
                          ? '#fca5a5'
                          : (n.data as BirdsEyeProject).health === 'at_risk'
                            ? '#fcd34d'
                            : '#86efac'
                        : MM_KIND_FILL[n.kind] || '#e2e8f0';
                  return (
                    <rect
                      key={n.id}
                      x={n.x}
                      y={n.y}
                      width={n.width}
                      height={n.height}
                      rx={6}
                      fill={fill}
                      opacity={n.kind === 'task' ? 0.55 : 0.9}
                    />
                  );
                })}
                {/* Current viewport */}
                <rect
                  x={viewportBox.sl / zoom}
                  y={viewportBox.st / zoom}
                  width={viewportBox.cw / zoom}
                  height={viewportBox.ch / zoom}
                  fill="rgba(21,101,192,0.08)"
                  stroke="#1565C0"
                  strokeWidth={Math.max(2, 2 / scale / 2)}
                  rx={8}
                />
              </svg>
            </div>
          );
        })()}

        {/* Footer legend — every chip is also a spotlight: click a status to
            dim every task that isn't in it, click again to clear. */}
        <div className="shrink-0 flex items-center gap-2 px-5 py-2 border-t border-slate-200 text-[10px] text-slate-500 flex-wrap bg-white">
          <span className="font-bold uppercase tracking-widest text-slate-400">Legend</span>
          {[
            { c: STATUS_FILL.done, s: STATUS_STROKE.done, l: 'On track / Done', k: 'done' },
            { c: STATUS_FILL.review, s: STATUS_STROKE.review, l: 'At risk / Review', k: 'review' },
            { c: STATUS_FILL.blocked, s: STATUS_STROKE.blocked, l: 'Critical / Blocked', k: 'blocked' },
            { c: STATUS_FILL.in_progress, s: STATUS_STROKE.in_progress, l: 'In progress', k: 'in_progress' },
            { c: STATUS_FILL.todo, s: STATUS_STROKE.todo, l: 'To do', k: 'todo' },
          ].map((kk) => (
            <button
              key={kk.k}
              type="button"
              aria-pressed={statusFocus === kk.k}
              onClick={() => setStatusFocus((cur) => (cur === kk.k ? null : kk.k))}
              title={
                statusFocus === kk.k
                  ? 'Clear the status spotlight'
                  : `Spotlight ${kk.l.toLowerCase()} tasks — everything else dims`
              }
              className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md transition-colors ${
                statusFocus === kk.k
                  ? 'bg-slate-100 ring-1 ring-slate-300 text-slate-800 font-bold'
                  : statusFocus
                    ? 'opacity-45 hover:opacity-100'
                    : 'hover:bg-slate-50'
              }`}
            >
              <span
                className="inline-block w-3 h-3 rounded"
                style={{ background: kk.c, border: `1.5px solid ${kk.s}` }}
              />
              <span>{kk.l}</span>
            </button>
          ))}
          <span className="ml-auto text-slate-400 hidden lg:inline">
            Click a card / connector to expand-hide · drag to rearrange · ↗ open · ✎ edit ·{' '}
            <kbd className="font-sans font-bold">/</kbd> find · <kbd className="font-sans font-bold">+−</kbd>{' '}
            zoom · <kbd className="font-sans font-bold">F</kbd> fit ·{' '}
            <kbd className="font-sans font-bold">B</kbd> brush · <kbd className="font-sans font-bold">T</kbd>{' '}
            tasks
          </span>
        </div>

        {editing && (
          <BirdsEyeTaskEditor
            task={editing.node.data as BirdsEyeTask}
            anchorX={editing.clientX}
            anchorY={editing.clientY}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              onChange?.();
            }}
          />
        )}

        {addingTaskFor &&
          (() => {
            const node = addingTaskFor.node;
            const projectId =
              node.kind === 'project'
                ? (node.data as BirdsEyeProject).id
                : node.kind === 'phase'
                  ? // Phase-scope view: every task belongs to the same project as
                    // the existing tasks in this view, so we can grab the first.
                    data.tasks[0]?.projectId || ''
                  : '';
            const phaseName = node.kind === 'phase' ? node.label : undefined;
            if (!projectId) return null;
            return (
              <BirdsEyeNewTaskEditor
                projectId={projectId}
                phaseName={phaseName}
                anchorX={addingTaskFor.clientX}
                anchorY={addingTaskFor.clientY}
                onClose={() => setAddingTaskFor(null)}
                onSaved={() => {
                  setAddingTaskFor(null);
                  onChange?.();
                }}
              />
            );
          })()}
      </div>
    </div>,
    document.body,
  );
}

/* ── Inline task editor ────────────────────────────────────────────────────
   Anchored popover for the pencil affordance on task nodes. Two fields only —
   the two the user said matter most from the bird's-eye altitude (assignee
   and TCD/due-date) — so a lead can rebalance work without diving into the
   task page. Persists via the same PATCH /tasks/:id endpoint the task page
   uses, so audit-trail and validation behave identically. */
function BirdsEyeTaskEditor({
  task,
  anchorX,
  anchorY,
  onClose,
  onSaved,
}: {
  task: BirdsEyeTask;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState('');
  const [due, setDue] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pull the live task so we have the canonical assignee/TCD + project to
      // pick the members list from. The bird's-eye payload only carries
      // labels, not ids.
      try {
        const t = await api<any>(`/tasks/${task.id}`);
        if (cancelled) return;
        setAssigneeId(t.assigneeId || '');
        setDue(t.ccTcd || t.dueDate || '');
        const projectId = t.projectId;
        if (projectId) {
          const proj = await api<any>(`/projects/${projectId}`).catch(() => null);
          const teamId = proj?.teamId;
          const users = await api<any[]>(`/users${teamId ? `?teamId=${teamId}` : ''}`).catch(() => []);
          if (!cancelled) setMembers(users.map((u: any) => ({ id: u.id, name: u.name })));
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Could not load task');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [task.id]);

  async function save() {
    setSaving(true);
    setErr('');
    try {
      const body: any = {};
      body.assigneeId = assigneeId || null;
      body.ccTcd = due || null;
      await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      notifyCalendarChange();
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Anchor against the viewport but keep the popover fully on-screen.
  const POP_W = 280;
  const POP_H = 260;
  const left = Math.min(
    Math.max(8, anchorX - POP_W / 2),
    (typeof window !== 'undefined' ? window.innerWidth : 1024) - POP_W - 8,
  );
  const top = Math.min(
    Math.max(8, anchorY + 12),
    (typeof window !== 'undefined' ? window.innerHeight : 768) - POP_H - 8,
  );

  return (
    <>
      {/* Click-away catcher (sits between modal and popover) */}
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] rounded-xl border border-slate-200 bg-white shadow-2xl p-3 modal-in"
        style={{ left, top, width: POP_W }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-blue-600">Quick edit</div>
            <div className="text-[12px] font-bold text-slate-800 truncate" title={task.title}>
              {task.title}
            </div>
          </div>
          <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-2 mb-1">
          Assignee
        </label>
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          ariaLabel="Assignee"
          placeholder="Unassigned"
          options={[
            { value: '', label: 'Unassigned' },
            ...members.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
          Target completion date
        </label>
        <DatePicker value={due || null} onChange={(v) => setDue(v || '')} block />

        {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Check size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Inline new-task editor ────────────────────────────────────────────────
   Quick "+" affordance on project/phase nodes. Two fields only — title and
   assignee — so a lead can spawn work mid-brainstorm without leaving the
   bird's-eye altitude. The new task carries the parent phase as its
   `phaseName` when added from a phase node, so it lands in the right
   column on the next render. */
function BirdsEyeNewTaskEditor({
  projectId,
  phaseName,
  anchorX,
  anchorY,
  onClose,
  onSaved,
}: {
  projectId: string;
  phaseName?: string;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [due, setDue] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const proj = await api<any>(`/projects/${projectId}`).catch(() => null);
        const teamId = proj?.teamId;
        const users = await api<any[]>(`/users${teamId ? `?teamId=${teamId}` : ''}`).catch(() => []);
        if (!cancelled) setMembers(users.map((u: any) => ({ id: u.id, name: u.name })));
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Could not load project');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function save() {
    const t = title.trim();
    if (!t) {
      setErr('Title is required');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const body: any = { projectId, title: t };
      if (assigneeId) body.assigneeId = assigneeId;
      if (due) body.ccTcd = due;
      // Resolve phase name → phaseId from the project payload so the new task
      // lands in the right column. "Unphased" is the synthetic bucket used
      // when a phase has no name — skip lookup in that case.
      if (phaseName && phaseName !== 'Unphased') {
        try {
          const proj = await api<any>(`/projects/${projectId}`);
          const phase = (proj?.phases || []).find((p: any) => p.name === phaseName);
          if (phase?.id) body.phaseId = phase.id;
        } catch {
          /* phase lookup is best-effort */
        }
      }
      await api('/tasks', { method: 'POST', body });
      notifyCalendarChange();
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const POP_W = 300;
  const POP_H = 310;
  const left = Math.min(
    Math.max(8, anchorX - POP_W / 2),
    (typeof window !== 'undefined' ? window.innerWidth : 1024) - POP_W - 8,
  );
  const top = Math.min(
    Math.max(8, anchorY + 12),
    (typeof window !== 'undefined' ? window.innerHeight : 768) - POP_H - 8,
  );

  return (
    <>
      <div className="fixed inset-0 z-[70]" onClick={onClose} />
      <div
        className="fixed z-[71] rounded-xl border border-slate-200 bg-white shadow-2xl p-3 modal-in"
        style={{ left, top, width: POP_W }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-blue-600">Add task</div>
            <div className="text-[12px] font-bold text-slate-800 truncate">
              {phaseName ? `Under "${phaseName}"` : 'Under this project'}
            </div>
          </div>
          <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-700">
            <X size={14} />
          </button>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-2 mb-1">
          Title
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="What needs doing?"
          className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          }}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
          Assignee
        </label>
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          ariaLabel="Assignee"
          placeholder="Unassigned"
          options={[
            { value: '', label: 'Unassigned' },
            ...members.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">
          Target completion date
        </label>
        <DatePicker value={due || null} onChange={(v) => setDue(v || '')} block />

        {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}

        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={12} /> {saving ? 'Adding…' : 'Add task'}
          </button>
        </div>
      </div>
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
