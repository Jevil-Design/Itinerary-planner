# Authentication

Sign-in is an email address and a password, through **Supabase Auth**. Supabase
holds the credential; this application never hashes, stores or compares a
password, and `profiles` has no password column.

---

## The two problems this replaced

### First: a sender that reached one person

The app used to send its own six-digit codes through Resend's shared
`onboarding@resend.dev`. Resend restricts that address to a single recipient and
said so plainly:

```
HTTP 403 — "You can only send testing emails to your own email address
(suvojt740@gmail.com). To send emails to other recipients, please verify a
domain at resend.com/domains."
```

So exactly one person could sign in. Everyone else got a 503 inviting them to
retry something that could never succeed.

### Second: a mailer that reached two people an hour

Moving codes to Supabase Auth fixed delivery — its mailer accepts any recipient,
verified before the migration was written. But the built-in service is rate
limited to a couple of messages an hour, so the second person to sign in within
the hour still could not:

```
429 over_email_send_rate_limit
```

A password has no such ceiling. Signing in sends no mail at all; only
registration and password resets do, and both are one-off events rather than
something repeated on every visit.

---

## How it works now

```
/login              signInWithPassword({ email, password })
/signup             signUp({ email, password, data: { full_name } })
                         └─ trigger writes public.profiles
/forgot-password    resetPasswordForEmail()
                         └─ emailed link → /auth/callback → session
                                              └─ /reset-password
                                                   └─ updateUser({ password })
```

`middleware.ts` refreshes the access token on every request. Server Components
cannot write cookies, so without it a signed-in user would quietly become
signed-out when the token expired. It also guards `/dashboard`, `/trips` and
`/plan`, and bounces a signed-in visitor away from `/login` and `/signup`.

Sessions are read with `getUser()`, never `getSession()`. The first verifies the
token with the auth server; the second only decodes a cookie the browser owns,
so it will happily accept one that has been edited.

### Two deliberate choices about what the errors say

A failed sign-in says *"That email and password do not match an account"* —
never which half was wrong, and never whether the address is registered. Saying
either would turn the form into a way to test who has an account here. The
password-reset page confirms in the same words whether or not the address
exists, for the same reason.

Everything else is mapped to something specific: a weak password says the
minimum, a duplicate registration points at signing in, a rate limit quotes the
actual wait. An unrecognised error keeps Supabase's own wording rather than
being replaced by something vaguer.

---

## Configuration you must set in the Supabase dashboard

### 1. URL configuration — required

**Authentication → URL Configuration**

| Field | Value |
|---|---|
| Site URL | `https://itinerary-planner-virid.vercel.app` |
| Redirect URLs | `https://itinerary-planner-virid.vercel.app/auth/callback` |
| | `http://localhost:3000/auth/callback` |

Without this, the confirmation and password-reset links redirect to whatever the
Site URL says — typically `localhost` — and neither works for anyone else.

### 2. Email confirmation — your choice

**Authentication → Providers → Email → Confirm email**

With it **on**, a new account must click a link before it can sign in; the
signup form shows "Check your email" and waits. With it **off**, registration
signs the user straight in. Both paths are implemented, so this is a policy
decision rather than something the code constrains.

Confirmation emails still go through the built-in mailer and still hit its
hourly limit. If you expect more than a trickle of registrations, set custom
SMTP under **Authentication → Emails → SMTP Settings** — any provider will do,
including the `send.primarc.in` domain started in `docs/dns-send-primarc-in.md`
once its DNS records are live.

### 3. Leaked password protection — turn this on

**Authentication → Policies → Enable leaked password protection**

Supabase can check a new password against HaveIBeenPwned and refuse ones that
appear in a known breach. It is off by default and the project's own security
advisor flags it. It was irrelevant while sign-in was a mailed code; now that
accounts have passwords, it is the single highest-value setting on this page.

The application already enforces a minimum length, and `authMessage` maps the
`weak_password` error — so once this is enabled, a user choosing a breached
password gets a clear explanation rather than a generic failure.

---

## Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Only the first two reach the browser, which is by design: the publishable key is
meant to be public and Row Level Security is what actually protects the data.
The service-role key bypasses RLS entirely — it lives in
`lib/supabase/server.ts`, marked `server-only`, so importing it from a client
component fails the build rather than shipping a secret.

---

## What is checked

`npm run test:auth` runs 29 checks. Seven cover the error wording. The rest sign
in as two real accounts and have B attempt to read, edit, delete and attach an
itinerary to A's trip **by its UUID**. Every attempt must fail in the database,
not in the interface — that assertion is the reason the suite exists.
