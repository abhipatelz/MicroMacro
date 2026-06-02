import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

// ──────────────────────────────────────────────────────────────────────────
// Bulk admin actions on users — admin only. Multi-select deactivate or
// role-change applied to many contributors in one signed gesture.
//
// 21 CFR Part 11 §11.200: every action here is "sensitive" (it changes
// identity/role/lifecycle), so we require the admin's OWN password + a
// justification ONCE for the batch, then write an INDIVIDUAL audit row per
// affected user (so each record's trail is complete and attributable). The
// e-signature meaning (the reason) is recorded on every row.
//
// Guard rails mirror the single-user PATCH:
//   • the admin can't act on their own account
//   • the admin account itself is untouchable
//   • the batch may not drain the last lead seat
// Each user is applied independently; the response reports per-user results.
// ──────────────────────────────────────────────────────────────────────────

const Body = z.object({
  userIds: z.array(z.string()).min(1).max(500),
  action: z.enum(['deactivate', 'make_contributor', 'promote_lead']),
  password: z.string().min(1),
  reason: z.string().trim().min(4).max(1000),
});

export async function POST(req: NextRequest) {
  try {
    const { error, user: caller } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();

    const { userIds, action, password, reason } = await readBody(req, Body);

    // Validate the e-signature once for the whole batch (§11.200).
    const signer = await User.findById(caller!.sub, 'passwordHash').lean();
    if (!signer || !bcrypt.compareSync(password, (signer as any).passwordHash)) {
      return NextResponse.json({ error: 'Password sign-off failed.' }, { status: 401 });
    }

    // De-dupe + drop invalid ids and the caller's own id up front.
    const ids = Array.from(new Set(userIds))
      .filter((id) => mongoose.isValidObjectId(id) && id !== caller!.sub);

    const targets = await User.find({ _id: { $in: ids } }).lean();

    // Last-lead protection. If the batch would deactivate or demote leads, make
    // sure at least one active lead/admin survives.
    const removesLeadSeat = (t: any) =>
      (action === 'make_contributor' && ['lead', 'pm', 'admin'].includes(t.role)) ||
      (action === 'deactivate' && ['lead', 'pm', 'admin'].includes(t.role));
    if (action === 'make_contributor' || action === 'deactivate') {
      const totalLeads = await User.countDocuments({
        role: { $in: ['pm', 'lead', 'admin'] },
        active: { $ne: false },
      });
      const leadsHit = targets.filter((t: any) => removesLeadSeat(t) && (t as any).active !== false).length;
      if (totalLeads - leadsHit < 1) {
        return NextResponse.json(
          { error: 'This batch would leave no active lead. Keep at least one.' },
          { status: 409 },
        );
      }
    }

    const updated: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const t of targets as any[]) {
      const id = String(t._id);

      // Never touch the admin account through a bulk gesture.
      if (t.role === 'admin') {
        skipped.push({ id, reason: 'admin account is protected' });
        continue;
      }

      try {
        const set: Record<string, any> = {};
        const unset: Record<string, any> = {};
        let auditAction = '';
        let summary = '';

        if (action === 'deactivate') {
          if (t.active === false) { skipped.push({ id, reason: 'already deactivated' }); continue; }
          set.active = false;
          set.deactivatedAt = new Date();
          set.deactivatedBy = caller!.name || '';
          set.deactivationReason = reason;
          auditAction = 'user.deactivate';
          summary = `Deactivated account (bulk) — ${reason}`;
        } else if (action === 'make_contributor') {
          if (t.role === 'contributor') { skipped.push({ id, reason: 'already a contributor' }); continue; }
          set.role = 'contributor';
          auditAction = 'user.role';
          summary = 'Changed role → contributor (bulk)';
        } else { // promote_lead
          if (t.role === 'lead') { skipped.push({ id, reason: 'already a lead' }); continue; }
          set.role = 'lead';
          auditAction = 'user.role';
          summary = 'Changed role → lead (bulk)';
        }

        // Bumping sessionVersion + clearing activeSessionId forces the target
        // to re-authenticate, mirroring the single-user PATCH semantics.
        await User.findByIdAndUpdate(id, {
          $set: { ...set, activeSessionId: null },
          $inc: { sessionVersion: 1 },
          ...(Object.keys(unset).length ? { $unset: unset } : {}),
        });

        // One audit row per user — each record's trail must stand alone.
        await logOperation({
          action: auditAction, category: 'user', actor: caller,
          targetType: 'user', targetId: id, targetLabel: t.name || '',
          summary,
          meta: {
            bulk: true,
            reason,
            ...(action === 'deactivate'
              ? { deactivationReason: reason }
              : { changes: { role: { before: t.role, after: set.role } } }),
          },
        });

        updated.push(id);
      } catch {
        skipped.push({ id, reason: 'could not apply' });
      }
    }

    return NextResponse.json({
      ok: true,
      updatedCount: updated.length,
      skippedCount: skipped.length,
      updated,
      skipped,
    });
  } catch (e) {
    return handleError(e);
  }
}
