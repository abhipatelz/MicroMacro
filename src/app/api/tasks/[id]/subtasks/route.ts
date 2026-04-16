import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { subtask as subS } from '@/lib/serialize';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Body = z.object({
  title: z.string().min(1),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional()
});

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const sub = {
      _id: new mongoose.Types.ObjectId(),
      title: body.title,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      status: 'todo' as const,
      position: (t as any).subtasks?.length || 0
    };
    (t as any).subtasks.push(sub);
    await t.save();
    return NextResponse.json(subS(sub));
  } catch (e) {
    return handleError(e);
  }
}
