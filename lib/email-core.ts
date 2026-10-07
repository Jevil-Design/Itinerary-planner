/**
 * Sending the one-time code. Pure of any Next.js coupling so a plain node
 * process can exercise it; lib/email.ts is the server-only wrapper.
 *
 * Two providers, because they fail in different ways:
 *
 *   SMTP   — an ordinary mailbox (Gmail and the like). Reaches any recipient
 *            with no DNS work, which is why it is tried first. Rate limits are
 *            modest: Gmail allows roughly 500 messages a day.
 *   Resend — an API key and no domain setup to start, but the shared
 *            onboarding@resend.dev sender only delivers to the address that
 *            owns the Resend account. Unrestricted once a domain is verified.
 *
 * Neither is required. With no provider configured the route says so rather
 * than pretending a code was sent.
 */

export type SendResult =
  | { ok: true; via: 'smtp' | 'resend' }
  | {
      ok: false;
      /*
       * `recipient_not_allowed` is separated from `send_failed` because the two
       * need opposite advice. A send failure may well succeed on retry; a
       * provider refusing the recipient never will, and telling someone to try
       * again is worse than telling them nothing.
       */
      reason: 'not_configured' | 'send_failed' | 'recipient_not_allowed';
      detail?: string;
    };

const env = (name: string) => process.env[name]?.trim() || '';

/** SMTP needs a host, a login and a sender. The port has a sensible default. */
export function smtpConfigured(): boolean {
  return Boolean(env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS') && env('EMAIL_FROM'));
}

export function resendConfigured(): boolean {
  return Boolean(env('RESEND_API_KEY') && env('EMAIL_FROM'));
}

export function emailConfigured(): boolean {
  return smtpConfigured() || resendConfigured();
}

/** Which provider a send would use, for diagnostics that must not leak secrets. */
export function emailProvider(): 'smtp' | 'resend' | 'none' {
  if (smtpConfigured()) return 'smtp';
  if (resendConfigured()) return 'resend';
  return 'none';
}

const subject = (code: string) => `${code} is your Contour sign-in code`;

const bodyText = (code: string) =>
  `${code}\n\n` +
  `This code expires in 10 minutes and can be used once.\n\n` +
  `If you did not ask to sign in, ignore this — nothing has been created, ` +
  `and Contour does not keep an account for you.\n`;

/**
 * An HTML part alongside the text. A message with only a text part scores worse
 * with spam filters, and these are already sent from a shared or personal
 * sender, so the margin matters. The code is duplicated in both parts on
 * purpose: clients that strip HTML still show it.
 */
const bodyHtml = (code: string) =>
  `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#0E1E2B">` +
  `<p style="margin:0 0 18px">Your Contour sign-in code:</p>` +
  `<p style="font-size:30px;font-weight:700;letter-spacing:.18em;margin:0 0 18px">${code}</p>` +
  `<p style="margin:0 0 18px">It expires in 10 minutes and can be used once.</p>` +
  `<p style="margin:0;color:#5b6b7a">If you did not ask to sign in, ignore this — nothing has been ` +
  `created, and Contour does not keep an account for you.</p>` +
  `</div>`;

async function sendViaSmtp(to: string, code: string): Promise<SendResult> {
  // Imported lazily so a deployment using Resend never loads it.
  const nodemailer = (await import('nodemailer')).default;
  const port = Number(env('SMTP_PORT') || 587);

  const transport = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    // 465 is implicit TLS; 587 starts plaintext and upgrades with STARTTLS.
    secure: port === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
  });

  await transport.sendMail({
    from: env('EMAIL_FROM'),
    to,
    subject: subject(code),
    text: bodyText(code),
    html: bodyHtml(code),
  });
  return { ok: true, via: 'smtp' };
}

async function sendViaResend(to: string, code: string): Promise<SendResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env('EMAIL_FROM'),
      to,
      subject: subject(code),
      text: bodyText(code),
      html: bodyHtml(code),
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    /*
     * The shared onboarding@resend.dev sender delivers only to the address that
     * owns the Resend account; Resend answers 403 and says so. Retrying cannot
     * help, so this is reported as its own kind of failure.
     */
    const restricted =
      res.status === 403 && /only send testing emails|verify a domain/i.test(detail);
    return {
      ok: false,
      reason: restricted ? 'recipient_not_allowed' : 'send_failed',
      detail: detail.slice(0, 300),
    };
  }
  return { ok: true, via: 'resend' };
}

export async function sendCode(to: string, code: string): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, reason: 'not_configured' };

  try {
    return smtpConfigured() ? await sendViaSmtp(to, code) : await sendViaResend(to, code);
  } catch (e) {
    // Never let a provider error carry the code, the password or the key into a
    // log line or a response body.
    const detail = String(e instanceof Error ? e.message : e)
      .replace(new RegExp(code, 'g'), '******')
      .slice(0, 200);
    return { ok: false, reason: 'send_failed', detail };
  }
}
