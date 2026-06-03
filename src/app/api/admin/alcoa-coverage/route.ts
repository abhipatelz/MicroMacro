import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { scoreAlcoa, type TaskSnapshot } from '@/lib/alcoa';

export const runtime = 'nodejs';

// ──────────────────────────────────────────────────────────────────────────
// Read-only ALCOA+ / 21 CFR Part 11 coverage rollup. Admin only.
//
// This endpoint NEVER mutates anything and NEVER calls an external model — it
// reads the GxP task corpus, runs each task through the deterministic
// `scoreAlcoa()` engine (the same rule-based scorer used everywhere else), and
// returns aggregate compliance gaps a reviewer can act on:
//   • GxP-critical tasks missing a document / SOP reference
//   • tasks that require QA sign-off but have not been signed
//   • "done" tasks missing a completion timestamp
//   • the ALCOA+ grade distribution across the corpus
//
// Personal projects are excluded (they are private to-do lists, never GxP).
// ──────────────────────────────────────────────────────────────────────────

interface GapTask {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  grade: string;
  score: number;
  reasons: string[];
}

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();

    // Personal projects are never part of the GxP record set.
    const personalProjects = await Project.find(
      { $or: [{ isPersonal: true }, { code: /^PRSN-/ }] },
      '_id',
    ).lean();
    const personalIds = new Set(personalProjects.map((p: any) => String(p._id)));

    // Pull only the fields the scorer + rollup need. We score the whole
    // corpus but headline the GxP-critical and signoff-required slices, since
    // those carry the regulatory weight.
    const [tasks, projects] = await Promise.all([
      Task.find(
        {},
        'title projectId status taskType priority assigneeId requiresQaSignoff ' +
        'qaSignoffUserId qaSignoffAt gxpCritical ccNo documentNo applicableSite ' +
        'deployStage createdAt startDate dueDate completedAt remarks pendingWith aiTriage',
      ).lean(),
      Project.find({}, '_id name code isPersonal').lean(),
    ]);

    const projMap = new Map(
      projects.map((p: any) => [String(p._id), { name: p.name || '', code: p.code || '' }]),
    );

    // Running tallies.
    let totalGxp = 0;
    let signoffRequired = 0;
    let signoffMissing = 0;
    let docRefMissing = 0;       // GxP-critical without documentNo
    let completionMissing = 0;   // status=done without completedAt
    const gradeDist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    let gxpScoreSum = 0;
    const gaps: GapTask[] = [];

    for (const t of tasks as any[]) {
      const pid = String(t.projectId || '');
      if (personalIds.has(pid)) continue;
      if (!t.gxpCritical) continue; // headline rollup is scoped to GxP-critical work

      totalGxp += 1;
      const proj = projMap.get(pid) || { name: '', code: '' };

      const snap: TaskSnapshot = {
        title: t.title,
        status: t.status,
        taskType: t.taskType,
        priority: t.priority,
        assigneeId: t.assigneeId ? String(t.assigneeId) : null,
        requiresQaSignoff: !!t.requiresQaSignoff,
        qaSignoffUserId: t.qaSignoffUserId ? String(t.qaSignoffUserId) : null,
        qaSignoffAt: t.qaSignoffAt || null,
        gxpCritical: !!t.gxpCritical,
        ccNo: t.ccNo || null,
        documentNo: t.documentNo || null,
        applicableSite: t.applicableSite || null,
        deployStage: t.deployStage || null,
        createdAt: t.createdAt || null,
        startDate: t.startDate || null,
        dueDate: t.dueDate || null,
        completedAt: t.completedAt || null,
        remarks: t.remarks || null,
        pendingWith: t.pendingWith || null,
        projectIsPersonal: false,
        aiTriage: t.aiTriage || null,
      };

      const result = scoreAlcoa(snap);
      gradeDist[result.grade] = (gradeDist[result.grade] || 0) + 1;
      gxpScoreSum += result.total;

      const reasons: string[] = [];

      // §11.10(e) / §11.50 — required QA sign-off must be present.
      if (t.requiresQaSignoff) {
        signoffRequired += 1;
        if (!t.qaSignoffUserId || !t.qaSignoffAt) {
          signoffMissing += 1;
          reasons.push('Requires QA sign-off — not yet signed');
        }
      }

      // Legible — GxP-critical records need a document / SOP reference.
      const hasDoc = (t.documentNo || '').trim().length > 0;
      if (!hasDoc) {
        docRefMissing += 1;
        reasons.push('Missing document / SOP reference');
      }

      // Accurate / Contemporaneous — a "done" record must carry its completion time.
      if (t.status === 'done' && !t.completedAt) {
        completionMissing += 1;
        reasons.push('Marked done without a completion timestamp');
      }

      if (reasons.length > 0) {
        gaps.push({
          id: String(t._id),
          title: t.title || '(untitled)',
          projectId: pid,
          projectName: proj.name,
          projectCode: proj.code,
          grade: result.grade,
          score: result.total,
          reasons,
        });
      }
    }

    // Worst-first so the admin sees the highest-risk records at the top, and
    // cap the payload — this is a triage list, not a full export.
    gaps.sort((a, b) => a.score - b.score);
    const cappedGaps = gaps.slice(0, 200);

    const compliantGxp = totalGxp - gaps.length;
    const avgGxpScore = totalGxp > 0 ? Math.round(gxpScoreSum / totalGxp) : 0;
    const coveragePct = totalGxp > 0 ? Math.round((compliantGxp / totalGxp) * 100) : 100;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalGxp,
        compliantGxp,
        gapCount: gaps.length,
        coveragePct,
        avgGxpScore,
        signoffRequired,
        signoffMissing,
        docRefMissing,
        completionMissing,
      },
      gradeDist,
      gaps: cappedGaps,
      gapsTruncated: gaps.length > cappedGaps.length,
    });
  } catch (e) {
    return handleError(e);
  }
}
