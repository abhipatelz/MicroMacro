import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { requireUser } from '@/lib/auth';
import { readBody, handleError } from '@/lib/http';
import { logOperation } from '@/lib/audit';

export const runtime = 'nodejs';

const PIN_RE = /^\d{4}$/;
// Trivially weak PINs are rejected so a convenience unlock doesn't become the
// obvious "0000 / 1234" everyone uses.
const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321']);

const Body = z.object({
  pin: z.string().regex(PIN_RE, 'PIN must be exactly 4 digits'),
  // Changing an existing PIN requires the current one; first-time setup doesn't.
  currentPin: z.string().regex(PIN_RE).optional(),
});

// GET → whether the signed-in user has a Quick PIN configured.
export async function GET(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const u = await User.findById(user!.sub, 'pinHash').lean();
    return NextResponse.json({ hasPin: !!(u as any)?.pinHash });
  } catch (e) {
    return handleError(e);
  }
}

// POST → set or change the Quick PIN. Always performed inside a live session,
// so the user has already proven their identity with the full password.
export async function POST(req: NextRequest) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    await connectDB();
    const body = await readBody(req, Body);

    if (WEAK_PINS.has(body.pin)) {
      return NextResponse.json({ error: 'Choose a less predictable PIN.' }, { status: 422 });
    }

    const u = await User.findById(user!.sub).select('pinHash');
    if (!u) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // If a PIN already exists, the caller must prove the current one before
    // replacing it — otherwise a hijacked session could silently swap it.
    if ((u as any).pinHash) {
      if (!body.currentPin || !bcrypt.compareSync(body.currentPin, (u as any).pinHash)) {
        return NextResponse.json({ error: 'Current PIN is incorrect.' }, { status: 401 });
      }
    }

    (u as any).pinHash = bcrypt.hashSync(body.pin, 10);
    (u as any).pinSetAt = new Date();
    (u as any).pinFailedAttempts = 0;
    await u.save();

    await logOperation({
      action: 'auth.pin_set', category: 'auth',
      actor: { id: user!.sub, name: user!.name },
      targetType: 'user', targetId: user!.sub, targetLabel: user!.name,
      summary: 'Set or changed their Quick PIN',
    });

    return NextResponse.json({ ok: true, hasPin: true });
  } catch (e) {
    return handleError(e);
  }
}
