import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Team } from '@/models/Team';
import { requireUser, requireRole } from '@/lib/auth';
import { u } from '@/lib/serialize';
import { handleError, readBody } from '@/lib/http';
import crypto from 'crypto';

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
  name:  z.string().min(1),
  email: z.string().email(),
  title: z.string().optional(),
  // role is intentionally excluded — all new accounts are IC
  // Promotion to PM requires a separate explicit PATCH action
});

function generateTempPassword(): string {
  // Format: Pragati-XXXXXX (8 random alphanumeric chars)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const rand = crypto.randomBytes(8);
  let suffix = '';
  for (let i = 0; i < 8; i++) suffix += chars[rand[i] % chars.length];
  return `Pragati-${suffix}`;
}

export async function POST(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'pm', 'lead');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, CreateBody);
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    const tempPassword = generateTempPassword();
    const user = await User.create({
      email:              body.email.toLowerCase(),
      name:               body.name,
      passwordHash:       bcrypt.hashSync(tempPassword, 10),
      role:               'employee',
      title:              body.title || '',
      mustChangePassword: true,
    });
    return NextResponse.json({ user: u(user), tempPassword });
  } catch (e) {
    return handleError(e);
  }
}
