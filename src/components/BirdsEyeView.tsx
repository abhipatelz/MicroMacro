'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { X, ZoomIn, ZoomOut, Maximize2, Download } from 'lucide-react';

/**
 * Bird's-Eye View — a hierarchical map of a team / project / personal workspace.
 *
 * Renders three levels (team → projects → tasks) as a packed, indented tree
 * laid out left-to-right with curved connector lines. No external graph
 * library — a pure-SVG layout means the bundle stays small and the export
 * pipeline (print → save-as-PDF) sees identical pixels to the on-screen view.
 *
 * Three zoom levels are supported:
 *   1.0 (default) — show all three levels
 *   0.75          — collapse task nodes into a count chip per project
 *   1.25 / 1.5    — magnify for presentation
 *
 * The tree is *deterministic* (alphabetical at each level, then by status)
 * so opening the same view from two different sessions paints the same
 * shape. That's what makes it a useful bird's-eye reference — it changes
 * only when the underlying work changes, never because of layout jitter.
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
}

export interface BirdsEyeData {
  rootLabel: string;          // e.g. "All teams · 4" or "Project: BOT Automation"
  rootSubLabel?: string;
  teams: BirdsEyeTeam[];      // can be empty for project-only view
  projects: BirdsEyeProject[];
  tasks: BirdsEyeTask[];
  /** Which level the root represents — drives node-shape choices. */
  scope: 'workspace' | 'team' | 'project';
}

const STATUS_FILL: Record<string, string> = {
  todo:        '#f1f5f9',
  in_progress: '#dbeafe',
  review:      '#fef3c7',
  blocked:     '#fee2e2',
  done:        '#dcfce7',
};
const STATUS_STROKE: Record<string, string> = {
  todo:        '#94a3b8',
  in_progress: '#3b82f6',
  review:      '#f59e0b',
  blocked:     '#ef4444',
  done:        '#22c55e',
};
const HEALTH_FILL: Record<string, string> = {
  healthy:  '#dcfce7',
  at_risk:  '#fef3c7',
  critical: '#fee2e2',
};
const HEALTH_STROKE: Record<string, string> = {
  healthy:  '#22c55e',
  at_risk:  '#f59e0b',
  critical: '#ef4444',
};

interface PositionedNode {
  kind: 'root' | 'team' | 'project' | 'task' | 'count';
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  sub?: string;
  data?: any;
}

interface Edge { from: string; to: string }

const NODE_WIDTH = { root: 220, team: 200, project: 230, task: 240, count: 110 } as const;
const NODE_HEIGHT = { root: 64, team: 56, project: 56, task: 42, count: 36 } as const;
const COL_GAP    = 90;
const ROW_GAP    = 12;
const SUBTREE_PAD = 24;

function nodeKey(kind: string, id: string) { return `${kind}:${id}`; }

/**
 * Pure layout pass. Returns absolute coordinates for every node + the edges
 * between them. Layout is deterministic (alphabetical) so the export and
 * the on-screen view share pixel coordinates.
 */
function layout(data: BirdsEyeData, opts: { collapseTasks: boolean }): {
  nodes: PositionedNode[];
  edges: Edge[];
  width: number;
  height: number;
} {
  const nodes: PositionedNode[] = [];
  const edges: Edge[] = [];

  // Group projects by team. Projects with no team go under a synthetic
  // "Untethered" bucket so they still appear.
  const projectsByTeam = new Map<string, BirdsEyeProject[]>();
  const teamMap = new Map<string, BirdsEyeTeam>();
  for (const t of data.teams) teamMap.set(t.id, t);
  for (const p of data.projects) {
    const k = p.teamId || '_untethered_';
    if (!projectsByTeam.has(k)) projectsByTeam.set(k, []);
    projectsByTeam.get(k)!.push(p);
  }
  for (const list of projectsByTeam.values()) list.sort((a, b) => a.name.localeCompare(b.name));

  // Group tasks by project. Sort by status (todo → in_progress → review →
  // blocked → done) so the same project always renders its kanban-ish stack
  // the same way.
  const tasksByProject = new Map<string, BirdsEyeTask[]>();
  const STATUS_ORDER: Record<string, number> = { in_progress: 0, review: 1, blocked: 2, todo: 3, done: 4 };
  for (const t of data.tasks) {
    if (!tasksByProject.has(t.projectId)) tasksByProject.set(t.projectId, []);
    tasksByProject.get(t.projectId)!.push(t);
  }
  for (const list of tasksByProject.values()) {
    list.sort((a, b) => {
      const s = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
      return s !== 0 ? s : a.title.localeCompare(b.title);
    });
  }

  // Walk three levels right-to-left, computing each subtree's height first
  // so its parent can centre against it.
  type Subtree = { node: PositionedNode; children: Subtree[]; height: number };

  function buildProjectSubtree(p: BirdsEyeProject): Subtree {
    const tasks = tasksByProject.get(p.id) || [];
    const childW = NODE_WIDTH.task;
    const childH = NODE_HEIGHT.task;
    const children: Subtree[] = [];
    if (opts.collapseTasks && tasks.length > 0) {
      // Single "X tasks" chip instead of all the individual rows.
      const countNode: PositionedNode = {
        kind: 'count', id: `count:${p.id}`,
        x: 0, y: 0, width: NODE_WIDTH.count, height: NODE_HEIGHT.count,
        label: `${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
        sub: `${p.tasksDone}/${p.taskCount} done`,
      };
      children.push({ node: countNode, children: [], height: NODE_HEIGHT.count });
    } else {
      // Render up to TASK_CAP per project. Beyond that the SVG starts to
      // out-scroll a typical viewport; we surface a clear "+N more" chip
      // so it's never silently truncated when shown to leadership.
      const TASK_CAP = 60;
      for (const t of tasks.slice(0, TASK_CAP)) {
        const n: PositionedNode = {
          kind: 'task', id: nodeKey('task', t.id),
          x: 0, y: 0, width: childW, height: childH,
          label: t.title,
          sub: [t.assigneeName, t.status].filter(Boolean).join(' · '),
          data: t,
        };
        children.push({ node: n, children: [], height: childH });
      }
      if (tasks.length > TASK_CAP) {
        const more: PositionedNode = {
          kind: 'count', id: `more:${p.id}`,
          x: 0, y: 0, width: NODE_WIDTH.count, height: NODE_HEIGHT.count,
          label: `+${tasks.length - TASK_CAP} more — group to see all`,
          sub: 'click Group tasks',
        };
        children.push({ node: more, children: [], height: NODE_HEIGHT.count });
      }
    }
    const projectNode: PositionedNode = {
      kind: 'project', id: nodeKey('project', p.id),
      x: 0, y: 0, width: NODE_WIDTH.project, height: NODE_HEIGHT.project,
      label: p.name, sub: `${p.code} · ${p.tasksDone}/${p.taskCount}`, data: p,
    };
    const childrenH = children.length === 0 ? NODE_HEIGHT.project : children.reduce((sum, c) => sum + c.height + ROW_GAP, -ROW_GAP);
    return { node: projectNode, children, height: Math.max(NODE_HEIGHT.project, childrenH) };
  }

  function buildTeamSubtree(team: BirdsEyeTeam, teamProjects: BirdsEyeProject[]): Subtree {
    const teamNode: PositionedNode = {
      kind: 'team', id: nodeKey('team', team.id),
      x: 0, y: 0, width: NODE_WIDTH.team, height: NODE_HEIGHT.team,
      label: team.name, sub: team.ownerName ? `Lead: ${team.ownerName}` : undefined,
      data: team,
    };
    const children = teamProjects.map(buildProjectSubtree);
    const childrenH = children.length === 0 ? NODE_HEIGHT.team : children.reduce((sum, c) => sum + c.height + SUBTREE_PAD, -SUBTREE_PAD);
    return { node: teamNode, children, height: Math.max(NODE_HEIGHT.team, childrenH) };
  }

  // Build the forest.
  const subtrees: Subtree[] = [];
  if (data.scope === 'workspace') {
    const sortedTeams = [...teamMap.values()].sort((a, b) => a.name.localeCompare(b.name));
    for (const t of sortedTeams) subtrees.push(buildTeamSubtree(t, projectsByTeam.get(t.id) || []));
    const untethered = projectsByTeam.get('_untethered_') || [];
    if (untethered.length) {
      const synthetic: BirdsEyeTeam = { id: '_untethered_', name: 'Untethered projects' };
      subtrees.push(buildTeamSubtree(synthetic, untethered));
    }
  } else if (data.scope === 'team') {
    for (const p of data.projects.slice().sort((a, b) => a.name.localeCompare(b.name))) subtrees.push(buildProjectSubtree(p));
  } else {
    // project scope — flatten one level (skip the team column)
    for (const p of data.projects.slice().sort((a, b) => a.name.localeCompare(b.name))) subtrees.push(buildProjectSubtree(p));
  }

  // ── Position pass ──
  const startX = 40;
  let y = 40;

  function placeChildren(parent: PositionedNode, children: Subtree[], childX: number) {
    // Centre the children's vertical range against the parent.
    const totalH = children.reduce((s, c) => s + c.height + ROW_GAP, -ROW_GAP);
    let cy = parent.y + parent.height / 2 - totalH / 2;
    for (const c of children) {
      placeSubtree(c, childX, cy);
      cy += c.height + ROW_GAP;
    }
  }

  function placeSubtree(s: Subtree, x: number, y0: number) {
    s.node.x = x;
    s.node.y = y0 + s.height / 2 - s.node.height / 2;
    nodes.push(s.node);
    if (s.children.length) {
      const childX = x + s.node.width + COL_GAP;
      placeChildren(s.node, s.children, childX);
      for (const c of s.children) {
        edges.push({ from: s.node.id, to: c.node.id });
      }
    }
  }

  // Root column (workspace or project label)
  const rootNode: PositionedNode = {
    kind: 'root', id: 'root',
    x: startX, y: 40, width: NODE_WIDTH.root, height: NODE_HEIGHT.root,
    label: data.rootLabel, sub: data.rootSubLabel,
  };
  const totalH = subtrees.reduce((s, c) => s + c.height + SUBTREE_PAD, -SUBTREE_PAD);
  rootNode.y = 40 + (Math.max(totalH, NODE_HEIGHT.root) - NODE_HEIGHT.root) / 2;
  nodes.push(rootNode);

  // Subtrees fan out to the right of root.
  let cy = 40;
  const childX = startX + NODE_WIDTH.root + COL_GAP;
  for (const s of subtrees) {
    placeSubtree(s, childX, cy);
    edges.push({ from: 'root', to: s.node.id });
    cy += s.height + SUBTREE_PAD;
  }

  // Final dimensions.
  let maxX = 0, maxY = 0;
  for (const n of nodes) {
    if (n.x + n.width > maxX)   maxX = n.x + n.width;
    if (n.y + n.height > maxY)  maxY = n.y + n.height;
  }
  return { nodes, edges, width: maxX + 40, height: Math.max(maxY + 40, cy + 40) };
}

function NodeShape({ n }: { n: PositionedNode }) {
  if (n.kind === 'root') {
    return (
      <g>
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={14}
          fill="url(#beRootGrad)" stroke="#1565C0" strokeWidth={1.5} />
        <text x={n.x + n.width / 2} y={n.y + 24} textAnchor="middle"
          fontSize={14} fontWeight={800} fill="#ffffff">{n.label}</text>
        {n.sub && <text x={n.x + n.width / 2} y={n.y + 44} textAnchor="middle"
          fontSize={11} fill="rgba(255,255,255,0.85)">{n.sub}</text>}
      </g>
    );
  }
  if (n.kind === 'team') {
    return (
      <g>
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={10}
          fill="#eff6ff" stroke="#1d4ed8" strokeWidth={1.25} />
        <text x={n.x + 12} y={n.y + 22} fontSize={12} fontWeight={700} fill="#1e3a8a">{trim(n.label, 24)}</text>
        {n.sub && <text x={n.x + 12} y={n.y + 40} fontSize={10} fill="#3b82f6">{trim(n.sub, 28)}</text>}
      </g>
    );
  }
  if (n.kind === 'project') {
    const p = n.data as BirdsEyeProject;
    const fill = HEALTH_FILL[p?.health || 'healthy'];
    const stroke = HEALTH_STROKE[p?.health || 'healthy'];
    return (
      <g>
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={10}
          fill={fill} stroke={stroke} strokeWidth={1.25} />
        <text x={n.x + 12} y={n.y + 22} fontSize={12} fontWeight={700} fill="#0f172a">{trim(n.label, 26)}</text>
        {n.sub && <text x={n.x + 12} y={n.y + 40} fontSize={10} fill="#475569" fontFamily="ui-monospace,monospace">{trim(n.sub, 30)}</text>}
      </g>
    );
  }
  if (n.kind === 'task') {
    const t = n.data as BirdsEyeTask;
    const fill = STATUS_FILL[t?.status || 'todo'];
    const stroke = STATUS_STROKE[t?.status || 'todo'];
    return (
      <g>
        <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={8}
          fill={fill} stroke={stroke} strokeWidth={1} />
        <text x={n.x + 10} y={n.y + 17} fontSize={11} fontWeight={600} fill="#0f172a">{trim(n.label, 32)}</text>
        {n.sub && <text x={n.x + 10} y={n.y + 31} fontSize={9} fill="#64748b">{trim(n.sub, 36)}</text>}
      </g>
    );
  }
  // count chip
  return (
    <g>
      <rect x={n.x} y={n.y} width={n.width} height={n.height} rx={8}
        fill="#f8fafc" stroke="#cbd5e1" strokeDasharray="3,3" strokeWidth={1} />
      <text x={n.x + n.width / 2} y={n.y + 15} textAnchor="middle"
        fontSize={11} fontWeight={700} fill="#475569">{n.label}</text>
      {n.sub && <text x={n.x + n.width / 2} y={n.y + 28} textAnchor="middle"
        fontSize={9} fill="#64748b">{n.sub}</text>}
    </g>
  );
}

/** Smooth cubic-Bézier between two node anchor points. */
function edgePath(from: PositionedNode, to: PositionedNode): string {
  const x1 = from.x + from.width;
  const y1 = from.y + from.height / 2;
  const x2 = to.x;
  const y2 = to.y + to.height / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

function trim(s: string, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/* ── Component ─────────────────────────────────────────────────────────── */
export function BirdsEyeView({ data, onClose }: { data: BirdsEyeData; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [collapseTasks, setCollapseTasks] = useState(data.tasks.length > 80);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const { nodes, edges, width, height } = useMemo(
    () => layout(data, { collapseTasks }),
    [data, collapseTasks],
  );
  const nodeIndex = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  function exportSvg() {
    if (!svgRef.current) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    // Inline a white background so the saved file isn't transparent.
    clone.insertBefore(
      Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'rect'), {}),
      clone.firstChild,
    );
    const bg = clone.firstChild as SVGRectElement;
    bg.setAttribute('width', String(width));
    bg.setAttribute('height', String(height));
    bg.setAttribute('fill', '#ffffff');
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
    w.document.write(`<!doctype html><html><head><title>${data.rootLabel} — Bird's-eye</title>
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
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm overlay-in" onClick={onClose}>
      <div className="absolute inset-2 sm:inset-8 rounded-2xl bg-white shadow-2xl flex flex-col modal-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header — stacks the title block and the toolbar on phones so the
            buttons stay accessible. On desktop they sit on one line. */}
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Bird&apos;s-eye view</div>
            <div className="text-base font-black text-slate-900 truncate">{data.rootLabel}</div>
            {data.rootSubLabel && <div className="text-[11px] text-slate-400 truncate">{data.rootSubLabel}</div>}
          </div>
          <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap sm:shrink-0">
            <button onClick={() => setCollapseTasks((v) => !v)} title={collapseTasks ? 'Show every task' : 'Collapse tasks'}
              className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
              {collapseTasks ? 'Show tasks' : 'Group tasks'}
            </button>
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Zoom out"><ZoomOut size={15} /></button>
            <span className="text-[11px] font-bold text-slate-600 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2, z + 0.1))} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Zoom in"><ZoomIn size={15} /></button>
            <button onClick={() => setZoom(1)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Reset zoom"><Maximize2 size={15} /></button>
            <span className="w-px h-5 bg-slate-200 mx-1 hidden sm:block" />
            <button onClick={exportSvg} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Save as SVG"><Download size={15} /></button>
            <button onClick={printAsPdf} className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
              <span className="hidden sm:inline">Export PDF</span>
              <span className="sm:hidden">PDF</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Close"><X size={16} /></button>
          </div>
        </div>

        {/* Canvas — scroll inside the modal so very wide trees pan rather than break the layout. */}
        <div className="flex-1 overflow-auto bg-gradient-to-br from-slate-50 to-white">
          <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: width * zoom, height: height * zoom }}>
            <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
              xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
              <defs>
                <linearGradient id="beRootGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%"  stopColor="#1565C0" />
                  <stop offset="100%" stopColor="#2E7D32" />
                </linearGradient>
              </defs>
              {edges.map((e, i) => {
                const a = nodeIndex.get(e.from); const b = nodeIndex.get(e.to);
                if (!a || !b) return null;
                return <path key={i} d={edgePath(a, b)} fill="none" stroke="#cbd5e1" strokeWidth={1.25} />;
              })}
              {nodes.map((n) => {
                const navHref = n.kind === 'task' ? `/tasks/${(n.data as BirdsEyeTask).id}`
                  : n.kind === 'project' ? `/projects/${(n.data as BirdsEyeProject).id}`
                  : n.kind === 'team' ? `/teams/${(n.data as BirdsEyeTeam).id}` : null;
                const shape = <NodeShape key={n.id} n={n} />;
                if (!navHref) return shape;
                return (
                  <a key={n.id} href={navHref} target="_blank" rel="noreferrer" style={{ cursor: 'pointer' }}>
                    {shape}
                  </a>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Footer legend */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-t border-slate-100 text-[10px] text-slate-500 flex-wrap">
          <span className="font-bold uppercase tracking-widest text-slate-400">Legend</span>
          {[
            { c: '#dcfce7', s: '#22c55e', l: 'On track / Done' },
            { c: '#fef3c7', s: '#f59e0b', l: 'At risk / Review' },
            { c: '#fee2e2', s: '#ef4444', l: 'Critical / Blocked' },
            { c: '#dbeafe', s: '#3b82f6', l: 'In progress' },
            { c: '#f1f5f9', s: '#94a3b8', l: 'To do' },
          ].map((k) => (
            <span key={k.l} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded" style={{ background: k.c, border: `1.25px solid ${k.s}` }} />
              <span>{k.l}</span>
            </span>
          ))}
          <span className="ml-auto text-slate-400">Tap a node to open it in a new tab.</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
