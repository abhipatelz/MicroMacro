import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { requireRole } from '@/lib/auth';
import { guardTeamOwner } from '@/lib/teamAuth';
import { logOperation } from '@/lib/audit';
import { handleError, readBody } from '@/lib/http';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Body = z.object({ userId: z.string() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireRole(req, 'lead', 'admin');
    if (error) return error;
    await connectDB();
    const denied = await guardTeamOwner(params.id, user.sub, user.role);
    if (denied) return denied;
    const body = await readBody(req, Body);
    await Team.updateOne(
      { _id: params.id },
      { $addToSet: { memberIds: new mongoose.Types.ObjectId(body.userId) } }
    );
    await logOperation({
      action: 'team.member_add', category: 'team', actor: user,
      targetType: 'team', targetId: params.id, summary: 'Added a team member',
      meta: { userId: body.userId },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
