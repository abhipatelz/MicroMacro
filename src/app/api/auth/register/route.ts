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
  password: z.string().min(6),
  title: z.string().optional(),
  role: z.enum(['employee', 'lead', 'manager', 'admin']).optional()
});

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await readBody(req, Body);
    const exists = await User.findOne({ email: body.email.toLowerCase() });
    if (exists) return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    const count = await User.countDocuments();
    const role = count === 0 ? 'admin' : body.role || 'employee';
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
      name: user.name
    });
    const res = NextResponse.json({ token, user: u(user) });
    setAuthCookie(res, token);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
