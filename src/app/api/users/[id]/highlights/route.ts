import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Highlight } from '@/models/Highlight';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { HIGHLIGHT_ACCENTS, serializeHighlight } from '@/lib/highlights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — a user's highlights, newest first. Any signed-in member can read
 *  (the workspace directory is open by design), capped for a clean ring row.
 *  Reactions are serialized relative to the viewer so the bar can show their
 *  own selection. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const list = await Highlight.find({ userId: params.id }).sort({ createdAt: -1 }).limit(12).lean();
    return NextResponse.json({ highlights: list.map((h) => serializeHighlight(h, user.sub)) });
  } catch (e) {
    return handleError(e);
  }
}

const CreateBody = z.object({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().max(280).optional(),
  accent: z.enum(HIGHLIGHT_ACCENTS).optional(),
});

/** POST — add a highlight to your OWN profile only. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (user.sub !== params.id)
      return NextResponse.json(
        { error: 'You can only post highlights to your own profile.' },
        { status: 403 },
      );
    await connectDB();
    // Keep the row tidy — cap at 12 per person; oldest falls off.
    const count = await Highlight.countDocuments({ userId: user.sub });
    if (count >= 12) {
      const oldest = await Highlight.find({ userId: user.sub })
        .sort({ createdAt: 1 })
        .limit(count - 11);
      await Highlight.deleteMany({ _id: { $in: oldest.map((h) => h._id) } });
    }
    const { title, body, accent } = await readBody(req, CreateBody);
    const h = await Highlight.create({ userId: user.sub, title, body: body || '', accent: accent || 'blue' });
    return NextResponse.json(serializeHighlight(h, user.sub));
  } catch (e) {
    return handleError(e);
  }
}
