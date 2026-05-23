import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { signToken, setAuthCookie, isLead } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { u } from '@/lib/serialize';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await readBody(req, Body);
    const user = await User.findOne({ email: body.email.toLowerCase() });
    if (!user) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    const ok = bcrypt.compareSync(body.password, user.passwordHash);
    if (!ok) return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });

    // Pragati is leads-only. Contributors are tracked as assignable records
    // but cannot sign in. (Decision re-confirmed by product owner before
    // the v1 launch — see CLAUDE.md for the long-term policy.)
    if (!isLead(user.role)) {
      return NextResponse.json(
        { error: 'This workspace is open to team leads only. Contact your administrator.' },
        { status: 403 },
      );
    }

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
