import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Highlight } from '@/models/Highlight';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { HIGHLIGHT_ACCENTS, serializeHighlight } from '@/lib/highlights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PatchBody = z.object({
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().max(280).optional(),
  accent: z.enum(HIGHLIGHT_ACCENTS).optional(),
});

/** PATCH — edit one of your OWN highlights (title / body / accent). */
export async function PATCH(req: NextRequest, { params }: { params: { id: string; hid: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (user.sub !== params.id) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    await connectDB();
    const { title, body, accent } = await readBody(req, PatchBody);
    const updated = await Highlight.findOneAndUpdate(
      { _id: params.hid, userId: user.sub },
      { title, body: body || '', ...(accent ? { accent } : {}) },
      { new: true },
    ).lean();
    if (!updated) return NextResponse.json({ error: 'Highlight not found.' }, { status: 404 });
    return NextResponse.json(serializeHighlight(updated, user.sub));
  } catch (e) {
    return handleError(e);
  }
}

/** DELETE — remove one of your OWN highlights. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string; hid: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (user.sub !== params.id) return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    await connectDB();
    await Highlight.deleteOne({ _id: params.hid, userId: user.sub });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
