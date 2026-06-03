import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { buildContributions } from '@/lib/contributions';

export const runtime = 'nodejs';

// A team lead / admin peeking at a teammate's contribution graph (read-only).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'lead', 'admin');
    if (error) return error;
    await connectDB();

    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const currentYear = new Date().getFullYear();
    const year = Math.min(Math.max(parseInt(searchParams.get('year') || '') || currentYear, 2020), currentYear + 1);

    const data = await buildContributions(params.id, year);
    return NextResponse.json(data);
  } catch (e) {
    return handleError(e);
  }
}
