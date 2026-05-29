import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import {
  requireUser,
  signDeviceToken,
  setDeviceCookie,
  clearDeviceCookie,
} from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Quick PIN management.
 *
 *   POST   /api/auth/pin   { pin }   set or replace the PIN; also mints
 *                                    the pragati_device cookie so this
 *                                    browser is recognised on next sign-in.
 *   DELETE /api/auth/pin             remove the PIN and clear the device
 *                                    cookie (the user must use the password
 *                                    from now on, on any browser).
 *
 * Both require a current authenticated session — you can't enable or
 * change a PIN without already proving who you are.
 */
const Body = z.object({
  // 4–6 digits. Short enough to remember, long enough that the rate-limited
  // sign-in route can't be brute-forced before the account locks.
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4–6 digits'),
});

export async function POST(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);

    const user = await User.findById(jwt!.sub);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    user.pinHash = bcrypt.hashSync(body.pin, 10) as any;
    await user.save();

    const res = NextResponse.json({ ok: true });
    setDeviceCookie(res, signDeviceToken({ sub: String(user._id), name: user.name }));
    return res;
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const user = await User.findById(jwt!.sub);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    user.pinHash = null as any;
    await user.save();
    const res = NextResponse.json({ ok: true });
    clearDeviceCookie(res);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
