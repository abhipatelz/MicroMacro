import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { subtask as subS } from '@/lib/serialize';

export const runtime = 'nodejs';

const Patch = z.object({
  title: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  assigneeId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional()
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; subId: string } }
) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Patch);
    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const sub = (t as any).subtasks.id(params.subId);
    if (!sub) return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
    const prev = sub.status;
    if (body.title !== undefined) sub.title = body.title;
    if (body.status !== undefined) {
      sub.status = body.status;
      if (body.status === 'done' && prev !== 'done') sub.completedAt = new Date();
      else if (body.status !== 'done') sub.completedAt = null;
    }
    if (body.assigneeId !== undefined) sub.assigneeId = body.assigneeId || null;
    if (body.dueDate !== undefined) sub.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    await t.save();
    return NextResponse.json(subS(sub));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; subId: string } }
) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    (t as any).subtasks = (t as any).subtasks.filter((s: any) => String(s._id) !== params.subId);
    await t.save();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
