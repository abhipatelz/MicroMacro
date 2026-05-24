import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { connectDB } from '@/lib/db';
import { Invite } from '@/models/Invite';
import { User } from '@/models/User';
import { requireRole } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().email() });

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// GET /api/invites — list invites visible to the current lead.
// Returns active + consumed + revoked (audit trail), sorted newest first.
export async function GET(req: NextRequest) {
  try {
    const { error } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();

    const invites = await Invite.find({}).sort({ createdAt: -1 }).limit(100).lean();
    return NextResponse.json({
      invites: invites.map(i => ({
        id:            String(i._id),
        email:         i.email,
        invitedByName: i.invitedByName,
        createdAt:     i.createdAt,
        expiresAt:     i.expiresAt,
        consumedAt:    i.consumedAt,
        revokedAt:     i.revokedAt,
        token:         i.consumedAt || i.revokedAt ? null : i.token, // only expose token for active invites
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/invites — create a single-use invite for the given email.
export async function POST(req: NextRequest) {
  try {
    const { error, user: caller } = await requireRole(req, 'admin');
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);
    const email = body.email.toLowerCase();

    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      return NextResponse.json({ error: 'A user with this email already exists.' }, { status: 409 });
    }

    const now = new Date();
    const activePending = await Invite.findOne({
      email,
      consumedAt: null,
      revokedAt:  null,
      expiresAt:  { $gt: now },
    }).lean();
    if (activePending) {
      return NextResponse.json(
        { error: 'An active invite already exists for this email. Revoke it first to reissue.' },
        { status: 409 }
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const invite = await Invite.create({
      token,
      email,
      invitedBy:     caller.sub,
      invitedByName: caller.name,
      expiresAt:     new Date(now.getTime() + SEVEN_DAYS_MS),
    });

    return NextResponse.json({
      id:        String(invite._id),
      email:     invite.email,
      token:     invite.token,
      expiresAt: invite.expiresAt,
    });
  } catch (e) {
    return handleError(e);
  }
}
