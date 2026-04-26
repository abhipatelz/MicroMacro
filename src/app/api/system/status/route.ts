import { NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await connectDB();
    const count = await User.countDocuments();
    return NextResponse.json({ initialized: count > 0 });
  } catch (e) {
    return handleError(e);
  }
}
