import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

/**
 * The planner itself, behind the one-time-code gate.
 *
 * It is served as a document rather than rendered by React because the planner
 * is a self-contained client application: it holds the whole trip in memory and
 * writes nothing anywhere, which is exactly the storage posture asked for.
 */
export async function GET() {
  const session = await currentSession();
  if (!session) {
    return new Response(null, { status: 307, headers: { location: '/login' } });
  }

  const file = join(process.cwd(), 'public', 'prototype', 'index.html');
  const html = await readFile(file, 'utf8');

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // nothing about a trip should be cached by an intermediary
      'cache-control': 'no-store, private',
    },
  });
}
