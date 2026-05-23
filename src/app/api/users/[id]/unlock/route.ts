import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// Clear a user's failed-login lock without resetting their password.
// Use this when the lock was caused by typos or a brief password fumble
// and the user still knows their real password — saves the awkward
// "here's a temp password" handoff.
//
// Gated to pm/lead/admin since lifting a lockout is an audit-bearing
// action: it directly affects the system's brute-force protection.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'pm', 'lead', 'admin');
    if (error) return error;
    await connectDB();

    const target = await User.findById(params.id);
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    target.failedLoginAttempts = 0;
    target.lockedAt = null;
    await target.save();

    return NextResponse.json({
      ok: true,
      user: { id: String(target._id), email: target.email, name: target.name },
    });
  } catch (e) {
    return handleError(e);
  }
}
