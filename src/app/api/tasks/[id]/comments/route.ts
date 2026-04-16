import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import mongoose from 'mongoose';

export const runtime = 'nodejs';

const Body = z.object({ body: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const c = {
      _id: new mongoose.Types.ObjectId(),
      userId: new mongoose.Types.ObjectId(user.sub),
      body: body.body,
      createdAt: new Date()
    } as any;
    (t as any).comments.push(c);
    await t.save();
    const author = await User.findById(user.sub).lean();
    return NextResponse.json({
      id: String(c._id),
      userId: user.sub,
      userName: (author as any)?.name,
      body: c.body,
      createdAt: c.createdAt
    });
  } catch (e) {
    return handleError(e);
  }
}
