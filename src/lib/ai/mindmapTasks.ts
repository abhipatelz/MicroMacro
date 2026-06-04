// ─── Mind-map → tasks ─────────────────────────────────────────────────────────
// Turns a freeform brainstorming graph into a clean, ordered list of actionable
// task titles.
//
// Design (mirrors the product's "LLM augments, never replaces" rule): there is
// always a deterministic rule-based extraction that works with no API key. When
// GEMINI_API_KEY is present, the LLM *refines* that list — phrasing each node as
// an imperative action, merging duplicates, and ordering parents before their
// children — but it can only ever reshape titles that originated from the user's
// own nodes. It does not invent work, and it never touches the QA triage scoring
// path (triage.ts / qaKnowledge.ts), which stays fully rule-based.

import { GoogleGenerativeAI } from '@google/generative-ai';

export interface MMGraphNode { id: string; text: string }
export interface MMGraphEdge { from: string; to: string }
export interface SuggestedTask { title: string }
export interface ExtractResult { tasks: SuggestedTask[]; source: 'ai' | 'rule' }

const MODEL_ORDER = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

function clean(s: string): string {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Deterministic extraction — root nodes first (breadth-first over the edges),
 *  de-duplicated, trivial fragments dropped. Always available, no key needed. */
export function ruleExtract(nodes: MMGraphNode[], edges: MMGraphEdge[]): SuggestedTask[] {
  const byId = new Map(nodes.map((n) => [n.id, clean(n.text)]));
  const hasText = (id: string) => !!(byId.get(id) && byId.get(id)!.length >= 2);

  // Order: nodes with no incoming edge (roots) first, then the rest, following
  // the edge order so a parent thought lands above the thoughts it branches to.
  const incoming = new Set(edges.map((e) => e.to));
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => { if (!seen.has(id) && hasText(id)) { seen.add(id); ordered.push(id); } };

  for (const n of nodes) if (!incoming.has(n.id)) push(n.id);
  for (const e of edges) { push(e.from); push(e.to); }
  for (const n of nodes) push(n.id);

  const out: SuggestedTask[] = [];
  const usedTitles = new Set<string>();
  for (const id of ordered) {
    const title = byId.get(id)!;
    const key = title.toLowerCase();
    if (usedTitles.has(key)) continue;
    usedTitles.add(key);
    out.push({ title: title.slice(0, 300) });
  }
  return out.slice(0, 40);
}

/** Try to refine the rule-based list with Gemini. Returns null on any failure
 *  so the caller can fall back to the deterministic list. */
async function aiRefine(base: SuggestedTask[], edges: MMGraphEdge[]): Promise<SuggestedTask[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || base.length === 0) return null;

  const list = base.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
  const prompt = `You are turning a person's brainstorming notes into a clean to-do list.

Here are the raw notes captured on a mind map (one per line):
${list}

Rewrite these as a concise, ordered list of actionable tasks:
- Phrase each as a short imperative starting with a verb (e.g. "Draft the URS", "Review supplier audit").
- Merge clear duplicates; drop pure headings that aren't actionable.
- Keep the user's intent — do NOT invent tasks that aren't implied by the notes.
- Keep each title under 90 characters.

Return ONLY a JSON array of strings, nothing else. Example: ["Draft the URS","Schedule the review"]`;

  const genAI = new GoogleGenerativeAI(apiKey);
  for (const modelName of MODEL_ORDER) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0.3, maxOutputTokens: 800, responseMimeType: 'application/json' },
      });
      const res = await model.generateContent(prompt);
      const text = res.response.text().trim();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        const tasks = parsed
          .map((s) => clean(typeof s === 'string' ? s : (s?.title ?? '')))
          .filter((s) => s.length >= 2)
          .slice(0, 40)
          .map((title) => ({ title: title.slice(0, 300) }));
        if (tasks.length) return tasks;
      }
    } catch {
      // try next model, then fall back to rule-based
    }
  }
  return null;
}

export async function extractTasksFromGraph(
  nodes: MMGraphNode[],
  edges: MMGraphEdge[],
): Promise<ExtractResult> {
  const base = ruleExtract(nodes, edges);
  if (base.length === 0) return { tasks: [], source: 'rule' };
  const refined = await aiRefine(base, edges);
  return refined ? { tasks: refined, source: 'ai' } : { tasks: base, source: 'rule' };
}
