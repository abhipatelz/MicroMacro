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
import bcrypt from 'bcryptjs';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { Invite } from '@/models/Invite';
import { handleError } from '@/lib/http';

export const runtime = 'nodejs';

function configuredToken(): string | null {
  const t = process.env.ADMIN_BOOTSTRAP_TOKEN?.trim();
  return t && t.length >= 16 ? t : null;
}

export async function POST(req: NextRequest) {
  try {
    const token = configuredToken();
    if (!token) {
      return NextResponse.json({ error: 'Bootstrap is disabled.' }, { status: 404 });
    }
    const supplied = req.headers.get('x-bootstrap-token') ?? '';
    if (supplied !== token) {
      return NextResponse.json({ error: 'Invalid bootstrap token.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const email          = String(body.email ?? '').toLowerCase().trim();
    const password       = String(body.password ?? '');
    const name           = String(body.name ?? '').trim() || email.split('@')[0];
    const cleanupUsers   = Boolean(body.cleanupUsers);
    const keepMesOnly    = Boolean(body.keepMesOnly);

    if (!/.+@.+\..+/.test(email)) {
      return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

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
