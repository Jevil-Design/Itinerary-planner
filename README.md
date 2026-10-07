# Contour — AI Travel Itinerary Builder

Give it a source, a destination and dates. It builds the route, the day-by-day
schedule, what to pack and what it costs.

**Supabase is the backend of record.** Accounts, trips, itineraries and budgets
live there behind Row Level Security, so the database rather than the app decides
who can read them. The planner UI does not write to it yet — that migration is in
progress, and until it lands a trip still lives only in the browser tab.

---

## What is in this repository

| Path | What it is |
|---|---|
| `app/` | The site: landing page, one-time-code sign-in, and the gated planner route. |
| `lib/` | OTP crypto, the server wrapper that holds the signing secret, email delivery, the error envelope. |
| `prototype-build/` | The planner itself, generated from the design file. Deliberately outside `public/` — a statically served copy would be a way past the sign-in gate. Served only by `app/plan`, after the session check. |
| `Contour - AI Travel Itinerary Builder.dc.html` | The design file. The source of truth for the planner; `prototype-build/` is built from it. |
| `support.js` | The runtime the design file needs, beside it so it opens straight from disk. |
| `scripts/` | Build and verification: prototype build, imagery fetch, OTP tests, browser tests. |
| `app/imagery.json` | Destination photography: source URL, subject, licence and author for each image. |

---

## Storage

There is no database, no session table, no user record.

| Lives where | What |
|---|---|
| Browser memory | The whole trip. Lost on refresh, by design. |
| Signed cookie | The OTP challenge during sign-in, and the session afterwards. |
| Nowhere | Everything else. |

A consequence worth stating plainly: **a trip does not survive a refresh**, and
cannot be opened on another device. That is the storage posture asked for, not
an oversight. Export before closing the tab.

---

## Sign-in

A six-digit code by email, issued and verified by Supabase Auth. No password,
and no other method.

This replaced a self-rolled sender that could only reach one address — see
[docs/authentication.md](docs/authentication.md) for what went wrong, how the
flow works now, and the two dashboard settings production needs.

- `middleware.ts` refreshes the access token and guards `/dashboard`, `/trips` and `/plan`
- `/auth/callback` handles an emailed link, in either shape Supabase can send
- Sessions are read with `getUser()`, never `getSession()` — the latter only decodes a cookie the browser owns

```sh
npm run test:auth    # error mapping, and that a code reaches an address we do not own
```

## Running it

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # AUTH_SECRET
npm install
npm run dev
```

Without `RESEND_API_KEY` and `EMAIL_FROM`, the code-request endpoint refuses
with a clear message rather than pretending a code was sent. The planner itself
needs a signed-in session and is served only at `/plan`.

---

## Verifying

```bash
npm run test:otp        # 21 checks: forgery, tampering, brute force, expiry
npm run test:email      # 14 checks: provider choice, a real SMTP send, no leaks
npm run test:session    # 6 steps: a real session opens the planner, not a 2nd login
npm run test:browser    # 27 steps through the planner in real Chromium
node scripts/browser-test-site.mjs http://127.0.0.1:3400   # the site itself
npm run typecheck && npm run build
```

`npm run build` runs `build:prototype` first, which regenerates
`public/prototype/` from the design file. Do not hand-edit anything under
`public/prototype/` — it is generated and the build will overwrite it.

---

## Imagery

`app/imagery.json` is built by `npm run fetch:imagery`, which pulls openly
licensed destination photographs from Wikimedia Commons and records the subject,
licence and author of each. Commons rather than a stock-photo id pasted from
memory, because Commons says what the picture actually shows. Only permissive
licences are kept, and the credit line in the footer is required by them.

---

## Deploying

Three things have each broken this deployment, all now handled in the repo:

**`vercel.json` pins `framework: nextjs`. Do not remove it.** The project was
created as a static site, so its preset was `null`; Vercel still ran `next build`
and reported success, then served the output as a plain directory. Static files
resolved and every server route 404d — `/prototype` worked while `/` did not,
which looks like a routing bug and is not one.

**Vercel blocks a vulnerable Next.js version *after* a successful build.** The
log ends `Build Completed` then `Vulnerable version of Next.js detected`, and the
deployment goes red. Run `npm audit` before wondering why a green build will not
go live.

**`/prototype` needs an absolute script path.** Next strips the trailing slash,
so a relative `./support.js` resolves to `/support.js`, 404s, returns HTML, and
the browser refuses the script — leaving the raw template on screen.
`scripts/build-prototype.mjs` handles this and runs on `prebuild`.

Environment variables in Vercel: `AUTH_SECRET`, and `RESEND_API_KEY` +
`EMAIL_FROM` once you want codes delivered.

---

## What is not built

No AI, routing, places, weather or hotel provider is wired. The planner
generates the part that follows from your inputs — days with real dates, the
route legs, a packing list keyed to travel mode, the pre-trip checklist and the
budget categories. Activities inside each day, stays, restaurants, sightseeing,
weather and measured distances need those providers and are deliberately left
empty rather than invented.

Also not built: PDF and Excel export, share links, collaborators, conflict
detection, notifications, multi-currency and timezone handling.
