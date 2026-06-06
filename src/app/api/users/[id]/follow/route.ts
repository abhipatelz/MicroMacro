import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

// POST  /api/users/[id]/follow  — follow a colleague
// DELETE /api/users/[id]/follow — unfollow
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user: me } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    if (params.id === me!.sub) {
      return NextResponse.json({ error: 'You cannot follow yourself.' }, { status: 400 });
    }
    await connectDB();
    const target = await User.findById(params.id, '_id').lean();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await User.findByIdAndUpdate(
      me!.sub,
      { $addToSet: { following: new mongoose.Types.ObjectId(params.id) } },
    );
    return NextResponse.json({ ok: true, following: true });
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user: me } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    await connectDB();
    await User.findByIdAndUpdate(
      me!.sub,
      { $pull: { following: new mongoose.Types.ObjectId(params.id) } },
    );
    return NextResponse.json({ ok: true, following: false });
  } catch (e) {
    return handleError(e);
  }
}
