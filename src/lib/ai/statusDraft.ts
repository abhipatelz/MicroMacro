// ─── AI project status draft ─────────────────────────────────────────────────
// Turns a project's *existing structured data* (progress, overdue/blocked
// counts, upcoming work) into a short, paste-ready status narrative — the kind
// of update a QA lead writes for a change control or CAPA every week.
//
// Compliance (mirrors the product's "LLM augments, never replaces" rule, see
// CLAUDE.md): this only ever AUGMENTS EXPLANATORY TEXT. It is handed numbers
// and titles that already exist and asked to phrase them as prose. It NEVER
// computes severity, classification, or any regulatory determination — that
// path stays in triage.ts / qaKnowledge.ts and is fully rule-based. The model
// is explicitly instructed not to invent facts or make a compliance call, and
// the output is always presented to the user as an editable draft (human in
// the loop). With no GEMINI_API_KEY, a deterministic factual summary is
// returned instead — clearly labelled as non-AI, never dressed up as one.

import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL_ORDER = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

export interface StatusDraftInput {
  projectName: string;
  code: string;
  lifecycle?: string | null;
  status?: string | null;
  dueDate?: string | null;
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  /** A few notable task lines (already trimmed by the caller). */
  blockedTitles: string[];
  overdueTitles: string[];
  upcoming: { title: string; due: string | null }[];
}

export interface StatusDraftResult {
  text: string;
  source: 'ai' | 'rule';
}

function pct(done: number, total: number): number {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function factBlock(i: StatusDraftInput): string {
  const lines: string[] = [];
  lines.push(`Project: ${i.projectName} (${i.code})`);
  if (i.lifecycle) lines.push(`Lifecycle: ${i.lifecycle}`);
  if (i.status) lines.push(`Current status: ${i.status}`);
  lines.push(`Progress: ${i.done} of ${i.total} tasks complete (${pct(i.done, i.total)}%)`);
  lines.push(`In progress: ${i.inProgress} · Blocked: ${i.blocked} · Overdue: ${i.overdue}`);
  lines.push(`Target date: ${i.dueDate ? new Date(i.dueDate).toDateString() : 'none set'}`);
  if (i.blockedTitles.length) lines.push(`Blocked items: ${i.blockedTitles.join('; ')}`);
  if (i.overdueTitles.length) lines.push(`Overdue items: ${i.overdueTitles.join('; ')}`);
  if (i.upcoming.length) {
    lines.push(`Upcoming: ${i.upcoming.map(u => u.due ? `${u.title} (due ${new Date(u.due).toDateString()})` : u.title).join('; ')}`);
  }
  return lines.join('\n');
}

/** Deterministic, factual fallback — no model, no invention, no flourish. */
function ruleDraft(i: StatusDraftInput): string {
  const p = pct(i.done, i.total);
  const health = i.overdue > 0 || i.blocked > 0 ? 'needs attention' : p >= 100 ? 'complete' : 'on track';
  const parts: string[] = [];
  parts.push(`${i.projectName} (${i.code}) is ${health} — ${i.done} of ${i.total} tasks complete (${p}%).`);
  const risks: string[] = [];
  if (i.overdue > 0) risks.push(`${i.overdue} overdue`);
  if (i.blocked > 0) risks.push(`${i.blocked} blocked`);
  if (risks.length) {
    parts.push(`Currently ${risks.join(' and ')}${i.blockedTitles.length ? ` (e.g. ${i.blockedTitles.slice(0, 2).join(', ')})` : ''}.`);
  } else {
    parts.push('No overdue or blocked work.');
  }
  if (i.upcoming.length) {
    const next = i.upcoming[0];
    parts.push(`Next up: ${next.title}${next.due ? ` (due ${new Date(next.due).toDateString()})` : ''}.`);
  }
  if (i.dueDate) parts.push(`Target completion: ${new Date(i.dueDate).toDateString()}.`);
  return parts.join(' ');
}

async function aiDraft(i: StatusDraftInput): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are drafting a brief, factual status update for a pharmaceutical Quality project (e.g. a change control or CAPA). A QA lead will review and edit it before sending.

Here are the ONLY facts you may use:
${factBlock(i)}

Write the status update following these rules strictly:
- 3 to 5 sentences of plain professional prose. No bullet points, no markdown, no headings.
- State the overall health, what has been delivered, what is at risk (overdue / blocked), and what is next.
- Use ONLY the facts above. Do NOT invent tasks, dates, names, or outcomes.
- Do NOT make any regulatory determination, assign severity, or judge GxP impact — describe status only.
- Neutral, concise tone suitable for pasting into a status email.

Return only the status text.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  for (const modelName of MODEL_ORDER) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
      });
      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      if (text.length > 20) return text;
    } catch {
      // try next model, then fall back to the deterministic summary
    }
  }
  return null;
}

export async function generateStatusDraft(input: StatusDraftInput): Promise<StatusDraftResult> {
  const ai = await aiDraft(input);
  return ai ? { text: ai, source: 'ai' } : { text: ruleDraft(input), source: 'rule' };
}
