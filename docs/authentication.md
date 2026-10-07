# Authentication

Sign-in is a six-digit code by email, issued and verified by **Supabase Auth**.
There is no password and no other method.

---

## The bug this replaced

The login page used to answer:

> The code could not be sent. Try again in a moment.

That was not a Supabase problem, and not really a code problem either. The app
sent its own codes through Resend's shared sender, `onboarding@resend.dev`.
Resend restricts that address to one recipient, and said so plainly:

```
HTTP 403 — "You can only send testing emails to your own email address
(suvojt740@gmail.com). To send emails to other recipients, please verify a
domain at resend.com/domains."
```

So exactly one person could sign in. Everyone else got a 503 and an invitation
to retry something that could never succeed.

Lifting it needed a verified domain — DNS on a company zone — or SMTP
credentials. **Supabase Auth needs neither.** Its own mailer accepts any
recipient, which was verified before the migration was written:

```
signInWithOtp("contracts@primarc.in") → accepted
auth.users.confirmation_sent_at       → stamped
```

An address Resend refused outright.

---

## How it works now

```
/login
  └─ signInWithOtp({ email })        Supabase sends the mail
       └─ /login (code step)
            └─ verifyOtp({ email, token, type: 'email' })
                 └─ session cookie set, httpOnly
                      └─ /dashboard
```

If the project's email template sends a **link** instead of a code, that link
lands on `/auth/callback`, which handles both shapes Supabase can produce — a
PKCE `code`, or a `token_hash` with a `type`. Which one arrives is a dashboard
setting rather than something the app controls, so both are supported.

`middleware.ts` refreshes the access token on every request. Server Components
cannot write cookies, so without it a signed-in user would quietly become
signed-out when the token expired. It also guards `/dashboard`, `/trips` and
`/plan`, and bounces a signed-in visitor away from `/login`.

Sessions are read with `getUser()`, never `getSession()`. The first verifies the
token with the auth server; the second only decodes a cookie the browser owns,
so it will happily accept one that has been edited.

---

## Configuration you must set in the Supabase dashboard

Two of these are not optional in production.

### 1. URL configuration — required

**Authentication → URL Configuration**

| Field | Value |
|---|---|
| Site URL | `https://itinerary-planner-virid.vercel.app` |
| Redirect URLs | `https://itinerary-planner-virid.vercel.app/auth/callback` |
| | `http://localhost:3000/auth/callback` |

Without this, an emailed **link** redirects to whatever the Site URL says —
typically `localhost` — and sign-in fails for everyone not on your machine. The
six-digit code path works regardless, which is why codes are preferred.

### 2. Send a six-digit code, not a link — recommended

**Authentication → Email Templates → Magic Link**

The default template contains only `{{ .ConfirmationURL }}`. To send a code,
include the token:

```html
<h2>Your Contour sign-in code</h2>
<p style="font-size:30px;letter-spacing:.18em"><strong>{{ .Token }}</strong></p>
<p>This code expires shortly and can be used once.</p>
```

The app accepts either, so this changes which experience people get rather than
whether sign-in works.

### 3. Rate limits — the real constraint

Supabase's built-in mailer is intended for development and is **rate limited to
a handful of emails per hour**. This is the practical ceiling on the product
right now, and it is low enough to matter with more than one or two users.

The fix is custom SMTP: **Authentication → Emails → SMTP Settings**. Any
provider works — the Resend domain at `send.primarc.in` that was already
started would do, once its DNS records are live (see
`docs/dns-send-primarc-in.md`). Supabase then sends through it and the limit
rises to that provider's.

---

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Only the first two reach the browser, which is by design: the publishable key is
meant to be public and Row Level Security is what actually protects the data.
The service-role key bypasses RLS entirely — it lives in `lib/supabase/server.ts`,
which is marked `server-only`, so importing it from a client component fails the
build rather than shipping a secret.

---

## What is checked

`npm run test:auth` covers the error mapping and, most importantly, that a code
can still be sent to an address we do not own. That assertion exists precisely
so the old failure cannot come back unnoticed.
