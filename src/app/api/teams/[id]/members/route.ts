import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Body = z.object({ userId: z.string() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'pm', 'lead');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    await Team.updateOne(
      { _id: params.id },
      { $addToSet: { memberIds: new mongoose.Types.ObjectId(body.userId) } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
