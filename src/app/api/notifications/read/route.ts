import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Notification } from '@/models/Notification';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  // Mark a single notification read, or omit `id` to mark all read. When
  // present it must be a valid ObjectId so a malformed value is rejected
  // cleanly instead of triggering a Mongoose CastError 500 on the filter.
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid notification id').optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid notification id' }, { status: 400 });
    }
    const id = parsed.data.id;

    // Scope every write to the caller's own notifications.
    const filter: any = { userId: user.sub, read: false };
    if (id) filter._id = id;
    await Notification.updateMany(filter, { $set: { read: true } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
