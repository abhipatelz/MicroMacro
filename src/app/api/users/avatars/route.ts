import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Lightweight avatar registry.
 *
 * Returns a compact map of userId → monogram style for every user who has
 * customised their avatar. The client (AvatarRegistry context) fetches this
 * once per session and renders any other user's monogram everywhere their
 * avatar appears — without each list endpoint having to carry the three
 * avatar fields itself. Users who never customised their avatar are omitted,
 * so the payload stays tiny and the Avatar component cleanly falls back to
 * name-derived initials + a hashed gradient for them.
 */
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    // Only rows with a custom background set count as "customised".
    const rows = await User.find(
      { avatarBg: { $nin: [null, ''] } },
      '_id avatarLetter avatarBg avatarFont',
    ).lean();

    const avatars: Record<string, { letter: string; bg: string; font: number }> = {};
    for (const r of rows as any[]) {
      avatars[String(r._id)] = {
        letter: r.avatarLetter || '',
        bg:     r.avatarBg || '',
        font:   typeof r.avatarFont === 'number' ? r.avatarFont : 0,
      };
    }

    return NextResponse.json({ avatars });
  } catch (e) {
    return handleError(e);
  }
}
