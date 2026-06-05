import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { clearAuthCookie, verifyToken } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * Logout — clears the auth cookie AND invalidates the server-side session.
 *
 * Without the server-side step, a JWT stolen from disk/network before logout
 * would remain valid until natural expiry — every authenticated request only
 * checks the token signature + sessionVersion + activeSessionId. By bumping
 * sessionVersion and clearing activeSessionId here we hard-revoke ALL active
 * sessions for this user, which is what 21 CFR Part 11 §11.10(d) ("limiting
 * system access to authorized individuals") expects of a sign-out gesture.
 *
 * Best-effort: cookie is always cleared. If the token is unreadable, or the
 * DB write fails, the cookie clear still wins (the user's intent — sign out
 * on this device — is honoured) and the error is logged for the operator.
 */
export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res);
  try {
    const cookieHeader = req.cookies.get('auth')?.value;
    if (cookieHeader) {
      // Best-effort: if the token is expired or tampered, the verify throws
      // and we still complete the cookie-clear in the outer flow.
      const payload = verifyToken(cookieHeader);
      const userId = (payload as any)?.sub;
      if (userId) {
        await connectDB();
        await User.updateOne(
          { _id: userId },
          { $inc: { sessionVersion: 1 }, $set: { activeSessionId: null } },
        );
      }
    }
  } catch (e) {
    // Token unreadable / DB unreachable — still complete the cookie clear so
    // the user's intent is honoured. Logged via the error sink for ops.
    console.error('[auth/logout] session-invalidate failed', e);
  }
  // Keep the trusted-device cookie. Signing out ends the active session, but
  // this same browser can return with Quick PIN instead of password.
  return res;
}
