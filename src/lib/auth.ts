import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from './db';
import { User } from '@/models/User';

// Roles:
//   'employee' — legacy role; can still be assigned tasks but cannot sign in.
//   'pm'       — legacy lead role, retained for backwards compat with existing
//                records and JWTs issued before the rename.
//   'lead'     — current name for the team-lead role. Phase-1 login is
//                restricted to this role (plus legacy 'pm').
export type Role = 'employee' | 'pm' | 'lead';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  name: string;
  title?: string;
  mustChangePassword?: boolean;
}

// True for both the new 'lead' role and the legacy 'pm' role so callers don't
// need to repeat the dual check at every guard.
export function isLead(role?: string | null): boolean {
  return role === 'lead' || role === 'pm';
}

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('[SECURITY] JWT_SECRET env var is not set. Using insecure fallback. Set JWT_SECRET immediately.');
}
const COOKIE = 'pragati_token';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload;
}

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const fromCookie = req.cookies.get(COOKIE)?.value;
  if (fromCookie) return fromCookie;
  const h = req.headers.get('authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

export async function getCurrentUserFromRequest(
  req: NextRequest
): Promise<JwtPayload | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

// Server component helper (uses cookies())
export async function getCurrentUserFromCookie(): Promise<JwtPayload | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    await connectDB();
    const user = await User.findById(payload.sub, 'mustChangePassword').lean();
    if (!user) return null;
    return { ...payload, mustChangePassword: !!(user as any).mustChangePassword };
  } catch {
    return null;
  }
}

export async function requireUser(req: NextRequest) {
  const user = await getCurrentUserFromRequest(req);
  if (!user) {
    return {
      error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
      user: null as unknown as JwtPayload
    };
  }
  return { error: null, user };
}

export async function requireRole(req: NextRequest, ...roles: JwtPayload['role'][]) {
  const { user, error } = await requireUser(req);
  if (error) return { user: null as unknown as JwtPayload, error };
  if (!roles.includes(user.role)) {
    return {
      error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
      user
    };
  }
  return { user, error: null };
}

export async function ensureDBAndUser(req: NextRequest) {
  await connectDB();
  const fresh = await User.findOne({ _id: (await requireUser(req)).user?.sub });
  return fresh;
}
