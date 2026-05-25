import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { ScratchNote } from '@/models/ScratchNote';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Patch = z.object({
  done: z.boolean().optional(),
  text: z.string().trim().min(1).max(2000).optional(),
  promotedTaskId: z.string().optional(),
});

/** PATCH — toggle done, edit text, or stamp the promoted task. Scoped to
 *  the caller's own notes. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    await connectDB();
    const body = await readBody(req, Patch);

    const updated = await ScratchNote.findOneAndUpdate(
      { _id: params.id, userId: user.sub },
      { $set: body },
      { new: true },
    ).lean();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }
    await connectDB();
    await ScratchNote.deleteOne({ _id: params.id, userId: user.sub });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
