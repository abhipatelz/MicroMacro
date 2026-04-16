import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'lead', 'manager', 'admin');
    if (error) return error;
    await connectDB();
    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (!t.requiresQaSignoff)
      return NextResponse.json({ error: 'Task does not require QA sign-off' }, { status: 400 });
    t.qaSignoffUserId = user.sub as any;
    t.qaSignoffAt = new Date();
    await t.save();
    return NextResponse.json(taskS(t));
  } catch (e) {
    return handleError(e);
  }
}
