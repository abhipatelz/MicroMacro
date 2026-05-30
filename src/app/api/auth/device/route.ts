import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { getDeviceUserId } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// Tells the login screen whether THIS device has previously completed a full
// sign-in and, if so, who for and whether they have a Quick PIN set. When
// `trusted` + `hasPin` are both true the UI offers the PIN pad; otherwise it
// falls back to the full username + password form. Returns no sensitive data
// beyond a display name, and only when the device cookie verifies.
export async function GET(req: NextRequest) {
  try {
    const userId = getDeviceUserId(req);
    if (!userId) return NextResponse.json({ trusted: false });
    await connectDB();
    const user = await User.findById(userId, 'name username pinHash lockedAt').lean();
    if (!user) return NextResponse.json({ trusted: false });
    return NextResponse.json({
      trusted: true,
      name: (user as any).name || (user as any).username || '',
      hasPin: !!(user as any).pinHash,
      locked: !!(user as any).lockedAt,
    });
  } catch (e) {
    return handleError(e);
  }
}
