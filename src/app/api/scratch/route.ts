import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { ScratchNote } from '@/models/ScratchNote';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serialize(n: any) {
  return {
    id: String(n._id),
    text: n.text,
    done: !!n.done,
    promotedTaskId: n.promotedTaskId ? String(n.promotedTaskId) : null,
    createdAt: n.createdAt,
  };
}

/** GET — the caller's own notes. Open notes first (carry over), then a
 *  capped slice of recently-done ones for context. */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const [open, done] = await Promise.all([
      ScratchNote.find({ userId: user.sub, done: false }).sort({ createdAt: -1 }).lean(),
      ScratchNote.find({ userId: user.sub, done: true }).sort({ updatedAt: -1 }).limit(20).lean(),
    ]);

    return NextResponse.json({ open: open.map(serialize), done: done.map(serialize) });
  } catch (e) {
    return handleError(e);
  }
}

const CreateBody = z.object({ text: z.string().trim().min(1).max(2000) });

/** POST — capture a new note. */
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const { text } = await readBody(req, CreateBody);
    const note = await ScratchNote.create({ userId: user.sub, text });
    return NextResponse.json(serialize(note));
  } catch (e) {
    return handleError(e);
  }
}
