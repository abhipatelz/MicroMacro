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

// First registered user is always PM — workspace owner.
// All subsequent accounts must be created by an existing PM via POST /api/users.

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
    const user = await User.create({
      email: body.email.toLowerCase(),
      name: body.name,
      passwordHash: bcrypt.hashSync(body.password, 10),
      role: 'lead',
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
