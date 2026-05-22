import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { User } from '@/models/User';
import { PasswordReset } from '@/models/PasswordReset';
import { sendPasswordResetEmail, isMailerConfigured, MailerNotConfiguredError } from '@/lib/mailer';
import { readBody } from '@/lib/http';

export const runtime = 'nodejs';

const Body = z.object({ email: z.string().email() });

const RATE_WINDOW_MS  = 15 * 60 * 1000; // 15 minutes
const RATE_MAX        = 3;               // max requests per window per email

export async function POST(req: NextRequest) {
  try {
    // Fail loud BEFORE doing any user lookup — it's independent of the email
    // value, so disclosing it does not enable account enumeration.
    if (!isMailerConfigured()) {
      console.error('[forgot-password] mailer not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
      return NextResponse.json(
        {
          ok: false,
          error: 'mailer_not_configured',
          message: "Password reset email isn't set up on this deployment. Please contact your administrator.",
        },
        { status: 503 },
      );
    }

    await connectDB();
    const { email } = await readBody(req, Body);
    const lowerEmail = email.toLowerCase();

    // --- Rate limit: count requests in the last 15 min for this email ---
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS);
    const recentCount = await PasswordReset.countDocuments({
      email: lowerEmail,
      createdAt: { $gte: windowStart },
    });
    if (recentCount >= RATE_MAX) {
      // Return the same shape as success — don't tell the caller they're rate-limited
      // but log it server-side
      console.warn(`[forgot-password] rate limit hit for ${lowerEmail}`);
      return NextResponse.json({ ok: true });
    }

    // --- Check user exists (still return 200 if not — prevents enumeration) ---
    const user = await User.findOne({ email: lowerEmail });
    if (!user) return NextResponse.json({ ok: true });

    // --- Invalidate any previous live tokens for this email ---
    await PasswordReset.updateMany({ email: lowerEmail, used: false }, { used: true });

    // --- Create new token ---
    const rawToken  = crypto.randomBytes(40).toString('hex'); // 80 hex chars
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await PasswordReset.create({ email: lowerEmail, tokenHash, expiresAt });

    // --- Send email ---
    const appUrl   = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    try {
      await sendPasswordResetEmail(lowerEmail, resetUrl, user.name);
    } catch (mailErr: any) {
      // Invalidate the token first so a partial send can't be exploited.
      await PasswordReset.updateOne({ tokenHash }, { used: true });

      // If it's a config issue, surface explicitly (independent of email value).
      if (mailErr instanceof MailerNotConfiguredError) {
        console.error('[forgot-password] mailer not configured:', mailErr.message);
        return NextResponse.json(
          {
            ok: false,
            error: 'mailer_not_configured',
            message: "Password reset email isn't set up on this deployment. Please contact your administrator.",
          },
          { status: 503 },
        );
      }

      // Transient SMTP failures (timeout, auth) — log loudly but stay silent
      // to the client to preserve anti-enumeration.
      console.error('[forgot-password] SMTP error:', mailErr?.message || mailErr);
      if (process.env.NODE_ENV !== 'production') {
        return NextResponse.json(
          { ok: false, error: `Email delivery failed: ${mailErr.message}` },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[forgot-password] unexpected error:', e.message);
    return NextResponse.json({ ok: true }); // never expose internals
  }
}
