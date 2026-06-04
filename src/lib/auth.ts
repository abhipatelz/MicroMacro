import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectDB } from './db';
import { User } from '@/models/User';

// Product roles:
//   'admin'    — workspace owner / administrator.
//   'lead'     — team lead.
//   'contributor' — individual contributor.
// Legacy rows may still contain 'pm' or 'employee'; normalize at every boundary.
export type Role = 'contributor' | 'lead' | 'admin' | 'master_admin';
// Legacy stored values that should be coerced on read (kept for backward
// compatibility with documents written before the role enum was tightened).
// `master_admin` is the multi-tenant superuser — dormant until the runtime
// flag PRAGATI_MULTI_TENANT=true is set, but recognised everywhere so that
// promoting a user to it doesn't fall back to "contributor".
export type StoredRole = Role | 'pm' | 'employee';

export interface JwtPayload {
  sub: string;
  email: string;
  role: StoredRole;
  name: string;
  title?: string;
  mustChangePassword?: boolean;
  // sv = the user's sessionVersion at sign time. sid = this login's session id.
  // Both are optional so JWTs minted before session control shipped still
  // verify (they simply skip the corresponding check — see validateSession).
  sv?: number;
  sid?: string;
  // Runtime-only (never signed): whether the user has a Quick PIN configured.
  // Populated by validateSession from the DB so the UI can enforce the
  // mandatory-PIN-setup gate without a second round-trip.
  hasPin?: boolean;
  // Runtime-only: how many full logins this account has completed. Used to
  // defer the Quick-PIN modal until the second login — the first time around
  // the user is busy with the password-change + onboarding tour.
  loginCount?: number;
  // Runtime-only: ISO of when the user dismissed the Quick-PIN prompt, if
  // they chose to set it up later. When present, suppress the modal.
  pinPromptDismissedAt?: string | null;
}

/** A fresh, unguessable session identifier for one login. */
export function newSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function normalizeRole(role?: string | null): Role {
  if (role === 'master_admin') return 'master_admin';
  if (role === 'admin') return 'admin';
  if (role === 'lead' || role === 'pm') return 'lead';
  return 'contributor';
}

// True for team lead/admin roles. Use `isAdmin()` when you specifically want
// to surface admin-only affordances. Master-admin is implicitly above lead.
export function isLead(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'lead' || r === 'admin' || r === 'master_admin';
}

// The 'admin' role is the workspace owner with full visibility across every
// team and project. Master-admin is a strict superset (also includes tenant
// provisioning), so it satisfies admin checks everywhere admin is required.
export function isAdmin(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'admin' || r === 'master_admin';
}

/** Master admin — the platform operator. Dormant in single-tenant mode but
 *  the role check is wired so future multi-tenant features can gate on it. */
export function isMasterAdmin(role?: string | null): boolean {
  return normalizeRole(role) === 'master_admin';
}

// Any role allowed to mutate shared records (create / edit / delete
// projects, tasks, teams, users). Admin is implicitly included so the
// product owner can use their account for everything.
export function canMutate(role?: string | null): boolean {
  return isAdmin(role) || isLead(role);
}

export function isContributor(role?: string | null): boolean {
  return normalizeRole(role) === 'contributor';
}

// Workspace owner's email — hard-coded so the auto-promote works even when
// the ADMIN_EMAIL env var isn't set on the hosting environment. The env var
// still takes precedence if both are present, but this constant is the
// guaranteed-to-work fallback for the founder account.
// The configured admin email (lower-cased). When this address logs in or
// registers we promote them to role:'admin' automatically.
// MUST be set via ADMIN_EMAIL env var — no hardcoded fallback so no personal
// email is ever committed to the repository.
export function configuredAdminEmail(): string | null {
  const env = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return env || null;
}

// True for any email that should be treated as admin. Today there's only
// one (the workspace owner), but the helper exists so the login + register
// routes don't repeat the comparison logic and so the hard-coded fallback
// stays in a single auditable place.
export function isConfiguredAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const target = configuredAdminEmail();
  return !!target && email.trim().toLowerCase() === target;
}

// JWT_SECRET is REQUIRED in production. The dev fallback below is only used
// when NODE_ENV !== 'production' AND the env var is unset — anything else
// (preview deploys included) refuses to sign or verify a token. We check at
// first-use rather than at module load so `next build` can still produce an
// artifact on a CI box that doesn't have the secret available.
const DEV_SECRET_FALLBACK = 'dev-secret-change-me';

function getSecret(): string {
  const env = process.env.JWT_SECRET;
  if (env && env.length >= 16) return env;
  if (process.env.NODE_ENV !== 'production') return DEV_SECRET_FALLBACK;
  throw new Error(
    '[SECURITY] JWT_SECRET is not set (or shorter than 16 chars) in production. ' +
    'Refusing to sign/verify auth tokens with an insecure value.',
  );
}

const COOKIE = 'pragati_token';
// The trusted-device cookie. Set ONLY after a full password sign-in; its
// presence (and validity) is what permits a Quick-PIN unlock. It deliberately
// outlives the session token so a user can PIN back in the next working day.
const DEVICE_COOKIE = 'pragati_device';
const DEVICE_TRUST_DAYS = 30;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getSecret()) as JwtPayload;
}

/* ── Trusted-device token ──────────────────────────────────────────────────
   A signed, httpOnly cookie that marks THIS browser as one that has already
   completed a full password login for `sub`. It carries no privileges on its
   own — it only gates whether the PIN-unlock endpoint will even look at a PIN.
   `typ:'device'` keeps it from ever being mistaken for a session token. */
interface DeviceToken { sub: string; typ: 'device'; iat?: number; exp?: number; }

export function signDeviceToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: 'device' }, getSecret(), { expiresIn: `${DEVICE_TRUST_DAYS}d` });
}

export function verifyDeviceToken(token: string): DeviceToken | null {
  try {
    const d = jwt.verify(token, getSecret()) as DeviceToken;
    return d.typ === 'device' ? d : null;
  } catch {
    return null;
  }
}

export function setDeviceCookie(response: NextResponse, userId: string) {
  response.cookies.set(DEVICE_COOKIE, signDeviceToken(userId), {
    ...COOKIE_BASE,
    maxAge: 60 * 60 * 24 * DEVICE_TRUST_DAYS,
  });
}

export function clearDeviceCookie(response: NextResponse) {
  response.cookies.set(DEVICE_COOKIE, '', { ...COOKIE_BASE, maxAge: 0 });
}

export function getDeviceUserId(req: NextRequest): string | null {
  const tok = req.cookies.get(DEVICE_COOKIE)?.value;
  if (!tok) return null;
  return verifyDeviceToken(tok)?.sub || null;
}

const COOKIE_BASE = {
  httpOnly: true,
  // 'secure' is mandatory in production: the cookie carries the session JWT
  // and would otherwise be sent over plain HTTP if a misconfigured proxy
  // ever served the app without TLS.
  secure: process.env.NODE_ENV === 'production',
  // 'lax' lets top-level navigations carry the cookie (so signing in via a
  // link still works) while blocking cross-site POST/fetch with credentials.
  // That's enough CSRF protection for cookie-only auth — every state-changing
  // route is POST/PATCH/DELETE, which sameSite=lax refuses to attach the
  // cookie to from a foreign origin.
  sameSite: 'lax' as const,
  path: '/',
};

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE, token, {
    ...COOKIE_BASE,
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set(COOKIE, '', { ...COOKIE_BASE, maxAge: 0 });
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const fromCookie = req.cookies.get(COOKIE)?.value;
  if (fromCookie) return fromCookie;
  const h = req.headers.get('authorization');
  if (h?.startsWith('Bearer ')) return h.slice(7);
  return null;
}

/**
 * Verify a JWT *and* confirm it still represents a live session by checking
 * the database. A token is rejected when:
 *   • the user no longer exists, OR
 *   • its `sv` is behind the user's current sessionVersion (force-logout, e.g.
 *     after an admin edits/locks the account), OR
 *   • its `sid` doesn't match the user's activeSessionId (a newer login
 *     elsewhere superseded this one — one active session per user).
 *
 * Tokens minted before session control shipped carry no `sv`/`sid`; the
 * corresponding check is skipped for them so we don't mass-logout on deploy.
 * The returned payload is enriched with the fresh role + mustChangePassword
 * so a role change or forced reset takes effect without re-login.
 */
export async function validateSession(payload: JwtPayload): Promise<JwtPayload | null> {
  await connectDB();
  const user = await User.findById(
    payload.sub,
    'role mustChangePassword sessionVersion activeSessionId name title email pinHash active loginCount pinPromptDismissedAt',
  ).lean();
  if (!user) return null;

  const u = user as any;
  // A deactivated account is denied on its very next request, so an admin
  // turning someone off mid-session logs them out everywhere immediately
  // (defence-in-depth alongside the sessionVersion bump on deactivation).
  if (u.active === false) throw new Error('ACCOUNT_DEACTIVATED');
  if (typeof payload.sv === 'number' && (u.sessionVersion ?? 0) !== payload.sv) return null;
  if (payload.sid && u.activeSessionId && u.activeSessionId !== payload.sid) return null;

  return {
    ...payload,
    role: normalizeRole(u.role),
    name: u.name ?? payload.name,
    title: u.title ?? payload.title,
    email: u.email ?? payload.email,
    mustChangePassword: !!u.mustChangePassword,
    hasPin: !!u.pinHash,
    loginCount: typeof u.loginCount === 'number' ? u.loginCount : 0,
    pinPromptDismissedAt: u.pinPromptDismissedAt ? new Date(u.pinPromptDismissedAt).toISOString() : null,
  };
}

export async function getCurrentUserFromRequest(
  req: NextRequest
): Promise<{ user: JwtPayload | null; deactivated?: boolean }> {
  const token = getTokenFromRequest(req);
  if (!token) return { user: null };
  try {
    const user = await validateSession(verifyToken(token));
    return { user };
  } catch (e: any) {
    if (e?.message === 'ACCOUNT_DEACTIVATED') return { user: null, deactivated: true };
    return { user: null };
  }
}

// Server component helper (uses cookies()). Returns the session payload, or
// null. The `deactivated` flag lets the layout distinguish a closed account
// from a plain missing/expired token so it can redirect with the right reason.
export async function getCurrentUserFromCookie(): Promise<JwtPayload | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    return await validateSession(verifyToken(token));
  } catch {
    return null;
  }
}

export async function isDeactivatedFromCookie(): Promise<boolean> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return false;
  try {
    await validateSession(verifyToken(token));
    return false;
  } catch (e: any) {
    return e?.message === 'ACCOUNT_DEACTIVATED';
  }
}

export async function requireUser(req: NextRequest) {
  const { user, deactivated } = await getCurrentUserFromRequest(req);
  if (!user) {
    return {
      error: NextResponse.json(
        { error: deactivated ? 'Your account has been deactivated. Please contact your administrator.' : 'Authentication required', deactivated: !!deactivated },
        { status: 401 },
      ),
      user: null as unknown as JwtPayload
    };
  }
  return { error: null, user };
}

export async function requireRole(req: NextRequest, ...roles: Role[]) {
  const { user, error } = await requireUser(req);
  if (error) return { user: null as unknown as JwtPayload, error };
  if (!roles.includes(normalizeRole(user.role))) {
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
