# Contour — AI Travel Itinerary Builder

Give it a source, a destination and dates. It builds the route, the day-by-day
schedule, what to pack and what it costs.

**Nothing a user enters is stored on a server.** There is no database. A trip
lives in the browser for as long as the tab is open and is gone when it closes.
Sign-in is a six-digit code by email, and creates no account.

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

Sign-in is a six-digit code by email, and nothing else. It creates no
account: the session is a signed cookie holding an email address and an
expiry, and nothing more.

### One-time code

The usual design keeps issued codes in a table. This one stores nothing, so the
challenge is carried in a signed cookie — the address, a **hash** of the code,
an expiry and an attempt counter, HMAC'd with `AUTH_SECRET`. The server verifies
a code it never kept.

- The plaintext code exists only in the email and the user's head
- Attempts are counted inside the cookie, so brute force is bounded without storage
- `AUTH_SECRET` *is* the security boundary — rotating it invalidates every session
- Revocation is per-browser, because the challenge lives in that browser's cookie

`lib/otp-core.ts` is pure and takes the secret as a parameter, which is what
makes it testable. `lib/otp.ts` is the thin server-only wrapper that supplies it.

### Delivering the code

Two providers. Which one you want depends on who has to receive a code.

**SMTP — anyone can sign in.** An ordinary mailbox, no DNS, no domain:

```sh
npm run setup:smtp -- <your-gmail> <16-char-app-password> [someone-else@example.com]
```

Gmail needs 2-Step Verification on, then an app password from
`myaccount.google.com/apppasswords` — never the account password. Pass a third
argument to prove delivery reaches someone other than you. The ceiling is
roughly 500 messages a day.

**Resend — one key, but restricted until you own a domain.**

```sh
npm run setup:email -- <resend-api-key> <your-email>
```

The default `onboarding@resend.dev` sender **only delivers to the address that
owns the Resend account**, which makes it useless for letting other people in.
`npm run setup:domain` lifts that by verifying a subdomain, but it needs DNS
records added wherever the domain is managed.

Both scripts send a real message before touching the deployment, so a bad
credential fails at setup rather than in front of a user. SMTP wins when both
are configured. With neither, the request route says so rather than pretending
a code was sent.


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
