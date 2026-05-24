/**
 * One-time admin bootstrap + workspace cleanup, gated by a secret token.
 *
 * Lets the workspace owner (you) provision the first admin account, set its
 * password, and optionally wipe pre-launch seed data — all from a browser,
 * without shell access to the database. The CLI scripts (set-admin /
 * set-password / cleanup-users / keep-mes-only) do the same job for anyone
 * who has Node + Mongo URI on their machine; this route is the browser-only
 * equivalent.
 *
 * Security:
 *  • The endpoint is **disabled** unless ADMIN_BOOTSTRAP_TOKEN is set in env.
 *    Once you're done with first-run setup, delete the env var and redeploy
 *    — the route then returns 404 and is inert.
 *  • Every request must present the exact token in the `x-bootstrap-token`
 *    header. There is no fallback, no derivation.
 *  • Sets `mustChangePassword: false` for the bootstrap admin because the
 *    operator is choosing the password themselves at this terminal; no
 *    second handoff happens that would justify forcing another rotation.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Invite } from '@/models/Invite';
import { handleError } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

function configuredToken(): string | null {
  const t = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim();
  return t && t.length >= 16 ? t : null;
}

/** Timing-safe equality so the token can't be brute-forced by measuring
 *  early-exit response latency byte-by-byte. */
function tokensMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

const BootstrapSchema = z.object({
  email:        z.string().email().max(254),
  password:     z.string().min(8).max(200),
  name:         z.string().trim().max(120).optional().default(''),
  cleanupUsers: z.boolean().optional().default(false),
  keepMesOnly:  z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const token = configuredToken();
    if (!token) {
      // 404 (not 401) so the existence of the endpoint isn't even
      // confirmed when bootstrap is disabled.
      return NextResponse.json({ error: 'Bootstrap is disabled.' }, { status: 404 });
    }

    // Token-guessing is bounded by the per-IP throttle, in addition to
    // the timing-safe comparison below. Token must be >= 16 chars so a
    // realistic guess would require 100M+ requests.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon';
    if (!rateLimit(`bootstrap:${ip}`, 5, 60_000)) {
      return NextResponse.json({ error: 'Too many requests.' }, { status: 429 });
    }

    const supplied = req.headers.get('x-bootstrap-token') ?? '';
    if (!tokensMatch(supplied, token)) {
      return NextResponse.json({ error: 'Invalid bootstrap token.' }, { status: 401 });
    }

    const json = await req.json().catch(() => ({}));
    const parsed = BootstrapSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const email        = parsed.data.email.toLowerCase().trim();
    const password     = parsed.data.password;
    const name         = (parsed.data.name || email.split('@')[0]).trim();
    const cleanupUsers = parsed.data.cleanupUsers;
    const keepMesOnly  = parsed.data.keepMesOnly;

    await connectDB();

    // 1. Provision / promote the admin account.
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        email,
        name,
        passwordHash:       bcrypt.hashSync(password, 10),
        role:               'admin',
        mustChangePassword: false,
        hasSeenTour:        false,
      });
    } else {
      user.passwordHash       = bcrypt.hashSync(password, 10);
      user.role               = 'admin' as any;
      user.mustChangePassword = false;
      await user.save();
    }

    // Single-admin invariant: demote any other admin to 'lead'.
    await User.updateMany(
      { _id: { $ne: user._id }, role: 'admin' },
      { $set: { role: 'lead' } },
    );

    const summary: any = {
      admin: { id: String(user._id), email: user.email, name: user.name, role: user.role },
    };

    // 2. Optional: drop every non-invited user.
    if (cleanupUsers) {
      const all = await User.find({}, '_id email createdAt').lean();
      const invites = await Invite.find(
        { consumedByUserId: { $ne: null } },
        'consumedByUserId',
      ).lean();
      const invitedIds = new Set(invites.map(i => String(i.consumedByUserId)));
      const toDrop = all.filter(u =>
        String(u._id) !== String(user!._id) && !invitedIds.has(String(u._id)),
      );
      if (toDrop.length > 0) {
        const res = await User.deleteMany({ _id: { $in: toDrop.map(u => u._id) } });
        summary.usersDeleted = { count: res.deletedCount, emails: toDrop.map(u => u.email) };
      } else {
        summary.usersDeleted = { count: 0, emails: [] };
      }
    }

    // 3. Optional: keep only projects under the MES team.
    if (keepMesOnly) {
      const mes = await Team.findOne({ name: { $regex: /^mes\b/i } }, '_id name').lean();
      if (!mes) {
        summary.projectsDeleted = { error: 'No team starting with "MES" — skipped.' };
      } else {
        const allProjects = await Project.find({}, '_id name teamId').lean();
        const drop = allProjects.filter(p => String(p.teamId) !== String(mes._id));
        if (drop.length > 0) {
          const ids = drop.map(p => p._id);
          const taskRes    = await Task.deleteMany({ projectId: { $in: ids } });
          const projectRes = await Project.deleteMany({ _id: { $in: ids } });
          summary.projectsDeleted = {
            mesTeam:  mes.name,
            projects: projectRes.deletedCount,
            tasks:    taskRes.deletedCount,
            names:    drop.map(p => p.name),
          };
        } else {
          summary.projectsDeleted = { mesTeam: mes.name, projects: 0, tasks: 0, names: [] };
        }
      }
    }

    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    return handleError(e);
  }
}
