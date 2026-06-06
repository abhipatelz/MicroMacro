'use client';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { FlaskConical, Loader2, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface TriageResult {
  severity: 'minor' | 'major' | 'critical';
  severityScore: number;
  category: string;
  categoryLabel: string;
  rationale: string[];
  suggestedCapa: string[];
  similar: Array<{ id: string; title: string; projectCode?: string; score: number }>;
  computedAt: string;
}

const SEV_CONFIG = {
  minor:    { label: 'Minor',    bg: 'bg-blue-50',   border: 'border-blue-200',  text: 'text-blue-700',  bar: '#3B82F6', icon: Info },
  major:    { label: 'Major',    bg: 'bg-amber-50',  border: 'border-amber-200', text: 'text-amber-700', bar: '#F59E0B', icon: AlertTriangle },
  critical: { label: 'Critical', bg: 'bg-red-50',    border: 'border-red-200',   text: 'text-red-700',   bar: '#EF4444', icon: AlertTriangle },
};

export default function TriagePage() {
  const [title, setTitle]       = useState('');
  const [description, setDesc]  = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<TriageResult | null>(null);
  const [err, setErr]           = useState('');
  const [showRationale, setShowRationale] = useState(false);

  async function classify(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setErr('');
    setResult(null);
    try {
      const r = await api<TriageResult>('/ai/triage', {
        method: 'POST',
        body: { title: title.trim(), description: description.trim() },
      });
      setResult(r);
    } catch (e: any) {
      setErr(e.message || 'Classification failed.');
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setTitle('');
    setDesc('');
    setShowRationale(false);
  }

  const sev = result ? SEV_CONFIG[result.severity] : null;
  const SevIcon = sev?.icon;

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-10">

      {/* Header */}
      <div className="pb-5 mb-1 border-b border-slate-100 dark:border-white/[0.06]">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 page-icon-box bg-violet-50 dark:bg-violet-500/10 shrink-0">
            <FlaskConical size={19} className="text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="page-title">QA Triage Assistant</h1>
            <p className="text-sm text-slate-500 dark:text-white/45 mt-1 leading-snug">
              Describe a quality event — deviation, audit finding, data integrity issue, or CAPA trigger.
              The engine will classify severity, suggest CAPA actions, and surface similar past events.
            </p>
          </div>
        </div>
      </div>

      {/* Form */}
      {!result && (
        <form onSubmit={classify} className="card p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Event title <span className="text-red-400">*</span>
            </label>
            <input
              className="input"
              placeholder="e.g. Audit trail disabled on LIMS server during weekend"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Description <span className="text-slate-300">(optional but improves accuracy)</span>
            </label>
            <textarea
              className="input resize-none"
              rows={4}
              placeholder="Include what happened, when, how many batches/records affected, any regulatory implications..."
              value={description}
              onChange={e => setDesc(e.target.value)}
              disabled={loading}
            />
          </div>
          {err && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              {err}
            </div>
          )}
          <button type="submit" disabled={loading || !title.trim()} className="btn-primary flex items-center gap-2">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <FlaskConical size={15} />}
            {loading ? 'Classifying…' : 'Classify Event'}
          </button>
        </form>
      )}

      {/* Result */}
      {result && sev && SevIcon && (
        <div className="space-y-4">

          {/* Severity banner */}
          <div className={`rounded-xl border p-5 ${sev.bg} ${sev.border}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${sev.bg} border ${sev.border}`}>
                <SevIcon size={20} className={sev.text} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className={`text-2xl font-black ${sev.text}`}>{sev.label}</span>
                  <span className="text-sm text-slate-500">severity</span>
                  <span className={`tnum text-xs font-bold px-2 py-0.5 rounded-full border ${sev.bg} ${sev.text} ${sev.border}`}>
                    score {result.severityScore > 0 ? '+' : ''}{result.severityScore}
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-700 mt-0.5">{result.categoryLabel}</div>
              </div>
              <button onClick={reset} className="btn-ghost text-xs shrink-0">New event</button>
            </div>

            {/* Score bar */}
            <div className="mt-3">
              <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, Math.max(5, (result.severityScore + 3) / 12 * 100))}%`,
                    background: sev.bar,
                  }}
                />
              </div>
            </div>

            {/* Rationale toggle */}
            <button
              onClick={() => setShowRationale(r => !r)}
              className={`mt-3 flex items-center gap-1.5 text-xs font-semibold ${sev.text} hover:opacity-80 transition-opacity`}
            >
              {showRationale ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showRationale ? 'Hide' : 'Show'} scoring rationale
            </button>
            {showRationale && (
              <ul className="mt-2 space-y-1 pl-1">
                {result.rationale.map((r, i) => (
                  <li key={i} className={`text-xs font-mono ${sev.text}/80`}>{r}</li>
                ))}
              </ul>
            )}
          </div>

          {/* CAPA suggestions */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <CheckCircle size={15} className="text-forest-600" />
              Suggested CAPA Actions
            </h3>
            <ol className="space-y-2.5">
              {result.suggestedCapa.map((action, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-[10px] font-bold mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-slate-700 leading-relaxed">{action}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[11px] text-slate-400 border-t border-slate-100 pt-3">
              Actions are drawn from pharma QA playbooks (21 CFR Part 11, ICH Q10, GAMP 5, ALCOA+).
              Review with your QA team before formalising in the system.
            </p>
          </div>

          {/* Similar past events */}
          {result.similar.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-bold text-slate-800 mb-3">Similar Past Events</h3>
              <div className="space-y-2">
                {result.similar.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-1.5 border-b border-slate-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 truncate">{s.title}</div>
                      {s.projectCode && (
                        <div className="text-xs text-slate-400 font-mono">{s.projectCode}</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <div className="text-xs font-bold text-slate-400">{Math.round(s.score * 100)}% match</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.similar.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-2">
              No similar past events found in the system — this may be a novel finding.
            </p>
          )}

          <button onClick={reset} className="btn-secondary w-full text-sm">
            Classify another event
          </button>
        </div>
      )}
    </div>
  );
}
