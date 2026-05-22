import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const { error } = await requireRole(req, 'pm', 'lead');
    if (error) return error;
    await connectDB();
    await Team.updateOne(
      { _id: params.id },
      { $pull: { memberIds: new mongoose.Types.ObjectId(params.userId) } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
