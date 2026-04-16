import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { listLifecycles, LIFECYCLES } from '@/lib/lifecycles';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { error } = await requireUser(req);
  if (error) return error;
  const key = req.nextUrl.searchParams.get('key');
  if (key) {
    const lc = (LIFECYCLES as any)[key];
    if (!lc) return NextResponse.json({ error: 'Unknown lifecycle' }, { status: 404 });
    return NextResponse.json({ key, ...lc });
  }
  return NextResponse.json(listLifecycles());
}
