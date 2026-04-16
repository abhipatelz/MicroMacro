'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Card, SEVERITY_COLORS } from '@/components/ui';
import { Sparkles } from 'lucide-react';

const EXAMPLES = [
  {
    title: 'Shared login on HPLC system',
    body:
      'During batch release for product AL-2213, three analysts used a shared login on the HPLC data system. Audit trail shows multiple re-integrations. Potential ALCOA+ violation; 3 batches already released to market. FDA is scheduled to inspect next quarter.'
  },
  {
    title: 'Missed OQ test case on LIMS upgrade',
    body:
      'OQ script TC-045 was not executed for the LIMS upgrade. URS requirement URS-102 has no matching test in the traceability matrix. System was released to production.'
  },
  {
    title: 'Late ICSR submission',
    body:
      'Pharmacovigilance case AE-2026-441 was submitted to the authority 3 days after the regulatory clock. Seriousness was reclassified during QC review. Late submission requires notification.'
  },
  {
    title: 'Typo in SOP appendix',
    body:
      'Found a typo in the appendix of SOP-0551. Single isolated editorial issue, no impact on GxP processes.'
  }
];

export default function AiTriagePage() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');

  async function run() {
    setErr('');
    setLoading(true);
    try {
      const r = await api('/ai/triage', {
        method: 'POST',
        body: { title, description: body }
      });
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="text-brand-600" size={24} />
          AI Issue Triage
        </h1>
        <p className="text-sm text-slate-500">
          Paste a newly logged deviation, audit finding or data integrity issue below. The on-prem
          triage model will classify the category, score severity, explain every signal, and
          propose CAPA actions — with similar past cases from your corpus.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Describe the event">
          <div className="space-y-3">
            <div>
              <label className="label">Short title</label>
              <input
                className="input"
                placeholder="e.g. Shared login on chromatography system"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="textarea min-h-[160px]"
                placeholder="As much detail as you would normally put into a deviation log…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={run} disabled={loading || !title}>
                {loading ? 'Analysing…' : 'Run triage'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setTitle('');
                  setBody('');
                  setResult(null);
                }}
              >
                Clear
              </button>
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}

            <div className="pt-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Try an example
              </div>
              <div className="space-y-1">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.title}
                    className="w-full text-left text-xs px-3 py-2 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200"
                    onClick={() => {
                      setTitle(ex.title);
                      setBody(ex.body);
                    }}
                  >
                    <div className="font-medium">{ex.title}</div>
                    <div className="text-slate-500 line-clamp-2">{ex.body}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          {result ? (
            <>
              <Card title="Classification">
                <div className="flex flex-wrap gap-2 items-center mb-4">
                  <span className={`tag ${SEVERITY_COLORS[result.severity]}`}>
                    Severity: <strong className="ml-1">{result.severity}</strong> ({result.severityScore})
                  </span>
                  <span className="tag bg-slate-100 text-slate-700 border border-slate-200">
                    Category: {result.categoryLabel}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                  Why?
                </div>
                <ul className="text-sm text-slate-700 list-disc ml-4 space-y-1">
                  {result.rationale.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </Card>
              <Card title="Suggested CAPA actions">
                <ul className="text-sm text-slate-700 list-disc ml-4 space-y-1.5">
                  {result.suggestedCapa.map((c: string, i: number) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </Card>
              <Card title={`Similar past cases (${result.similar.length})`}>
                {result.similar.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    No similar past cases found — this looks like a first-of-its-kind event.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {result.similar.map((s: any) => (
                      <Link
                        href={`/tasks/${s.id}`}
                        key={s.id}
                        className="block border border-slate-200 rounded-md p-2 hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-medium text-brand-700">{s.title}</div>
                          <span className="tag bg-slate-100 text-xs">
                            similarity {Math.round(s.score * 100)}%
                          </span>
                        </div>
                        {s.projectCode && (
                          <div className="text-xs text-slate-500 font-mono mt-0.5">
                            {s.projectCode}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </Card>
            </>
          ) : (
            <Card>
              <div className="text-sm text-slate-500">
                The triage engine uses a transparent, explainable classifier tuned for
                pharma quality events. Every output (severity score, category, CAPA) is
                traceable to the features that triggered it — which is the bar a regulated
                QA function needs, compared with an opaque external LLM call.
                <ul className="list-disc ml-5 mt-2 space-y-1">
                  <li>Severity model: weighted features over patient safety, batches released, regulatory exposure, data loss, ALCOA+ signals.</li>
                  <li>Category model: keyword-pattern matcher for Data Integrity / CSV / PV / Audit Trail / Lab Informatics / Training.</li>
                  <li>Similarity: cosine distance over bag-of-words vectors of your prior deviation/CAPA/audit tasks.</li>
                </ul>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
