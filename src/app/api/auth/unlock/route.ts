import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import {
  signToken, setAuthCookie, setDeviceCookie, clearDeviceCookie,
  getDeviceUserId, newSessionId,
} from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';
import { rateLimit } from '@/lib/rateLimit';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

const Body = z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN must be 4 digits') });

// Wrong-PIN budget before the convenience unlock is revoked and the user is
// forced back to the full password (defence against shoulder-surfed PINs).
const MAX_PIN_FAILS = 5;

// Resume an idle session with the Quick PIN. This is ONLY reachable on a device
// whose trusted-device cookie verifies — i.e. one that previously completed a
// full username+password sign-in. A new device can never unlock with a PIN.
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`unlock:${ip}`, 15, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Wait a minute and try again.' }, { status: 429 });
    }

    const body = await readBody(req, Body);

    // The device cookie identifies WHO may unlock here. No cookie → no PIN path.
    const userId = getDeviceUserId(req);
    if (!userId) {
      const res = NextResponse.json({ error: 'This device isn’t recognised. Please sign in with your password.', needPassword: true }, { status: 401 });
      return res;
    }

    await connectDB();
    const user = await User.findById(userId).select(
      'name email role title mustChangePassword sessionVersion pinHash pinFailedAttempts lockedAt',
    );
    if (!user || !(user as any).pinHash) {
      const res = NextResponse.json({ error: 'Please sign in with your password.', needPassword: true }, { status: 401 });
      clearDeviceCookie(res);
      return res;
    }

    // A locked account can't be unlocked by PIN — only an admin/lead clears it.
    if ((user as any).lockedAt) {
      const res = NextResponse.json({ error: 'Your account is locked. Sign in with your password or contact your admin.', needPassword: true }, { status: 401 });
      clearDeviceCookie(res);
      return res;
    }

    const ok = bcrypt.compareSync(body.pin, (user as any).pinHash);
    if (!ok) {
      const fails = ((user as any).pinFailedAttempts ?? 0) + 1;
      (user as any).pinFailedAttempts = fails;
      // Too many misses → revoke device trust and make them use the password.
      if (fails >= MAX_PIN_FAILS) {
        (user as any).pinFailedAttempts = 0;
        await user.save();
        const res = NextResponse.json(
          { error: 'Too many wrong PIN entries. Please sign in with your password.', needPassword: true },
          { status: 401 },
        );
        clearDeviceCookie(res);
        return res;
      }
      await user.save();
      return NextResponse.json(
        { error: `Incorrect PIN. ${MAX_PIN_FAILS - fails} attempt${MAX_PIN_FAILS - fails === 1 ? '' : 's'} left.` },
        { status: 401 },
      );
    }

    // ── Success — mint a fresh session exactly like a password login. ──
    (user as any).pinFailedAttempts = 0;
    const sid = newSessionId();
    (user as any).activeSessionId = sid;
    await user.save();

    const token = signToken({
      sub:   String(user._id),
      email: (user as any).email,
      role:  (user as any).role,
      name:  (user as any).name,
      title: (user as any).title || '',
      mustChangePassword: !!(user as any).mustChangePassword,
      sv:    (user as any).sessionVersion ?? 0,
      sid,
    });

    await logOperation({
      action: 'auth.pin_unlock', category: 'auth',
      actor: { id: String(user._id), name: (user as any).name },
      targetType: 'user', targetId: String(user._id), targetLabel: (user as any).name,
      summary: 'Resumed session with Quick PIN',
    });

    const res = NextResponse.json({ token, user: u(user) });
    setAuthCookie(res, token);
    // Refresh the trusted-device window on each successful unlock.
    setDeviceCookie(res, String(user._id));
    return res;
  } catch (e) {
    return handleError(e);
  }
}
