import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { getTaskAccess, canActOnOwnTask } from '@/lib/taskAccess';
import { handleError, readBody } from '@/lib/http';
import { task as taskS } from '@/lib/serialize';

export const runtime = 'nodejs';

const Body = z.object({
  minutes: z.number().int().min(1).max(24 * 60 * 30),
  note: z.string().max(500).optional().default(''),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(['manual', 'calendar']).optional().default('manual'),
});

/** POST /api/tasks/:id/effort — log effort against a task. Lead/admin or the
 *  task's own assignee (people log time on their own work). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }
    await connectDB();

    const body = await readBody(req, Body);

    const access = await getTaskAccess(params.id, user.sub, user.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!canActOnOwnTask(access)) {
      return NextResponse.json(
        { error: 'You can only log effort on a task assigned to you.' },
        { status: 403 },
      );
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    t.effortLog.push({
      userId: user.sub as any,
      minutes: body.minutes,
      note: body.note || '',
      onDate: body.onDate || new Date().toISOString().slice(0, 10),
      source: body.source || 'manual',
    } as any);

    // Roll up actual hours from the effort log so existing UI keeps working.
    const totalMins = t.effortLog.reduce((s: number, e: any) => s + (e.minutes || 0), 0);
    t.actualHours = Math.round((totalMins / 60) * 10) / 10;
    t.lastActivityAt = new Date();

    await t.save();
    return NextResponse.json(taskS(t));
  } catch (e) {
    return handleError(e);
  }
}
