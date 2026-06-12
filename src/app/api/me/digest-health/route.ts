import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { loadDigestSettings, digestTimeZone, defaultDigestHour } from '@/lib/digest';
import { mailerConfigured } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/digest-health — can the daily email actually reach me?
 *
 * Readable by ANY signed-in user (no secrets exposed — only booleans and a
 * timestamp), so the personal toggle can be honest: a user who switches the
 * digest on while the deployment has no mail provider or cron secret sees
 * "delivery isn't configured yet" instead of a toggle that silently does
 * nothing — which is exactly the support ticket this endpoint prevents.
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const settings = await loadDigestSettings();
    const tz = digestTimeZone();
    // A short human label for the workspace timezone (e.g. "GMT+5:30"), so the
    // hour picker can say which clock the chosen hour is in.
    let tzLabel = tz;
    try {
      tzLabel =
        new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
          .formatToParts(new Date())
          .find((p) => p.type === 'timeZoneName')?.value || tz;
    } catch {
      /* keep the IANA name */
    }
    return NextResponse.json(
      {
        mailerConfigured: mailerConfigured(),
        cronSecretSet: !!process.env.CRON_SECRET,
        workspaceEnabled: (settings as any).enabled !== false,
        lastRunAt: (settings as any).lastRunAt ? new Date((settings as any).lastRunAt).toISOString() : null,
        timeZone: tz,
        timeZoneLabel: tzLabel,
        defaultHour: defaultDigestHour(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return handleError(e);
  }
}
