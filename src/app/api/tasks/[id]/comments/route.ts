import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { isContributor, requireUser } from '@/lib/auth';
import { getTaskAccess, canActOnOwnTask } from '@/lib/taskAccess';
import { handleError, readBody } from '@/lib/http';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Body = z.object({ body: z.string().min(1).max(4000) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }
    await connectDB();
    const body = await readBody(req, Body);

    // Visible + (lead OR assignee). A contributor can comment on a task
    // assigned to them; anyone else with mere visibility cannot.
    const access = await getTaskAccess(params.id, user.sub, user.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (!canActOnOwnTask(access)) {
      return NextResponse.json(
        { error: 'You can only comment on tasks assigned to you.' },
        { status: 403 },
      );
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (isContributor(user.role) && String(t.assigneeId) !== user.sub && !(t as any).subtasks?.some((s: any) => String(s.assigneeId) === user.sub))
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    const c = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(user.sub),
      body: body.body,
      createdAt: new Date()
    } as any;
    (t as any).comments.push(c);
    (t as any).lastActivityAt = new Date();
    await t.save();
    const author = await User.findById(user.sub).lean();
    return NextResponse.json({
      id: String(c._id),
      userId: user.sub,
      userName: (author as any)?.name,
      body: c.body,
      createdAt: c.createdAt
    });
  } catch (e) {
    return handleError(e);
  }
}
