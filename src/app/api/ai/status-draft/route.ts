import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { handleError, readBody } from '@/lib/http';
import { StatusDraftSchema } from '@/lib/validations';
import { generateStatusDraft } from '@/lib/ai/statusDraft';

export const runtime = 'nodejs';

/**
 * POST /api/ai/status-draft
 *
 * Pure transform: takes a project's already-visible rollup (progress, blocked /
 * overdue counts, upcoming work) and returns a short, paste-ready status
 * narrative for a QA lead to review and edit. Writes no record. Augments
 * explanatory text only — it never computes severity, classification, or any
 * regulatory determination (that path stays rule-based in triage.ts). Works
 * with no GEMINI_API_KEY (returns a deterministic factual summary, flagged as
 * such via `source`).
 */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    // Drafting calls the LLM — cap to 10/min/user so a key can't be burned.
    if (!rateLimit(`ai-status-draft:${user.sub}`, 10, 60_000)) {
      return NextResponse.json({ error: 'Too many draft requests. Wait a minute.' }, { status: 429 });
    }

    const body = await readBody(req, StatusDraftSchema);
    const result = await generateStatusDraft({
      projectName: body.projectName,
      code: body.code ?? '',
      lifecycle: body.lifecycle ?? null,
      status: body.status ?? null,
      dueDate: body.dueDate ?? null,
      total: body.total,
      done: body.done,
      inProgress: body.inProgress,
      blocked: body.blocked,
      overdue: body.overdue,
      blockedTitles: body.blockedTitles ?? [],
      overdueTitles: body.overdueTitles ?? [],
      upcoming: body.upcoming ?? [],
    });
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
