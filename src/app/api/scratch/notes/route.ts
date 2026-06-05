import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import UserNote from '@/models/UserNote';
import { requireUser } from '@/lib/auth';
import { rateLimit } from '@/lib/rateLimit';
import { handleError, readBody } from '@/lib/http';

// Hard ceiling per user so a buggy client or a malicious account cannot
// fill the collection. Combined with the 50 KB content cap in the Zod
// schema below, the worst-case footprint is bounded.
const MAX_NOTES_PER_USER = 500;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serialize(n: any) {
  return {
    id:             String(n._id),
    title:          n.title || null,
    content:        n.content,
    type:           n.type,
    whiteboardData: n.whiteboardData || null,
    pinned:         !!n.pinned,
    createdAt:      n.createdAt,
    updatedAt:      n.updatedAt,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const notes = await UserNote.find({ userId: user.sub })
      .sort({ pinned: -1, createdAt: -1 })
      .limit(100)
      .lean();
    return NextResponse.json(notes.map(serialize));
  } catch (e) {
    return handleError(e);
  }
}

const CreateBody = z.object({
  title:          z.string().trim().max(200).optional(),
  content:        z.string().trim().min(1).max(50000),
  type:           z.enum(['text', 'whiteboard']).default('text'),
  whiteboardData: z.any().optional(),
  pinned:         z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    // Throttle so a runaway client cannot spam the collection.
    if (!rateLimit(`notes-create:${user.sub}`, 30, 60_000)) {
      return NextResponse.json(
        { error: 'Too many notes created in a short time. Wait a minute and try again.' },
        { status: 429 },
      );
    }
    await connectDB();
    const body = await readBody(req, CreateBody);
    // Hard per-user cap. A user who hits this should delete or archive old
    // notes before creating more — bounded storage > silently grow forever.
    const existing = await UserNote.countDocuments({ userId: user.sub });
    if (existing >= MAX_NOTES_PER_USER) {
      return NextResponse.json(
        { error: `You've reached the maximum of ${MAX_NOTES_PER_USER} notes. Delete a few to make room.` },
        { status: 409 },
      );
    }
    const note = await UserNote.create({ userId: user.sub, ...body });
    return NextResponse.json(serialize(note));
  } catch (e) {
    return handleError(e);
  }
}
