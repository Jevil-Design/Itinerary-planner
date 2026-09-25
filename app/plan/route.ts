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
  const raw = await readFile(file, 'utf8');

  /**
   * Tell the planner who is already signed in. Without this it falls back to
   * its own landing page and its own sign-in form — a second, fake login on top
   * of a real session, which is what a user actually hit.
   *
   * JSON.stringify is not enough on its own inside a script element: a literal
   * </script> in the value would close the tag early and the rest would be
   * parsed as markup. Replacing every < with its escape is equivalent JSON
   * and cannot terminate the tag. Built with fromCharCode(92) so the
   * backslash survives every layer of tooling between here and the file.
   */
  const ESCAPED_LT = String.fromCharCode(92) + 'u003c';
  const sessionJson = JSON.stringify({ email: session.email }).replaceAll('<', ESCAPED_LT);
  const html = raw.replace(
    '</head>',
    `<script>window.__CONTOUR_SESSION__=${sessionJson};</script></head>`,
  );

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // nothing about a trip should be cached by an intermediary
      'cache-control': 'no-store, private',
    },
  });
}
