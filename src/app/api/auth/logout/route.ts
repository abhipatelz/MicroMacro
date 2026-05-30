import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res);
  // Keep the trusted-device cookie. Signing out ends the active session, but
  // this same browser can return with Quick PIN instead of password.
  return res;
}
