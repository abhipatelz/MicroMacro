import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { Invite } from '@/models/Invite';
import { signToken, setAuthCookie } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { u } from '@/lib/serialize';

export const runtime = 'nodejs';

const Body = z.object({
  token:    z.string().min(1),
  name:     z.string().min(1),
  password: z.string().min(8),
  title:    z.string().optional(),
});

// POST /api/auth/signup — consume a one-time invite token and create the
// account. Atomic enough for the volume we expect: the invite is
// findOneAndUpdate'd to consumedAt in a single op, so concurrent attempts
// on the same token will fail at the second consumer.
export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const body = await readBody(req, Body);

    const now = new Date();
    const invite = await Invite.findOneAndUpdate(
      {
        token:      body.token,
        consumedAt: null,
        revokedAt:  null,
        expiresAt:  { $gt: now },
      },
      { $set: { consumedAt: now } },
      { new: true }
    );
    if (!invite) {
      return NextResponse.json(
        { error: 'This invite is invalid, expired, revoked, or already used.' },
        { status: 410 }
      );
    }

    const existing = await User.findOne({ email: invite.email }).lean();
    if (existing) {
      // Race: someone created an account with this email between invite
      // issuance and now. Roll back the consumption so the inviter can
      // see why and reissue if needed.
      invite.consumedAt = null;
      await invite.save();
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 });
    }

    const user = await User.create({
      email:        invite.email,
      name:         body.name,
      passwordHash: bcrypt.hashSync(body.password, 10),
      role:         'lead',
      title:        body.title || '',
      hasSeenTour:  false,
    });

    invite.consumedByUserId = user._id;
    await invite.save();

    const jwt = signToken({
      sub:   String(user._id),
      email: user.email,
      role:  user.role as any,
      name:  user.name,
      title: user.title || '',
    });
    const res = NextResponse.json({ token: jwt, user: u(user) });
    setAuthCookie(res, jwt);
    return res;
  } catch (e) {
    return handleError(e);
  }
}
