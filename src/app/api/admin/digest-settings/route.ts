import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { DigestSetting } from '@/models/DigestSetting';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { logOperation } from '@/lib/audit';
import { loadDigestSettings, digestTimeZone, digestDailyCap, appBaseUrl } from '@/lib/digest';
import { mailerConfigured, configuredSender } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Shape returned to the admin UI — the saved config plus a live "is delivery
 *  actually wired up?" checklist, so the operator can see exactly what env is
 *  still missing without leaving the page. */
function serialize(doc: any) {
  return {
    enabled: doc.enabled !== false,
    dueToday: doc.dueToday !== false,
    overdue: doc.overdue !== false,
    dueSoonDays: typeof doc.dueSoonDays === 'number' ? doc.dueSoonDays : 0,
    projectUpdates: !!doc.projectUpdates,
    sendWhenEmpty: !!doc.sendWhenEmpty,
    introNote: doc.introNote || '',
    updatedByName: doc.updatedByName || '',
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    lastRunAt: doc.lastRunAt ? new Date(doc.lastRunAt).toISOString() : null,
    lastRunSummary: doc.lastRunSummary || null,
  };
}

function setupStatus() {
  return {
    mailerConfigured: mailerConfigured(),
    senderEmail: configuredSender(),
    appUrlConfigured: !!appBaseUrl(),
    cronSecretSet: !!process.env.CRON_SECRET,
    timeZone: digestTimeZone(),
    sendTimeLocal: '08:30',
    dailyCap: digestDailyCap(),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();
    const doc = await loadDigestSettings();
    return NextResponse.json({ settings: serialize(doc), status: setupStatus() });
  } catch (e) {
    return handleError(e);
  }
}

const Body = z.object({
  enabled: z.boolean().optional(),
  dueToday: z.boolean().optional(),
  overdue: z.boolean().optional(),
  dueSoonDays: z.number().int().min(0).max(14).optional(),
  projectUpdates: z.boolean().optional(),
  sendWhenEmpty: z.boolean().optional(),
  introNote: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { error, user: caller } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);

    const $set: Record<string, any> = { updatedByName: caller.name || '' };
    for (const k of [
      'enabled',
      'dueToday',
      'overdue',
      'dueSoonDays',
      'projectUpdates',
      'sendWhenEmpty',
      'introNote',
    ] as const) {
      if (body[k] !== undefined) $set[k] = body[k];
    }

    const doc = await DigestSetting.findByIdAndUpdate(
      'global',
      { $set, $setOnInsert: { _id: 'global' } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    // Operational provenance — who tuned the workspace-wide digest config.
    await logOperation({
      action: 'settings.digest_update',
      category: 'general',
      actor: caller,
      targetType: 'setting',
      targetId: 'digest',
      targetLabel: 'Daily email digest',
      summary: 'Updated daily email digest settings',
      meta: { changed: Object.keys($set).filter((k) => k !== 'updatedByName') },
    });

    return NextResponse.json({ settings: serialize(doc), status: setupStatus() });
  } catch (e) {
    return handleError(e);
  }
}
