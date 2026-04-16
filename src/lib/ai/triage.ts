// AI Deviation / Issue Triage
//
// Given a free-text description (typically a newly logged deviation, audit
// finding, or data integrity issue) this module returns:
//   - severity (minor | major | critical) with a numeric score
//   - a quality-informatics category (data_integrity, audit_trail, etc.)
//   - a short rationale citing the signals that drove the classification
//   - suggested CAPA actions drawn from a curated pharma QA playbook
//   - similar past tasks (lexical similarity over title+description)
//
// It is a lightweight explainable classifier: a scored keyword/regex model
// plus cosine similarity on bag-of-words vectors of previously logged tasks.
// This keeps inference purely on-server, with no external API dependency, and
// gives fully auditable outputs (every score is traceable to a feature) -
// which is exactly what a regulated quality function needs.

import type { TaskDoc } from '@/models/Task';

export type Severity = 'minor' | 'major' | 'critical';

export interface TriageCategory {
  key: string;
  label: string;
  keywords: RegExp[];
  defaultCapa: string[];
}

const CATEGORIES: TriageCategory[] = [
  {
    key: 'data_integrity',
    label: 'Data Integrity (ALCOA+)',
    keywords: [
      /\baudit[-\s]?trail\b/i,
      /\bALCOA(\+|plus)?\b/i,
      /\bdata\s+integrity\b/i,
      /\bshared\s+(login|account)\b/i,
      /\bgeneric\s+user\b/i,
      /\braw\s+data\b/i,
      /\borphan\s+data\b/i,
      /\bbackdated?\b/i,
      /\bre[-\s]?integrat(e|ion)\b/i,
      /\buntimestamped\b/i
    ],
    defaultCapa: [
      'Disable shared/generic accounts; enforce unique user IDs with audit trail review.',
      'Update SOP to require contemporaneous entry and periodic audit trail review.',
      'Perform retrospective audit-trail review for the impacted period.',
      'Train impacted users on ALCOA+ and update training records.',
      'Add system configuration to require second-person verification on critical records.'
    ]
  },
  {
    key: 'csv_validation',
    label: 'CSV / Computerized System Validation',
    keywords: [
      /\bOQ\b/,
      /\bIQ\b/,
      /\bPQ\b/,
      /\bGAMP\b/i,
      /\burs\b/i,
      /\btraceability\s+matrix\b/i,
      /\brequirement(s)?\s+not\s+tested\b/i,
      /\bun(validated|documented)\s+(change|configuration)\b/i
    ],
    defaultCapa: [
      'Re-execute affected qualification script(s) under a deviation report.',
      'Update Requirements Traceability Matrix to close the coverage gap.',
      'Raise a change control to formalise the undocumented configuration change.',
      'Perform an impact assessment on validated state and re-release if needed.',
      'Update validation SOP to require peer review of URS coverage pre-OQ.'
    ]
  },
  {
    key: 'pharmacovigilance',
    label: 'Pharmacovigilance / ICSR',
    keywords: [
      /\bICSR\b/,
      /\badverse\s+event\b/i,
      /\bE2B\b/,
      /\bMedDRA\b/i,
      /\blate\s+submission\b/i,
      /\bseriousness\b/i,
      /\bexpedited\b/i,
      /\bcase\s+intake\b/i,
      /\bPSUR\b/
    ],
    defaultCapa: [
      'File a late-submission notification to the authority within 24 hours.',
      'Perform reconciliation of the impacted case(s) and re-submit corrected E2B.',
      'Review case-intake SOP; add automated duplicate detection before triage.',
      'Train case-processing team on seriousness criteria; refresh competency records.',
      'Update regulatory clock start definition; add dashboard alerts for approaching due dates.'
    ]
  },
  {
    key: 'audit_trail',
    label: 'Audit Trail Issue',
    keywords: [
      /\baudit\s+trail\s+(disabled|turned\s+off|gap)\b/i,
      /\bmissing\s+(entries|events)\b/i,
      /\btimestamp\s+(mismatch|missing)\b/i
    ],
    defaultCapa: [
      'Restore and lock audit trail configuration; remove admin-level bypass.',
      'Perform retrospective audit trail review; capture findings as deviations.',
      'Add periodic (e.g. monthly) documented audit trail review to SOP.'
    ]
  },
  {
    key: 'lab_informatics',
    label: 'Lab Informatics (LIMS / Chromatography)',
    keywords: [
      /\bLIMS\b/i,
      /\bchromatograph(y|ic)\b/i,
      /\bHPLC\b/i,
      /\bGC[-\s]?MS\b/i,
      /\binjection\s+sequence\b/i,
      /\bsample\s+result\b/i,
      /\binstrument\s+qualif(ication|y)\b/i
    ],
    defaultCapa: [
      'Quarantine the affected result; perform investigation under OOS/OOT procedure.',
      'Verify instrument qualification status and calibration records.',
      'Review chromatography processing parameters and integration settings.',
      'Add 4-eyes review to chromatographic re-integration.'
    ]
  },
  {
    key: 'training',
    label: 'Training / Competency',
    keywords: [
      /\btraining\s+(gap|missing|not\s+recorded)\b/i,
      /\bcompetency\b/i,
      /\bquali(fied|fication)\s+person\b/i
    ],
    defaultCapa: [
      'Issue training on the impacted procedure; record in training matrix.',
      'Add annual refresher training for the relevant SOP.',
      'Update role-to-SOP mapping in the training system.'
    ]
  },
  {
    key: 'general',
    label: 'General Quality Event',
    keywords: [],
    defaultCapa: [
      'Perform a root cause analysis using a 5-Why or fishbone technique.',
      'Define corrective and preventive actions with accountable owners and due dates.',
      'Schedule an effectiveness check 30-90 days after CAPA closure.'
    ]
  }
];

export interface SeverityFeature {
  pattern: RegExp;
  weight: number;
  reason: string;
}

const SEVERITY_FEATURES: SeverityFeature[] = [
  { pattern: /\b(patient|subject)\s+(safety|harm|death|fatal)\b/i, weight: 6, reason: 'Patient safety impact' },
  { pattern: /\brecall\b/i, weight: 5, reason: 'Recall implication' },
  { pattern: /\bbatch(es)?\s+(affected|released|impacted)\b/i, weight: 4, reason: 'Multiple batches impacted' },
  { pattern: /\b(regulatory|authority|inspector|FDA|EMA|MHRA)\b/i, weight: 4, reason: 'Regulatory / inspection exposure' },
  { pattern: /\bdata\s+(loss|deleted|falsif(y|ied|ication))\b/i, weight: 5, reason: 'Data loss or falsification' },
  { pattern: /\bshared\s+(login|account|credential)\b/i, weight: 3, reason: 'Shared credentials' },
  { pattern: /\baudit\s+trail\s+(disabled|turned\s+off|missing)\b/i, weight: 4, reason: 'Audit trail compromised' },
  { pattern: /\brelease(d)?\s+to\s+market\b/i, weight: 4, reason: 'Product already released' },
  { pattern: /\bcritical\b/i, weight: 2, reason: 'Reporter used "critical"' },
  { pattern: /\bmajor\b/i, weight: 1.5, reason: 'Reporter used "major"' },
  { pattern: /\bminor\b/i, weight: -1.5, reason: 'Reporter used "minor"' },
  { pattern: /\btypo\b/i, weight: -2, reason: 'Described as typo' },
  { pattern: /\bsingle\s+(record|sample|event)\b/i, weight: -1, reason: 'Single isolated record' },
  { pattern: /\bsandbox|test\s+environment\b/i, weight: -3, reason: 'Non-production / sandbox' },
  { pattern: /\blate\s+submission\b/i, weight: 3, reason: 'Late regulatory submission' },
  { pattern: /\brepeat(ed)?\s+finding\b/i, weight: 3, reason: 'Repeat / recurring finding' }
];

export interface TriageResult {
  severity: Severity;
  severityScore: number;
  category: string;
  categoryLabel: string;
  rationale: string[];
  suggestedCapa: string[];
  similarTaskIds: string[];
  similar: Array<{ id: string; title: string; projectCode?: string; score: number }>;
  computedAt: string;
}

export function classifyCategory(text: string): TriageCategory {
  let best: { cat: TriageCategory; hits: number } = { cat: CATEGORIES[CATEGORIES.length - 1], hits: 0 };
  for (const cat of CATEGORIES) {
    let hits = 0;
    for (const kw of cat.keywords) if (kw.test(text)) hits++;
    if (hits > best.hits) best = { cat, hits };
  }
  return best.cat;
}

export function scoreSeverity(text: string): { score: number; hits: SeverityFeature[] } {
  const hits: SeverityFeature[] = [];
  let score = 0;
  for (const f of SEVERITY_FEATURES) {
    if (f.pattern.test(text)) {
      score += f.weight;
      hits.push(f);
    }
  }
  return { score, hits };
}

export function severityFromScore(score: number): Severity {
  if (score >= 5) return 'critical';
  if (score >= 2) return 'major';
  return 'minor';
}

// ---------- lexical similarity ----------
const STOP = new Set([
  'the','a','an','and','or','of','in','to','for','on','at','by','with','is','are','was','were',
  'be','been','being','it','its','as','that','this','these','those','from','than','but','not','no',
  'we','they','he','she','i','you','our','their','his','her','will','would','could','should','has',
  'have','had','do','does','did','done'
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\-\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

export function bagOfWords(tokens: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

export function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, v] of a) na += v * v;
  for (const [, v] of b) nb += v * v;
  for (const [k, v] of a) {
    const bv = b.get(k);
    if (bv) dot += v * bv;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface KnownTask {
  _id: any;
  title: string;
  description?: string;
  projectCode?: string;
}

export function findSimilar(queryText: string, corpus: KnownTask[], k = 5) {
  const q = bagOfWords(tokenize(queryText));
  const scored = corpus.map((c) => ({
    task: c,
    score: cosine(q, bagOfWords(tokenize(`${c.title} ${c.description || ''}`)))
  }));
  return scored
    .filter((s) => s.score > 0.1)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ---------- full triage ----------
export function runTriage(
  title: string,
  description: string,
  corpus: KnownTask[]
): TriageResult {
  const text = `${title}\n${description || ''}`;
  const cat = classifyCategory(text);
  const sev = scoreSeverity(text);
  const severity = severityFromScore(sev.score);
  const similar = findSimilar(text, corpus);

  const rationale: string[] = [];
  if (sev.hits.length) {
    for (const h of sev.hits)
      rationale.push(`${h.weight > 0 ? '+' : ''}${h.weight.toFixed(1)} · ${h.reason}`);
  } else {
    rationale.push('No severity keywords matched — defaulted to minor.');
  }
  if (cat.key !== 'general') rationale.push(`Category matched: ${cat.label}`);

  return {
    severity,
    severityScore: Math.round(sev.score * 10) / 10,
    category: cat.key,
    categoryLabel: cat.label,
    rationale,
    suggestedCapa: cat.defaultCapa.slice(0, 5),
    similarTaskIds: similar.map((s) => String(s.task._id)),
    similar: similar.map((s) => ({
      id: String(s.task._id),
      title: s.task.title,
      projectCode: s.task.projectCode,
      score: Math.round(s.score * 100) / 100
    })),
    computedAt: new Date().toISOString()
  };
}
