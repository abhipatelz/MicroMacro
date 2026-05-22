import nodemailer from 'nodemailer';

export class MailerNotConfiguredError extends Error {
  code = 'mailer_not_configured' as const;
  missing: string[];
  constructor(missing: string[]) {
    super(`Email not configured. Missing env vars: ${missing.join(', ')}`);
    this.missing = missing;
  }
}

export function isMailerConfigured(): boolean {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function buildTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  const missing: string[] = [];
  if (!SMTP_HOST) missing.push('SMTP_HOST');
  if (!SMTP_USER) missing.push('SMTP_USER');
  if (!SMTP_PASS) missing.push('SMTP_PASS');
  if (missing.length) throw new MailerNotConfiguredError(missing);
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Retry up to 3 times on transient failures
    pool: true,
    maxConnections: 3,
    rateDelta: 1000,
    rateLimit: 5,
  });
}

/** Verify SMTP credentials are reachable — call at startup or before sending. */
export async function verifyMailer(): Promise<void> {
  const transport = buildTransport();
  await transport.verify();
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  name: string,
): Promise<void> {
  const transport = buildTransport();

  // SMTP_FROM_NAME lets you set a friendly name without exposing personal email.
  // Note: Gmail forces the authenticated account as the actual sender address,
  // so create a dedicated send-only Gmail (e.g. pragati.noreply@gmail.com)
  // and set SMTP_USER + SMTP_FROM to that account to hide personal emails.
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const fromName  = process.env.SMTP_FROM_NAME || 'Pragati';
  const from      = `"${fromName}" <${fromEmail}>`;

  await transport.sendMail({
    from,
    to,
    subject: 'Reset your Pragati password',
    html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1565C0 0%,#1769C8 100%);padding:28px 32px;">
            <p style="margin:0;color:#fff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">Pragati</p>
            <p style="margin:4px 0 0;color:rgba(255,255,255,0.3);font-size:10px;letter-spacing:0.15em;text-transform:uppercase;">
              Project Intelligence
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;">Hi ${name},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
              We received a request to reset your Pragati password.
              Click the button below — this link expires in <strong>1 hour</strong>.
            </p>

            <table cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="border-radius:8px;background:#1565C0;">
                  <a href="${resetUrl}"
                     style="display:inline-block;padding:13px 30px;color:#fff;font-size:14px;
                            font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:0.01em;">
                    Reset password →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;line-height:1.7;">
              Button not working? Copy and paste this link into your browser:
            </p>
            <p style="margin:0;font-size:11px;word-break:break-all;">
              <a href="${resetUrl}" style="color:#1565C0;">${resetUrl}</a>
            </p>

            <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;" />
            <p style="margin:0;font-size:12px;color:#cbd5e1;line-height:1.6;">
              If you didn't request this, you can safely ignore this email.
              Your password will not change until you click the link above.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #f1f5f9;">
            <p style="margin:0;font-size:11px;color:#cbd5e1;text-align:center;">
              Pragati · Project Intelligence for QA-IT
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}
