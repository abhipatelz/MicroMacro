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
    let filter: any = {};
    if (teamId) {
      const team = await Team.findById(teamId).select('leadId memberIds').lean();
      if (team) {
        const ids = [team.leadId, ...(team.memberIds || [])].filter(Boolean);
        filter = { _id: { $in: ids } };
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
  // standard default password (see below) so contributors never need a
  // password handed to them — their lead just tells them the convention.
  employeeId: z.string().trim().min(1).max(40),
  title:      z.string().max(120).optional(),
  // role is intentionally excluded — all new accounts are contributors.
  // Promotion to Lead requires a separate explicit PATCH action.
});

/**
 * Standard default password for a contributor: lower-cased first name,
 * "@", then the employee ID exactly as entered. Deterministic so a lead
 * can tell a team member their credentials verbally without anything
 * being displayed in the UI. e.g. "Priya Sharma" + "12345" → "priya@12345".
 */
function defaultContributorPassword(name: string, employeeId: string): string {
  const firstName = name.trim().split(/\s+/)[0]?.toLowerCase() || 'user';
  return `${firstName}@${employeeId.trim()}`;
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'admin');
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
      role:               'employee',
      title:              body.title || '',
      // Contributors keep the standard default password — no forced reset,
      // no credential handoff. The convention is communicated out-of-band.
      mustChangePassword: false,
    });
    // Deliberately does NOT return the password — the UI never displays it.
    return NextResponse.json({ user: u(user) });
  } catch (e) {
    return handleError(e);
  }
}
