/**
 * Outbound email via Brevo's transactional HTTP API.
 *
 * Deliberately dependency-free — a plain `fetch` to Brevo's REST endpoint, so
 * there is no SMTP library to install and nothing to verify at build time.
 * Configured entirely through environment variables, so delivery stays under
 * the operator's control:
 *
 *   BREVO_API_KEY       – transactional API key (required to actually send)
 *   BREVO_SENDER_EMAIL  – verified sender address (required)
 *   BREVO_SENDER_NAME   – display name shown to recipients (optional)
 *
 * When the key or sender are absent the mailer is a transparent NO-OP: it logs
 * a warning and returns `{ ok:false, skipped:true }` without throwing. This
 * mirrors the optional-Redis cache pattern already used in the codebase, so
 * dev, CI and `next build` never need a provider and importing this module can
 * never crash a serverless cold start.
 */

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;
}

export interface MailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
}

const SENDER_NAME_FALLBACK = 'Pragati';
// Brevo's transactional endpoint. Overridable so integration tests and smoke
// runs can point the mailer at a local mock and assert the exact payload that
// would have gone out — production deployments never set this.
const DEFAULT_API_URL = 'https://api.brevo.com/v3/smtp/email';

function apiUrl(): string {
  return process.env.BREVO_API_URL?.trim() || DEFAULT_API_URL;
}

/** True when a real Brevo sender is configured and email can actually go out. */
export function mailerConfigured(): boolean {
  return !!(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
}

/** The configured sender address (or '' when unconfigured) — surfaced read-only
 *  in the admin setup checklist so an operator can confirm what's wired up. */
export function configuredSender(): string {
  return process.env.BREVO_SENDER_EMAIL || '';
}

export async function sendEmail(msg: MailMessage): Promise<MailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || SENDER_NAME_FALLBACK;

  if (!apiKey || !senderEmail) {
    console.warn('[mailer] Brevo not configured — skipping email to', msg.to);
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch(apiUrl(), {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: msg.to, ...(msg.toName ? { name: msg.toName } : {}) }],
        subject: msg.subject,
        htmlContent: msg.html,
        ...(msg.text ? { textContent: msg.text } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[mailer] Brevo send failed', res.status, body.slice(0, 300));
      return { ok: false, error: `brevo_${res.status}` };
    }

    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, id: data?.messageId };
  } catch (e: any) {
    console.error('[mailer] Brevo send error', e?.message);
    return { ok: false, error: e?.message || 'send_error' };
  }
}
