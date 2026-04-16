import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Card } from '../ui';

export default function NewProject() {
  const [form, setForm] = useState({
    name: '',
    description: '',
    lifecycle: 'csv',
    priority: 'medium',
    gxp_impact: 'medium',
    team_id: '',
    start_date: '',
    due_date: '',
    use_template: true
  });
  const [lifecycles, setLifecycles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api('/lifecycles').then(setLifecycles);
    api('/teams').then(setTeams);
  }, []);

  useEffect(() => {
    if (form.lifecycle) api(`/lifecycles/${form.lifecycle}`).then(setPreview);
  }, [form.lifecycle]);

  function up(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        team_id: form.team_id ? Number(form.team_id) : undefined,
        start_date: form.start_date || undefined,
        due_date: form.due_date || undefined
      };
      const p = await api('/projects', { method: 'POST', body: payload });
      nav(`/projects/${p.id}`);
    } catch (e) {
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
                <input className="input" required value={form.name} onChange={(e) => up('name', e.target.value)} />
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
                  <select className="select" value={form.priority} onChange={(e) => up('priority', e.target.value)}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="label">GxP impact</label>
                  <select className="select" value={form.gxp_impact} onChange={(e) => up('gxp_impact', e.target.value)}>
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
                  <input type="date" className="input" value={form.start_date} onChange={(e) => up('start_date', e.target.value)} />
                </div>
                <div>
                  <label className="label">Due date</label>
                  <input type="date" className="input" value={form.due_date} onChange={(e) => up('due_date', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Team</label>
                <select className="select" value={form.team_id} onChange={(e) => up('team_id', e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Pharma QA lifecycle">
            <label className="label">Lifecycle template</label>
            <select className="select" value={form.lifecycle} onChange={(e) => up('lifecycle', e.target.value)}>
              {lifecycles.map((l) => (
                <option key={l.key} value={l.key}>{l.label}</option>
              ))}
            </select>
            {preview && (
              <div className="mt-3 text-sm">
                <p className="text-slate-600">{preview.description}</p>
                {preview.regulatory_refs && (
                  <div className="mt-2 text-xs text-slate-500">
                    <span className="font-semibold">Regulatory refs: </span>{preview.regulatory_refs}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {preview.phases.map((ph, i) => (
                    <details key={i} className="bg-slate-50 rounded border border-slate-200 p-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                        {i + 1}. {ph.name} <span className="text-slate-400">({ph.tasks.length} tasks)</span>
                      </summary>
                      <ul className="mt-2 text-xs space-y-1 ml-3 list-disc">
                        {ph.tasks.map((t, j) => (
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
                checked={form.use_template}
                onChange={(e) => up('use_template', e.target.checked)}
              />
              Seed phases &amp; tasks from this template
            </label>
          </Card>
        </div>

        <div className="lg:col-span-3 flex items-center gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => nav(-1)}>Cancel</button>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      </form>
    </div>
  );
}
