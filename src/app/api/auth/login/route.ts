import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { signToken, setAuthCookie, isLead, isAdmin, configuredAdminEmail } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const Body = z.object({
  email:    z.string().email().max(254),
  password: z.string().min(1).max(200),
});

// After this many consecutive wrong passwords the account is locked
// until an admin/lead clears it from the People page.
const MAX_FAILED_LOGINS = 5;

// Generic "wrong email or password" response. We never reveal which half
// was wrong — even when the account is locked — so an attacker can't
// enumerate valid emails by watching status codes or messages. Real
// users get the helpful message in-product once they sign in successfully
// (their admin tells them their account was locked).
const GENERIC_INVALID = { status: 401, body: { error: 'Invalid email or password.' } } as const;

export async function POST(req: NextRequest) {
  try {
    // Per-IP brute-force throttle. The per-account lockout is the second
    // line of defence; this one fires before we ever hit the database, so
    // an attacker spraying a wordlist across many emails is contained
    // without locking out legitimate users in the process.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`login:${ip}`, 20, 60_000)) {
      return NextResponse.json(
        { error: 'Too many sign-in attempts. Wait a minute and try again.' },
        { status: 429 },
      );
    }

    await connectDB();
    const body = await readBody(req, Body);
    const email = body.email.toLowerCase().trim();
    const user  = await User.findOne({ email });

    // Unified "invalid" path for missing user, locked user, and wrong
    // password. We still do the bcrypt comparison against a dummy hash
    // even when no user matched, so the response time doesn't reveal
    // whether the email exists in the database.
    const DUMMY_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8ZQAYPwLqL.qZdW7HtLZqL2lF6f7Pi';
    const passwordOk = bcrypt.compareSync(body.password, user?.passwordHash || DUMMY_HASH);

    if (!user) {
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }

    if (user.lockedAt) {
      // Don't reveal lock state through the error message — same opaque
      // response as a wrong password. The admin sees the lock in the
      // People page UI.
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }

    if (!passwordOk) {
      // Atomic increment so two concurrent wrong-password requests can't
      // both read N and both write N+1. The 5th miss flips lockedAt in
      // the same round-trip; ifn the counter is already at the threshold
      // we get the lockedAt timestamp back from the same operation.
      const updated = await User.findOneAndUpdate(
        { _id: user._id, lockedAt: null },
        [
          {
            $set: {
              failedLoginAttempts: { $add: ['$failedLoginAttempts', 1] },
            },
          },
          {
            $set: {
              lockedAt: {
                $cond: [
                  { $gte: ['$failedLoginAttempts', MAX_FAILED_LOGINS] },
                  new Date(),
                  null,
                ],
              },
            },
          },
        ] as any,
        { new: true, projection: { lockedAt: 1, failedLoginAttempts: 1 } },
      ).lean();

      // (If `updated` is null, another request locked the row first —
      // either way the user sees the same generic error.)
      void updated;
      return NextResponse.json(GENERIC_INVALID.body, { status: GENERIC_INVALID.status });
    }

    // ── Success path ─────────────────────────────────────────────────
    // Reset the counter and promote to admin if this email matches the
    // configured workspace owner. Single atomic save afterwards.
    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedAt) {
      user.failedLoginAttempts = 0;
      user.lockedAt            = null;
    }
    const adminEmail = configuredAdminEmail();
    if (adminEmail && user.email === adminEmail && user.role !== 'admin') {
      user.role = 'admin' as any;
    }
    if (user.isModified()) await user.save();

    // Pragati is leads + the single admin only. Contributors are tracked
    // as assignable records but cannot sign in.
    if (!isLead(user.role) && !isAdmin(user.role)) {
      return NextResponse.json(
        { error: 'This workspace is open to team leads only. Contact your administrator.' },
        { status: 403 },
      );
    }

    const token = signToken({
      sub:   String(user._id),
      email: user.email,
      role:  user.role as any,
      name:  user.name,
      title: user.title || '',
    });

    const res = NextResponse.json({ token, user: u(user) });
    setAuthCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
