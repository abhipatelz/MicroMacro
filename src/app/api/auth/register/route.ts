import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { signToken, setAuthCookie } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { u } from '@/lib/serialize';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  title: z.string().optional(),
});

function resolveRole(email: string, isFirstUser: boolean): 'pm' | 'employee' {
  if (isFirstUser) return 'pm';
  const pmEmails = (process.env.PM_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return pmEmails.includes(email.toLowerCase()) ? 'pm' : 'employee';
}

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const count = await User.countDocuments();
    if (count > 0) {
      return NextResponse.json(
        { error: 'Self-registration is disabled. Ask your PM to create an account for you.' },
        { status: 403 }
      );
    }
    const body = await readBody(req, Body);
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    const role = resolveRole(body.email, true);
    const user = await User.create({
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash: bcrypt.hashSync(body.password, 10),
      role,
      title: body.title || ''
    });
    const token = signToken({
      sub: String(user._id),
      email: user.email,
      role: user.role as any,
      name: user.name,
      title: user.title || ''
    });
    const res = NextResponse.json({ token, user: u(user) });
    setAuthCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
