import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { getTaskAccess } from '@/lib/taskAccess';
import { handleError, readBody } from '@/lib/http';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Body = z.object({ body: z.string().min(1).max(4000) });

// PATCH /api/tasks/[id]/comments/[commentId]
// Edit a comment. Only the comment's original author may edit it — a comment
// is an attributable record, so it stays bound to the person who wrote it.
export async function PATCH(req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id) || !mongoose.isValidObjectId(params.commentId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    await connectDB();
    const body = await readBody(req, Body);

    const access = await getTaskAccess(params.id, user.sub, user.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const c = (t as any).comments.id(params.commentId);
    if (!c) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

    // Authorship gate — only the author edits their own words.
    if (String(c.userId) !== user.sub) {
      return NextResponse.json({ error: 'You can only edit your own comment.' }, { status: 403 });
    }

    c.body = body.body;
    (t as any).lastActivityAt = new Date();
    await t.save();

    const author = await User.findById(user.sub).lean();
    return NextResponse.json({
      id: String(c._id),
      userId: user.sub,
      userName: (author as any)?.name,
      body: c.body,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    });
  } catch (e) {
    return handleError(e);
  }
}

// DELETE /api/tasks/[id]/comments/[commentId]
// Remove a comment. Only the original author may delete it.
export async function DELETE(req: NextRequest, { params }: { params: { id: string; commentId: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id) || !mongoose.isValidObjectId(params.commentId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    await connectDB();

    const access = await getTaskAccess(params.id, user.sub, user.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const c = (t as any).comments.id(params.commentId);
    if (!c) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });

    if (String(c.userId) !== user.sub) {
      return NextResponse.json({ error: 'You can only delete your own comment.' }, { status: 403 });
    }

    c.deleteOne();
    (t as any).lastActivityAt = new Date();
    await t.save();

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
