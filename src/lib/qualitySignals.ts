/**
 * Quality Signal Engine
 *
 * Three surfaces — all built on the deterministic bag-of-words + cosine
 * similarity already in triage.ts (same tokenizer, same math):
 *
 *  1. Past Cases — surface similar CLOSED tasks in the task-detail sidebar
 *     while an investigator is actively working. Institutional memory as
 *     infrastructure: the engineer sees "this was resolved before, in 4 days,
 *     here's the link" without having to know what to search for.
 *
 *  2. Pattern Clusters — across OPEN QA tasks, detect when 3+ tasks share
 *     enough lexical overlap that they may share a root cause. Catches
 *     systemic control gaps before an auditor does.
 *
 *  3. CAPA Effectiveness — after a CAPA closes, check whether similar issues
 *     were filed in the following 90 days. Automates a compliance obligation
 *     that virtually nobody performs rigorously.
 *
 * No LLM, no external API. Every score is a ratio of two dot products.
 * A reviewer can reproduce any result by hand from the task text.
 */

import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { tokenize, bagOfWords, cosine } from '@/lib/ai/triage';
import { QA_TASK_TYPES } from '@/lib/qaTaskTypes';
import { NOT_PERSONAL } from '@/lib/leadScope';

export { QA_TASK_TYPES };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PastCase {
  id: string;
  title: string;
  taskType: string;
  projectId: string;
  projectCode: string;
  score: number;
  daysToClose: number | null;
  completedAt: string;
}

export interface EffectivenessSignal {
  count: number;
  taskIds: string[];
  taskTitles: string[];
}

export interface PatternCluster {
  taskType: string;
  taskIds: string[];
  taskTitles: string[];
  commonTerms: string[];
  count: number;
  riskLevel: 'emerging' | 'moderate' | 'high';
}

// ── Pure clustering (union-find over similarity matrix) ───────────────────────
// Exported so unit tests can drive it without any DB.

export interface ClusterDoc {
  id: string;
  title: string;
  vec: Map<string, number>;
}

export function clusterDocs(
  docs: ClusterDoc[],
  threshold: number,
): ClusterDoc[][] {
  const parent = new Map<string, string>(docs.map((d) => [d.id, d.id]));

  function find(id: string): string {
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!));
    return parent.get(id)!;
  }

  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      if (cosine(docs[i].vec, docs[j].vec) >= threshold) {
        const ra = find(docs[i].id);
        const rb = find(docs[j].id);
        if (ra !== rb) parent.set(ra, rb);
      }
    }
  }

  const groups = new Map<string, ClusterDoc[]>();
  for (const d of docs) {
    const root = find(d.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(d);
  }

  return [...groups.values()].filter((g) => g.length >= 3);
}

// ── Past Cases ────────────────────────────────────────────────────────────────

/**
 * Return the top-N closed tasks most linguistically similar to the given task.
 * Used to surface institutional memory in the task-detail right sidebar.
 *
 * Only runs for QA task types. Returns [] for generic 'task' items or
 * when the description is too short to be meaningful.
 */
export async function findPastCases(
  taskId: string,
  opts: { limit?: number; minScore?: number; lookbackDays?: number } = {},
): Promise<PastCase[]> {
  const { limit = 3, minScore = 0.28, lookbackDays = 270 } = opts;

  const { Task } = await import('@/models/Task');
  const { Project } = await import('@/models/Project');
  await connectDB();

  const target = await Task.findById(taskId)
    .select('title description taskType')
    .lean() as any;
  if (!target || !QA_TASK_TYPES.has(target.taskType)) return [];

  const targetText = `${target.title} ${target.description || ''}`.trim();
  if (targetText.length < 10) return [];

  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const candidates = await Task.find({
    _id: { $ne: new mongoose.Types.ObjectId(taskId) },
    taskType: target.taskType,
    status: 'done',
    completedAt: { $gte: since },
  })
    .select('title description taskType projectId completedAt createdAt')
    .limit(300)
    .lean() as any[];

  if (!candidates.length) return [];

  const projectIds = [...new Set(candidates.map((c: any) => String(c.projectId)))];
  // Institutional memory must never surface a personal project's task — its
  // title and project code are owner-private, full stop. Drop those candidates
  // before they ever reach the similarity scoring / response.
  const projects = await Project.find({ _id: { $in: projectIds }, ...NOT_PERSONAL })
    .select('_id code')
    .lean() as any[];
  const codeMap = new Map(projects.map((p: any) => [String(p._id), p.code || '']));
  const visibleCandidates = candidates.filter((c: any) => codeMap.has(String(c.projectId)));

  const targetVec = bagOfWords(tokenize(targetText));

  return visibleCandidates
    .map((c: any) => {
      const score = cosine(
        targetVec,
        bagOfWords(tokenize(`${c.title} ${c.description || ''}`)),
      );
      const daysToClose =
        c.completedAt && c.createdAt
          ? Math.round(
              (new Date(c.completedAt).getTime() - new Date(c.createdAt).getTime()) / 86_400_000,
            )
          : null;
      return {
        id: String(c._id),
        title: c.title as string,
        taskType: c.taskType as string,
        projectId: String(c.projectId),
        projectCode: codeMap.get(String(c.projectId)) ?? '',
        score,
        daysToClose,
        completedAt: c.completedAt ? new Date(c.completedAt).toISOString() : '',
      };
    })
    .filter((t) => t.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ── CAPA Effectiveness ────────────────────────────────────────────────────────

/**
 * After a CAPA closes, check if similar issues appeared within 90 days.
 * Returns null when: not a CAPA type, no similar recurrences found, or
 * the CAPA is too recent (< 14 days closed — too early to call).
 */
export async function checkCapaEffectiveness(
  taskId: string,
  completedAt: Date,
): Promise<EffectivenessSignal | null> {
  const { Task } = await import('@/models/Task');
  const { Project } = await import('@/models/Project');
  await connectDB();

  // Too recent to judge
  const daysSinceClosure = (Date.now() - completedAt.getTime()) / 86_400_000;
  if (daysSinceClosure < 14) return null;

  const target = await Task.findById(taskId)
    .select('title description taskType')
    .lean() as any;
  if (!target || !['capa', 'corrective_action'].includes(target.taskType)) return null;

  const targetText = `${target.title} ${target.description || ''}`.trim();
  if (targetText.length < 10) return null;

  const targetVec = bagOfWords(tokenize(targetText));
  const windowEnd = new Date(completedAt.getTime() + 90 * 86_400_000);

  const newerRaw = await Task.find({
    _id: { $ne: new mongoose.Types.ObjectId(taskId) },
    taskType: { $in: ['deviation', 'capa', 'audit_finding', 'data_review'] },
    createdAt: { $gte: completedAt, $lte: windowEnd },
  })
    .select('_id title description projectId')
    .limit(200)
    .lean() as any[];

  if (!newerRaw.length) return null;

  // A recurrence signal must never name-drop a task from someone's personal
  // project — filter those out before scoring or surfacing any title.
  const newerProjectIds = [...new Set(newerRaw.map((t: any) => String(t.projectId)))];
  const visibleProjects = await Project.find({ _id: { $in: newerProjectIds }, ...NOT_PERSONAL })
    .select('_id').lean() as any[];
  const visibleProjectIds = new Set(visibleProjects.map((p: any) => String(p._id)));
  const newer = newerRaw.filter((t: any) => visibleProjectIds.has(String(t.projectId)));

  if (!newer.length) return null;

  const similar = newer
    .map((t: any) => ({
      id: String(t._id),
      title: t.title as string,
      score: cosine(targetVec, bagOfWords(tokenize(`${t.title} ${t.description || ''}`)))
    }))
    .filter((t) => t.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!similar.length) return null;

  return {
    count: similar.length,
    taskIds: similar.map((s) => s.id),
    taskTitles: similar.map((s) => s.title),
  };
}

// ── Pattern Clusters ──────────────────────────────────────────────────────────

/**
 * Across open QA tasks in the given projects, find clusters of 3+ tasks that
 * share enough lexical overlap to suggest a common root cause.
 *
 * Used in the insights page "Quality Signals" section. Returns clusters sorted
 * by count descending. An empty array means no systemic signals detected.
 */
export async function detectPatternClusters(
  projectIds: mongoose.Types.ObjectId[],
  lookbackDays = 90,
): Promise<PatternCluster[]> {
  const { Task } = await import('@/models/Task');
  await connectDB();

  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  const tasks = await Task.find({
    projectId: { $in: projectIds },
    taskType: { $in: [...QA_TASK_TYPES] },
    status: { $ne: 'done' },
    createdAt: { $gte: since },
  })
    .select('_id title description taskType')
    .limit(400)
    .lean() as any[];

  if (tasks.length < 3) return [];

  // Group by taskType — avoid false positives across types
  const byType = new Map<string, typeof tasks>();
  for (const t of tasks) {
    if (!byType.has(t.taskType)) byType.set(t.taskType, []);
    byType.get(t.taskType)!.push(t);
  }

  const results: PatternCluster[] = [];

  for (const [taskType, typeTasks] of byType) {
    if (typeTasks.length < 3) continue;

    const docs: ClusterDoc[] = typeTasks.map((t: any) => ({
      id: String(t._id),
      title: t.title as string,
      vec: bagOfWords(tokenize(`${t.title} ${t.description || ''}`)),
    }));

    const clusters = clusterDocs(docs, 0.40);

    for (const members of clusters) {
      // Find terms that appear in at least half the cluster members
      const termDocFreq = new Map<string, number>();
      const termTotalFreq = new Map<string, number>();

      for (const m of members) {
        const seen = new Set<string>();
        for (const [term, freq] of m.vec) {
          termTotalFreq.set(term, (termTotalFreq.get(term) ?? 0) + freq);
          if (!seen.has(term)) {
            termDocFreq.set(term, (termDocFreq.get(term) ?? 0) + 1);
            seen.add(term);
          }
        }
      }

      const minDocs = Math.ceil(members.length / 2);
      const commonTerms = [...termTotalFreq.entries()]
        .filter(([term]) => (termDocFreq.get(term) ?? 0) >= minDocs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([term]) => term);

      // Skip clusters with no meaningful shared vocabulary
      if (commonTerms.length === 0) continue;

      results.push({
        taskType,
        taskIds: members.map((m) => m.id),
        taskTitles: members.map((m) => m.title),
        commonTerms,
        count: members.length,
        riskLevel: members.length >= 5 ? 'high' : members.length >= 4 ? 'moderate' : 'emerging',
      });
    }
  }

  return results.sort((a, b) => b.count - a.count);
}
