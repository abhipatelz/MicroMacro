import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Notification } from '@/models/Notification';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  // Mark a single notification read, or omit `id` to mark all read.
  id: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const body = await req.json().catch(() => ({}));
    const parsed = Body.safeParse(body);
    const id = parsed.success ? parsed.data.id : undefined;

    // Scope every write to the caller's own notifications.
    const filter: any = { userId: user.sub, read: false };
    if (id) filter._id = id;
    await Notification.updateMany(filter, { $set: { read: true } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
