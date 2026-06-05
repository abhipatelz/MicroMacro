import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { ErrorLog } from '@/models/ErrorLog';
import { requireUser, isAdmin } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { handleError, readBody } from '@/lib/http';
import { captureError } from '@/lib/errorMonitor';

export const runtime = 'nodejs';

const ReportBody = z.object({
  message: z.string().min(1).max(1000),
  stack:   z.string().max(8000).optional(),
  digest:  z.string().max(200).optional(),
  path:    z.string().max(500).optional(),
});

/**
 * Client-side error report. The route-level error boundary posts here when a
 * page crashes during render, so client crashes show up in the same admin
 * monitoring view as server failures. Any authenticated user can report.
 */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    // A buggy client in a render loop could try to post hundreds of
    // identical errors per minute. Cap at 30/min/user so the collection
    // can't be flooded; legitimate one-off crashes always make it through.
    if (!rateLimit(`errors:${user!.sub}`, 30, 60_000)) {
      // Quietly drop excess reports — the client already crashed, there is
      // no value in returning an error message that might re-trigger.
      return NextResponse.json({ ok: true, throttled: true });
    }
    const body = await readBody(req, ReportBody);
    await captureError({
      source: 'client',
      message: body.message,
      stack: body.stack,
      digest: body.digest,
      path: body.path,
      statusCode: 0,
      userId: user!.sub,
      userName: user!.name,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

/**
 * Admin-only: the most recent captured errors for the monitoring view.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isAdmin(user!.role)) {
      return NextResponse.json({ error: 'Admins only' }, { status: 403 });
    }
    await connectDB();
    const onlyOpen = req.nextUrl.searchParams.get('acknowledged') === '0';
    const filter = onlyOpen ? { acknowledged: false } : {};
    const [items, unacknowledged] = await Promise.all([
      ErrorLog.find(filter).sort({ lastSeenAt: -1 }).limit(50).lean(),
      ErrorLog.countDocuments({ acknowledged: false }),
    ]);
    return NextResponse.json({
      unacknowledged,
      errors: items.map((e: any) => ({
        id:         String(e._id),
        source:     e.source,
        message:    e.message,
        digest:     e.digest || '',
        path:       e.path || '',
        method:     e.method || '',
        statusCode: e.statusCode ?? 500,
        userName:   e.userName || '',
        count:      e.count ?? 1,
        acknowledged: !!e.acknowledged,
        lastSeenAt: e.lastSeenAt ? new Date(e.lastSeenAt).toISOString() : null,
        createdAt:  e.createdAt ? new Date(e.createdAt).toISOString() : null,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

const AckBody = z.object({
  id:  z.string().optional(),
  all: z.boolean().optional(),
});

/**
 * Admin-only: acknowledge (dismiss) one error or all of them.
 */
export async function PATCH(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isAdmin(user!.role)) {
      return NextResponse.json({ error: 'Admins only' }, { status: 403 });
    }
    await connectDB();
    const { id, all } = await readBody(req, AckBody);
    if (all) {
      await ErrorLog.updateMany({ acknowledged: false }, { $set: { acknowledged: true } });
    } else if (id) {
      await ErrorLog.updateOne({ _id: id }, { $set: { acknowledged: true } });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
