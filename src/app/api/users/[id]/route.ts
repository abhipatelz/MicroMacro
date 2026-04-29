import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Task } from '@/models/Task';
import { requireRole } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({
  role:       z.enum(['employee', 'pm']).optional(),
  title:      z.string().optional(),
  name:       z.string().optional(),
  department: z.string().optional(),
  phone:      z.string().optional(),
  location:   z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user: caller } = await requireRole(req, 'pm');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);

    if (body.role && caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 });
    }

    if (body.role === 'employee') {
      const pmCount = await User.countDocuments({ role: 'pm' });
      const target = await User.findById(params.id, 'role');
      if (target?.role === 'pm' && pmCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last PM. Promote another user first.' }, { status: 409 });
      }
    }

    const updated = await User.findByIdAndUpdate(params.id, { $set: body }, { new: true });
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(u(updated));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user: caller } = await requireRole(req, 'pm');
    if (error) return error;
    await connectDB();

    if (caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 403 });
    }

    const target = await User.findById(params.id, 'role name');
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (target.role === 'pm') {
      const pmCount = await User.countDocuments({ role: 'pm' });
      if (pmCount <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last PM.' }, { status: 409 });
      }
    }

    // Unassign all their tasks
    await Task.updateMany({ assigneeId: params.id }, { $unset: { assigneeId: '', assigneeName: '' } });
    await User.findByIdAndDelete(params.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
