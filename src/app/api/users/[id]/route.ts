import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Task } from '@/models/Task';
import { requireRole, isAdmin, isLead } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError, readBody } from '@/lib/http';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

const Body = z.object({
  // The admin can move anyone between Individual Contributor and Team Lead.
  // 'admin' is intentionally NOT assignable here — there is a single
  // workspace admin (the owner), provisioned via env/bootstrap, never
  // through a generic PATCH.
  role:       z.enum(['contributor', 'lead']).optional(),
  title:      z.string().max(120).optional(),
  name:       z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  phone:      z.string().max(40).optional(),
  location:   z.string().max(120).optional(),
  // Admin operations lock — true suspends the account (blocks sign-in),
  // false lifts the lock and clears the failed-login counter.
  locked:     z.boolean().optional(),
  // Force the user to set a new password on their next sign-in.
  mustChangePassword: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user: caller } = await requireRole(req, 'admin');
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    await connectDB();
    const body = await readBody(req, Body);

    const target = await User.findById(params.id, 'role').lean();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // The admin is the workspace owner. A non-admin lead must never be
    // able to demote them, rename them, or edit their identity — otherwise
    // any compromised lead account = total workspace takeover.
    if (isAdmin((target as any).role) && !isAdmin(caller.role)) {
      return NextResponse.json(
        { error: 'Only the workspace admin can modify the admin account.' },
        { status: 403 },
      );
    }

    if (body.role && caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 });
    }

    if (body.locked && caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot lock your own account.' }, { status: 403 });
    }

    if (body.role === 'contributor') {
      const leadCount = await User.countDocuments({ role: { $in: ['pm', 'lead', 'admin'] } });
      if (leadCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last lead. Promote another user first.' }, { status: 409 });
      }
    }

    // When an admin changes *another* user's account, force re-auth by bumping
    // sessionVersion (invalidates all existing tokens) and clearing activeSessionId.
    // mustChangePassword is NOT set here — that only happens at reset-password.
    const isSelfEdit = caller.sub === params.id;
    const mutation: Record<string, any> = isSelfEdit
      ? { $set: body }
      : {
          $set: { ...body, activeSessionId: null },
          $inc: { sessionVersion: 1 },
        };

    const updated = await User.findByIdAndUpdate(params.id, mutation, { new: true }).lean();
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await logOperation({
      action: body.role ? 'user.role' : 'user.update', category: 'user', actor: caller,
      targetType: 'user', targetId: params.id, targetLabel: (updated as any)?.name || '',
      summary: body.role ? `Changed role → ${body.role}` : 'Updated user account',
    });

    return NextResponse.json(u(updated));
  } catch (e) {
    return handleError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user: caller } = await requireRole(req, 'admin');
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
    }
    await connectDB();

    if (caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot remove your own account.' }, { status: 403 });
    }

    const target = await User.findById(params.id, 'role name').lean();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Only the admin can remove the admin account. Without this guard, any
    // lead could delete the workspace owner and (combined with the
    // self-registration loophole closed in the register route) take over.
    if (isAdmin((target as any).role) && !isAdmin(caller.role)) {
      return NextResponse.json(
        { error: 'Only the workspace admin can delete the admin account.' },
        { status: 403 },
      );
    }

    if (isLead((target as any).role)) {
      const leadCount = await User.countDocuments({ role: { $in: ['pm', 'lead', 'admin'] } });
      if (leadCount <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last lead.' }, { status: 409 });
      }
    }

    // Unassign all their tasks
    await Task.updateMany({ assigneeId: params.id }, { $unset: { assigneeId: '', assigneeName: '' } });
    await User.findByIdAndDelete(params.id);

    await logOperation({
      action: 'user.delete', category: 'user', actor: caller,
      targetType: 'user', targetId: params.id, targetLabel: (target as any)?.name || '',
      summary: `Removed user ${(target as any)?.name || ''}`.trim(),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
