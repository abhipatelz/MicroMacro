import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { findPastCases, checkCapaEffectiveness } from '@/lib/qualitySignals';
import { getTaskAccess } from '@/lib/taskAccess';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;

    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }

    await connectDB();
    // Same visibility floor as every other task surface — a task someone
    // can't open must not be usable as an input to similarity scoring either.
    const access = await getTaskAccess(params.id, user!.sub, user!.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const task = access.task as any;

    const isClosed = task.status === 'done' && task.completedAt;

    const [pastCases, effectiveness] = await Promise.all([
      findPastCases(params.id),
      isClosed
        ? checkCapaEffectiveness(params.id, new Date(task.completedAt))
        : Promise.resolve(null),
    ]);

    return NextResponse.json({ pastCases, effectiveness });
  } catch (e) {
    return handleError(e);
  }
}
