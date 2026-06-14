import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Highlight } from '@/models/Highlight';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { notify } from '@/lib/notify';
import { HIGHLIGHT_REACTIONS, applyReactionToggle, serializeHighlight } from '@/lib/highlights';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ emoji: z.enum(HIGHLIGHT_REACTIONS) });

/** POST — toggle the viewer's reaction on a highlight. One reaction per member:
 *  tapping the same emoji clears it, a different one switches it. Any signed-in
 *  member can react (the directory is open by design). The highlight owner gets
 *  a best-effort notification when a reaction is added or switched. */
export async function POST(req: NextRequest, { params }: { params: { id: string; hid: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const h = await Highlight.findById(params.hid);
    if (!h) return NextResponse.json({ error: 'Highlight not found.' }, { status: 404 });

    const { emoji } = await readBody(req, Body);
    const { added } = applyReactionToggle(h.reactions as any[], user.sub, emoji);
    await h.save();

    if (added) {
      // Fire-and-forget; never blocks the response. notify() already skips
      // self-actions, so reacting to your own highlight stays silent.
      void notify({
        userId: String(h.userId),
        actorId: user.sub,
        type: 'general',
        title: `${(user as any).name || 'A colleague'} reacted to your highlight`,
        body: `${emoji}  ${h.title}`,
      });
    }

    return NextResponse.json(serializeHighlight(h, user.sub));
  } catch (e) {
    return handleError(e);
  }
}
