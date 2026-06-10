import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Task } from '@/models/Task';
import { requireRole, isAdmin, isLead, bustSessionCache } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError, readBody } from '@/lib/http';
import { logOperation } from '@/lib/audit';
import { bustPeopleDirectoryCache } from '@/lib/peopleDirectory';

export const runtime = 'nodejs';

const Body = z.object({
  // The admin can move anyone between Individual Contributor and Team Lead.
  // 'admin' is intentionally NOT assignable here — there is a single
  // workspace admin (the owner), provisioned via env/bootstrap, never
  // through a generic PATCH.
  role: z.enum(['contributor', 'lead']).optional(),
  title: z.string().max(120).optional(),
  name: z.string().max(120).optional(),
  // Identity fields — only the admin can change these, and only with a
  // password sign-off + justification (21 CFR Part 11 §11.200). Username,
  // email, and employee ID are the identifiers downstream systems use to
  // reconcile an account, so changes leave a full before/after audit trail.
  username: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9._-]+$/, 'lowercase letters, digits, dot, dash, underscore')
    .optional(),
  email: z.string().email().max(200).optional(),
  employeeId: z.string().max(80).optional(),
  // Real notification address (distinct from the login `email`). Admin-managed
  // contact metadata — editable here to backfill existing accounts. Not an
  // identity key, so it does NOT require the e-signature gate; empty clears it.
  notifyEmail: z.union([z.string().trim().toLowerCase().email().max(200), z.literal('')]).optional(),
  department: z.string().max(120).optional(),
  // Soft organisational grouping (business unit, plant, sub-company). Used by
  // people-pickers to group/filter at scale; not a tenant boundary.
  organisation: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  location: z.string().max(120).optional(),
  // Admin operations lock — true suspends the account (blocks sign-in),
  // false lifts the lock and clears the failed-login counter.
  locked: z.boolean().optional(),
  // Account lifecycle. `active: false` deactivates (professional removal
  // with a preserved record); `active: true` reactivates AND unlocks. A
  // reason is recorded on deactivation for the audit trail.
  active: z.boolean().optional(),
  deactivationReason: z.string().max(500).optional(),
  // Force the user to set a new password on their next sign-in.
  mustChangePassword: z.boolean().optional(),
  // ── E-signature (21 CFR Part 11 §11.200) ────────────────────────────────
  // Required for sensitive changes: role promote/demote, deactivation, and
  // any identity-field edit (name/username/email/employeeId). The handler
  // validates the admin's *own* password and the reason becomes part of the
  // immutable audit row.
  password: z.string().min(1).optional(),
  reason: z.string().max(1000).optional(),
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

    // Pull the full target document so the audit row can record before/after
    // values for every changed field. A reviewer needs to be able to answer
    // "what did the admin change, and why?" by pointing at one row.
    const target = await User.findById(params.id).lean();
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

    // ── E-signature gate for sensitive changes (21 CFR Part 11 §11.200) ───
    // Identity (name/username/email/employeeId), role, and *deactivation* all
    // require the admin to re-enter their own password + a justification.
    // Reactivation (active: true) does NOT need a signature — it is an
    // administrative restoration gesture, not a regulated removal of access.
    const isDeactivation = body.active === false && (target as any).active !== false;
    const sensitiveTouched =
      body.role !== undefined ||
      isDeactivation ||
      body.username !== undefined ||
      body.email !== undefined ||
      body.employeeId !== undefined ||
      (body.name !== undefined && body.name !== (target as any).name);
    if (sensitiveTouched) {
      if (!body.password || !body.reason || body.reason.trim().length < 4) {
        return NextResponse.json(
          { error: 'Password sign-off and a justification (4+ chars) are required for this change.' },
          { status: 400 },
        );
      }
      const signer = await User.findById(caller.sub, 'passwordHash').lean();
      if (!signer || !bcrypt.compareSync(body.password, (signer as any).passwordHash)) {
        return NextResponse.json({ error: 'Password sign-off failed.' }, { status: 401 });
      }
    }

    // Uniqueness pre-checks for identity fields — surface a clean 409 instead
    // of a Mongo duplicate-key error.
    if (body.username !== undefined && body.username !== (target as any).username) {
      const dupe = await User.findOne({ username: body.username, _id: { $ne: params.id } }, '_id').lean();
      if (dupe) return NextResponse.json({ error: 'That username is already taken.' }, { status: 409 });
    }
    if (
      body.email !== undefined &&
      body.email.toLowerCase() !== String((target as any).email || '').toLowerCase()
    ) {
      const dupe = await User.findOne(
        { email: body.email.toLowerCase(), _id: { $ne: params.id } },
        '_id',
      ).lean();
      if (dupe) return NextResponse.json({ error: 'That email is already in use.' }, { status: 409 });
    }

    if (body.role && caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 403 });
    }

    if (body.locked && caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot lock your own account.' }, { status: 403 });
    }

    if (body.active === false && caller.sub === params.id) {
      return NextResponse.json({ error: 'You cannot deactivate your own account.' }, { status: 403 });
    }

    // Demoting the last lead, or deactivating the last lead, would leave the
    // workspace with no one able to manage it.
    const willLoseLeadSeat =
      body.role === 'contributor' || (body.active === false && isLead((target as any).role));
    if (willLoseLeadSeat) {
      const leadCount = await User.countDocuments({
        role: { $in: ['pm', 'lead', 'admin'] },
        active: { $ne: false },
      });
      if (leadCount <= 1) {
        const what = body.active === false ? 'deactivate' : 'demote';
        return NextResponse.json(
          { error: `Cannot ${what} the last lead. Promote another user first.` },
          { status: 409 },
        );
      }
    }

    // Pull lifecycle + e-signature fields out of the naive body spread —
    // they drive extra bookkeeping fields (deactivatedAt/by/reason,
    // reactivatedAt) or are signature-only, and must not be written verbatim.
    const { active, deactivationReason, password, reason, email, ...plain } = body;
    const set: Record<string, any> = { ...plain };
    // Normalise email to lowercase to keep the unique index consistent.
    if (typeof email === 'string') set.email = email.toLowerCase();
    const unset: Record<string, any> = {};
    const wasActive = (target as any).active !== false;
    let lifecycleAction: 'deactivate' | 'reactivate' | null = null;

    if (typeof active === 'boolean' && active !== wasActive) {
      if (active === false) {
        lifecycleAction = 'deactivate';
        set.active = false;
        set.deactivatedAt = new Date();
        set.deactivatedBy = caller.name || '';
        set.deactivationReason = (deactivationReason || '').trim();
      } else {
        // Reactivation doubles as an unlock — the single "make active" gesture.
        lifecycleAction = 'reactivate';
        set.active = true;
        set.reactivatedAt = new Date();
        set.lockedAt = null;
        set.failedLoginAttempts = 0;
        unset.deactivatedAt = '';
        unset.deactivatedBy = '';
        unset.deactivationReason = '';
      }
    }

    // When an admin changes *another* user's account, force re-auth by bumping
    // sessionVersion (invalidates all existing tokens) and clearing activeSessionId.
    // mustChangePassword is NOT set here — that only happens at reset-password.
    const isSelfEdit = caller.sub === params.id;
    const mutation: Record<string, any> = isSelfEdit
      ? { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }
      : {
          $set: { ...set, activeSessionId: null },
          $inc: { sessionVersion: 1 },
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        };

    const updated = await User.findByIdAndUpdate(params.id, mutation, { new: true }).lean();
    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    bustSessionCache(params.id);

    const action =
      lifecycleAction === 'deactivate'
        ? 'user.deactivate'
        : lifecycleAction === 'reactivate'
          ? 'user.reactivate'
          : body.role
            ? 'user.role'
            : 'user.update';

    // Build a before/after diff of just the fields the admin actually changed
    // — the audit row's `meta` is what a reviewer scans to answer "what
    // exactly did they change?" without trawling through the user document.
    const AUDIT_FIELDS = [
      'name',
      'username',
      'email',
      'notifyEmail',
      'employeeId',
      'title',
      'department',
      'organisation',
      'phone',
      'location',
      'role',
      'active',
      'locked',
      'mustChangePassword',
    ] as const;
    const diff: Record<string, { before: any; after: any }> = {};
    for (const k of AUDIT_FIELDS) {
      if ((body as any)[k] === undefined) continue;
      const before = (target as any)[k];
      const after =
        k === 'email' ? (set.email ?? (body as any).email) : ((set as any)[k] ?? (body as any)[k]);
      if (String(before ?? '') !== String(after ?? '')) diff[k] = { before, after };
    }
    const changeWords = Object.keys(diff).join(', ');
    const summary =
      lifecycleAction === 'deactivate'
        ? `Deactivated account${set.deactivationReason ? ` — ${set.deactivationReason}` : ''}`
        : lifecycleAction === 'reactivate'
          ? 'Reactivated account (lock cleared)'
          : body.role
            ? `Changed role → ${body.role}`
            : changeWords
              ? `Updated ${changeWords}`
              : 'Updated user account';

    await logOperation({
      action,
      category: 'user',
      actor: caller,
      targetType: 'user',
      targetId: params.id,
      targetLabel: (updated as any)?.name || '',
      summary,
      meta: {
        ...(Object.keys(diff).length ? { changes: diff } : {}),
        ...(reason ? { reason } : {}),
        ...(lifecycleAction === 'deactivate' ? { deactivationReason: set.deactivationReason || null } : {}),
      },
    });

    void bustPeopleDirectoryCache();
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
      action: 'user.delete',
      category: 'user',
      actor: caller,
      targetType: 'user',
      targetId: params.id,
      targetLabel: (target as any)?.name || '',
      summary: `Removed user ${(target as any)?.name || ''}`.trim(),
    });

    void bustPeopleDirectoryCache();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}
