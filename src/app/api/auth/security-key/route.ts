import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

// The admin's self-service recovery key. Generated here, hashed with bcrypt,
// and stored on the User document. The plaintext is returned exactly once and
// never persisted — the admin saves it somewhere safe (password manager) and,
// if they ever forget their password, types it into the password field on the
// login form to get straight back in (see api/auth/login/route.ts).
//
// Format: SK-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx (128 bits of entropy).
function generateKey(): string {
  const hex = crypto.randomBytes(16).toString('hex');
  return `SK-${hex.slice(0, 8)}-${hex.slice(8, 16)}-${hex.slice(16, 24)}-${hex.slice(24, 32)}`;
}

// GET — does the calling admin already have a recovery key set? (never returns
// the key itself, only whether one exists)
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();
    const doc = await User.findById(user.sub).select('securityKeyHash').lean();
    return NextResponse.json({ hasKey: !!(doc as any)?.securityKeyHash });
  } catch (e) {
    return handleError(e);
  }
}

// POST — generate (or rotate) the calling admin's recovery key. Returns the
// plaintext exactly once.
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireRole(req, 'admin');
    if (error) return error;

    if (!rateLimit(`seckey-gen:${user.sub}`, 10, 60 * 60_000)) {
      return NextResponse.json({ error: 'Too many key generations — try again later.' }, { status: 429 });
    }

    await connectDB();
    const plainKey = generateKey();
    const hash = await bcrypt.hash(plainKey, 12);
    await User.findByIdAndUpdate(user.sub, { securityKeyHash: hash });

    return NextResponse.json({ key: plainKey });
  } catch (e) {
    return handleError(e);
  }
}
