import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildContributions } from '@/lib/contributions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const { searchParams } = new URL(req.url);
    const currentYear = new Date().getFullYear();
    const year = Math.min(Math.max(parseInt(searchParams.get('year') || '') || currentYear, 2020), currentYear + 1);

    const data = await buildContributions(user!.sub, year);
    return NextResponse.json(data);
  } catch (e) {
    return handleError(e);
  }
}
