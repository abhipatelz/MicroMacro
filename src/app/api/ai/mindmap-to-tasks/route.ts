import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { handleError, readBody } from '@/lib/http';
import { MindmapToTasksSchema } from '@/lib/validations';
import { extractTasksFromGraph } from '@/lib/ai/mindmapTasks';

export const runtime = 'nodejs';

/**
 * POST /api/ai/mindmap-to-tasks
 *
 * Pure transform: takes a user's mind-map graph and returns *suggested* task
 * titles. It never writes a record — the user reviews the list and then creates
 * tasks through the validated POST /api/tasks path. Works with no API key
 * (deterministic extraction); Gemini only refines phrasing when configured.
 */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!rateLimit(`ai-mindmap:${user.sub}`, 20, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Wait a minute.' }, { status: 429 });
    }

    const body = await readBody(req, MindmapToTasksSchema);
    const result = await extractTasksFromGraph(body.nodes, body.edges || []);
    return NextResponse.json(result);
  } catch (e) {
    return handleError(e);
  }
}
