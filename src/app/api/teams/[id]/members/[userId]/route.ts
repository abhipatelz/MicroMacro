import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { requireRole } from '@/lib/auth';
import { guardTeamOwner } from '@/lib/teamAuth';
import { logOperation } from '@/lib/audit';
import { handleError } from '@/lib/http';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const { error, user } = await requireRole(req, 'lead', 'admin');
    if (error) return error;
    await connectDB();
    const denied = await guardTeamOwner(params.id, user.sub, user.role);
    if (denied) return denied;
    await Team.updateOne(
      { _id: params.id },
      { $pull: { memberIds: new mongoose.Types.ObjectId(params.userId) } }
    );
    await logOperation({
      action: 'team.member_remove', category: 'team', actor: user,
      targetType: 'team', targetId: params.id, summary: 'Removed a team member',
      meta: { userId: params.userId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
