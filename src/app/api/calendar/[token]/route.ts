import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { handleError } from '@/lib/http';
import { appBaseUrl, effectiveDue } from '@/lib/digest';
import { renderAgendaIcs, type IcsTask } from '@/lib/ics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/calendar/[token] — the personal agenda feed (iCalendar).
 *
 * Capability-token auth: calendar clients can't carry session cookies, so the
 * random per-user token in the URL is the credential. It is rotatable and
 * revocable from Settings, and grants exactly one read-only view: the owner's
 * open tasks by due date (30 days back for overdue context, 60 days ahead).
 */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params.token.replace(/\.ics$/i, '');
    // Tokens are 48 hex chars; reject anything else before touching the DB.
    if (!/^[a-f0-9]{48}$/i.test(token)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await connectDB();
    const owner = await User.findOne({ icsToken: token, active: { $ne: false } })
      .select('_id name')
      .lean();
    if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const now = new Date();
    // 30 days back keeps overdue context; the future is effectively unbounded
    // (2 years) so every dated task the user plans is already on the calendar
    // the moment it's created — no re-subscribe, no horizon surprises.
    const lower = new Date(now.getTime() - 30 * DAY_MS);
    const upper = new Date(now.getTime() + 730 * DAY_MS);
    const tasks = await Task.find({
      assigneeId: (owner as any)._id,
      status: { $ne: 'done' },
      $or: [{ ccTcd: { $gte: lower, $lt: upper } }, { ccTcd: null, dueDate: { $gte: lower, $lt: upper } }],
    })
      .select('_id title status priority dueDate ccTcd projectId updatedAt')
      .limit(300)
      .lean();

    const projIds = [...new Set(tasks.map((t: any) => String(t.projectId)).filter(Boolean))];
    const projects = projIds.length
      ? await Project.find({ _id: { $in: projIds } })
          .select('_id name')
          .lean()
      : [];
    const projName = new Map(projects.map((p: any) => [String(p._id), p.name]));

    const items: IcsTask[] = [];
    for (const t of tasks as any[]) {
      const due = effectiveDue(t);
      if (!due) continue;
      items.push({
        id: String(t._id),
        title: t.title,
        projectName: t.projectId ? projName.get(String(t.projectId)) || null : null,
        due,
        status: t.status,
        priority: t.priority || null,
        updatedAt: t.updatedAt ? new Date(t.updatedAt) : null,
      });
    }

    const body = renderAgendaIcs({
      // One calendar, one name. Subscribers see a calendar called "Pragati"
      // in Outlook/Google/Apple — not a per-user label they didn't choose.
      calendarName: 'Pragati',
      tasks: items,
      appUrl: appBaseUrl(),
      now,
    });
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="pragati-agenda.ics"',
        // Short TTL so a date change shows up on the next client poll. Clients
        // still honour the in-feed REFRESH-INTERVAL for how often they ask.
        'Cache-Control': 'private, max-age=120, must-revalidate',
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
