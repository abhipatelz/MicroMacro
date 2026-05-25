import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';
import { UsernameSchema } from '@/lib/validations';

export const runtime = 'nodejs';

// Always-editable preferences.
const EditableBody = z.object({
  notifTaskAssigned:  z.boolean().optional(),
  notifTaskDueSoon:   z.boolean().optional(),
  notifTaskOverdue:   z.boolean().optional(),
  notifProjectUpdate: z.boolean().optional(),
});

// Identity — name / username / employee ID. Settable by the user EXACTLY
// ONCE (then profileLockedAt locks it; only an admin can change it after).
const IdentityBody = z.object({
  name:       z.string().trim().min(1).max(120).optional(),
  username:   UsernameSchema.optional(),
  employeeId: z.string().trim().max(50).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const user = await User.findById(jwt.sub).lean();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { error, user: jwt } = await requireUser(req);
    if (error) return error;
    await connectDB();

    const user = await User.findById(jwt.sub);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json();

    // Preferences — always allowed.
    const editable = EditableBody.safeParse(body);
    if (editable.success) {
      const d = editable.data;
      if (d.notifTaskAssigned  !== undefined) user.notifTaskAssigned  = d.notifTaskAssigned as any;
      if (d.notifTaskDueSoon   !== undefined) user.notifTaskDueSoon   = d.notifTaskDueSoon  as any;
      if (d.notifTaskOverdue   !== undefined) user.notifTaskOverdue   = d.notifTaskOverdue  as any;
      if (d.notifProjectUpdate !== undefined) user.notifProjectUpdate = d.notifProjectUpdate as any;
    }

    // Identity — one-time only.
    const identity = IdentityBody.safeParse(body);
    const wantsIdentityChange = identity.success && (
      identity.data.name !== undefined ||
      identity.data.username !== undefined ||
      identity.data.employeeId !== undefined
    );
    if (wantsIdentityChange) {
      if (user.profileLockedAt) {
        return NextResponse.json(
          { error: 'Your name, username and employee ID can only be set once. Ask an admin to change them.' },
          { status: 403 },
        );
      }
      const id = identity.data!;
      // Username must stay unique across the workspace.
      if (id.username !== undefined && id.username !== user.username) {
        const taken = await User.findOne({ username: id.username, _id: { $ne: user._id } }, '_id').lean();
        if (taken) return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
        user.username = id.username as any;
      }
      if (id.name       !== undefined) user.name       = id.name as any;
      if (id.employeeId !== undefined) user.employeeId = id.employeeId as any;
      // Lock identity after this first successful edit.
      user.profileLockedAt = new Date() as any;
    }

    await user.save();
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}
