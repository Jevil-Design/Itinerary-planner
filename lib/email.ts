import 'server-only';

/**
 * Server-only surface for sending the one-time code.
 *
 * The implementation lives in lib/email-core.ts, which imports nothing from
 * Next.js. That split exists so scripts/verify-email.mjs can drive it from a
 * plain node process — `server-only` throws outside a React Server Component,
 * which would otherwise make the whole layer untestable.
 */
export {
  sendCode,
  emailConfigured,
  emailProvider,
  smtpConfigured,
  resendConfigured,
  type SendResult,
} from './email-core.ts';
