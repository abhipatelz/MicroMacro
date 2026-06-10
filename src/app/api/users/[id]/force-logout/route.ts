import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole, bustSessionCache } from '@/lib/auth';
import { rolesWith } from '@/lib/permissions';
import { handleError } from '@/lib/http';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

// Immediately revoke every active session of an account. Bumping
// sessionVersion invalidates all previously-minted JWTs on their very next
// request (see validateSession), and clearing activeSessionId closes the
// one-active-session slot. The account itself stays untouched — no lock, no
// password rotation — so this is the fast, reversible incident-response
// gesture: kick the session now, decide what else to do after.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user: caller } = await requireRole(req, ...rolesWith('users.force_logout'));
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    if (caller.sub === params.id) {
      return NextResponse.json({ error: 'Use Sign out for your own session.' }, { status: 400 });
    }
    await connectDB();

    const target = await User.findByIdAndUpdate(
      params.id,
      { $set: { activeSessionId: null }, $inc: { sessionVersion: 1 } },
      { new: true, projection: 'name' },
    ).lean();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    bustSessionCache(params.id);

    await logOperation({
      action: 'user.force_logout',
      category: 'user',
      actor: caller,
      targetType: 'user',
      targetId: params.id,
      targetLabel: (target as any).name || '',
      summary: 'Signed the user out of all sessions',
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
