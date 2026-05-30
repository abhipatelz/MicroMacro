import { NextResponse } from 'next/server';
import { clearAuthCookie, clearDeviceCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res);
  // An explicit sign-out also drops the trusted-device marker: the next entry
  // on this device requires the full password again (a Quick PIN is only for
  // resuming an idle session, not for re-entering after deliberately leaving).
  clearDeviceCookie(res);
  return res;
}
