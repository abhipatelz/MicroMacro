import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { assessOpenTasks } from '@/lib/ai/riskService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    const { searchParams } = req.nextUrl;
    const teamId = searchParams.get('teamId') || undefined;
    const userId = searchParams.get('userId') || undefined;
    const data = await assessOpenTasks({ teamId, userId });
    return NextResponse.json(data);
  } catch (e) {
    return handleError(e);
  }
}
