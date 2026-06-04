'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, Save, RotateCcw, Pencil, Check, Link2, ListChecks } from 'lucide-react';
import { api } from '@/lib/client/api';
import { MindMapToTasksModal } from '@/components/MindMapToTasksModal';

/**
 * Mind Map — a lightweight personal scratch surface for the My Day page.
 *
 * Node-link graph rendered in pure SVG, no external libraries (no react-flow,
 * no tldraw — both would balloon the bundle). Designed for capturing thinking,
 * not full whiteboarding:
 *
 *   - Click empty canvas to add a node
 *   - Drag a node to move it (within the canvas bounds)
 *   - Double-click a node to rename
 *   - Hold the small "link" button on a node and drop on another node to
 *     connect them — that gesture is the closest a single mouse can get to a
 *     touch-friendly "drag to connect"
 *   - Shift+click a connection or node to delete it
 *
 * Persistence — POST /scratch/mindmap saves the whole graph as one JSON
 * document keyed to the current user. There's no per-node REST: this is a
 * single-user surface, the document is small, and the simpler shape pays
 * off in code size and offline behaviour.
 */

interface MMNode { id: string; x: number; y: number; text: string; color?: string }
interface MMEdge { id: string; from: string; to: string }

const COLORS = ['#1565C0', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9'];
const NODE_R = 56; // node radius (px); chosen so 2 lines of text fit

function uid() { return Math.random().toString(36).slice(2, 10); }

/** Tiny "link" icon glyph drawn in pure SVG (so it sits inside the parent
 *  SVG tree rather than as foreignObject — which the React JSX checker
 *  doesn't like because <div xmlns> isn't an HTMLDivElement prop). */
function Link2Icon({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g pointerEvents="none">
      <path
        d={`M ${cx - 3.5} ${cy - 1} a 2 2 0 0 1 2 -2 l 1 0 a 2 2 0 0 1 2 2 M ${cx + 3.5} ${cy + 1} a 2 2 0 0 1 -2 2 l -1 0 a 2 2 0 0 1 -2 -2`}
        stroke={color} strokeWidth={1.25} fill="none" strokeLinecap="round"
      />
    </g>
  );
}

function autoLayoutNew(count: number, width: number, height: number) {
  // Spiral the next node out from centre so a brand-new map populates
  // outward rather than stacking everything on the same coordinate.
  const cx = width / 2, cy = height / 2;
  const r  = 110 + 35 * Math.sqrt(count);
  const t  = count * 0.7;
  return { x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) };
}

export function MindMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 480 });
  const [nodes, setNodes] = useState<MMNode[]>([]);
  const [edges, setEdges] = useState<MMEdge[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState('');
  const [linking, setLinking] = useState<string | null>(null); // node we're dragging a link from
  const [linkCursor, setLinkCursor] = useState<{ x: number; y: number } | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const [toTasksOpen, setToTasksOpen] = useState(false);
  const dirty = useRef(false);

  // Track container size so the canvas grows with the column.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(400, r.width), h: Math.max(380, r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Initial load.
  useEffect(() => {
    api<{ nodes: MMNode[]; edges: MMEdge[]; updatedAt?: string }>('/scratch/mindmap')
      .then((d) => {
        setNodes(d.nodes || []);
        setEdges(d.edges || []);
        if (d.updatedAt) setSavedAt(new Date(d.updatedAt));
      })
      .catch(() => { /* empty map */ });
  }, []);

  // Autosave debounced (1.5s after the last change). Smaller writes, fewer
  // races than save-on-every-action.
  useEffect(() => {
    if (!dirty.current) return;
    const t = setTimeout(() => { void save(); }, 1500);
    return () => clearTimeout(t);
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true);
    try {
      await api('/scratch/mindmap', { method: 'PUT', body: { nodes, edges } });
      setSavedAt(new Date());
      dirty.current = false;
    } catch { /* keep dirty so the next change retries */ }
    finally { setBusy(false); }
  }

  function mark() { dirty.current = true; }

  function addNode(at?: { x: number; y: number }) {
    const pos = at || autoLayoutNew(nodes.length, size.w, size.h);
    const id  = uid();
    setNodes((n) => [...n, { id, x: pos.x, y: pos.y, text: 'New thought', color: COLORS[n.length % COLORS.length] }]);
    setEditing(id);
    setPendingText('New thought');
    mark();
  }

  function deleteNode(id: string) {
    setNodes((n) => n.filter((x) => x.id !== id));
    setEdges((e) => e.filter((x) => x.from !== id && x.to !== id));
    mark();
  }

  function startDrag(e: React.MouseEvent, n: MMNode) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setDragId(n.id);
    setDragOffset({ x: e.clientX - rect.left - n.x, y: e.clientY - rect.top - n.y });
  }

  function onMouseMove(e: React.MouseEvent) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (dragId) {
      setNodes((arr) =>
        arr.map((n) => (n.id === dragId
          ? {
            ...n,
            x: Math.max(NODE_R + 4, Math.min(size.w - NODE_R - 4, mx - dragOffset.x)),
            y: Math.max(NODE_R + 4, Math.min(size.h - NODE_R - 4, my - dragOffset.y)),
          }
          : n)));
      mark();
    } else if (linking) {
      setLinkCursor({ x: mx, y: my });
    }
  }

  function onMouseUp(e: React.MouseEvent) {
    if (linking && linkCursor) {
      // Drop on a node?
      const target = nodes.find((n) => {
        const d = Math.hypot(n.x - linkCursor.x, n.y - linkCursor.y);
        return d <= NODE_R && n.id !== linking;
      });
      if (target && !edges.some((e) => (e.from === linking && e.to === target.id) || (e.from === target.id && e.to === linking))) {
        setEdges((arr) => [...arr, { id: uid(), from: linking!, to: target.id }]);
        mark();
      }
    }
    setDragId(null);
    setLinking(null);
    setLinkCursor(null);
  }

  function onCanvasClick(e: React.MouseEvent) {
    if (dragId || linking) return;
    // Only the bare canvas adds — clicks on nodes bubble-stopped.
    if (e.target === svgRef.current) {
      const rect = svgRef.current!.getBoundingClientRect();
      addNode({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }

  function clearAll() {
    if (!confirm('Clear the whole mind map? This deletes every node and connection.')) return;
    setNodes([]); setEdges([]); mark();
  }

  function commitEdit() {
    if (!editing) return;
    setNodes((arr) => arr.map((n) => (n.id === editing ? { ...n, text: pendingText.trim() || 'Untitled' } : n)));
    setEditing(null); setPendingText('');
    mark();
  }

  function deleteEdge(id: string) {
    setEdges((arr) => arr.filter((e) => e.id !== id));
    mark();
  }

  return (
    <div className="bg-white dark:bg-[#262624] rounded-2xl border border-slate-200/80 dark:border-white/10 overflow-hidden flex flex-col"
      style={{ minHeight: 460 }}>
      <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-emerald-500 flex items-center justify-center">
            <Pencil size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800 dark:text-white/85">Mind map</div>
            <div className="text-[10px] text-slate-400 dark:text-white/30">Tap canvas to add · Drag to move · Link to connect</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {savedAt && (
            <span className="text-[10px] text-slate-400 dark:text-white/30 hidden sm:inline">
              {busy ? 'Saving…' : `Saved ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </span>
          )}
          {nodes.length > 0 && (
            <button onClick={() => setToTasksOpen(true)} title="Turn these notes into tasks"
              className="inline-flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors">
              <ListChecks size={13} /> <span className="hidden sm:inline">To tasks</span>
            </button>
          )}
          <button onClick={() => addNode()} title="Add node"
            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-white/[0.05] transition-colors">
            <Plus size={15} />
          </button>
          <button onClick={() => void save()} title="Save now" disabled={busy}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] disabled:opacity-40 transition-colors">
            <Save size={14} />
          </button>
          <button onClick={clearAll} title="Clear all"
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/[0.08] transition-colors">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative cursor-crosshair">
        <svg
          ref={svgRef}
          width="100%" height="100%"
          viewBox={`0 0 ${size.w} ${size.h}`}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onClick={onCanvasClick}
          style={{ display: 'block' }}
        >
          <defs>
            <pattern id="mindmap-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="0.6" cy="0.6" r="0.6" fill="#cbd5e1" />
            </pattern>
          </defs>
          <rect width={size.w} height={size.h} fill="url(#mindmap-grid)" opacity={0.4} />

          {/* Edges */}
          {edges.map((e) => {
            const a = nodes.find((n) => n.id === e.from);
            const b = nodes.find((n) => n.id === e.to);
            if (!a || !b) return null;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const c1x = (a.x + mx) / 2;
            const c2x = (b.x + mx) / 2;
            return (
              <g key={e.id} className="group" onClick={(ev) => { if (ev.shiftKey) { ev.stopPropagation(); deleteEdge(e.id); } }} style={{ cursor: 'pointer' }}>
                <path d={`M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`}
                  fill="none" stroke="#94a3b8" strokeWidth={1.5} />
                {/* Click target — wider invisible stroke. */}
                <path d={`M ${a.x} ${a.y} C ${c1x} ${a.y}, ${c2x} ${b.y}, ${b.x} ${b.y}`}
                  fill="none" stroke="transparent" strokeWidth={14} />
              </g>
            );
          })}

          {/* In-flight link line */}
          {linking && linkCursor && (() => {
            const a = nodes.find((n) => n.id === linking);
            if (!a) return null;
            return <path d={`M ${a.x} ${a.y} L ${linkCursor.x} ${linkCursor.y}`}
              stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />;
          })()}

          {/* Nodes */}
          {nodes.map((n) => {
            const isLinking = linking === n.id;
            return (
              <g key={n.id}
                onMouseDown={(e) => { e.stopPropagation(); startDrag(e, n); }}
                onClick={(e) => { e.stopPropagation(); if (e.shiftKey) deleteNode(n.id); }}
                onDoubleClick={(e) => { e.stopPropagation(); setEditing(n.id); setPendingText(n.text); }}
                style={{ cursor: dragId === n.id ? 'grabbing' : 'grab' }}
              >
                <circle cx={n.x} cy={n.y} r={NODE_R}
                  fill={n.color || '#1565C0'} fillOpacity={0.12}
                  stroke={n.color || '#1565C0'} strokeWidth={isLinking ? 2.5 : 1.5}
                />
                <foreignObject x={n.x - NODE_R + 6} y={n.y - 18} width={NODE_R * 2 - 12} height={36}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>
                  <div
                    /* @ts-ignore */
                    xmlns="http://www.w3.org/1999/xhtml"
                    style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      textAlign: 'center', fontSize: 11, fontWeight: 700,
                      color: n.color || '#1565C0',
                      lineHeight: 1.2,
                      padding: '0 4px',
                      overflow: 'hidden',
                    }}
                  >
                    {n.text}
                  </div>
                </foreignObject>
                {/* Link handle on the right edge */}
                <circle cx={n.x + NODE_R} cy={n.y} r={9}
                  fill="#fff" stroke={n.color || '#1565C0'} strokeWidth={1.25}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setLinking(n.id);
                    const rect = svgRef.current!.getBoundingClientRect();
                    setLinkCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
                  }}
                  style={{ cursor: 'crosshair' }}
                />
                <Link2Icon cx={n.x + NODE_R} cy={n.y} color={n.color || '#1565C0'} />
              </g>
            );
          })}
        </svg>

        {/* Inline editor */}
        {editing && (() => {
          const n = nodes.find((x) => x.id === editing);
          if (!n) return null;
          // Clamp the editor to the canvas so a node near the right or top
          // edge doesn't push the input off-screen on a phone.
          const EDITOR_W = 160;
          const left = Math.max(4, Math.min(size.w - EDITOR_W - 4, n.x - EDITOR_W / 2));
          const top  = Math.max(4, n.y - 16);
          return (
            <div className="absolute" style={{ left, top, width: EDITOR_W }}>
              <input
                autoFocus
                value={pendingText}
                onChange={(e) => setPendingText(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit();
                  if (e.key === 'Escape') { setEditing(null); setPendingText(''); }
                }}
                className="w-full text-[12px] text-center font-bold rounded-lg border-2 px-1.5 py-1 outline-none bg-white shadow-md"
                style={{ borderColor: n.color || '#1565C0', color: n.color || '#1565C0' }}
              />
            </div>
          );
        })()}

        {/* Empty state */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center max-w-sm">
              <Plus size={28} className="mx-auto mb-2 text-slate-300" />
              <div className="text-sm font-bold text-slate-500">Start a thought</div>
              <div className="text-xs text-slate-400 mt-1">
                Tap anywhere on the canvas to drop a node. Drag it to move, double-click to rename, drag the side handle onto another node to connect them.
              </div>
            </div>
          </div>
        )}
      </div>

      {toTasksOpen && (
        <MindMapToTasksModal
          nodes={nodes.map((n) => ({ id: n.id, text: n.text }))}
          edges={edges.map((e) => ({ from: e.from, to: e.to }))}
          onClose={() => setToTasksOpen(false)}
        />
      )}
    </div>
  );
}
