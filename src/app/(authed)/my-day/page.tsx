'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { useIsLead } from '@/components/CurrentUserContext';
import { Plus, Check, Trash2, ArrowRight, X, Sparkles } from 'lucide-react';
import { DatePicker } from '@/components/DatePicker';

interface Note { id: string; text: string; done: boolean; promotedTaskId: string | null; createdAt: string; }

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Still going';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function MyDayPage() {
  const isLead = useIsLead();
  const [open, setOpen]   = useState<Note[]>([]);
  const [done, setDone]   = useState<Note[]>([]);
  const [text, setText]   = useState('');
  const [loaded, setLoaded] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [promote, setPromote] = useState<Note | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit(n: Note) { setEditingId(n.id); setEditText(n.text); }
  function cancelEdit() { setEditingId(null); setEditText(''); }
  async function saveEdit(n: Note) {
    const t = editText.trim();
    if (!t || t === n.text) { cancelEdit(); return; }
    setOpen((o) => o.map((x) => (x.id === n.id ? { ...x, text: t } : x)));
    cancelEdit();
    try { await api(`/scratch/${n.id}`, { method: 'PATCH', body: { text: t } }); } finally { load(); }
  }

  async function load() {
    try {
      const res = await api<{ open: Note[]; done: Note[] }>('/scratch');
      setOpen(res.open); setDone(res.done); setLoaded(true);
    } catch { setLoaded(true); }
  }
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setText('');
    // optimistic
    const temp: Note = { id: `tmp-${Date.now()}`, text: t, done: false, promotedTaskId: null, createdAt: new Date().toISOString() };
    setOpen((o) => [temp, ...o]);
    try { await api('/scratch', { method: 'POST', body: { text: t } }); } finally { load(); }
    inputRef.current?.focus();
  }

  async function toggle(n: Note) {
    if (n.done) {
      setDone((d) => d.filter((x) => x.id !== n.id));
      setOpen((o) => [{ ...n, done: false }, ...o]);
    } else {
      setOpen((o) => o.filter((x) => x.id !== n.id));
      setDone((d) => [{ ...n, done: true }, ...d]);
    }
    try { await api(`/scratch/${n.id}`, { method: 'PATCH', body: { done: !n.done } }); } finally { load(); }
  }

  async function remove(n: Note) {
    setOpen((o) => o.filter((x) => x.id !== n.id));
    setDone((d) => d.filter((x) => x.id !== n.id));
    try { await api(`/scratch/${n.id}`, { method: 'DELETE' }); } finally { load(); }
  }

  return (
    <div className="max-w-2xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-5 pt-1">
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles size={12} className="text-blue-400" />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">My Day</span>
        </div>
        <h1 className="text-2xl font-black tracking-tight">
          <span className="brand-shimmer-text" suppressHydrationWarning>{greeting()}.</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          Jot anything on your mind — tap a note to edit, or promote it to a tracked task.
        </p>
      </div>

      {/* Capture */}
      <form onSubmit={add} className="flex gap-2 mb-5">
        <input
          ref={inputRef}
          className="input text-sm"
          placeholder="What's on your mind? Press Enter to add…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
          maxLength={2000}
        />
        <button type="submit" className="btn-primary gap-1.5 shrink-0" disabled={!text.trim()}>
          <Plus size={15} /> Add
        </button>
      </form>

      {/* Open notes */}
      {loaded && open.length === 0 && done.length === 0 && (
        <div className="card p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
            <Sparkles size={22} className="text-blue-400" />
          </div>
          <div className="text-sm font-semibold text-slate-600 mb-1">A clear head starts here</div>
          <div className="text-xs text-slate-400 max-w-xs mx-auto">
            Throw in everything you're holding onto. Unfinished lines carry over to tomorrow on their own.
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {open.map((n) => (
          <div key={n.id} className={`group flex gap-3 bg-white border border-slate-200/80 rounded-xl px-3.5 py-3 fluid-card ${editingId === n.id ? 'items-start' : 'items-center'}`}>
            <button
              onClick={() => toggle(n)}
              aria-label="Mark done"
              className={`w-5 h-5 rounded-md border border-slate-300 hover:border-emerald-400 flex items-center justify-center shrink-0 transition-colors ${editingId === n.id ? 'mt-1' : ''}`}
            />
            {editingId === n.id ? (
              <textarea
                autoFocus
                rows={1}
                className="input flex-1 text-sm py-1 resize-none leading-snug whitespace-pre-wrap break-words overflow-hidden"
                value={editText}
                maxLength={2000}
                onFocus={(e) => {
                  // Grow to fit existing content and place caret at the end.
                  e.currentTarget.style.height = 'auto';
                  e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                  const len = e.currentTarget.value.length;
                  e.currentTarget.setSelectionRange(len, len);
                }}
                onChange={(e) => {
                  setEditText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={(e) => {
                  // Enter saves; Shift+Enter inserts a newline for longer notes.
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(n); }
                  if (e.key === 'Escape') cancelEdit();
                }}
                onBlur={() => saveEdit(n)}
              />
            ) : (
              <span
                className="flex-1 text-sm text-slate-700 break-words cursor-text hover:text-slate-900"
                onClick={() => startEdit(n)}
                title="Tap to edit"
              >
                {n.text}
              </span>
            )}
            {n.promotedTaskId ? (
              <a href={`/tasks/${n.promotedTaskId}`} className="text-[11px] font-semibold text-emerald-600 shrink-0">→ tracked</a>
            ) : isLead && editingId !== n.id ? (
              <button
                onClick={() => setPromote(n)}
                title="Add to a project as a tracked task"
                className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Add to project <ArrowRight size={12} />
              </button>
            ) : null}
            <button onClick={() => remove(n)} aria-label="Delete"
              className="text-slate-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Done */}
      {done.length > 0 && (
        <div className="mt-6">
          <button onClick={() => setShowDone((s) => !s)}
            className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors">
            {showDone ? '▾' : '▸'} Done ({done.length})
          </button>
          {showDone && (
            <div className="space-y-1.5 mt-2">
              {done.map((n) => (
                <div key={n.id} className="group flex items-center gap-3 px-3.5 py-2.5">
                  <button
                    onClick={() => toggle(n)}
                    aria-label="Reopen"
                    className="w-5 h-5 rounded-md bg-emerald-500 border border-emerald-500 flex items-center justify-center shrink-0"
                  >
                    <Check size={12} className="text-white" />
                  </button>
                  <span className="flex-1 text-sm text-slate-400 line-through break-words">{n.text}</span>
                  <button onClick={() => remove(n)} aria-label="Delete"
                    className="text-slate-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {promote && (
        <PromoteModal note={promote} onClose={() => setPromote(null)} onDone={() => { setPromote(null); load(); }} />
      )}
    </div>
  );
}

/* Convert a scratch note into a real, tracked project task. Lead/admin only
   (the API enforces it too). Pick a project; the note's text becomes the
   task title; the note is then marked done and linked. */
function PromoteModal({ note, onClose, onDone }: { note: Note; onClose: () => void; onDone: () => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [projectId, setProjectId] = useState('');
  const [phases, setPhases]   = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [phaseId, setPhaseId]     = useState('');
  const [priority, setPriority]   = useState('medium');
  const [assigneeId, setAssignee] = useState('');
  const [due, setDue]         = useState('');
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api<any[]>('/projects').then((p) => { setProjects(p); if (p[0]) setProjectId(p[0].id); }).catch(() => {});
  }, []);

  // When the chosen project changes, pull its phases + assignable roster so the
  // lead can allocate the task to a phase and a person in one go.
  useEffect(() => {
    if (!projectId) { setPhases([]); setMembers([]); return; }
    setLoadingMeta(true);
    setPhaseId(''); setAssignee('');
    api<any>(`/projects/${projectId}`)
      .then(async (p) => {
        setPhases((p.phases || []).map((ph: any) => ({ id: ph.id, name: ph.name })));
        const roster = await api<any[]>(`/users${p.teamId ? `?teamId=${p.teamId}` : ''}`).catch(() => []);
        setMembers(roster);
      })
      .catch(() => { setPhases([]); setMembers([]); })
      .finally(() => setLoadingMeta(false));
  }, [projectId]);

  async function go() {
    if (!projectId) { setErr('Pick a project.'); return; }
    setSaving(true); setErr('');
    try {
      const body: any = { projectId, title: note.text, priority };
      if (phaseId) body.phaseId = phaseId;
      if (assigneeId) body.assigneeId = assigneeId;
      if (due) body.dueDate = due;
      const task = await api<{ id: string }>('/tasks', { method: 'POST', body });
      await api(`/scratch/${note.id}`, { method: 'PATCH', body: { done: true, promotedTaskId: task.id } });
      onDone();
    } catch (e: any) {
      setErr(e.message || 'Could not create the task.');
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 overlay-in" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 w-full max-w-sm modal-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-base font-bold text-slate-900">Add to project</div>
              <div className="text-xs text-slate-400 mt-0.5">This note becomes a tracked task.</div>
            </div>
            <button onClick={onClose} className="text-slate-300 hover:text-slate-500"><X size={18} /></button>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm text-slate-700 mb-4">{note.text}</div>

          <label className="label">Project</label>
          <select className="select mb-3" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.length === 0 && <option value="">No projects available</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Phase</label>
              <select className="select" value={phaseId} onChange={(e) => setPhaseId(e.target.value)} disabled={loadingMeta || phases.length === 0}>
                <option value="">{phases.length === 0 ? 'No phases' : 'Unassigned'}</option>
                {phases.map((ph) => <option key={ph.id} value={ph.id}>{ph.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="select" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Assign to</label>
              <select className="select" value={assigneeId} onChange={(e) => setAssignee(e.target.value)} disabled={loadingMeta}>
                <option value="">Unassigned</option>
                {members.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Target completion</label>
              <DatePicker value={due} onChange={(v) => setDue(v || '')} />
            </div>
          </div>

          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mt-3">{err}</div>}
          <div className="flex gap-2 mt-5">
            <button onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button onClick={go} disabled={saving || !projectId} className="btn-primary flex-1 justify-center">
              {saving ? 'Creating…' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
