import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildAndSendDailyDigests } from '@/lib/digest';

export const runtime = 'nodejs';
// Never statically evaluated — this route reads the clock and the DB on every
// hit and must never be cached.
export const dynamic = 'force-dynamic';
// Sending is sequential; give the function room for a batch of recipients.
export const maxDuration = 60;

/**
 * Daily task-due email digest.
 *
 * Triggered three ways, all funnelling into the same builder:
 *   1. Vercel Cron (08:30 IST — see vercel.json). When CRON_SECRET is set,
 *      Vercel attaches `Authorization: Bearer <CRON_SECRET>` automatically; we
 *      require it. Fail-closed: with no secret and no admin session the request
 *      is rejected, so the endpoint can never become an open email cannon.
 *   2. Manual admin run — an authenticated admin hits it to force a send now.
 *   3. Admin test — `?test=1` sends a single sample digest to the admin's own
 *      address, ignoring opt-in / master-switch / empty-skip, so delivery can
 *      be verified from the Settings panel.
 */
export async function GET(req: NextRequest) {
  try {
    const isTest = req.nextUrl.searchParams.get('test') === '1';

    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    const cronAuthed = !!secret && auth === `Bearer ${secret}`;

    // Anything that isn't a verified cron call must be an admin (also required
    // for test mode, which emails the caller). Master-admin is a strict
    // superset of admin everywhere in the app, so it is accepted here too.
    let adminId: string | null = null;
    if (!cronAuthed || isTest) {
      const { user, error } = await requireRole(req, 'admin', 'master_admin');
      if (error) return error;
      adminId = user.sub;
    }

    if (isTest) {
      const summary = await buildAndSendDailyDigests({ test: true, onlyUserId: adminId! });
      return NextResponse.json({ mode: 'test', ...summary }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const summary = await buildAndSendDailyDigests({});
    return NextResponse.json(
      { mode: cronAuthed ? 'cron' : 'manual', ...summary },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return handleError(e);
  }
}
