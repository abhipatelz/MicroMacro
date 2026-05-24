'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { useIsLead } from '@/components/CurrentUserContext';
import { Plus, X, GripVertical, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Phase { id: string; name: string; tasks: string[] }

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
      { value: 'data_integrity',    label: 'Data Integrity',        hint: 'ALCOA+ assessment' },
      { value: 'pharmacovigilance', label: 'Safety Reporting (PV)', hint: 'ICSR / safety case' },
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
    tasks: ph.tasks.map((t: any) => t.title),
  }));
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
  const isLead = useIsLead();

  // Creating projects is a lead/admin action. The "+ New project" button is
  // already hidden for contributors, but the route is still reachable by
  // direct URL — guard it so a contributor sees the dashboard instead of a
  // form that would 403 on submit.
  useEffect(() => {
    if (isLead === false) router.replace('/');
  }, [isLead, router]);

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

  useEffect(() => {
    api<any[]>('/teams').then(setTeams);
  }, []);

  useEffect(() => {
    if (!form.lifecycle) return;
    api<any>(`/lifecycles?key=${form.lifecycle}`).then(t => {
      setTemplateInfo(t);
      setPhases(phasesFromTemplate(t));
    }).catch(() => {});
  }, [form.lifecycle]);

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm(f => ({ ...f, [k]: v }));
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
          teamId:      form.teamId || undefined,
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

  const lifecycleLabel = LIFECYCLE_GROUPS.flatMap(g => g.options).find(o => o.value === form.lifecycle)?.label ?? form.lifecycle;

  return (
    <div className="max-w-3xl pb-20">
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Priority</label>
                <select className="select" value={form.priority} onChange={e => up('priority', e.target.value)}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="label">GxP impact</label>
                <select className="select" value={form.gxpImpact} onChange={e => up('gxpImpact', e.target.value)}>
                  <option value="none">None</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
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
            {teams.length > 0 && (
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
            <label className="label">Workflow template</label>
            <p className="text-xs text-slate-400 mb-3 -mt-1">
              Pick a template to get predefined stages and tasks — you can edit everything in the next step.
            </p>
            <div className="space-y-4">
              {LIFECYCLE_GROUPS.map(group => (
                <div key={group.label}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{group.label}</div>
                    <div className="text-[10px] text-slate-300">{group.description}</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {group.options.map(opt => {
                      const active = form.lifecycle === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => up('lifecycle', opt.value)}
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
            </div>

            {/* Preview of what the picked template ships with */}
            {templateInfo && templateInfo.phases?.length > 0 && (
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
              <button onClick={() => { setPhases(phasesFromTemplate(templateInfo)); }}
                className="text-xs text-blue-600 font-semibold hover:underline shrink-0">
                Reset to template
              </button>
            </div>

            {templateInfo?.description && (
              <div className="mt-3 mb-4 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                {templateInfo.description}
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
