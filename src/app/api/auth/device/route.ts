import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { readDeviceFromRequest, clearDeviceCookie } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

/**
 * Probe the recognised-device cookie so the login page can show "welcome
 * back, <name>, enter your PIN" instead of the full password form. Returns
 *  • 200 { id, name } when the cookie is valid AND the user still has a
 *    PIN configured (the only state in which PIN sign-in is possible).
 *  • 204 No Content otherwise — the page falls back to password mode.
 *
 * DELETE clears the cookie (the user picked "not me / use password
 * instead" on the login page).
 */
export async function GET(req: NextRequest) {
  try {
    const device = readDeviceFromRequest(req);
    if (!device) return new NextResponse(null, { status: 204 });
    await connectDB();
    const u = await User.findById(device.sub).select('name pinHash lockedAt').lean();
    if (!u || !(u as any).pinHash || (u as any).lockedAt) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({ id: String((u as any)._id), name: (u as any).name });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearDeviceCookie(res);
  return res;
}
