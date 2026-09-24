import 'server-only';

/**
 * Sending the one-time code. Provider-agnostic, same shape as lib/services:
 * it reports whether it is configured rather than failing obscurely, and the
 * route turns that into a message a person can act on.
 *
 * Resend is the default because it needs one key and no domain setup to start.
 */

export type SendResult =
  | { ok: true }
  | { ok: false; reason: 'not_configured' | 'send_failed'; detail?: string };

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}

export async function sendCode(to: string, code: string): Promise<SendResult> {
  if (!emailConfigured()) return { ok: false, reason: 'not_configured' };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to,
        subject: `${code} is your Contour sign-in code`,
        text:
          `${code}\n\n` +
          `This code expires in 10 minutes and can be used once.\n\n` +
          `If you did not ask to sign in, ignore this — nothing has been created, ` +
          `and Contour does not keep an account for you.\n`,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, reason: 'send_failed', detail: detail.slice(0, 200) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'send_failed', detail: String(e).slice(0, 200) };
  }
}
