import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildICS, icsResponse } from '@/lib/ics';

export const runtime = 'nodejs';

/**
 * GET /api/tasks/:id/calendar?at=YYYY-MM-DDTHH:MM&dur=30
 *  - Generates a .ics file the user can open in Outlook / Google / Apple.
 *  - Title prefixed with [PRAG-T-<id-prefix>] so calendar events stay
 *    discoverable and human-recognisable.
 *  - URL field links back to the Pragati task page.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const t = await Task.findById(params.id).lean();
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const project = await Project.findById(t.projectId).lean();

    const url = new URL(req.url);
    const atStr = url.searchParams.get('at');     // ISO datetime
    const durStr = url.searchParams.get('dur');   // minutes
    const duration = Math.max(5, Math.min(60 * 12, parseInt(durStr || '30', 10) || 30));

    let start: Date;
    if (atStr) {
      const parsed = new Date(atStr);
      start = isNaN(parsed.getTime()) ? defaultStart() : parsed;
    } else {
      // Default: tomorrow 10:00 local
      start = defaultStart();
    }
    const end = new Date(start.getTime() + duration * 60_000);

    const taskCode = `PRAG-T-${String(t._id).slice(-6).toUpperCase()}`;
    const projCode = (project as any)?.code || (project as any)?.name || '';
    const baseUrl = (process.env.APP_URL || `${url.protocol}//${url.host}`).replace(/\/$/, '');
    const taskUrl = `${baseUrl}/tasks/${t._id}`;

    const ics = buildICS([
      {
        uid: `${taskCode}@pragati`,
        title: `[${taskCode}] ${t.title}`,
        description: [
          t.description || '',
          '',
          `Linked to Pragati task: ${taskUrl}`,
          projCode ? `Project: ${projCode}` : '',
        ].filter(Boolean).join('\n'),
        url: taskUrl,
        start,
        end,
      },
    ], { calName: `Pragati · ${t.title}` });

    // Side effect: log this scheduled meeting as planned effort so PMs
    // can see the work being committed to the task.
    try {
      await Task.updateOne(
        { _id: params.id },
        {
          $push: {
            effortLog: {
              userId: (await requireUser(req)).user!.sub,
              minutes: duration,
              note: `Scheduled meeting · ${start.toISOString().slice(0, 16).replace('T', ' ')}`,
              onDate: start.toISOString().slice(0, 10),
              source: 'calendar',
            },
          },
          $set: { lastActivityAt: new Date() },
        }
      );
    } catch { /* non-fatal — still serve the .ics */ }

    return icsResponse(ics, `${taskCode}.ics`);
  } catch (e) {
    return handleError(e);
  }
}

function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}
