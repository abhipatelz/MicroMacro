import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { requireUser, requireRole } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError, readBody } from '@/lib/http';
import { UsernameSchema } from '@/lib/validations';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { user, error } = await requireUser(req);
    if (error) return error;
    await connectDB();

    // Optional ?teamId=... narrows the listing to members + lead of that
    // single team. Used by the project task-assignee dropdown so leads
    // only see people who actually belong to the project's team.
    const teamId = req.nextUrl.searchParams.get('teamId');
    // Deactivated accounts are excluded everywhere by default — they must
    // not appear in assignee pickers or team rosters. Only an admin can ask
    // for them (the People page does, to show the deactivated record).
    const includeInactive =
      req.nextUrl.searchParams.get('includeInactive') === '1' &&
      String(user.role) === 'admin';
    let filter: any = includeInactive ? {} : { active: { $ne: false } };
    if (teamId) {
      const team = await Team.findById(teamId).select('leadId memberIds').lean();
      if (team) {
        const ids = [team.leadId, ...(team.memberIds || [])].filter(Boolean);
        filter = { ...filter, _id: { $in: ids } };
      } else {
        return NextResponse.json([]);
      }
    }

    const list = await User.find(filter).sort({ name: 1 }).lean();
    return NextResponse.json(list.map(u));
  } catch (e) {
    return handleError(e);
  }
}

const CreateBody = z.object({
  // Display name; auto-derived from the username on the client but always
  // sent so the password's first-name component is predictable.
  name:       z.string().min(1).max(120),
  // Corporate login handle (the part before @ in their work email).
  username:   UsernameSchema,
  // Company employee ID. Combined with the first name it forms the
  // standard default password (FirstName@employeeId).
  employeeId: z.string().trim().min(1).max(40),
  // role is intentionally excluded — all new accounts are contributors.
  // Promotion to Lead requires a separate explicit PATCH action.
  // No job title — a person is shown by their role, nothing else.
});

/**
 * Standard default password for a new account: the person's first name
 * exactly as written, "@", then the employee ID. e.g. "Abhi Patel" +
 * "29218" → "Abhi@29218". Deterministic so it can be communicated
 * verbally; the user is forced to change it on first login.
 */
function defaultContributorPassword(name: string, employeeId: string): string {
  const firstName = name.trim().split(/\s+/)[0] || 'User';
  return `${firstName}@${employeeId.trim()}`;
}

export async function POST(req: NextRequest) {
  try {
    const { error, user: caller } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, CreateBody);

    const username   = body.username;             // already lowercased + trimmed
    const employeeId = body.employeeId.trim();
    // Internal placeholder address so legacy code referencing user.email
    // keeps working; contributors sign in with their username, never email.
    const email      = `${username}@pragati.local`;

    const conflict = await User.findOne({ $or: [{ email }, { username }] }, '_id username').lean();
    if (conflict) {
      return NextResponse.json({ error: 'Username already in use' }, { status: 409 });
    }

    const password = defaultContributorPassword(body.name, employeeId);
    const user = await User.create({
      email,
      username,
      employeeId,
      name:               body.name,
      passwordHash:       bcrypt.hashSync(password, 10),
      role:               'contributor',
      // Sign in with the standard default (FirstName@employeeId), then set
      // your own password on first login.
      mustChangePassword: true,
    });
    await logOperation({
      action: 'user.create', category: 'user', actor: caller,
      targetType: 'user', targetId: String(user._id), targetLabel: body.name,
      summary: `Created contributor ${body.name}`,
    });

    // Deliberately does NOT return the password — the UI never displays it.
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}
