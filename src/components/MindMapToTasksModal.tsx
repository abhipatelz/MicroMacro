'use client';
import { useEffect, useState } from 'react';
import { ModalPortal } from '@/components/ModalPortal';
import { api } from '@/lib/client/api';
import { useIsLead } from '@/components/CurrentUserContext';
import { X, Sparkles, Check, ListChecks } from 'lucide-react';

interface GraphNode {
  id: string;
  text: string;
}
interface GraphEdge {
  from: string;
  to: string;
}

/**
 * Mind-map → tasks. Reads the user's brainstorming graph, asks the transform
 * endpoint for a clean ordered task list (deterministic, with optional Gemini
 * refinement), and lets the user pick which ones to create and where. Creation
 * goes through the normal validated POST /api/tasks — nothing is written until
 * the user clicks Create.
 */
export function MindMapToTasksModal({
  nodes,
  edges,
  onClose,
  onCreated,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onClose: () => void;
  onCreated?: (count: number) => void;
}) {
  const isLead = useIsLead();
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'ai' | 'rule'>('rule');
  const [tasks, setTasks] = useState<{ title: string; sel: boolean }[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [privateToMe, setPrivateToMe] = useState(!isLead);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');
  const [doneCount, setDoneCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [res, projs] = await Promise.all([
          api<{ tasks: { title: string }[]; source: 'ai' | 'rule' }>('/ai/mindmap-to-tasks', {
            method: 'POST',
            body: { nodes, edges },
          }),
          api<any[]>('/projects').catch(() => [] as any[]),
        ]);
        if (cancelled) return;
        setSource(res.source);
        setTasks(res.tasks.map((t) => ({ title: t.title, sel: true })));
        const visible = (projs || []).filter((p: any) => !p.archived);
        setProjects(visible);
        if (visible[0]) setProjectId(visible[0].id);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Could not read the mind map.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCount = tasks.filter((t) => t.sel).length;
  function toggle(i: number) {
    setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, sel: !t.sel } : t)));
  }

  async function createAll() {
    if (!projectId) {
      setErr('Pick a project first.');
      return;
    }
    const chosen = tasks.filter((t) => t.sel);
    if (!chosen.length) return;
    setCreating(true);
    setErr('');
    let created = 0;
    try {
      for (const t of chosen) {
        await api('/tasks', { method: 'POST', body: { projectId, title: t.title, privateToMe } });
        created++;
      }
      setDoneCount(created);
      onCreated?.(created);
    } catch (e: any) {
      setErr(e?.message || `Created ${created}, but the rest failed.`);
      if (created > 0) onCreated?.(created);
    } finally {
      setCreating(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[60] overflow-y-auto overlay-in"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
      >
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="w-full max-w-md modal-in rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-2xl overflow-hidden"
            style={{ background: 'var(--bg-page)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'linear-gradient(135deg, #1565C0, #22C55E)' }}
                >
                  <ListChecks size={17} className="text-white" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold text-slate-800 dark:text-white/90 leading-tight">
                    Turn notes into tasks
                  </div>
                  <div className="text-[11px] text-slate-400 dark:text-white/35">
                    {loading
                      ? 'Reading your mind map…'
                      : source === 'ai'
                        ? 'Refined from your notes'
                        : 'Pulled straight from your notes'}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white/70 transition-colors shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            {doneCount !== null ? (
              <div className="px-5 py-8 text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-3">
                  <Check size={22} className="text-emerald-600 dark:text-emerald-400" strokeWidth={3} />
                </div>
                <div className="text-sm font-bold text-slate-700 dark:text-white/85">
                  Added {doneCount} task{doneCount === 1 ? '' : 's'}
                </div>
                <div className="text-xs text-slate-400 dark:text-white/35 mt-1">
                  They’re on the project now — close to keep brainstorming.
                </div>
                <button onClick={onClose} className="btn-primary mt-5 text-sm">
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="px-5 max-h-[46vh] overflow-y-auto">
                  {loading ? (
                    <div className="space-y-2 py-2">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="h-9 skeleton rounded-lg" />
                      ))}
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="py-8 text-center text-sm text-slate-400 dark:text-white/35">
                      Nothing to turn into tasks yet — add a few thoughts to the mind map first.
                    </div>
                  ) : (
                    <div className="space-y-1.5 py-1">
                      {tasks.map((t, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggle(i)}
                          className={`w-full flex items-start gap-2.5 rounded-lg px-3 py-2 text-left border transition-colors ${
                            t.sel
                              ? 'border-blue-200 dark:border-blue-500/30 bg-blue-50/50 dark:bg-blue-500/[0.07]'
                              : 'border-slate-200 dark:border-white/[0.07] bg-transparent opacity-55'
                          }`}
                        >
                          <span
                            className={`mt-[1px] w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
                              t.sel ? 'border-blue-500 bg-blue-500' : 'border-slate-300 dark:border-white/20'
                            }`}
                          >
                            {t.sel && <Check size={11} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className="text-sm text-slate-700 dark:text-white/80 leading-snug">
                            {t.title}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 mt-1 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
                  {err && <div className="text-xs text-red-500 dark:text-red-400">{err}</div>}
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-white/35 shrink-0">
                      Add to
                    </label>
                    <select
                      value={projectId}
                      onChange={(e) => setProjectId(e.target.value)}
                      disabled={loading || !projects.length}
                      className="flex-1 min-w-0 text-sm rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] px-2.5 py-1.5 text-slate-700 dark:text-white/85 outline-none focus:border-blue-400 disabled:opacity-50"
                    >
                      {projects.length === 0 && <option value="">No projects available</option>}
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {isLead && (
                    <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-white/50 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={privateToMe}
                        onChange={(e) => setPrivateToMe(e.target.checked)}
                        className="rounded border-slate-300 dark:border-white/20"
                      />
                      Keep these private to me (don’t show on the team board)
                    </label>
                  )}
                  <button
                    onClick={createAll}
                    disabled={creating || loading || selectedCount === 0 || !projectId}
                    className="btn-primary w-full justify-center text-sm disabled:opacity-50"
                  >
                    <Sparkles size={14} />
                    {creating ? 'Adding…' : `Add ${selectedCount} task${selectedCount === 1 ? '' : 's'}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
