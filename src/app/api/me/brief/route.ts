import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildDailyBrief } from '@/lib/brief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/brief — the viewer's Daily Brief (see src/lib/brief.ts).
 * Always scoped to the caller; there is no way to request someone else's.
 */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    const brief = await buildDailyBrief(user!.sub, user!.role);
    return NextResponse.json(brief, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return handleError(e);
  }
}
