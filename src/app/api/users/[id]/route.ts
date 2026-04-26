import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  role:  z.enum(['employee', 'pm']).optional(),
  title: z.string().optional(),
  name:  z.string().optional(),
  department: z.string().optional(),
  phone:      z.string().optional(),
  location:   z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error } = await requireRole(req, 'pm');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    const user = await User.findByIdAndUpdate(params.id, { $set: body }, { new: true });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(u(user));
  } catch (e) {
    return handleError(e);
  }
}
