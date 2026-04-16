import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { runTriage } from '@/lib/ai/triage';

export const runtime = 'nodejs';

const Body = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  taskId: z.string().optional(), // if provided, persist triage on that task
  save: z.boolean().default(false)
});

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);

    // Build corpus from deviation/audit/capa/data_review tasks
    const corpus = await Task.find({
      taskType: { $in: ['deviation', 'capa', 'audit_finding', 'data_review'] }
    })
      .select('_id title description projectId')
      .lean();
    const pMap = new Map<string, string>();
    const pids = [...new Set(corpus.map((c) => String(c.projectId)))];
    if (pids.length) {
      const projs = await Project.find({ _id: { $in: pids } }).select('_id code').lean();
      for (const p of projs) pMap.set(String(p._id), p.code);
    }
    const corpusWithCodes = corpus.map((c) => ({
      ...c,
      projectCode: pMap.get(String(c.projectId))
    }));

    const result = runTriage(body.title, body.description || '', corpusWithCodes);

    if (body.save && body.taskId) {
      await Task.updateOne(
        { _id: body.taskId },
        {
          $set: {
            aiTriage: {
              severity: result.severity,
              severityScore: result.severityScore,
              category: result.category,
              rationale: result.rationale,
              suggestedCapa: result.suggestedCapa,
              similarTaskIds: result.similarTaskIds,
              computedAt: new Date()
            }
          }
        }
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
