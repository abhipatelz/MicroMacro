import { NextRequest, NextResponse } from 'next/server';
import { isLead, requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { assessOpenTasks } from '@/lib/ai/riskService';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    const { searchParams } = req.nextUrl;
    const lead = isLead(user.role);
    const teamId = lead ? (searchParams.get('teamId') || undefined) : undefined;
    const userId = lead ? (searchParams.get('userId') || undefined) : user.sub;
    const data = await assessOpenTasks({ teamId, userId });
    return NextResponse.json(data);
  } catch (e) {
    return handleError(e);
  }
}
