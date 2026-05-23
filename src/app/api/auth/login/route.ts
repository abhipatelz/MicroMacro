import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { signToken, setAuthCookie, isLead, isAdmin, configuredAdminEmail } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

// After this many consecutive wrong passwords the account is locked
// until an admin/lead clears it. Kept low (5) because Pragati is a
// small workspace where a real lockout is recoverable in <30 seconds
// (admin clicks Unlock on the People page).
const MAX_FAILED_LOGINS = 5;

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await readBody(req, Body);
    const user = await User.findOne({ email: body.email.toLowerCase() });
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    // Refuse upfront if the account is already locked — don't even check
    // the password, otherwise the counter would keep climbing forever
    // and a real user trying to log in after a lock would see the
    // generic "Invalid credentials" message instead of being told why.
    if (user.lockedAt) {
      return NextResponse.json(
        { error: 'Account locked after too many failed sign-in attempts. Ask your administrator to unlock it.' },
        { status: 423 }, // Locked
      );
    }

    const ok = bcrypt.compareSync(body.password, user.passwordHash);
    if (!ok) {
      user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
      let message = 'Invalid credentials';
      if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
        user.lockedAt = new Date();
        message = 'Account locked after 5 failed attempts. Ask your administrator to unlock it.';
      }
      await user.save();
      return NextResponse.json(
        { error: message, attemptsRemaining: Math.max(0, MAX_FAILED_LOGINS - user.failedLoginAttempts) },
        { status: user.lockedAt ? 423 : 401 },
      );
    }

    // Successful auth — clear the failure counter so a previous burst
    // of typos doesn't trigger a lock days later.
    if ((user.failedLoginAttempts ?? 0) > 0 || user.lockedAt) {
      user.failedLoginAttempts = 0;
      user.lockedAt = null;
    }

    // The configured ADMIN_EMAIL is auto-promoted on every successful login,
    // so an existing lead account whose email matches becomes the admin
    // without any manual SQL.
    const adminEmail = configuredAdminEmail();
    if (adminEmail && user.email === adminEmail && user.role !== 'admin') {
      user.role = 'admin' as any;
    }
    if (user.isModified()) await user.save();

    // Pragati is leads + the single admin only. Contributors are tracked as
    // assignable records but cannot sign in.
    if (!isLead(user.role) && !isAdmin(user.role)) {
      return NextResponse.json(
        { error: 'This workspace is open to team leads only. Contact your administrator.' },
        { status: 403 },
      );
    }

    const token = signToken({
      sub: String(user._id),
      email: user.email,
      role: user.role as any,
      name: user.name,
      title: user.title || '',
    });

    const res = NextResponse.json({ token, user: u(user) });
    setAuthCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
