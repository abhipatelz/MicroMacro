import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildContributions } from '@/lib/contributions';

export const runtime = 'nodejs';

// Any signed-in member can view a colleague's contribution graph (read-only).
// Profiles + the People directory are open across the workspace by design
// (see CLAUDE.md); this exposes delivered-work points only — completed tasks
// weighted for on-time/priority — never credentials or private records.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const currentYear = new Date().getFullYear();
    const year = Math.min(Math.max(parseInt(searchParams.get('year') || '') || currentYear, 2020), currentYear + 1);

    const data = await buildContributions(params.id, year);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    });
  } catch (e) {
    return handleError(e);
  }
}
