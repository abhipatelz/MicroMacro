import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Team } from '@/models/Team';
import { requireUser } from '@/lib/auth';
import { handleError, readBody } from '@/lib/http';
import { guardTeamOwner } from '@/lib/teamAuth';

export const runtime = 'nodejs';

// Max ~40 KB for a 128-px JPEG base-64 encoded.
const MAX_B64_LEN = 60_000;

const Body = z.object({
  // base-64 encoded JPEG data URL: "data:image/jpeg;base64,..."
  // Client must resize to ~128 px before sending.
  image: z.string().max(MAX_B64_LEN).nullable(),
});

// PUT /api/teams/[id]/avatar — set (or clear) the team avatar.
// Only the team owner (lead) or admin may call this.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
    }
    await connectDB();

    const ownerError = await guardTeamOwner(params.id, user!.sub, user!.role);
    if (ownerError) return ownerError;

    const { image } = await readBody(req, Body);

    // Validate data-URL format when an image is provided.
    if (image !== null && !image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Image must be a base-64 data URL.' }, { status: 400 });
    }

    // Store avatarImage on the team document (excluded from list queries by
    // `select: false` on the schema field).
    await Team.findByIdAndUpdate(params.id, { $set: { avatarImage: image ?? null } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

// GET /api/teams/[id]/avatar — retrieve the avatar image for the detail page.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid team id' }, { status: 400 });
    }
    await connectDB();

    // Check membership before returning the avatar.
    const t = await Team.findById(params.id, 'leadId memberIds').lean();
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const me = String(user!.sub);
    const isMember =
      String((t as any).leadId || '') === me ||
      ((t as any).memberIds || []).some((m: any) => String(m) === me) ||
      user!.role === 'admin';
    if (!isMember) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Explicitly select avatarImage (excluded by default).
    const withImage = await Team.findById(params.id).select('+avatarImage').lean();
    return NextResponse.json({ avatarImage: (withImage as any)?.avatarImage ?? null });
  } catch (e) {
    return handleError(e);
  }
}
