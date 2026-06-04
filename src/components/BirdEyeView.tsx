'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Download, RotateCcw, Map, StickyNote, Trash2 } from 'lucide-react';
import { api } from '@/lib/client/api';

/* ── Types ───────────────────────────────────────────────────────────────── */

interface BirdEyeNode {
  id: string;
  type: 'project' | 'task' | 'person';
  x: number;
  y: number;
  data: any;
}

interface BirdEyeEdge {
  from: string;
  to: string;
  label?: string;
}

interface Annotation {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface BirdEyeViewProps {
  title: string;
  nodes: BirdEyeNode[];
  edges: BirdEyeEdge[];
  exportedBy: string;
  onClose: () => void;
  onTaskUpdated?: () => void;
}

const NOTE_COLORS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa'];

/* ── Layout helpers ──────────────────────────────────────────────────────── */

const LAYOUT_CX = 600;
const LAYOUT_CY = 400;

/**
 * Radius for a ring of `count` evenly-spaced cards such that neighbours never
 * overlap. The chord between adjacent card centres is 2·r·sin(π/count); we
 * require it to clear the wider card dimension plus a gap, then solve for r and
 * clamp to a sensible minimum. This is what makes the view legible whether a
 * project has 3 tasks or 30 — the ring simply grows instead of cards colliding.
 */
function ringRadius(count: number, cardW: number, cardH: number, gap: number, minR: number): number {
  if (count <= 1) return minR;
  const span = Math.max(cardW, cardH) + gap;
  const needed = span / (2 * Math.sin(Math.PI / count));
  return Math.max(minR, needed);
}

export function getInitialLayout(
  project: any,
  tasks: any[],
): { nodes: BirdEyeNode[]; edges: BirdEyeEdge[] } {
  const cx = LAYOUT_CX;
  const cy = LAYOUT_CY;
  const nodes: BirdEyeNode[] = [];
  const edges: BirdEyeEdge[] = [];
  const T = NODE_SIZE.task;
  const P = NODE_SIZE.person;

  // Project at centre
  nodes.push({ id: `proj-${project.id}`, type: 'project', x: cx, y: cy, data: project });

  // Tasks on a ring whose radius grows with the task count so cards never collide
  const taskR = ringRadius(tasks.length, T.w, T.h, 64, 230);
  tasks.forEach((t, i) => {
    const angle = (i / Math.max(tasks.length, 1)) * 2 * Math.PI - Math.PI / 2;
    nodes.push({
      id: `task-${t.id}`,
      type: 'task',
      x: cx + taskR * Math.cos(angle),
      y: cy + taskR * Math.sin(angle),
      data: t,
    });
    edges.push({ from: `proj-${project.id}`, to: `task-${t.id}` });
  });

  // People on an outer ring — deduplicate by assigneeId
  const seen = new Set<string>();
  const uniquePeople: { id: string; name: string }[] = [];
  tasks.forEach((t) => {
    if (t.assigneeId && !seen.has(t.assigneeId)) {
      seen.add(t.assigneeId);
      uniquePeople.push({ id: t.assigneeId, name: t.assigneeName || 'Unknown' });
    }
  });

  // Outer ring must clear the task ring radially AND keep people apart laterally.
  const peopleR = Math.max(
    taskR + T.h / 2 + P.h / 2 + 90,
    ringRadius(uniquePeople.length, P.w, P.h, 48, 0),
  );
  uniquePeople.forEach((p, i) => {
    const angle = (i / Math.max(uniquePeople.length, 1)) * 2 * Math.PI;
    nodes.push({
      id: `person-${p.id}`,
      type: 'person',
      x: cx + peopleR * Math.cos(angle),
      y: cy + peopleR * Math.sin(angle),
      data: p,
    });
    tasks
      .filter((t) => t.assigneeId === p.id)
      .forEach((t) => {
        edges.push({ from: `task-${t.id}`, to: `person-${p.id}` });
      });
  });

  return { nodes, edges };
}

/** Layout for a team canvas: team at centre, projects in middle ring, members in outer ring. */
export function getTeamLayout(
  team: any,
  projects: any[],
  members: any[],
): { nodes: BirdEyeNode[]; edges: BirdEyeEdge[] } {
  const cx = LAYOUT_CX;
  const cy = LAYOUT_CY;
  const nodes: BirdEyeNode[] = [];
  const edges: BirdEyeEdge[] = [];
  const T = NODE_SIZE.task;
  const P = NODE_SIZE.person;

  nodes.push({ id: `team-${team.id}`, type: 'project', x: cx, y: cy, data: { ...team, name: team.name, code: team.function || 'TEAM' } });

  const projR = ringRadius(projects.length, T.w, T.h, 70, 250);
  projects.forEach((p, i) => {
    const angle = (i / Math.max(projects.length, 1)) * 2 * Math.PI - Math.PI / 2;
    nodes.push({ id: `proj-${p.id}`, type: 'task', x: cx + projR * Math.cos(angle), y: cy + projR * Math.sin(angle), data: p });
    edges.push({ from: `team-${team.id}`, to: `proj-${p.id}` });
  });

  const memR = Math.max(
    projR + T.h / 2 + P.h / 2 + 90,
    ringRadius(members.length, P.w, P.h, 48, 0),
  );
  members.forEach((m, i) => {
    const angle = (i / Math.max(members.length, 1)) * 2 * Math.PI;
    nodes.push({ id: `person-${m.id}`, type: 'person', x: cx + memR * Math.cos(angle), y: cy + memR * Math.sin(angle), data: m });
    edges.push({ from: `team-${team.id}`, to: `person-${m.id}` });
  });

  return { nodes, edges };
}

/* ── Status helpers ──────────────────────────────────────────────────────── */

const STATUS_COLOR: Record<string, string> = {
  todo: '#94a3b8',
  in_progress: '#3b82f6',
  review: '#f59e0b',
  blocked: '#ef4444',
  done: '#22c55e',
  planning: '#94a3b8',
  on_hold: '#f59e0b',
  completed: '#22c55e',
  cancelled: '#ef4444',
};

const STATUS_LABEL: Record<string, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  planning: 'Planning',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TASK_STATUSES = ['todo', 'in_progress', 'review', 'blocked', 'done'] as const;

function statusDot(s: string) {
  return STATUS_COLOR[s] || '#94a3b8';
}

function formatDate(d?: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

function healthBadge(tasks: any[]): { label: string; color: string; bg: string } {
  if (!tasks.length) return { label: 'No tasks', color: '#64748b', bg: '#f8fafc' };
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const done = tasks.filter((t) => t.status === 'done').length;
  if (blocked > 0) return { label: 'Blocked', color: '#dc2626', bg: '#fef2f2' };
  if (done === tasks.length) return { label: 'Complete', color: '#15803d', bg: '#f0fdf4' };
  return { label: 'On track', color: '#1565C0', bg: '#eff6ff' };
}

/* ── Node dimensions ─────────────────────────────────────────────────────── */

const NODE_SIZE: Record<BirdEyeNode['type'], { w: number; h: number }> = {
  project: { w: 200, h: 110 },
  task: { w: 170, h: 82 },
  person: { w: 100, h: 80 },
};

/* The fixed SVG user-space the canvas is drawn in (viewBox). Node coordinates,
   the fit-to-view maths, and the mini-map all reference these. */
const CANVAS_W = 1200;
const CANVAS_H = 800;

/** Fit every node into the canvas, centred, with padding — returns pan + scale. */
function computeFit(ns: BirdEyeNode[]): { pan: { x: number; y: number }; scale: number } {
  if (!ns.length) return { pan: { x: 0, y: 0 }, scale: 1 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of ns) {
    const s = NODE_SIZE[n.type];
    minX = Math.min(minX, n.x - s.w / 2);
    minY = Math.min(minY, n.y - s.h / 2);
    maxX = Math.max(maxX, n.x + s.w / 2);
    maxY = Math.max(maxY, n.y + s.h / 2);
  }
  const pad = 80;
  const cw = Math.max(1, maxX - minX);
  const ch = Math.max(1, maxY - minY);
  const scale = Math.max(0.3, Math.min(1.4, Math.min((CANVAS_W - pad * 2) / cw, (CANVAS_H - pad * 2) / ch)));
  return {
    scale,
    pan: { x: (CANVAS_W - cw * scale) / 2 - minX * scale, y: (CANVAS_H - ch * scale) / 2 - minY * scale },
  };
}

/* ── Presentable SVG export ──────────────────────────────────────────────────
   Renders the same graph as a standalone, light-themed SVG with real titled
   cards (full titles wrapped, not truncated) — a "view from above" artifact
   that prints and shares cleanly, independent of the interactive canvas. */

function xmlEsc(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Greedy word-wrap into at most maxLines lines of ~maxChars chars (ellipsised if longer). */
function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= maxChars) { cur = next; continue; }
    if (cur) lines.push(cur);
    cur = w;
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  // Mark truncation if words were dropped
  const joined = lines.join(' ').replace(/\s+/g, ' ');
  if (joined.replace(/…$/, '').length < String(text || '').replace(/\s+/g, ' ').trim().length) {
    lines[lines.length - 1] = lines[lines.length - 1].replace(/\s+\S*$/, '') + '…';
  }
  return lines;
}

export function buildBirdEyeSvg(
  title: string,
  nodes: BirdEyeNode[],
  edges: BirdEyeEdge[],
  exportedBy: string,
): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const EXPORT_W = { project: 248, task: 214, person: 120 };
  for (const n of nodes) {
    const w = (EXPORT_W as any)[n.type] ?? 200;
    minX = Math.min(minX, n.x - w / 2);
    minY = Math.min(minY, n.y - 60);
    maxX = Math.max(maxX, n.x + w / 2);
    maxY = Math.max(maxY, n.y + 60);
  }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = CANVAS_W; maxY = CANVAS_H; }
  const padX = 64, padTop = 116, padBottom = 64;
  const vbX = minX - padX, vbY = minY - padTop;
  const vbW = (maxX - minX) + padX * 2, vbH = (maxY - minY) + padTop + padBottom;

  const edgeSvg = edges.map((e) => {
    const a = nodes.find((n) => n.id === e.from);
    const b = nodes.find((n) => n.id === e.to);
    if (!a || !b) return '';
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const qx = mx + (b.y - a.y) * 0.07, qy = my - (b.x - a.x) * 0.07;
    return `<path d="M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}" fill="none" stroke="#cbd5e1" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  }).join('');

  const cardSvg = nodes.map((n) => {
    if (n.type === 'person') {
      const name = n.data?.name || 'Unknown';
      return `<g>
        <circle cx="${n.x}" cy="${n.y - 12}" r="23" fill="#1565C0"/>
        <text x="${n.x}" y="${n.y - 12}" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="700" fill="#ffffff">${xmlEsc(initials(name))}</text>
        <text x="${n.x}" y="${n.y + 26}" text-anchor="middle" font-size="12.5" font-weight="600" fill="#334155">${xmlEsc(name)}</text>
      </g>`;
    }
    const isProject = n.type === 'project';
    const heading = isProject ? (n.data?.name || 'Project') : (n.data?.title || 'Task');
    const status = n.data?.status || '';
    const color = STATUS_COLOR[status] || '#94a3b8';
    const kicker = isProject ? (n.data?.code || 'PROJECT') : (STATUS_LABEL[status] || 'Task');
    const lines = wrapLines(heading, isProject ? 28 : 26, 4);
    const lineH = 17, headerH = 24, metaH = 20;
    const cardW = (EXPORT_W as any)[n.type];
    const cardH = headerH + lines.length * lineH + metaH + 14;
    const x = n.x - cardW / 2, y = n.y - cardH / 2;
    const assignee = n.data?.assigneeName || n.data?.ownerName || '';
    const due = formatDate(n.data?.dueDate || n.data?.ccTcd);
    const meta = `${assignee || (isProject ? '' : 'Unassigned')}${(due && due !== '—') ? `${assignee || !isProject ? '  ·  ' : ''}${due}` : ''}`;
    const titleSpans = lines.map((ln, i) => `<tspan x="${x + 15}" dy="${i === 0 ? 0 : lineH}">${xmlEsc(ln)}</tspan>`).join('');
    return `<g>
      <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="13" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
      <rect x="${x}" y="${y}" width="5" height="${cardH}" rx="2.5" fill="${color}"/>
      <circle cx="${x + 18}" cy="${y + 16}" r="3.5" fill="${color}"/>
      <text x="${x + 28}" y="${y + 16}" dominant-baseline="central" font-size="9.5" font-weight="700" letter-spacing="0.6" fill="${color}">${xmlEsc(String(kicker).toUpperCase())}</text>
      <text x="${x + 15}" y="${y + headerH + 13}" font-size="13.5" font-weight="700" fill="#1e293b">${titleSpans}</text>
      ${meta ? `<text x="${x + 15}" y="${y + cardH - 13}" font-size="11" fill="#64748b">${xmlEsc(meta)}</text>` : ''}
    </g>`;
  }).join('');

  const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX.toFixed(0)} ${vbY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}" width="${vbW.toFixed(0)}" height="${vbH.toFixed(0)}" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">
  <rect x="${vbX.toFixed(0)}" y="${vbY.toFixed(0)}" width="${vbW.toFixed(0)}" height="${vbH.toFixed(0)}" fill="#f8fafc"/>
  <text x="${(vbX + 30).toFixed(0)}" y="${(vbY + 46).toFixed(0)}" font-size="23" font-weight="800" fill="#0f172a">${xmlEsc(title)}</text>
  <text x="${(vbX + 30).toFixed(0)}" y="${(vbY + 70).toFixed(0)}" font-size="12.5" font-weight="600" fill="#64748b">Bird's-eye view · Pragati</text>
  ${edgeSvg}
  ${cardSvg}
  <text x="${(vbX + 30).toFixed(0)}" y="${(vbY + vbH - 22).toFixed(0)}" font-size="11" fill="#94a3b8">${exportedBy ? `Exported by ${xmlEsc(exportedBy)} · ` : ''}${xmlEsc(dateStr)}</text>
</svg>`;
}

/** Build the presentable SVG and trigger a browser download. */
export function downloadBirdEyeSvg(title: string, nodes: BirdEyeNode[], edges: BirdEyeEdge[], exportedBy: string) {
  const svg = buildBirdEyeSvg(title, nodes, edges, exportedBy);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(title || 'birds_eye').replace(/\s+/g, '_')}_birds_eye.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function BirdEyeView({
  title,
  nodes: initialNodes,
  edges,
  exportedBy,
  onClose,
  onTaskUpdated,
}: BirdEyeViewProps) {
  /* ── State ── */
  const [nodes, setNodes] = useState<BirdEyeNode[]>(initialNodes);
  // Auto-fit on open so every node is visible and centred regardless of count.
  const initialFit = useMemo(() => computeFit(initialNodes), [initialNodes]);
  const [pan, setPan] = useState(initialFit.pan);
  const [scale, setScale] = useState(initialFit.scale);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [mode, setMode] = useState<'select' | 'note'>('select');
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const draggingNoteRef = useRef<string | null>(null);

  // Drag state
  const draggingNodeRef = useRef<string | null>(null);
  const dragStartRef = useRef<{ mx: number; my: number; nx: number; ny: number } | null>(null);
  // Pan state
  const panningRef = useRef(false);
  const panStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  // SVG ref for export
  const svgRef = useRef<SVGSVGElement>(null);
  // Whether the click landed on a node/note (to suppress canvas deselect)
  const clickOnNodeRef = useRef(false);

  // Animation: nodes drop in from above on mount
  const [landed, setLanded] = useState(false);
  const [edgesVisible, setEdgesVisible] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLanded(true), 60);
    const t2 = setTimeout(() => setEdgesVisible(true), 60 + initialNodes.length * 50 + 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [initialNodes.length]);

  // Dark mode detection
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      setDark(document.documentElement.classList.contains('dark') || mq.matches);
    };
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    mq.addEventListener('change', update);
    return () => { obs.disconnect(); mq.removeEventListener('change', update); };
  }, []);

  /* ── Derived ── */
  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  /* ── Zoom ── */
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(2.5, Math.max(0.3, s - e.deltaY * 0.001)));
  }, []);

  useEffect(() => {
    const el = svgRef.current?.parentElement;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  /* ── Mouse handlers ── */
  function svgCoords(e: React.MouseEvent | MouseEvent) {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      mx: e.clientX - rect.left,
      my: e.clientY - rect.top,
    };
  }

  function onNodeMouseDown(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    clickOnNodeRef.current = true;
    const node = nodes.find((n) => n.id === nodeId)!;
    const { mx, my } = svgCoords(e);
    draggingNodeRef.current = nodeId;
    dragStartRef.current = { mx, my, nx: node.x, ny: node.y };
    setSelectedId(nodeId);
  }

  function onCanvasMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    clickOnNodeRef.current = false;
    if (mode === 'note') {
      const { mx, my } = svgCoords(e);
      const cx = (mx - pan.x) / scale;
      const cy = (my - pan.y) / scale;
      setAnnotations((prev) => [...prev, { id: `note-${Date.now()}`, x: cx - 80, y: cy - 50, text: '', color: noteColor }]);
      return;
    }
    const { mx, my } = svgCoords(e);
    panningRef.current = true;
    panStartRef.current = { mx, my, px: pan.x, py: pan.y };
  }

  function onNoteMouseDown(e: React.MouseEvent, noteId: string) {
    e.stopPropagation();
    clickOnNodeRef.current = true;
    const note = annotations.find((a) => a.id === noteId)!;
    const { mx, my } = svgCoords(e);
    draggingNoteRef.current = noteId;
    dragStartRef.current = { mx, my, nx: note.x, ny: note.y };
  }

  function onMouseMove(e: React.MouseEvent) {
    const { mx, my } = svgCoords(e);
    if (draggingNoteRef.current && dragStartRef.current) {
      const { mx: sx, my: sy, nx, ny } = dragStartRef.current;
      const dx = (mx - sx) / scale;
      const dy = (my - sy) / scale;
      const id = draggingNoteRef.current;
      setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, x: nx + dx, y: ny + dy } : a)));
      return;
    }
    if (draggingNodeRef.current && dragStartRef.current) {
      const { mx: sx, my: sy, nx, ny } = dragStartRef.current;
      const dx = (mx - sx) / scale;
      const dy = (my - sy) / scale;
      const id = draggingNodeRef.current;
      setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x: nx + dx, y: ny + dy } : n)));
    } else if (panningRef.current && panStartRef.current) {
      const { mx: sx, my: sy, px, py } = panStartRef.current;
      setPan({ x: px + (mx - sx), y: py + (my - sy) });
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    draggingNodeRef.current = null;
    draggingNoteRef.current = null;
    dragStartRef.current = null;
    panningRef.current = false;
    panStartRef.current = null;
  }

  function onCanvasDoubleClick() {
    fitView();
  }

  function onCanvasClick() {
    if (!clickOnNodeRef.current) {
      setSelectedId(null);
    }
    clickOnNodeRef.current = false;
  }

  /* ── Reset view — re-fit all nodes, centred ── */
  function fitView() {
    const f = computeFit(nodes);
    setScale(f.scale);
    setPan(f.pan);
  }
  function resetView() {
    fitView();
  }

  /* ── SVG Export — presentable, light-themed, full titles (shared builder) ── */
  function downloadSvg() {
    downloadBirdEyeSvg(title, nodes, edges, exportedBy);
  }

  /* ── Edge path calculation ── */
  function edgePath(fromId: string, toId: string): string {
    const from = nodes.find((n) => n.id === fromId);
    const to   = nodes.find((n) => n.id === toId);
    if (!from || !to) return '';
    const fx = from.x, fy = from.y;
    const tx = to.x,   ty = to.y;
    const mx = (fx + tx) / 2;
    const my = (fy + ty) / 2;
    // Slight curve
    const cx = mx + (ty - fy) * 0.1;
    const cy = my - (tx - fx) * 0.1;
    return `M ${fx} ${fy} Q ${cx} ${cy} ${tx} ${ty}`;
  }

  /* ── Colors ── */
  const bg       = dark ? 'linear-gradient(135deg, #0a0f1e 0%, #0d1526 50%, #0a1520 100%)'
                        : 'linear-gradient(135deg, #f0f9ff 0%, #eff6ff 50%, #eef2ff 100%)';
  const gridLine = dark ? 'rgba(255,255,255,0.04)' : 'rgba(59,130,246,0.07)';
  const ringStroke = dark ? 'rgba(99,179,237,0.08)' : 'rgba(59,130,246,0.10)';
  const edgeStroke = dark ? 'rgba(148,163,184,0.35)' : 'rgba(100,116,139,0.35)';
  const cardBg     = dark ? '#1a2035' : '#ffffff';
  const cardBorder = dark ? 'rgba(255,255,255,0.10)' : '#e2e8f0';
  const textMain   = dark ? 'rgba(255,255,255,0.88)' : '#1e293b';
  const textMuted  = dark ? 'rgba(255,255,255,0.45)' : '#64748b';

  /* ── Render helpers ── */
  const renderNode = (node: BirdEyeNode, index: number) => {
    const size = NODE_SIZE[node.type];
    const isSelected = node.id === selectedId;
    const delay = `${index * 50}ms`;
    const animStyle = landed
      ? { opacity: 1, transform: 'translateY(0px)', transition: `opacity 350ms ease ${delay}, transform 400ms cubic-bezier(0.34,1.56,0.64,1) ${delay}` }
      : { opacity: 0, transform: 'translateY(-80px)', transition: 'none' };

    const selectionGlow = isSelected ? (dark ? '0 0 0 2.5px #3b82f6, 0 8px 32px rgba(59,130,246,0.3)' : '0 0 0 2.5px #3b82f6, 0 8px 24px rgba(59,130,246,0.2)') : (dark ? '0 4px 20px rgba(0,0,0,0.5)' : '0 2px 12px rgba(15,23,42,0.08)');

    const fo = (
      <foreignObject
        key={node.id}
        x={node.x - size.w / 2}
        y={node.y - size.h / 2}
        width={size.w}
        height={size.h}
        style={{ overflow: 'visible', cursor: 'grab' }}
        onMouseDown={(e) => onNodeMouseDown(e, node.id)}
      >
        <div
          // @ts-ignore — xmlns is valid on foreignObject children
          xmlns="http://www.w3.org/1999/xhtml"
          style={{
            width: size.w,
            height: size.h,
            borderRadius: 12,
            background: cardBg,
            border: `1.5px solid ${isSelected ? '#3b82f6' : cardBorder}`,
            boxShadow: selectionGlow,
            overflow: 'hidden',
            userSelect: 'none',
            ...animStyle,
          }}
        >
          {node.type === 'project' && <ProjectCard node={node} dark={dark} textMain={textMain} textMuted={textMuted} tasks={initialNodes.filter((n) => n.type === 'task').map((n) => n.data)} />}
          {node.type === 'task' && <TaskCard node={node} dark={dark} textMain={textMain} textMuted={textMuted} />}
          {node.type === 'person' && <PersonCard node={node} dark={dark} textMain={textMain} textMuted={textMuted} tasks={initialNodes.filter((n) => n.type === 'task').map((n) => n.data)} />}
        </div>
      </foreignObject>
    );
    return fo;
  };

  /* ── Mini-map ── */
  const MINI_W = 140, MINI_H = 90;
  const miniScaleX = MINI_W / CANVAS_W;
  const miniScaleY = MINI_H / CANVAS_H;

  return (
    <div
      className="fixed inset-0 z-50"
      style={{ background: bg }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      {/* ── Keyframe styles ── */}
      <style>{`
        @keyframes birdDrop {
          from { opacity: 0; transform: translateY(-80px); }
          to   { opacity: 1; transform: translateY(0px); }
        }
        @keyframes dashDraw {
          from { stroke-dashoffset: 600; }
          to   { stroke-dashoffset: 0; }
        }
        .be-edge {
          stroke-dasharray: 6 4;
          stroke-dashoffset: 600;
        }
        .be-edge.visible {
          animation: dashDraw 800ms ease forwards;
        }
      `}</style>

      {/* ── Header bar ── */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2.5"
        style={{ background: dark ? 'rgba(10,15,30,0.85)' : 'rgba(255,255,255,0.82)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'}` }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: dark ? 'rgba(59,130,246,0.2)' : '#eff6ff' }}>
            <Map size={13} style={{ color: dark ? '#93c5fd' : '#3b82f6' }} />
          </div>
          <div>
            <div className="text-xs font-bold" style={{ color: textMain }}>{title}</div>
            <div className="text-[10px]" style={{ color: textMuted }}>Bird's Eye View · {nodes.length} nodes · Scroll to zoom · Drag to pan · Add notes</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Note mode toggle */}
          <button
            onClick={() => setMode((m) => m === 'note' ? 'select' : 'note')}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              color: mode === 'note' ? '#1d4ed8' : textMuted,
              background: mode === 'note' ? (dark ? 'rgba(59,130,246,0.2)' : '#eff6ff') : (dark ? 'rgba(255,255,255,0.06)' : '#f8fafc'),
              border: `1px solid ${mode === 'note' ? '#3b82f6' : cardBorder}`,
            }}
            title="Sticky note mode — click anywhere on the canvas to add a note"
          >
            <StickyNote size={11} /> {mode === 'note' ? 'Placing note…' : 'Add note'}
          </button>
          {/* Note color picker — only when note mode is active */}
          {mode === 'note' && (
            <div className="flex items-center gap-1">
              {NOTE_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setNoteColor(c)}
                  className="w-4 h-4 rounded-full transition-transform hover:scale-125"
                  style={{ background: c, outline: noteColor === c ? '2px solid #3b82f6' : 'none', outlineOffset: '1px' }}
                  title={`Use this colour`}
                />
              ))}
            </div>
          )}
          <button
            onClick={resetView}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ color: textMuted, background: dark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${cardBorder}` }}
            title="Reset pan/zoom (or double-click canvas)"
          >
            <RotateCcw size={11} /> Reset view
          </button>
          <button
            onClick={downloadSvg}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ color: textMuted, background: dark ? 'rgba(255,255,255,0.06)' : '#f8fafc', border: `1px solid ${cardBorder}` }}
          >
            <Download size={11} /> Download SVG
          </button>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all"
            style={{ color: textMuted, background: dark ? 'rgba(255,255,255,0.06)' : '#f1f5f9' }}
            title="Close (Esc)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── SVG Canvas ── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
        width="100%"
        height="100%"
        style={{ position: 'absolute', inset: 0, cursor: mode === 'note' ? 'copy' : (panningRef.current ? 'grabbing' : 'default'), overflow: 'visible' }}
        onMouseDown={onCanvasMouseDown}
        onDoubleClick={onCanvasDoubleClick}
        onClick={onCanvasClick}
      >
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={edgeStroke} />
          </marker>
        </defs>

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}>
          {/* ── Altitude rings ── */}
          {[0.30, 0.60, 0.90].map((r, i) => (
            <ellipse
              key={i}
              cx={CANVAS_W / 2}
              cy={CANVAS_H / 2}
              rx={(CANVAS_W / 2) * r}
              ry={(CANVAS_H / 2) * r}
              fill="none"
              stroke={ringStroke}
              strokeWidth="1"
              strokeDasharray="4 8"
            />
          ))}

          {/* ── Perspective grid ── */}
          {Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const x2 = CANVAS_W / 2 + Math.cos(angle) * CANVAS_W;
            const y2 = CANVAS_H / 2 + Math.sin(angle) * CANVAS_H;
            return (
              <line
                key={i}
                x1={CANVAS_W / 2} y1={CANVAS_H / 2}
                x2={x2} y2={y2}
                stroke={gridLine}
                strokeWidth="1"
              />
            );
          })}

          {/* ── Edges ── */}
          {edges.map((edge) => {
            const path = edgePath(edge.from, edge.to);
            if (!path) return null;
            // Choose edge type: task→person = dashed thin, proj→task = dashed medium
            const isToTask = edge.to.startsWith('task-');
            return (
              <path
                key={`${edge.from}→${edge.to}`}
                d={path}
                fill="none"
                stroke={edgeStroke}
                strokeWidth={isToTask ? 1.5 : 1}
                markerEnd="url(#arrow)"
                className={`be-edge ${edgesVisible ? 'visible' : ''}`}
                style={edgesVisible ? { animation: `dashDraw 700ms ease forwards` } : undefined}
              />
            );
          })}

          {/* ── Nodes ── */}
          {nodes.map((n, i) => renderNode(n, i))}

          {/* ── Sticky notes ── */}
          {annotations.map((note) => (
            <foreignObject
              key={note.id}
              x={note.x + pan.x}
              y={note.y + pan.y}
              width={160}
              height={100}
              style={{ transform: `scale(${scale})`, transformOrigin: `${note.x + pan.x}px ${note.y + pan.y}px`, overflow: 'visible', cursor: 'grab' }}
              onMouseDown={(e) => onNoteMouseDown(e as any, note.id)}
            >
              <div
                style={{
                  width: 160, height: 100, background: note.color,
                  borderRadius: 8, padding: '6px 8px', boxShadow: '0 3px 10px rgba(0,0,0,0.15)',
                  display: 'flex', flexDirection: 'column', position: 'relative',
                }}
              >
                <button
                  style={{ position: 'absolute', top: 3, right: 3, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5, padding: 0, lineHeight: 1 }}
                  onClick={(e) => { e.stopPropagation(); setAnnotations((prev) => prev.filter((a) => a.id !== note.id)); }}
                  title="Delete note"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="#374151" strokeWidth="1.5" strokeLinecap="round"/></svg>
                </button>
                <textarea
                  value={note.text}
                  placeholder="Type a note…"
                  onChange={(e) => setAnnotations((prev) => prev.map((a) => a.id === note.id ? { ...a, text: e.target.value } : a))}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                    fontSize: 11, lineHeight: 1.4, color: '#1e293b', fontFamily: 'inherit',
                    padding: '2px 16px 2px 2px', width: '100%',
                  }}
                />
              </div>
            </foreignObject>
          ))}
        </g>
      </svg>

      {/* ── Mini-map ── */}
      <div
        className="absolute bottom-4 right-4 rounded-xl overflow-hidden"
        style={{
          width: MINI_W + 16,
          height: MINI_H + 16,
          background: dark ? 'rgba(15,20,40,0.85)' : 'rgba(255,255,255,0.85)',
          border: `1px solid ${cardBorder}`,
          backdropFilter: 'blur(8px)',
          padding: 8,
        }}
      >
        <div className="text-[9px] font-bold mb-1 uppercase tracking-wider" style={{ color: textMuted }}>Overview</div>
        <svg width={MINI_W} height={MINI_H} viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}>
          {edges.map((edge) => {
            const path = edgePath(edge.from, edge.to);
            return path ? (
              <path key={`mini-${edge.from}→${edge.to}`} d={path} fill="none"
                stroke={dark ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.2)'} strokeWidth="3" />
            ) : null;
          })}
          {nodes.map((n) => {
            const color = n.type === 'project' ? '#3b82f6' : n.type === 'task' ? '#8b5cf6' : '#10b981';
            const r = n.type === 'project' ? 18 : n.type === 'task' ? 12 : 9;
            return <circle key={`mini-${n.id}`} cx={n.x} cy={n.y} r={r} fill={color} opacity={0.7} />;
          })}
          {/* Viewport indicator */}
          <rect
            x={-pan.x / scale}
            y={-pan.y / scale}
            width={CANVAS_W / scale}
            height={CANVAS_H / scale}
            fill="none"
            stroke={dark ? 'rgba(99,179,237,0.5)' : 'rgba(59,130,246,0.4)'}
            strokeWidth="10"
            rx="4"
          />
        </svg>
      </div>

      {/* ── Detail panel ── */}
      {selectedNode && (
        <DetailPanel
          node={selectedNode}
          dark={dark}
          cardBg={cardBg}
          cardBorder={cardBorder}
          textMain={textMain}
          textMuted={textMuted}
          onClose={() => setSelectedId(null)}
          onTaskUpdated={() => { onTaskUpdated?.(); }}
          onNodeUpdate={(updatedData) => {
            setNodes((prev) =>
              prev.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, ...updatedData } } : n))
            );
          }}
        />
      )}
    </div>
  );
}

/* ── Project Card ──────────────────────────────────────────────────────────── */

function ProjectCard({ node, dark, textMain, textMuted, tasks }: {
  node: BirdEyeNode; dark: boolean; textMain: string; textMuted: string; tasks: any[];
}) {
  const health = healthBadge(tasks);
  const doneCount = tasks.filter((t) => t.status === 'done').length;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Gradient header */}
      <div style={{
        padding: '8px 10px 6px',
        background: dark
          ? 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(139,92,246,0.18))'
          : 'linear-gradient(135deg, #eff6ff, #f5f3ff)',
        borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : '#e2e8f0'}`,
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: dark ? '#93c5fd' : '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Project</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: textMain, lineHeight: 1.3, wordBreak: 'break-word' }}>{node.data.name}</div>
      </div>
      {/* Body */}
      <div style={{ padding: '6px 10px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: textMuted }}>{doneCount}/{tasks.length} tasks</span>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: health.bg, color: health.color }}>{health.label}</span>
        </div>
        {node.data.dueDate && (
          <div style={{ fontSize: 9, color: textMuted }}>Due: {formatDate(node.data.dueDate)}</div>
        )}
        {/* Mini progress bar */}
        <div style={{ marginTop: 4, height: 3, borderRadius: 2, background: dark ? 'rgba(255,255,255,0.1)' : '#e2e8f0', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0}%`, background: '#3b82f6', borderRadius: 2, transition: 'width 0.5s ease' }} />
        </div>
      </div>
    </div>
  );
}

/* ── Task Card ─────────────────────────────────────────────────────────────── */

function TaskCard({ node, dark, textMain, textMuted }: {
  node: BirdEyeNode; dark: boolean; textMain: string; textMuted: string;
}) {
  const t = node.data;
  const dotColor = statusDot(t.status);
  const tcd = t.ccTcd || t.dueDate;

  return (
    <div style={{ width: '100%', height: '100%', padding: '8px 10px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: dotColor }}>{STATUS_LABEL[t.status] || t.status}</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: textMain, lineHeight: 1.35, wordBreak: 'break-word' }}>{t.title}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
          {t.assigneeName || 'Unassigned'}
        </span>
        {tcd && <span style={{ fontSize: 9, color: textMuted, fontFamily: 'monospace', flexShrink: 0 }}>{formatDate(tcd)}</span>}
      </div>
    </div>
  );
}

/* ── Person Card ─────────────────────────────────────────────────────────── */

function PersonCard({ node, dark, textMain, textMuted, tasks }: {
  node: BirdEyeNode; dark: boolean; textMain: string; textMuted: string; tasks: any[];
}) {
  const p = node.data;
  const assignedCount = tasks.filter((t) => t.assigneeId === p.id).length;
  const avatarColors = dark
    ? ['#1d4ed8', '#7c3aed', '#0f766e', '#b45309']
    : ['#dbeafe', '#ede9fe', '#d1fae5', '#fef3c7'];
  const avatarFg = dark
    ? ['#93c5fd', '#c4b5fd', '#6ee7b7', '#fde68a']
    : ['#1d4ed8', '#6d28d9', '#065f46', '#92400e'];
  const ci = (p.id?.charCodeAt(0) || 0) % 4;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 6px', gap: 6, overflow: 'hidden' }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%',
        background: avatarColors[ci],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, color: avatarFg[ci],
        flexShrink: 0,
      }}>
        {initials(p.name)}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: textMain, lineHeight: 1.3, wordBreak: 'break-word' }}>{p.name}</div>
        <div style={{ fontSize: 9, color: textMuted, marginTop: 1 }}>{assignedCount} task{assignedCount !== 1 ? 's' : ''}</div>
      </div>
    </div>
  );
}

/* ── Detail Panel ──────────────────────────────────────────────────────────── */

function DetailPanel({ node, dark, cardBg, cardBorder, textMain, textMuted, onClose, onTaskUpdated, onNodeUpdate }: {
  node: BirdEyeNode;
  dark: boolean;
  cardBg: string;
  cardBorder: string;
  textMain: string;
  textMuted: string;
  onClose: () => void;
  onTaskUpdated: () => void;
  onNodeUpdate: (data: any) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [tcd, setTcd] = useState<string>(node.data.ccTcd ? String(node.data.ccTcd).slice(0, 10) : node.data.dueDate ? String(node.data.dueDate).slice(0, 10) : '');
  const [status, setStatus] = useState<string>(node.data.status || 'todo');
  const [err, setErr] = useState('');

  // Reset panel state when the selected node changes
  useEffect(() => {
    setTcd(node.data.ccTcd ? String(node.data.ccTcd).slice(0, 10) : node.data.dueDate ? String(node.data.dueDate).slice(0, 10) : '');
    setStatus(node.data.status || 'todo');
    setErr('');
  }, [node.id]);

  async function saveTask() {
    if (node.type !== 'task') return;
    setSaving(true);
    setErr('');
    try {
      const body: Record<string, string> = {};
      if (status !== node.data.status) body.status = status;
      if (tcd !== (node.data.ccTcd ? String(node.data.ccTcd).slice(0, 10) : node.data.dueDate ? String(node.data.dueDate).slice(0, 10) : '')) {
        body.dueDate = tcd;
      }
      if (Object.keys(body).length === 0) return;
      await api(`/tasks/${node.data.id}`, { method: 'PATCH', body });
      onNodeUpdate({ ...node.data, ...body, status });
      onTaskUpdated();
    } catch (e: any) {
      setErr(e?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const panelBg     = dark ? '#111827' : '#ffffff';
  const inputBg     = dark ? 'rgba(255,255,255,0.06)' : '#f8fafc';
  const inputBorder = dark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';

  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: textMuted, marginBottom: 4, display: 'block' };
  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', fontSize: 12, borderRadius: 8, border: `1px solid ${inputBorder}`, background: inputBg, color: textMain, outline: 'none', boxSizing: 'border-box' };

  return (
    <div
      className="absolute right-0 top-0 bottom-0 z-30"
      style={{
        width: 280,
        background: panelBg,
        borderLeft: `1px solid ${cardBorder}`,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: dark ? '-8px 0 32px rgba(0,0,0,0.4)' : '-4px 0 24px rgba(15,23,42,0.08)',
        animation: 'slideInRight 220ms cubic-bezier(0.22,1,0.36,1)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
      {/* Panel header */}
      <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${cardBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? '#93c5fd' : '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>
            {node.type.charAt(0).toUpperCase() + node.type.slice(1)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: textMain, lineHeight: 1.3, maxWidth: 220, wordBreak: 'break-word' }}>
            {node.type === 'project' ? node.data.name : node.type === 'task' ? node.data.title : node.data.name}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{ width: 26, height: 26, borderRadius: 6, background: dark ? 'rgba(255,255,255,0.08)' : '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: textMuted, flexShrink: 0 }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Panel body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {node.type === 'project' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {node.data.description && (
              <div>
                <span style={labelStyle}>Description</span>
                <div style={{ fontSize: 12, color: textMain, lineHeight: 1.5 }}>{node.data.description}</div>
              </div>
            )}
            <div>
              <span style={labelStyle}>Status</span>
              <div style={{ fontSize: 12, color: textMain, textTransform: 'capitalize' }}>{String(node.data.status || '').replace(/_/g, ' ')}</div>
            </div>
            {node.data.ownerName && (
              <div>
                <span style={labelStyle}>Owner</span>
                <div style={{ fontSize: 12, color: textMain }}>{node.data.ownerName}</div>
              </div>
            )}
            {node.data.dueDate && (
              <div>
                <span style={labelStyle}>Due Date</span>
                <div style={{ fontSize: 12, color: textMain, fontFamily: 'monospace' }}>{formatDate(node.data.dueDate)}</div>
              </div>
            )}
          </div>
        )}

        {node.type === 'task' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <span style={labelStyle}>Assignee</span>
              <div style={{ fontSize: 12, color: textMain }}>{node.data.assigneeName || 'Unassigned'}</div>
            </div>

            <div>
              <label style={labelStyle} htmlFor="be-status">Status</label>
              <select
                id="be-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={labelStyle} htmlFor="be-tcd">Target Completion Date</label>
              <input
                id="be-tcd"
                type="date"
                value={tcd}
                onChange={(e) => setTcd(e.target.value)}
                style={inputStyle}
              />
            </div>

            {node.data.gxpCritical && (
              <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', display: 'inline-block' }}>
                GxP Critical
              </div>
            )}

            {node.data.requiresQaSignoff && (
              <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: '#f5f3ff', color: '#7c3aed', display: 'inline-block', marginTop: -6 }}>
                {node.data.qaSignoffAt ? 'QA Approved ✓' : 'Requires QA Sign-off'}
              </div>
            )}

            {err && <div style={{ fontSize: 11, color: '#ef4444' }}>{err}</div>}

            <button
              onClick={saveTask}
              disabled={saving}
              style={{
                padding: '8px 0', borderRadius: 8, border: 'none', cursor: saving ? 'not-allowed' : 'pointer',
                background: '#3b82f6', color: '#ffffff', fontSize: 12, fontWeight: 700, opacity: saving ? 0.6 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        )}

        {node.type === 'person' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: dark ? 'rgba(59,130,246,0.2)' : '#dbeafe',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 800, color: dark ? '#93c5fd' : '#1d4ed8',
              }}>
                {initials(node.data.name)}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: textMain }}>{node.data.name}</div>
                <div style={{ fontSize: 11, color: textMuted }}>Team member</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
