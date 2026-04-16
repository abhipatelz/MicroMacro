import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const list = await User.find({}).sort({ name: 1 });
    return NextResponse.json(list.map(u));
  } catch (e) {
    return handleError(e);
  }
}
