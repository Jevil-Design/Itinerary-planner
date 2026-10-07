# DNS request — `send.primarc.in`

**For:** whoever administers DNS for `primarc.in`
**Requested by:** contracts@primarc.in
**Purpose:** let the Contour travel planner send sign-in codes from
`login@send.primarc.in`

---

## What this does and does not touch

These four records all live **under the `send` subdomain**. None of them
modifies anything at the root of `primarc.in`.

In particular, the existing company mail records are **not** changed:

```
MX   primarc.in   0 primarc-in.mail.protection.outlook.com
TXT  primarc.in   v=spf1 include:spf.protection.outlook.com include:spf.zoho.com include:transmail.net -all
```

A subdomain is used deliberately. The root SPF ends in `-all`, a hard fail, and
it serves live Microsoft 365 mail — editing it risks legitimate company email
being rejected. Sending from a subdomain keeps this application's sending
reputation entirely separate from company correspondence.

All four names were checked and are currently empty, so nothing will be
overwritten.

---

## Records to add

| # | Type | Name (as typed in the `primarc.in` zone) | Value | Priority |
|---|------|------------------------------------------|-------|----------|
| 1 | TXT | `resend._domainkey.send` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDf3mc3WpmCQnBVoH8YHS15iNxnCU/gnOJDLWg1VK0+OqsIhuYreJJ6+jfJeEPHf5IRgfyvJL82UK0oTFGz1OAqWSFf9DfmApUWd7UShNSuUDfBTqdckteDIZ4VDWlIZL8tlPO7n+RohVJrDnQVp+tCl6uMwZUIpOKxAqmYNgb8WQIDAQAB` | — |
| 2 | MX | `send.send` | `feedback-smtp.ap-northeast-1.amazonses.com` | `10` |
| 3 | TXT | `send.send` | `v=spf1 include:amazonses.com ~all` | — |
| 4 | CNAME | `rsend.send` | `send.forge.rmta.net` | — |

TTL: default / automatic is fine for all four.

### If your DNS panel wants fully qualified names

Some panels expect the whole name rather than a prefix. In that case:

| # | Type | Fully qualified name |
|---|------|----------------------|
| 1 | TXT | `resend._domainkey.send.primarc.in` |
| 2 | MX | `send.send.primarc.in` |
| 3 | TXT | `send.send.primarc.in` |
| 4 | CNAME | `rsend.send.primarc.in` |

The doubled `send.send` is not a typo. The sending domain is
`send.primarc.in`, and the mail provider puts its bounce-handling records on a
further `send` label beneath it.

### What each one is for

- **1 (DKIM)** — the public half of the key that signs outgoing mail, so
  recipients can verify it was not tampered with.
- **2 (MX)** — where bounces and complaints are delivered.
- **3 (SPF)** — authorises the provider to send as `send.primarc.in`. Scoped to
  the subdomain; the root record is untouched.
- **4 (CNAME)** — the provider's tracking and delivery endpoint.

---

## Checking it worked

From any machine, once the records have propagated:

```sh
nslookup -type=TXT resend._domainkey.send.primarc.in
nslookup -type=MX  send.send.primarc.in
nslookup -type=TXT send.send.primarc.in
nslookup -type=CNAME rsend.send.primarc.in
```

Propagation is usually minutes but can take several hours.

---

## Reverting

Delete the four records. Nothing else needs undoing, and company mail is
unaffected either way because none of its records were changed.
