import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Invite } from '@/models/Invite';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// DELETE /api/invites/:id — revoke an active invite. Consumed invites are
// preserved (audit) and cannot be revoked.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();

    const invite = await Invite.findById(params.id);
    if (!invite) return NextResponse.json({ error: 'Invite not found.' }, { status: 404 });
    if (invite.consumedAt) {
      return NextResponse.json({ error: 'Cannot revoke a consumed invite.' }, { status: 409 });
    }
    if (invite.revokedAt) {
      return NextResponse.json({ error: 'Invite already revoked.' }, { status: 409 });
    }
    invite.revokedAt = new Date();
    await invite.save();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
