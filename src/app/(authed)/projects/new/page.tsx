'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Plus, X, GripVertical, ChevronDown, ChevronRight, Sparkles, Trash2, BookmarkPlus } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Phase { id: string; name: string; tasks: string[] }

interface CustomTemplate {
  id: string;
  name: string;
  description: string;
  createdBy: string;
  createdByName: string;
  phases: Array<{ name: string; tasks: Array<{ title: string; type?: string }> }>;
  createdAt: string;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2, 9); }

// Templates the typical QA-IT lead actually reaches for, ordered by frequency.
// Generic 'Custom / Blank' is always the first option so a lead can start fast
// with a project that doesn't match any pre-baked template.
const LIFECYCLE_GROUPS = [
  {
    label: 'Quality Informatics',
    description: 'Day-to-day QA-IT lifecycles',
    options: [
      { value: 'generic',         label: 'Custom / Blank',         hint: 'Start from scratch' },
      { value: 'change_control',  label: 'Change Control',         hint: 'Planned change to a validated system' },
      { value: 'software_change', label: 'Software Change',        hint: 'Code/configuration release with QA gate' },
      { value: 'deviation',       label: 'Deviation',              hint: 'Unplanned event needing investigation' },
      { value: 'capa',            label: 'CAPA',                   hint: 'Corrective + preventive action' },
      { value: 'deviation_capa',  label: 'Deviation + CAPA',       hint: 'Combined deviation→CAPA flow' },
    ]
  },
  {
    label: 'Life Sciences',
    description: 'GxP-validated lifecycles',
    options: [
      { value: 'csv',               label: 'CSV / GAMP 5',          hint: 'Computer System Validation' },
      { value: 'sop',               label: 'SOP Development',       hint: 'Author → review → train → release' },
      { value: 'audit',             label: 'Audit',                 hint: 'Internal or external GxP audit' },
      { value: 'validation',        label: 'Validation',            hint: 'Process / method validation' },
    ]
  },
  {
    label: 'General',
    description: 'Non-GxP projects',
    options: [
      { value: 'agile_sprint',     label: 'Agile Sprint',     hint: 'Two-week development iteration' },
      { value: 'software_release', label: 'Software Release', hint: 'Generic release pipeline' },
      { value: 'product_launch',   label: 'Product Launch',   hint: 'Go-to-market workflow' },
      { value: 'research',         label: 'Research',         hint: 'Scoping → analysis → reporting' },
    ]
  },
];

function phasesFromTemplate(template: any): Phase[] {
  if (!template?.phases) return [];
  return template.phases.map((ph: any) => ({
    id: uid(),
    name: ph.name,
    tasks: ph.tasks.map((t: any) => (typeof t === 'string' ? t : t.title)),
  }));
}

function phasesFromCustomTemplate(template: CustomTemplate): Phase[] {
  return template.phases.map(ph => ({
    id: uid(),
    name: ph.name,
    tasks: ph.tasks.map(t => t.title),
  }));
}

/* ── Save-as-template dialog ──────────────────────────────────────────────── */
function SaveTemplateDialog({
  phases,
  onClose,
  onSaved,
}: {
  phases: Phase[];
  onClose: () => void;
  onSaved: (t: CustomTemplate) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    if (!name.trim()) { setErr('Template name is required.'); return; }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        phases: phases.map(ph => ({
          name: ph.name,
          tasks: ph.tasks.map(t => ({ title: t })),
        })),
      };
      const saved = await api<CustomTemplate>('/workflow-templates', { method: 'POST', body: payload });
      onSaved(saved);
    } catch (e: any) {
      setErr(e.message || 'Failed to save template.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">Save as template</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Save the current {phases.length} stage{phases.length === 1 ? '' : 's'} as a reusable workspace template. Everyone on the team can use it.
        </p>
        <div>
          <label className="label">Template name *</label>
          <input
            className="input"
            placeholder="e.g. Standard CSV Validation"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Description <span className="normal-case font-normal text-slate-300">(optional)</span></label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="What is this template for?"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
        {err && <p className="text-xs text-red-600">{err}</p>}
        <div className="flex items-center gap-3 pt-1">
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save template'}
          </button>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ── Phase editor row ─────────────────────────────────────────────────────── */
function PhaseRow({
  phase, index, total,
  onChange, onDelete, onMoveUp, onMoveDown,
}: {
  phase: Phase; index: number; total: number;
  onChange: (p: Phase) => void; onDelete: () => void;
  onMoveUp: () => void; onMoveDown: () => void;
}) {
  const [open, setOpen] = useState(index < 3);
  const [newTask, setNewTask] = useState('');
  const taskRef = useRef<HTMLInputElement>(null);

  function addTask() {
    if (!newTask.trim()) return;
    onChange({ ...phase, tasks: [...phase.tasks, newTask.trim()] });
    setNewTask('');
    taskRef.current?.focus();
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white transition-all">
      {/* Phase header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50/80">
        <div className="flex flex-col gap-0.5 shrink-0 cursor-grab text-slate-300">
          <GripVertical size={14} />
        </div>
        <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{index + 1}</span>
        <input
          className="flex-1 text-sm font-semibold text-slate-800 bg-transparent outline-none border-b border-transparent focus:border-blue-400 transition-colors placeholder:text-slate-300"
          value={phase.name}
          onChange={e => onChange({ ...phase, name: e.target.value })}
          placeholder="Stage name…"
        />
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} disabled={index === 0}
            className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors" title="Move up">
            ↑
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1}
            className="p-1 rounded text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors" title="Move down">
            ↓
          </button>
          <button onClick={() => setOpen(o => !o)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button onClick={onDelete}
            className="p-1 rounded text-slate-300 hover:text-red-500 transition-colors" title="Remove stage">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tasks list */}
      {open && (
        <div className="px-4 py-3 space-y-1.5">
          {phase.tasks.map((task, ti) => (
            <div key={ti} className="flex items-center gap-2 group">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
              <span className="flex-1 text-sm text-slate-600">{task}</span>
              <button
                onClick={() => onChange({ ...phase, tasks: phase.tasks.filter((_, i) => i !== ti) })}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-500 transition-all">
                <X size={11} />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 mt-2">
            <Plus size={12} className="text-slate-300 shrink-0" />
            <input
              ref={taskRef}
              value={newTask}
              onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTask(); } }}
              placeholder="Add task… (press Enter)"
              className="flex-1 text-xs text-slate-600 bg-transparent outline-none border-b border-transparent focus:border-blue-300 transition-colors placeholder:text-slate-300"
            />
            {newTask.trim() && (
              <button onClick={addTask} className="text-xs text-blue-600 font-semibold hover:underline">Add</button>
            )}
          </div>
          {phase.tasks.length === 0 && (
            <div className="text-[11px] text-slate-300 mt-1">No tasks yet — add some above</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════════ */
export default function NewProjectPage() {
  const router = useRouter();

  // Every user can create a project; the Personal toggle decides whether it
  // is a shared team project or a private to-do list. There is no separate
  // entry point — one form, one toggle.
  const [personal, setPersonal] = useState(false);

  const [form, setForm] = useState({
    name: '', description: '', lifecycle: 'generic',
    priority: 'medium', gxpImpact: 'none',
    teamId: '', startDate: '', dueDate: '',
  });
  const [phases, setPhases]     = useState<Phase[]>([]);
  const [teams, setTeams]       = useState<any[]>([]);
  const [templateInfo, setTemplateInfo] = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState('');
  const [step, setStep]         = useState<1 | 2>(1);

  // Custom templates state
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [customTemplateId, setCustomTemplateId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  // Current user id (populated from /auth/me once)
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    api<any[]>('/teams').then(setTeams);
    api<any>('/auth/me').then(me => { if (me?.user?.id) setCurrentUserId(me.user.id); }).catch(() => {});
    api<CustomTemplate[]>('/workflow-templates').then(setCustomTemplates).catch(() => {});
  }, []);

  // Only fetch built-in lifecycle data when no custom template is active.
  // selectCustomTemplate sets customTemplateId before (possibly) changing
  // form.lifecycle to 'generic', so checking customTemplateId here prevents
  // the effect from overwriting the custom phases on the same render batch.
  useEffect(() => {
    if (!form.lifecycle || customTemplateId) return;
    api<any>(`/lifecycles?key=${form.lifecycle}`).then(t => {
      setTemplateInfo(t);
      setPhases(phasesFromTemplate(t));
    }).catch(() => {});
  }, [form.lifecycle, customTemplateId]);

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  // Selecting a built-in lifecycle clears any active custom template first so
  // the effect above is free to fetch the template data.
  function selectBuiltInLifecycle(value: string) {
    setCustomTemplateId(null);
    setTemplateInfo(null);
    up('lifecycle', value);
  }

  function selectCustomTemplate(t: CustomTemplate) {
    setCustomTemplateId(t.id);
    setTemplateInfo(null);
    // Keep lifecycle as 'generic' so the submission payload stays valid.
    // Because customTemplateId is set first (in the same batch), the
    // useEffect above skips the fetch and leaves the custom phases intact.
    setForm(f => ({ ...f, lifecycle: 'generic' }));
    setPhases(phasesFromCustomTemplate(t));
  }

  async function deleteCustomTemplate(id: string) {
    try {
      await api(`/workflow-templates/${id}`, { method: 'DELETE' });
      setCustomTemplates(ts => ts.filter(t => t.id !== id));
      if (customTemplateId === id) {
        setCustomTemplateId(null);
        setPhases([]);
      }
    } catch (e: any) {
      alert(e.message || 'Failed to delete template.');
    }
  }

  function addPhase() {
    setPhases(ps => [...ps, { id: uid(), name: '', tasks: [] }]);
  }

  function updatePhase(id: string, p: Phase) {
    setPhases(ps => ps.map(ph => ph.id === id ? p : ph));
  }

  function deletePhase(id: string) {
    setPhases(ps => ps.filter(ph => ph.id !== id));
  }

  function movePhase(idx: number, dir: -1 | 1) {
    setPhases(ps => {
      const next = [...ps];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return next;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  async function submit() {
    if (!form.name.trim()) { setErr('Project name is required.'); return; }
    setErr(''); setLoading(true);
    try {
      const p = await api<any>('/projects', {
        method: 'POST',
        body: {
          name:        form.name.trim(),
          description: form.description || undefined,
          lifecycle:   form.lifecycle,
          priority:    form.priority,
          gxpImpact:   form.gxpImpact,
          personal,
          teamId:      personal ? undefined : (form.teamId || undefined),
          startDate:   form.startDate || undefined,
          dueDate:     form.dueDate || undefined,
          useTemplate: false,
          customPhases: phases.map(ph => ({ name: ph.name, tasks: ph.tasks })),
        },
      });
      router.push(`/projects/${p.id}`);
    } catch (e: any) {
      setErr(e.message || 'Something went wrong.');
      setLoading(false);
    }
  }

  // The label shown in step 2 header
  const selectedCustomTemplate = customTemplateId
    ? customTemplates.find(t => t.id === customTemplateId)
    : null;
  const lifecycleLabel = selectedCustomTemplate
    ? selectedCustomTemplate.name
    : (LIFECYCLE_GROUPS.flatMap(g => g.options).find(o => o.value === form.lifecycle)?.label ?? form.lifecycle);

  // Whether the current lifecycle selection is a non-generic built-in
  const hasBuiltInLifecycle = form.lifecycle !== 'generic' && !customTemplateId;

  return (
    <div className="max-w-3xl pb-20">
      {/* Save-as-template dialog */}
      {showSaveDialog && (
        <SaveTemplateDialog
          phases={phases}
          onClose={() => setShowSaveDialog(false)}
          onSaved={saved => {
            setCustomTemplates(ts => [saved, ...ts]);
            setShowSaveDialog(false);
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6 pt-1">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">New project</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Step {step} of 2 — {step === 1 ? 'Project details' : 'Stages & workflow'}
          </p>
        </div>
        {/* Step pills */}
        <div className="ml-auto flex items-center gap-2">
          {[1, 2].map(s => (
            <button key={s} onClick={() => step > s && setStep(s as 1 | 2)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: step === s ? '#1565C0' : step > s ? '#dcfce7' : '#f1f5f9',
                color:      step === s ? '#fff'     : step > s ? '#15803d' : '#94a3b8',
                cursor:     step > s ? 'pointer' : 'default',
              }}>
              {step > s ? '✓' : s} {s === 1 ? 'Details' : 'Stages'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Step 1: Project details ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          {/* Name */}
          <div className="card p-5 space-y-4">
            <div>
              <label className="label">Project name *</label>
              <input className="input" placeholder="e.g. IDP Validation Q2 2026"
                value={form.name} onChange={e => up('name', e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label">Description <span className="normal-case font-normal text-slate-300">(optional)</span></label>
              <textarea className="textarea" rows={2} placeholder="What's this project about?"
                value={form.description} onChange={e => up('description', e.target.value)} />
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="select" value={form.priority} onChange={e => up('priority', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Start date</label>
                <input type="date" className="input" value={form.startDate} onChange={e => up('startDate', e.target.value)} />
              </div>
              <div>
                <label className="label">Due date</label>
                <input type="date" className="input" value={form.dueDate} onChange={e => up('dueDate', e.target.value)} />
              </div>
            </div>
            {/* Personal toggle — flip it on to keep the project private to
                you (no team, hidden from everyone else). Off = a shared
                project belonging to a team. */}
            <div className="rounded-lg border border-slate-200 px-3 py-2.5 flex items-start gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={personal}
                onClick={() => {
                  const next = !personal;
                  setPersonal(next);
                  // When switching to personal, default to a general lifecycle if currently on a GxP-specific one
                  if (next) {
                    const gxpKeys = LIFECYCLE_GROUPS.flatMap(g =>
                      g.label !== 'General' ? g.options.map(o => o.value) : []
                    ).filter(v => v !== 'generic');
                    if (gxpKeys.includes(form.lifecycle)) up('lifecycle', 'generic');
                  }
                }}
                className={`mt-0.5 relative w-9 h-5 rounded-full shrink-0 transition-colors cursor-pointer ${
                  personal ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${personal ? 'left-4' : 'left-0.5'}`} />
              </button>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-700">Personal project</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Only visible to you — no team, hidden from everyone else (including admins).
                </div>
              </div>
            </div>

            {!personal && teams.length > 0 && (
              <div>
                <label className="label">Team</label>
                <select className="select" value={form.teamId} onChange={e => up('teamId', e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Lifecycle template picker */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Workflow template</label>
              {/* Save-as-template button — shown when a non-generic lifecycle is selected */}
              {(hasBuiltInLifecycle || customTemplateId) && phases.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <BookmarkPlus size={13} />
                  Save as template
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-3 mt-0.5">
              {personal
                ? 'Pick a ready-made template to jump-start your personal project — or start blank.'
                : 'Pick a template to get predefined stages and tasks — you can edit everything in the next step.'}
            </p>
            <div className="space-y-4">
              {(personal
                ? [...LIFECYCLE_GROUPS].sort((a, b) => a.label === 'General' ? -1 : b.label === 'General' ? 1 : 0)
                : LIFECYCLE_GROUPS
              ).map(group => (
                <div key={group.label}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{group.label}</div>
                    <div className="text-[10px] text-slate-300">{group.description}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {group.options.map(opt => {
                      const active = !customTemplateId && form.lifecycle === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => selectBuiltInLifecycle(opt.value)}
                          className="text-left px-3 py-2 rounded-lg text-xs transition-all border"
                          style={{
                            background:   active ? '#EFF6FF' : '#fff',
                            borderColor:  active ? '#1565C0' : '#E2E8F0',
                            color:        active ? '#1565C0' : '#334155',
                          }}>
                          <div className="flex items-center gap-1.5">
                            {opt.value === 'generic' && <Sparkles size={11} className="opacity-60 shrink-0" />}
                            <span className={active ? 'font-bold' : 'font-semibold'}>{opt.label}</span>
                          </div>
                          <div className={`mt-0.5 text-[10px] ${active ? 'text-blue-600/80' : 'text-slate-400'}`}>
                            {opt.hint}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Custom templates group */}
              {customTemplates.length > 0 && (
                <div>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Custom</div>
                    <div className="text-[10px] text-slate-300">Saved by your workspace</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {customTemplates.map(ct => {
                      const active = customTemplateId === ct.id;
                      const isOwner = currentUserId && ct.createdBy === currentUserId;
                      return (
                        <div key={ct.id} className="relative group">
                          <button
                            type="button"
                            onClick={() => selectCustomTemplate(ct)}
                            className="w-full text-left px-3 py-2 rounded-lg text-xs transition-all border"
                            style={{
                              background:  active ? '#EFF6FF' : '#fff',
                              borderColor: active ? '#1565C0' : '#E2E8F0',
                              color:       active ? '#1565C0' : '#334155',
                            }}>
                            <div className="flex items-center gap-1.5 pr-5">
                              <span className={active ? 'font-bold' : 'font-semibold'}>{ct.name}</span>
                            </div>
                            <div className={`mt-0.5 text-[10px] ${active ? 'text-blue-600/80' : 'text-slate-400'}`}>
                              {ct.phases.length} stage{ct.phases.length === 1 ? '' : 's'} · by {ct.createdByName || 'Unknown'}
                            </div>
                          </button>
                          {isOwner && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); deleteCustomTemplate(ct.id); }}
                              className="absolute top-1.5 right-1.5 p-0.5 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                              title="Delete template">
                              <Trash2 size={11} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Preview of what the picked built-in template ships with */}
            {!customTemplateId && templateInfo && templateInfo.phases?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    What you get
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {templateInfo.phases.length} stage{templateInfo.phases.length === 1 ? '' : 's'} · {' '}
                    {templateInfo.phases.reduce((n: number, ph: any) => n + (ph.tasks?.length || 0), 0)} tasks
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {templateInfo.phases.map((ph: any, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 border border-slate-100 text-slate-600">
                      <span className="text-slate-400 font-bold">{i + 1}</span>
                      {ph.name}
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">{ph.tasks?.length || 0}</span>
                    </span>
                  ))}
                </div>
                {templateInfo.regulatoryRefs && (
                  <div className="mt-2 text-[11px] text-slate-400">
                    Regulatory refs: <span className="font-semibold text-slate-500">{templateInfo.regulatoryRefs}</span>
                  </div>
                )}
              </div>
            )}

            {/* Preview for selected custom template */}
            {customTemplateId && selectedCustomTemplate && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    What you get
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {selectedCustomTemplate.phases.length} stage{selectedCustomTemplate.phases.length === 1 ? '' : 's'} · {' '}
                    {selectedCustomTemplate.phases.reduce((n, ph) => n + ph.tasks.length, 0)} tasks
                  </div>
                </div>
                {selectedCustomTemplate.description && (
                  <p className="text-[11px] text-slate-500 mb-2">{selectedCustomTemplate.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomTemplate.phases.map((ph, i) => (
                    <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-50 border border-slate-100 text-slate-600">
                      <span className="text-slate-400 font-bold">{i + 1}</span>
                      {ph.name}
                      <span className="text-slate-300">·</span>
                      <span className="text-slate-400">{ph.tasks.length}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => { if (!form.name.trim()) { setErr('Enter a project name first.'); return; } setErr(''); setStep(2); }}
              className="btn-primary">
              Next: Configure stages →
            </button>
            <button className="btn-secondary" onClick={() => router.back()}>Cancel</button>
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </div>
      )}

      {/* ── Step 2: Stages ──────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Stages for "{form.name}"
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Based on <span className="font-semibold text-slate-600">{lifecycleLabel}</span> template.
                  Rename, reorder, add or remove stages and tasks freely.
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowSaveDialog(true)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <BookmarkPlus size={13} />
                  Save as template
                </button>
                <button onClick={() => {
                  if (selectedCustomTemplate) {
                    setPhases(phasesFromCustomTemplate(selectedCustomTemplate));
                  } else {
                    setPhases(phasesFromTemplate(templateInfo));
                  }
                }}
                  className="text-xs text-blue-600 font-semibold hover:underline">
                  Reset to template
                </button>
              </div>
            </div>

            {!customTemplateId && templateInfo?.description && (
              <div className="mt-3 mb-4 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                {templateInfo.description}
              </div>
            )}
            {customTemplateId && selectedCustomTemplate?.description && (
              <div className="mt-3 mb-4 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                {selectedCustomTemplate.description}
              </div>
            )}

            <div className="space-y-2 mt-4">
              {phases.map((ph, i) => (
                <PhaseRow
                  key={ph.id}
                  phase={ph}
                  index={i}
                  total={phases.length}
                  onChange={p => updatePhase(ph.id, p)}
                  onDelete={() => deletePhase(ph.id)}
                  onMoveUp={() => movePhase(i, -1)}
                  onMoveDown={() => movePhase(i, 1)}
                />
              ))}
            </div>

            <button onClick={addPhase}
              className="mt-3 w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-3 text-sm text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-all">
              <Plus size={15} /> Add stage
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={submit} disabled={loading} className="btn-primary">
              {loading ? 'Creating…' : 'Create project'}
            </button>
            <button className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
            {err && <span className="text-sm text-red-600">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
