import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { normalizeRole, requireUser, signToken, setAuthCookie } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ newPassword: z.string().min(8) });

export async function POST(req: NextRequest) {
  try {
    const { user: me, error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    const user = await User.findById(me.sub);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.mustChangePassword) {
      return NextResponse.json({ error: 'Password already set' }, { status: 400 });
    }

    // Reuse guard — also applies to forced first-set after admin reset.
    const history: string[] = (user as any).passwordHistory || [];
    for (const oldHash of history) {
      if (bcrypt.compareSync(body.newPassword, oldHash)) {
        return NextResponse.json(
          { error: 'You cannot reuse one of your last 3 passwords.' },
          { status: 400 },
        );
      }
    }

    const newHash = bcrypt.hashSync(body.newPassword, 10);
    (user as any).passwordHistory = [user.passwordHash, ...history].slice(0, 3);
    user.passwordHash = newHash;
    user.mustChangePassword = false;
    await user.save();

    // Re-issue token with mustChangePassword cleared, preserving the current
    // session identity so the user stays signed in on this device.
    const token = signToken({
      sub: String(user._id),
      email: user.email,
      role: normalizeRole(user.role),
      name: user.name,
      title: user.title || '',
      mustChangePassword: false,
      sv: user.sessionVersion ?? 0,
      sid: user.activeSessionId ?? undefined,
    });
    const res = NextResponse.json({ ok: true });
    setAuthCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
