import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import {
  readDeviceFromRequest,
  signToken,
  setAuthCookie,
  newSessionId,
} from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * Quick-PIN sign-in.
 * Reads the recognised-device cookie to know WHICH user is signing in,
 * compares the supplied PIN against the stored bcrypt hash, and on
 * success mints the same auth token a full password sign-in would.
 *
 * Locks the account after MAX_FAILED_LOGINS misses, just like the
 * password route — a stolen device cookie alone gives a fixed budget
 * to brute-force a 4–6 digit PIN before lockout.
 */
const Body = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
});

const MAX_FAILED_LOGINS = 5;
const GENERIC_INVALID = { status: 401, body: { error: 'Incorrect PIN.' } } as const;

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`pin:${ip}`, 20, 60_000)) {
      return NextResponse.json({ error: 'Too many attempts. Wait a minute.' }, { status: 429 });
    }

    const device = readDeviceFromRequest(req);
    if (!device) {
      return NextResponse.json(
        { error: 'This device is not recognised. Sign in with your password first.' },
        { status: 401 },
      );
    }

    const body = await readBody(req, Body);
    await connectDB();
    const user = await User.findById(device.sub);
    if (!user || !user.pinHash) {
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }
    if (user.lockedAt) {
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }

    const ok = bcrypt.compareSync(body.pin, user.pinHash);
    if (!ok) {
      await User.findOneAndUpdate(
        { _id: user._id, lockedAt: null },
        [
          { $set: { failedLoginAttempts: { $add: ['$failedLoginAttempts', 1] } } },
          {
            $set: {
              lockedAt: {
                $cond: [{ $gte: ['$failedLoginAttempts', MAX_FAILED_LOGINS] }, new Date(), null],
              },
            },
          },
        ] as any,
        { projection: { _id: 1 } },
      );
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }

    // Success — reset counters, rotate session, mint auth token.
    if ((user.failedLoginAttempts ?? 0) > 0) user.failedLoginAttempts = 0;
    const sid = newSessionId();
    user.activeSessionId = sid;
    await user.save();

    const token = signToken({
      sub:   String(user._id),
      email: user.email,
      role:  user.role as any,
      name:  user.name,
      title: user.title || '',
      mustChangePassword: !!user.mustChangePassword,
      sv:    user.sessionVersion ?? 0,
      sid,
    });

    await logOperation({
      action: 'auth.pin_login',
      category: 'auth',
      actor: { sub: String(user._id), name: user.name },
      targetType: 'user',
      targetId: String(user._id),
      targetLabel: user.name,
      summary: `${user.name} signed in with quick PIN`,
    });

    const res = NextResponse.json({ ok: true });
    setAuthCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
