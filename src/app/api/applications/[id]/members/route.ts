import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { Application } from '@/models/Application';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ userId: z.string() });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'manager', 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    await Application.updateOne(
      { _id: params.id },
      { $addToSet: { memberIds: new mongoose.Types.ObjectId(body.userId) } }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
