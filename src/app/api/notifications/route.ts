import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Notification } from '@/models/Notification';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/notifications — the current user's recent notifications plus
 *  their unread count. Polled by the bell in the app shell. */
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const [items, unread] = await Promise.all([
      Notification.find({ userId: user.sub }).sort({ createdAt: -1 }).limit(30).lean(),
      Notification.countDocuments({ userId: user.sub, read: false }),
    ]);

    return NextResponse.json({
      unread,
      items: items.map((n: any) => ({
        id:        String(n._id),
        type:      n.type,
        title:     n.title,
        body:      n.body,
        taskId:    n.taskId ? String(n.taskId) : null,
        projectId: n.projectId ? String(n.projectId) : null,
        read:      !!n.read,
        createdAt: n.createdAt,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}
