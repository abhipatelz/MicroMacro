import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// Self-service-style password reset: any logged-in lead can reset another
// user's password and get back a temporary password to share verbally /
// over chat. Avoids the SMTP round-trip entirely so leads aren't blocked
// when email isn't configured.
//
// Flow:
//   1. Lead opens /people, clicks "Reset password" on a row.
//   2. UI calls POST /api/users/[id]/reset-password.
//   3. Endpoint returns { tempPassword: "Pragati-..." } and flips the
//      target's mustChangePassword flag so they're forced to set a new
//      one on their next login.
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const rand = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[rand[i] % chars.length];
  return `Pragati-${s}`;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'pm', 'lead', 'admin');
    if (error) return error;
    await connectDB();

    const target = await User.findById(params.id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const tempPassword = generateTempPassword();
    target.passwordHash        = bcrypt.hashSync(tempPassword, 10);
    target.mustChangePassword  = true;
    // Resetting the password implicitly lifts any brute-force lock —
    // otherwise the user would still be locked out with the new temp
    // password and admin would have to make two clicks.
    target.failedLoginAttempts = 0;
    target.lockedAt            = null;
    await target.save();

    return NextResponse.json({
      ok: true,
      tempPassword,
      user: { id: String(target._id), email: target.email, name: target.name },
    });
  } catch (e) {
    return handleError(e);
  }
}
