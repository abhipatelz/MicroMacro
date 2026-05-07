import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildICS, icsResponse } from '@/lib/ics';

export const runtime = 'nodejs';

/**
 * GET /api/projects/:id/calendar
 *  Downloads a single .ics with one event per task that has a due date —
 *  10:00–10:30 on the due-date by default. Open the file once and
 *  Outlook/Google import every task. Title prefixed with [PRAG-T-XXXXXX].
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const project = await Project.findById(params.id).lean();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const tasks = await Task.find({ projectId: params.id, status: { $ne: 'done' }, dueDate: { $ne: null } })
      .lean();

    const url = new URL(req.url);
    const baseUrl = (process.env.APP_URL || `${url.protocol}//${url.host}`).replace(/\/$/, '');

    const events = tasks.map((t: any) => {
      const start = new Date(t.dueDate);
      start.setHours(10, 0, 0, 0);
      const end = new Date(start.getTime() + 30 * 60_000);
      const taskCode = `PRAG-T-${String(t._id).slice(-6).toUpperCase()}`;
      const taskUrl = `${baseUrl}/tasks/${t._id}`;
      return {
        uid: `${taskCode}@pragati`,
        title: `[${taskCode}] ${t.title}`,
        description: [
          t.description || '',
          '',
          `Project: ${(project as any).code || (project as any).name}`,
          `Linked to Pragati task: ${taskUrl}`,
        ].filter(Boolean).join('\n'),
        url: taskUrl,
        start,
        end,
      };
    });

    const ics = buildICS(events, {
      calName: `Pragati · ${(project as any).code || (project as any).name}`,
    });
    const safe = String((project as any).code || (project as any).name || params.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
    return icsResponse(ics, `${safe}.ics`);
  } catch (e) {
    return handleError(e);
  }
}
