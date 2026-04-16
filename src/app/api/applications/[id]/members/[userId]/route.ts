import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Application } from '@/models/Application';
import { requireRole } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; userId: string } }
) {
  try {
    const { error } = await requireRole(req, 'manager', 'admin');
    if (error) return error;
    await connectDB();
    await Application.updateOne(
      { _id: params.id },
      { $pull: { memberIds: new mongoose.Types.ObjectId(params.userId) } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
