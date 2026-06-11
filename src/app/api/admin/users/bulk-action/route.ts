import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole, isAdmin, bustSessionCache } from '@/lib/auth';
import { rolesWith } from '@/lib/permissions';
import { handleError, readBody } from '@/lib/http';
import { logOperation } from '@/lib/audit';
import { bustPeopleDirectoryCache } from '@/lib/peopleDirectory';

export const runtime = 'nodejs';

// Batch lifecycle actions from the People page. One e-signature (password +
// justification) authorises the whole batch — 21 CFR Part 11 §11.200 — but the
// server still writes an INDIVIDUAL audit row per affected user so the trail
// reads identically whether an account was changed alone or in a batch.
const Body = z.object({
  userIds: z.array(z.string()).min(1).max(200),
  action: z.enum(['deactivate', 'make_contributor', 'promote_lead']),
  password: z.string().min(1, 'Password sign-off is required'),
  reason: z.string().trim().min(4, 'A justification (4+ chars) is required').max(1000),
});

export async function POST(req: NextRequest) {
  try {
    const { error, user: caller } = await requireRole(req, ...rolesWith('users.bulk_manage'));
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);

    // E-signature: the admin re-enters their own password; the reason lands
    // verbatim in every audit row of the batch.
    const signer = await User.findById(caller.sub, 'passwordHash').lean();
    if (!signer || !bcrypt.compareSync(body.password, (signer as any).passwordHash)) {
      return NextResponse.json({ error: 'Password sign-off failed.' }, { status: 401 });
    }

    const validIds = body.userIds.filter((id) => mongoose.isValidObjectId(id));
    const targets = await User.find({ _id: { $in: validIds } }, 'name role active').lean();

    let updatedCount = 0;
    let skippedCount = body.userIds.length - targets.length;

    for (const target of targets as any[]) {
      const id = String(target._id);
      // Never touch the caller's own row or another admin account from a bulk
      // gesture — those changes are sensitive enough to demand the single-user
      // flow (which has its own last-lead and self-edit guards). Because the
      // acting admin always survives the batch, the workspace can never bulk
      // itself into having no one able to manage it.
      const role = target.role;
      const irrelevant =
        (body.action === 'deactivate' && target.active === false) ||
        (body.action === 'make_contributor' && role !== 'lead' && role !== 'pm') ||
        (body.action === 'promote_lead' && role !== 'contributor' && role !== 'employee');
      if (id === caller.sub || isAdmin(role) || irrelevant) {
        skippedCount++;
        continue;
      }

      const set: Record<string, any> =
        body.action === 'deactivate'
          ? {
              active: false,
              deactivatedAt: new Date(),
              deactivatedBy: caller.name || '',
              deactivationReason: body.reason,
            }
          : { role: body.action === 'promote_lead' ? 'lead' : 'contributor' };

      // Bump sessionVersion so the change takes effect on the user's very
      // next request — same force-reauth rule as the single-user PATCH.
      await User.updateOne(
        { _id: target._id },
        { $set: { ...set, activeSessionId: null }, $inc: { sessionVersion: 1 } },
      );
      bustSessionCache(id);

      await logOperation({
        action: body.action === 'deactivate' ? 'user.deactivate' : 'user.role',
        category: 'user',
        actor: caller,
        targetType: 'user',
        targetId: id,
        targetLabel: target.name || '',
        summary:
          body.action === 'deactivate'
            ? `Deactivated account — ${body.reason}`
            : `Changed role → ${set.role}`,
        meta: {
          reason: body.reason,
          bulk: true,
          ...(body.action !== 'deactivate' ? { changes: { role: { before: role, after: set.role } } } : {}),
        },
      });
      updatedCount++;
    }

    void bustPeopleDirectoryCache();
    return NextResponse.json({ updatedCount, skippedCount });
  } catch (e) {
    return handleError(e);
  }
}
