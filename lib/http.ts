import { NextResponse } from 'next/server';

/**
 * Every route returns { error: { code, message } } with a real status, as
 * docs/api-contract.md specifies. The client renders message; nothing fails
 * silently.
 */
export type ErrorCode =
  | 'AUTH_FAILED' | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'FORBIDDEN'
  | 'SAVE_FAILED' | 'RATE_LIMITED' | 'GENERATION_FAILED'
  | 'EMAIL_RECIPIENT_BLOCKED' | 'MODE_UNSUPPORTED';

const STATUS: Record<ErrorCode, number> = {
  AUTH_FAILED: 401,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  SAVE_FAILED: 500,
  RATE_LIMITED: 429,
  GENERATION_FAILED: 503,
  // 422 rather than 503: the request is understood and well formed, but this
  // deployment's mail sender will never accept that recipient. Retrying is
  // pointless, and a 5xx would invite exactly that.
  EMAIL_RECIPIENT_BLOCKED: 422,
  // The request is valid; no provider for that travel mode is wired yet.
  MODE_UNSUPPORTED: 501,
};

export function fail(code: ErrorCode, message: string, fields?: Record<string, string>) {
  return NextResponse.json({ error: { code, message, fields } }, { status: STATUS[code] });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
