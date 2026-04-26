'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client/api';
import { Card } from '@/components/ui';

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    description: '',
    lifecycle: 'generic',
    priority: 'medium',
    gxpImpact: 'medium',
    teamId: '',
    startDate: '',
    dueDate: '',
    useTemplate: true
  });
  const [lifecycles, setLifecycles] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [preview, setPreview] = useState<any>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<any[]>('/lifecycles').then(setLifecycles);
    api<any[]>('/teams').then(setTeams);
  }, []);
  useEffect(() => {
    if (form.lifecycle) api<any>(`/lifecycles?key=${form.lifecycle}`).then(setPreview);
  }, [form.lifecycle]);

  function up<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const payload: any = {
        name: form.name,
        description: form.description || undefined,
        lifecycle: form.lifecycle,
        priority: form.priority,
        gxpImpact: form.gxpImpact,
        useTemplate: form.useTemplate,
        teamId: form.teamId || undefined,
        startDate: form.startDate || undefined,
        dueDate: form.dueDate || undefined
      };
      const p = await api<any>('/projects', { method: 'POST', body: payload });
      router.push(`/projects/${p.id}`);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">New project</h1>
      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Project details">
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input
                  className="input"
                  required
                  value={form.name}
                  onChange={(e) => up('name', e.target.value)}
                />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.description}
                  onChange={(e) => up('description', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Priority</label>
                  <select
                    className="select"
                    value={form.priority}
                    onChange={(e) => up('priority', e.target.value as any)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="label">GxP impact</label>
                  <select
                    className="select"
                    value={form.gxpImpact}
                    onChange={(e) => up('gxpImpact', e.target.value as any)}
                  >
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
                  <input
                    type="date"
                    className="input"
                    value={form.startDate}
                    onChange={(e) => up('startDate', e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input
                    type="date"
                    className="input"
                    value={form.dueDate}
                    onChange={(e) => up('dueDate', e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="label">Team</label>
                <select
                  className="select"
                  value={form.teamId}
                  onChange={(e) => up('teamId', e.target.value)}
                >
                  <option value="">— Unassigned —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Project lifecycle">
            <label className="label">Lifecycle template</label>
            <select
              className="select"
              value={form.lifecycle}
              onChange={(e) => up('lifecycle', e.target.value)}
            >
              {(['General', 'Life Sciences'] as const).map(group => {
                const group_items = lifecycles.filter((l: any) => l.group === group);
                if (!group_items.length) return null;
                return (
                  <optgroup key={group} label={group}>
                    {group_items.map((l: any) => (
                      <option key={l.key} value={l.key}>{l.label}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {preview && (
              <div className="mt-3 text-sm">
                <p className="text-slate-600">{preview.description}</p>
                {preview.regulatoryRefs && (
                  <div className="mt-2 text-xs text-slate-500">
                    <span className="font-semibold">Regulatory refs: </span>
                    {preview.regulatoryRefs}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {preview.phases.map((ph: any, i: number) => (
                    <details
                      key={i}
                      className="bg-slate-50 rounded border border-slate-200 p-2"
                    >
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                        {i + 1}. {ph.name}{' '}
                        <span className="text-slate-400">({ph.tasks.length} tasks)</span>
                      </summary>
                      <ul className="mt-2 text-xs space-y-1 ml-3 list-disc">
                        {ph.tasks.map((t: any, j: number) => (
                          <li key={j}>
                            {t.title}
                            {t.qa && <span className="ml-1 text-purple-700">· QA</span>}
                            {t.gxp && <span className="ml-1 text-red-700">· GxP</span>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 mt-3 text-sm">
              <input
                type="checkbox"
                checked={form.useTemplate}
                onChange={(e) => up('useTemplate', e.target.checked)}
              />
              Seed phases &amp; tasks from this template
            </label>
          </Card>
        </div>

        <div className="lg:col-span-3 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => router.back()}>
            Cancel
          </button>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      </form>
    </div>
  );
}
