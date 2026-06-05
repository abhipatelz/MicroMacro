'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Scan, Download, FileDown, Layers, RotateCcw, Pencil, Check, Brush, Eraser, Plus } from 'lucide-react';
import { api } from '@/lib/client/api';
import { DatePicker } from '@/components/DatePicker';
import { Select } from '@/components/Select';

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
}

export interface BirdsEyeData {
  rootLabel: string;          // e.g. "Abhi Patel's workspace" or "BOT Automation"
  rootSubLabel?: string;
  teams: BirdsEyeTeam[];      // can be empty for project-only view
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
  todo:        '#f8fafc',
  in_progress: '#eff6ff',
  review:      '#fffbeb',
  blocked:     '#fef2f2',
  done:        '#f0fdf4',
};
const STATUS_STROKE: Record<string, string> = {
  todo:        '#94a3b8',
  in_progress: '#3b82f6',
  review:      '#f59e0b',
  blocked:     '#ef4444',
  done:        '#22c55e',
};
const STATUS_DOT = STATUS_STROKE;
const HEALTH_FILL: Record<string, string> = {
  healthy:  '#f0fdf4',
  at_risk:  '#fffbeb',
  critical: '#fef2f2',
};
const HEALTH_STROKE: Record<string, string> = {
  healthy:  '#16a34a',
  at_risk:  '#d97706',
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
}

interface Edge { from: string; to: string }

// Top-down org-chart geometry. Nodes shrink at deeper levels so a wide tree
// stays scannable from above.
const NODE_WIDTH  = { root: 300, team: 234, project: 224, phase: 210, task: 224, count: 210 } as const;
const NODE_HEIGHT = { root: 78,  team: 64,  project: 70,  phase: 46,  task: 54,  count: 40  } as const;
const LEVEL_GAP_Y = 78;   // vertical distance between depth levels
const SIBLING_GAP_X = 28; // horizontal distance between siblings of the same parent
const SUBTREE_GAP_X = 52; // extra horizontal gap between sibling subtrees
const TASK_STACK_GAP_Y = 10;  // vertical spacing inside a project's task stack
const PADDING = 56;       // canvas padding around the whole tree

function nodeKey(kind: string, id: string) { return `${kind}:${id}`; }

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
    if (next.length <= maxChars) { cur = next; continue; }
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

/**
 * Pure layout pass. Returns absolute coordinates for every node + the edges
 * between them. Deterministic (alphabetical) so the export and the on-screen
 * view share pixel coordinates. Direction is strictly top-down.
 */
function layout(data: BirdsEyeData, opts: { collapseTasks: boolean; collapsedIds?: ReadonlySet<string> }): {
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
        kind: 'count', id: `count:${keyPrefix}`,
        x: 0, y: 0, width: NODE_WIDTH.count, height: NODE_HEIGHT.count,
        label: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
        sub: `${done}/${tasks.length} done`,
      });
      return out;
    }
    const TASK_CAP = 80;
    for (const t of tasks.slice(0, TASK_CAP)) {
      out.push({
        kind: 'task', id: nodeKey('task', t.id),
        x: 0, y: 0, width: NODE_WIDTH.task, height: NODE_HEIGHT.task,
        label: t.title,
        titleLines: wrapText(t.title, 30, 2),
        sub: [t.assigneeName, t.status?.replace(/_/g, ' ')].filter(Boolean).join(' · '),
        data: t,
      });
    }
    if (tasks.length > TASK_CAP) {
      out.push({
        kind: 'count', id: `more:${keyPrefix}`,
        x: 0, y: 0, width: NODE_WIDTH.count, height: NODE_HEIGHT.count,
        label: `+${tasks.length - TASK_CAP} more — use Group tasks`,
      });
    }
    return out;
  }

  // Re-measure a node's height to fit its wrapped title (keeps the box from
  // clipping a two-line task name).
  function fitTaskHeight(n: PositionedNode) {
    const lines = n.titleLines?.length || 1;
    const subRows = n.sub ? 1 : 0;
    n.height = 16 + lines * 15 + subRows * 14;
  }

  const collapsedIds = opts.collapsedIds || new Set<string>();

  function buildProjectSubtree(p: BirdsEyeProject): Subtree {
    const id = nodeKey('project', p.id);
    const collapsed = collapsedIds.has(id);
    const tasks = collapsed ? [] : (tasksByProject.get(p.id) || []);
    const taskNodes = taskStack(tasks, p.id);
    taskNodes.forEach((t) => { if (t.kind === 'task') fitTaskHeight(t); });
    const projectNode: PositionedNode = {
      kind: 'project', id,
      x: 0, y: 0, width: NODE_WIDTH.project, height: NODE_HEIGHT.project,
      label: p.name, titleLines: wrapText(p.name, 28, 2),
      sub: `${p.code} · ${p.tasksDone}/${p.taskCount} done`, data: p,
    };
    return { node: projectNode, children: [], width: NODE_WIDTH.project, tasks: taskNodes };
  }

  function buildTeamSubtree(team: BirdsEyeTeam, teamProjects: BirdsEyeProject[]): Subtree {
    const id = nodeKey('team', team.id);
    const collapsed = collapsedIds.has(id);
    const teamNode: PositionedNode = {
      kind: 'team', id,
      x: 0, y: 0, width: NODE_WIDTH.team, height: NODE_HEIGHT.team,
      label: team.name, titleLines: wrapText(team.name, 26, 2),
      sub: team.ownerName ? `Lead · ${team.ownerName}` : undefined, data: team,
    };
    const children = collapsed ? [] : teamProjects.map(buildProjectSubtree);
    const childrenW = children.length === 0
      ? NODE_WIDTH.team
      : children.reduce((sum, c) => sum + c.width + SIBLING_GAP_X, -SIBLING_GAP_X);
    return { node: teamNode, children, width: Math.max(NODE_WIDTH.team, childrenW) };
  }

  // Project scope: phases become the horizontal level, each owning a task
  // column — so the view reads Project → Phases → Tasks.
  function buildPhaseSubtrees(): Subtree[] {
    const byPhase = new Map<string, BirdsEyeTask[]>();
    const order: string[] = [];
    for (const t of [...data.tasks].sort(sortTasks)) {
      const name = (t.phaseName && t.phaseName.trim()) || 'Unphased';
      if (!byPhase.has(name)) { byPhase.set(name, []); order.push(name); }
      byPhase.get(name)!.push(t);
    }
    // Stable, readable order: named phases alphabetically, "Unphased" last.
    order.sort((a, b) => (a === 'Unphased' ? 1 : b === 'Unphased' ? -1 : a.localeCompare(b)));
    return order.map((name, i) => {
      const phaseId = `phase:${i}`;
      const collapsed = collapsedIds.has(phaseId);
      const tasks = byPhase.get(name)!;
      const visibleTasks = collapsed ? [] : tasks;
      const taskNodes = taskStack(visibleTasks, `phase-${i}`);
      taskNodes.forEach((t) => { if (t.kind === 'task') fitTaskHeight(t); });
      const phaseNode: PositionedNode = {
        kind: 'phase', id: phaseId,
        x: 0, y: 0, width: NODE_WIDTH.phase, height: NODE_HEIGHT.phase,
        label: name, titleLines: wrapText(name, 26, 2),
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
    for (const p of [...data.projects].sort((a, b) => a.name.localeCompare(b.name))) subtrees.push(buildProjectSubtree(p));
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

  const forestW = subtrees.length === 0
    ? NODE_WIDTH.root
    : subtrees.reduce((sum, s) => sum + s.width + SUBTREE_GAP_X, -SUBTREE_GAP_X);
  const totalW = Math.max(NODE_WIDTH.root, forestW);

  const rootNode: PositionedNode = {
    kind: 'root', id: 'root',
    x: PADDING + (totalW - NODE_WIDTH.root) / 2,
    y: startY,
    width: NODE_WIDTH.root, height: NODE_HEIGHT.root,
    label: data.rootLabel, titleLines: wrapText(data.rootLabel, 30, 2), sub: data.rootSubLabel,
  };
  nodes.push(rootNode);

  let cursorX = PADDING + (totalW - forestW) / 2;
  const childTop = startY + NODE_HEIGHT.root + LEVEL_GAP_Y;
  for (const s of subtrees) {
    placeSubtreeAt(s, cursorX, childTop);
    edges.push({ from: 'root', to: s.node.id });
    cursorX += s.width + SUBTREE_GAP_X;
  }

  let maxX = 0, maxY = 0;
  for (const n of nodes) {
    if (n.x + n.width  > maxX) maxX = n.x + n.width;
    if (n.y + n.height > maxY) maxY = n.y + n.height;
  }
  return { nodes, edges, width: maxX + PADDING, height: maxY + PADDING };
}

/* ── Node rendering ────────────────────────────────────────────────────────
   Each level has a distinct silhouette: the workspace root is the boldest, a
   gradient pill; teams/phases are secondary tinted cards; projects carry a
   health edge; tasks are compact status cards. A native <title> on every node
   gives the full, untruncated text on hover. */
function MultiText({ x, lines, fontSize, lineHeight, fill, weight, anchor }: {
  x: number; lines: string[]; fontSize: number; lineHeight: number;
  fill: string; weight: number; anchor?: 'middle' | 'start';
}) {
  return (
    <>
      {lines.map((ln, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lineHeight} fontSize={fontSize} fontWeight={weight} fill={fill}
          textAnchor={anchor || 'start'}>{ln}</tspan>
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
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={16}
          fill="url(#beRootGrad)" stroke="#0f5db5" strokeWidth={1.5} />
        <text textAnchor="middle" y={n.y + (n.sub ? 28 : 34)}>
          <MultiText x={cx} lines={lines} fontSize={15} lineHeight={17} fill="#ffffff" weight={800} anchor="middle" />
        </text>
        {n.sub && <text x={cx} y={n.y + n.height - 14} textAnchor="middle"
          fontSize={11} fill="rgba(255,255,255,0.88)">{n.sub}</text>}
      </g>
    );
  }

  if (n.kind === 'team') {
    return (
      <g>
        <title>{fullTitle}</title>
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={12}
          fill="#eef2ff" stroke="#4f46e5" strokeWidth={1.25} />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill="#4f46e5" />
        <text x={n.x + 14} y={n.y + 22}>
          <MultiText x={n.x + 14} lines={lines} fontSize={13} lineHeight={15} fill="#312e81" weight={700} />
        </text>
        {n.sub && <text x={n.x + 14} y={n.y + n.height - 12} fontSize={10.5} fill="#6366f1">{n.sub}</text>}
      </g>
    );
  }

  if (n.kind === 'phase') {
    return (
      <g>
        <title>{fullTitle}</title>
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={11}
          fill="#f1f5f9" stroke="#64748b" strokeWidth={1.1} />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill="#64748b" />
        <text x={n.x + 13} y={n.y + 19}>
          <MultiText x={n.x + 13} lines={lines} fontSize={12} lineHeight={14} fill="#0f172a" weight={700} />
        </text>
        {n.sub && <text x={n.x + 13} y={n.y + n.height - 11} fontSize={10} fill="#64748b">{n.sub}</text>}
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
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={12}
          fill={fill} stroke={stroke} strokeWidth={1.4} />
        <rect x={n.x} y={n.y} width={4} height={n.height} rx={2} fill={stroke} />
        <text x={n.x + 14} y={n.y + 22}>
          <MultiText x={n.x + 14} lines={lines} fontSize={13} lineHeight={15} fill="#0f172a" weight={700} />
        </text>
        {n.sub && <text x={n.x + 14} y={n.y + n.height - 12} fontSize={10} fill="#475569"
          fontFamily="ui-monospace,monospace">{n.sub}</text>}
      </g>
    );
  }

  if (n.kind === 'task') {
    const t = n.data as BirdsEyeTask;
    const fill = STATUS_FILL[t?.status || 'todo'];
    const stroke = STATUS_STROKE[t?.status || 'todo'];
    const dot = STATUS_DOT[t?.status || 'todo'];
    return (
      <g>
        <title>{fullTitle}</title>
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={10}
          fill={fill} stroke={stroke} strokeWidth={1} />
        <circle cx={n.x + 13} cy={n.y + 16} r={3.5} fill={dot} />
        <text x={n.x + 24} y={n.y + 19}>
          <MultiText x={n.x + 24} lines={lines} fontSize={11.5} lineHeight={14} fill="#0f172a" weight={600} />
        </text>
        {n.sub && <text x={n.x + 13} y={n.y + n.height - 9} fontSize={9.5} fill="#64748b">{n.sub}</text>}
      </g>
    );
  }

  // count chip
  return (
    <g>
      <title>{n.label}</title>
      <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={10}
        fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="4,3" strokeWidth={1} />
      <text x={n.x + n.width / 2} y={n.y + (n.sub ? 17 : 24)} textAnchor="middle"
        fontSize={11} fontWeight={700} fill="#475569">{n.label}</text>
      {n.sub && <text x={n.x + n.width / 2} y={n.y + 31} textAnchor="middle"
        fontSize={9.5} fill="#64748b">{n.sub}</text>}
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
export function BirdsEyeView({ data, onClose, onChange }: {
  data: BirdsEyeData;
  onClose: () => void;
  /** Fires after a Bird's-Eye edit (assignee/TCD) persists — lets the host
   *  page re-fetch its data without forcing a hard reload. */
  onChange?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [collapseTasks, setCollapseTasks] = useState(data.tasks.length > 120);
  const [editing, setEditing] = useState<{ node: PositionedNode; clientX: number; clientY: number } | null>(null);
  const [addingTaskFor, setAddingTaskFor] = useState<{ node: PositionedNode; clientX: number; clientY: number } | null>(null);
  // Per-node drag overrides {id → {dx,dy}} — applied on top of the computed
  // layout. localStorage-backed per scope+root so the user's arrangement is
  // preserved across opens but doesn't bleed between views.
  const overrideKey = `pragati-bve-pos:${data.scope}:${data.rootLabel}`;
  const collapseKey = `pragati-bve-collapsed:${data.scope}:${data.rootLabel}`;
  const brushKey    = `pragati-bve-brush:${data.scope}:${data.rootLabel}`;
  const [overrides, setOverrides] = useState<Record<string, { dx: number; dy: number }>>(() => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(localStorage.getItem(overrideKey) || '{}'); } catch { return {}; }
  });
  // Set of collapsed node ids — when a node is collapsed its subtree (children
  // and/or tasks) is hidden. Persists per scope.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(collapseKey) || '[]')); } catch { return new Set(); }
  });
  // Brush / annotation layer — freeform polylines over the canvas so a lead
  // can sketch on top of the structure during a brainstorm. Persists per scope.
  type BrushStroke = { color: string; width: number; points: { x: number; y: number }[] };
  const [brushOn, setBrushOn] = useState(false);
  const [brushStrokes, setBrushStrokes] = useState<BrushStroke[]>(() => {
    if (typeof window === 'undefined') return [];
    try { return JSON.parse(localStorage.getItem(brushKey) || '[]'); } catch { return []; }
  });
  const [brushColor, setBrushColor] = useState('#1565C0');
  const liveStroke = useRef<BrushStroke | null>(null);
  const [, forceLive] = useState(0); // re-render trigger for live stroke painting
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user has taken manual control of the zoom; until they
  // do, we keep auto-fitting on resize so the first paint always frames the tree.
  const userZoomed = useRef(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') editing ? setEditing(null) : onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose, editing]);

  // Persist overrides whenever they change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(overrideKey, JSON.stringify(overrides)); } catch {}
  }, [overrides, overrideKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(collapseKey, JSON.stringify(Array.from(collapsedIds))); } catch {}
  }, [collapsedIds, collapseKey]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { localStorage.setItem(brushKey, JSON.stringify(brushStrokes)); } catch {}
  }, [brushStrokes, brushKey]);

  const { nodes: baseNodes, edges, width: baseWidth, height: baseHeight } = useMemo(
    () => layout(data, { collapseTasks, collapsedIds }),
    [data, collapseTasks, collapsedIds],
  );

  // Apply drag overrides to the computed layout (and expand canvas if dragged
  // beyond its bounds so edges & scroll still reach the moved node).
  const { nodes, width, height } = useMemo(() => {
    let w = baseWidth, h = baseHeight;
    const arr = baseNodes.map((n) => {
      const o = overrides[n.id];
      if (!o) return n;
      const moved = { ...n, x: n.x + o.dx, y: n.y + o.dy };
      if (moved.x + moved.width  + PADDING > w) w = moved.x + moved.width  + PADDING;
      if (moved.y + moved.height + PADDING > h) h = moved.y + moved.height + PADDING;
      return moved;
    });
    return { nodes: arr, width: w, height: h };
  }, [baseNodes, baseWidth, baseHeight, overrides]);

  const nodeIndex = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

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
    const ro = new ResizeObserver(() => { if (!userZoomed.current) fitToViewport(); });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mounted, fitToViewport]);

  const zoomBy = (delta: number) => {
    userZoomed.current = true;
    setZoom((z) => Math.min(2, Math.max(0.3, Math.round((z + delta) * 100) / 100)));
  };
  const resetView = () => { userZoomed.current = false; fitToViewport(); };

  // Pointer handling — two modes share one set of handlers:
  //   • Node drag  : press on a [data-be-node] element moves only that node.
  //                  Suppresses the native <a> click on release so the node
  //                  isn't navigated to after a drag.
  //   • Canvas pan : press on blank space scrolls the viewport, as before.
  const pan = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; baseDx: number; baseDy: number; moved: boolean } | null>(null);

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
      if (next.has(id)) next.delete(id); else next.add(id);
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
      drag.current = { id, startX: e.clientX, startY: e.clientY, baseDx: existing.dx, baseDy: existing.dy, moved: false };
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
        setOverrides((o) => ({ ...o, [drag.current!.id]: { dx: drag.current!.baseDx + dx, dy: drag.current!.baseDy + dy } }));
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
      const stopClick = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); window.removeEventListener('click', stopClick, true); };
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

  function exportSvg() {
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
  }

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
      <div className="absolute inset-2 sm:inset-6 rounded-2xl bg-white shadow-2xl flex flex-col modal-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Header — full-width band above the canvas. Title block left, controls
            right; both wrap independently so neither is clipped on a phone. */}
        <div className="shrink-0 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between px-5 py-3.5 border-b border-slate-200 bg-white">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Bird&apos;s-eye view</div>
            <div className="text-base sm:text-lg font-black text-slate-900 leading-tight break-words">{data.rootLabel}</div>
            {data.rootSubLabel && <div className="text-[11px] text-slate-500 truncate">{data.rootSubLabel}</div>}
          </div>
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:shrink-0">
            <button onClick={() => { userZoomed.current = false; setCollapseTasks((v) => !v); }}
              title={collapseTasks ? 'Show every task' : 'Collapse each project to a task count'}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
              <Layers size={13} /> {collapseTasks ? 'Show tasks' : 'Group tasks'}
            </button>
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button onClick={() => zoomBy(-0.1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Zoom out"><ZoomOut size={15} /></button>
            <span className="text-[11px] font-bold text-slate-600 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomBy(0.1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Zoom in"><ZoomIn size={15} /></button>
            <button onClick={resetView} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Reset · fit to screen"><Scan size={15} /></button>
            {Object.keys(overrides).length > 0 && (
              <button onClick={resetLayout}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                title="Reset node positions to the computed layout">
                <RotateCcw size={15} />
              </button>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button onClick={() => setBrushOn((v) => !v)}
              title={brushOn ? 'Exit brush — back to pan/drag' : 'Brush — draw notes & arrows on the canvas'}
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${
                brushOn ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}>
              <Brush size={13} /> Brush
            </button>
            {brushOn && (
              <>
                <div className="flex items-center gap-0.5 mx-0.5">
                  {['#1565C0', '#22c55e', '#f59e0b', '#ef4444', '#0f172a'].map((c) => (
                    <button key={c} type="button" onClick={() => setBrushColor(c)} title={`Use ${c}`}
                      className={`w-5 h-5 rounded-full transition-transform ${brushColor === c ? 'ring-2 ring-offset-1 ring-slate-400 scale-110' : 'hover:scale-110'}`}
                      style={{ background: c }} aria-label={`Use ${c}`} />
                  ))}
                </div>
                {brushStrokes.length > 0 && (
                  <button onClick={clearBrush} title="Erase all brush strokes"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
                    <Eraser size={14} />
                  </button>
                )}
              </>
            )}
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button onClick={exportSvg} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Download SVG"><Download size={15} /></button>
            <button onClick={printAsPdf} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors" title="Export as PDF">
              <FileDown size={13} /><span className="hidden sm:inline">Export PDF</span>
            </button>
            <span className="w-px h-5 bg-slate-200 mx-0.5 hidden sm:block" />
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Close"><X size={17} /></button>
          </div>
        </div>

        {/* Canvas — scroll + drag to pan. Inner wrapper is min-w-full so a tree
            narrower than the viewport is centred; a wider one scrolls to both
            edges without clipping. */}
        <div ref={scrollRef}
          className={`flex-1 overflow-auto select-none bg-[radial-gradient(circle_at_1px_1px,#e2e8f0_1px,transparent_0)] [background-size:22px_22px] bg-slate-50 dark:bg-[#1f1e1d] ${
            brushOn ? 'cursor-crosshair touch-none' : 'cursor-grab active:cursor-grabbing'
          }`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerLeave={endPointer}>
          <div className="inline-block min-w-full">
            <div className="flex justify-center">
              <div style={{ width: width * zoom, height: height * zoom }}>
                <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ display: 'block', width: width * zoom, height: height * zoom, touchAction: brushOn ? 'none' : 'auto' }}>
                  <defs>
                    <linearGradient id="beRootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%"  stopColor="#1565C0" />
                      <stop offset="100%" stopColor="#2E7D32" />
                    </linearGradient>
                  </defs>
                  {edges.map((e, i) => {
                    const a = nodeIndex.get(e.from); const b = nodeIndex.get(e.to);
                    if (!a || !b) return null;
                    return <path key={i} d={edgePath(a, b)} fill="none" stroke="#b6c2d4" strokeWidth={1.5} />;
                  })}
                  <g pointerEvents={brushOn ? 'none' : undefined}>
                  {nodes.map((n) => {
                    const navHref = n.kind === 'task' ? `/tasks/${(n.data as BirdsEyeTask).id}`
                      : n.kind === 'project' ? `/projects/${(n.data as BirdsEyeProject).id}`
                      : n.kind === 'team' ? `/teams/${(n.data as BirdsEyeTeam).id}` : null;
                    const isTask = n.kind === 'task';
                    const canCollapse = n.kind === 'team' || n.kind === 'project' || n.kind === 'phase';
                    const canAddTask  = n.kind === 'project' || n.kind === 'phase';
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
                          e.preventDefault(); e.stopPropagation();
                          setEditing({ node: n, clientX: (e as any).clientX, clientY: (e as any).clientY });
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <circle cx={n.x + n.width - 11} cy={n.y + 11} r={8} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.8} />
                        <path d={`M ${n.x + n.width - 14} ${n.y + 13} l 4 -4 l 2 2 l -4 4 z M ${n.x + n.width - 10} ${n.y + 9} l 1 1`}
                          stroke="#475569" strokeWidth={0.9} fill="none" strokeLinecap="round" />
                      </g>
                    ) : null;

                    // Collapse/expand toggle — top-right inside team/project/phase
                    // nodes. Click hides the subtree without losing what's there.
                    const collapseBtn = canCollapse ? (
                      <g
                        data-be-action="collapse"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCollapsed(n.id); }}
                        style={{ cursor: 'pointer' }}
                      >
                        <title>{isCollapsed ? 'Expand' : 'Hide children'}</title>
                        <circle cx={n.x + n.width - 11} cy={n.y + 11} r={8.5} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.8} />
                        {isCollapsed ? (
                          // "+" shows when collapsed (click to expand)
                          <>
                            <line x1={n.x + n.width - 15} y1={n.y + 11} x2={n.x + n.width - 7} y2={n.y + 11} stroke="#1565C0" strokeWidth={1.6} strokeLinecap="round" />
                            <line x1={n.x + n.width - 11} y1={n.y + 7}  x2={n.x + n.width - 11} y2={n.y + 15} stroke="#1565C0" strokeWidth={1.6} strokeLinecap="round" />
                          </>
                        ) : (
                          // "−" shows when expanded (click to hide)
                          <line x1={n.x + n.width - 15} y1={n.y + 11} x2={n.x + n.width - 7} y2={n.y + 11} stroke="#475569" strokeWidth={1.6} strokeLinecap="round" />
                        )}
                      </g>
                    ) : null;

                    // "+" add-task affordance — bottom-right corner of project/phase
                    // nodes. Opens an inline new-task popover that posts to /tasks.
                    const addBtn = canAddTask ? (
                      <g
                        data-be-action="add"
                        onClick={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          setAddingTaskFor({ node: n, clientX: (e as any).clientX, clientY: (e as any).clientY });
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        <title>Add a task under this {n.kind}</title>
                        <circle cx={n.x + n.width - 11} cy={n.y + n.height - 11} r={8.5} fill="#1565C0" />
                        <line x1={n.x + n.width - 15} y1={n.y + n.height - 11} x2={n.x + n.width - 7} y2={n.y + n.height - 11} stroke="#ffffff" strokeWidth={1.7} strokeLinecap="round" />
                        <line x1={n.x + n.width - 11} y1={n.y + n.height - 15} x2={n.x + n.width - 11} y2={n.y + n.height - 7}  stroke="#ffffff" strokeWidth={1.7} strokeLinecap="round" />
                      </g>
                    ) : null;

                    if (!navHref) {
                      return (
                        <g key={n.id} {...dragProps}>
                          {shape}
                          {collapseBtn}
                          {addBtn}
                          {editBtn}
                        </g>
                      );
                    }
                    return (
                      <g key={n.id} {...dragProps}>
                        <a href={navHref} target="_blank" rel="noreferrer">
                          {shape}
                        </a>
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
                      <polyline key={i}
                        points={s.points.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none" stroke={s.color} strokeWidth={s.width}
                        strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                    {liveStroke.current && liveStroke.current.points.length > 1 && (
                      <polyline
                        points={liveStroke.current.points.map(p => `${p.x},${p.y}`).join(' ')}
                        fill="none" stroke={liveStroke.current.color} strokeWidth={liveStroke.current.width}
                        strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
                    )}
                  </g>
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Footer legend */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-2 border-t border-slate-200 text-[10px] text-slate-500 flex-wrap bg-white">
          <span className="font-bold uppercase tracking-widest text-slate-400">Legend</span>
          {[
            { c: STATUS_FILL.done,        s: STATUS_STROKE.done,        l: 'On track / Done' },
            { c: STATUS_FILL.review,      s: STATUS_STROKE.review,      l: 'At risk / Review' },
            { c: STATUS_FILL.blocked,     s: STATUS_STROKE.blocked,     l: 'Critical / Blocked' },
            { c: STATUS_FILL.in_progress, s: STATUS_STROKE.in_progress, l: 'In progress' },
            { c: STATUS_FILL.todo,        s: STATUS_STROKE.todo,        l: 'To do' },
          ].map((k) => (
            <span key={k.l} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded" style={{ background: k.c, border: `1.5px solid ${k.s}` }} />
              <span>{k.l}</span>
            </span>
          ))}
          <span className="ml-auto text-slate-400 hidden sm:inline">Drag a node to rearrange · pencil to edit · tap to open.</span>
        </div>

        {editing && (
          <BirdsEyeTaskEditor
            task={editing.node.data as BirdsEyeTask}
            anchorX={editing.clientX}
            anchorY={editing.clientY}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); onChange?.(); }}
          />
        )}

        {addingTaskFor && (() => {
          const node = addingTaskFor.node;
          const projectId = node.kind === 'project' ? (node.data as BirdsEyeProject).id
            : node.kind === 'phase'
              // Phase-scope view: every task belongs to the same project as
              // the existing tasks in this view, so we can grab the first.
              ? (data.tasks[0]?.projectId || '')
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
              onSaved={() => { setAddingTaskFor(null); onChange?.(); }}
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
function BirdsEyeTaskEditor({ task, anchorX, anchorY, onClose, onSaved }: {
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
    return () => { cancelled = true; };
  }, [task.id]);

  async function save() {
    setSaving(true); setErr('');
    try {
      const body: any = {};
      body.assigneeId = assigneeId || null;
      body.ccTcd = due || null;
      await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  // Anchor against the viewport but keep the popover fully on-screen.
  const POP_W = 280;
  const POP_H = 260;
  const left = Math.min(Math.max(8, anchorX - POP_W / 2), (typeof window !== 'undefined' ? window.innerWidth : 1024) - POP_W - 8);
  const top  = Math.min(Math.max(8, anchorY + 12), (typeof window !== 'undefined' ? window.innerHeight : 768) - POP_H - 8);

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
            <div className="text-[12px] font-bold text-slate-800 truncate" title={task.title}>{task.title}</div>
          </div>
          <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-700"><X size={14} /></button>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-2 mb-1">Assignee</label>
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          ariaLabel="Assignee"
          placeholder="Unassigned"
          options={[{ value: '', label: 'Unassigned' }, ...members.map((u) => ({ value: u.id, label: u.name }))]}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">Target completion date</label>
        <DatePicker value={due || null} onChange={(v) => setDue(v || '')} block />

        {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}

        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
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
function BirdsEyeNewTaskEditor({ projectId, phaseName, anchorX, anchorY, onClose, onSaved }: {
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
    return () => { cancelled = true; };
  }, [projectId]);

  async function save() {
    const t = title.trim();
    if (!t) { setErr('Title is required'); return; }
    setSaving(true); setErr('');
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
        } catch { /* phase lookup is best-effort */ }
      }
      await api('/tasks', { method: 'POST', body });
      onSaved();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  const POP_W = 300;
  const POP_H = 310;
  const left = Math.min(Math.max(8, anchorX - POP_W / 2), (typeof window !== 'undefined' ? window.innerWidth : 1024) - POP_W - 8);
  const top  = Math.min(Math.max(8, anchorY + 12), (typeof window !== 'undefined' ? window.innerHeight : 768) - POP_H - 8);

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
          <button onClick={onClose} className="p-0.5 text-slate-400 hover:text-slate-700"><X size={14} /></button>
        </div>

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-2 mb-1">Title</label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="What needs doing?"
          className="w-full text-sm px-2.5 py-1.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">Assignee</label>
        <Select
          value={assigneeId}
          onChange={setAssigneeId}
          ariaLabel="Assignee"
          placeholder="Unassigned"
          options={[{ value: '', label: 'Unassigned' }, ...members.map((u) => ({ value: u.id, label: u.name }))]}
        />

        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mt-3 mb-1">Target completion date</label>
        <DatePicker value={due || null} onChange={(v) => setDue(v || '')} block />

        {err && <div className="mt-2 text-[11px] text-red-600">{err}</div>}

        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving || !title.trim()}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
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
