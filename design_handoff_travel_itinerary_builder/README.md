# Handoff: Contour — AI Travel Itinerary Builder

## Overview

A production travel-planning application. The user enters a source, a destination, dates, travel mode and budget; the system generates a complete, editable trip — route with legs and overnight halts, day-by-day schedule with realistic buffers, stays, restaurants, sightseeing, weather, an eleven-category budget, an expense tracker, a packing list and a pre-trip checklist. Everything is editable, everything is recalculated on change, and everything persists to Supabase PostgreSQL so a trip created on one device appears on any other.

The worked example throughout is a real trip shape: **Kolkata → Rinchenpong, West Sikkim, 23–27 Jan 2027, 4 travellers, two motorcycles, moderate budget, photography-led.**

Target stack: **Next.js (App Router) + React + TypeScript + Tailwind + Supabase (PostgreSQL, Auth, Storage), deployed on Vercel.**

---

## About the design files

The files in this bundle are **design references created in HTML**. They are prototypes showing intended look and behaviour — not production code to copy.

The task is to **recreate these designs in the target codebase**, using its established component patterns, styling system and data-fetching conventions. If no codebase exists yet, scaffold a Next.js App Router project and implement there.

`Contour — AI Travel Itinerary Builder.dc.html` is a single self-contained file with an in-app router and an in-memory store. Treat it as the **behavioural specification**: what each screen contains, how state moves, what happens on every interaction. Do not port its file structure.

The other three documents are **implementation specifications** and should be followed closely:

| File | Status |
|---|---|
| `database/schema.sql` | **Ship as-is.** Run it against the Supabase project. It is the authoritative data model. |
| `docs/api-contract.md` | **Authoritative.** Route paths, methods, payloads, error codes. |
| `docs/service-interfaces.md` | **Authoritative.** The provider-agnostic service layer and the AI prompt rules. |
| `.env.example` | **Authoritative.** Every variable, and which are server-only. |
| `database/seed.sql` | Optional demo data. Development projects only. |

---

## Fidelity

**High-fidelity.** Final colours, typography, spacing and interaction behaviour. Recreate the UI faithfully, mapping the tokens below onto the codebase's own system. All values are listed in *Design tokens*.

Two caveats where the prototype is deliberately not final:

1. **The map** is a schematic projection of real coordinates, not a rendered map. In production, replace it with the routing provider's map, drawing the returned polyline. Keep the marker taxonomy and the legend.
2. **Charts** are CSS (a `conic-gradient` donut, `width`-driven bars). Replace with the codebase's charting library if it has one; keep the same data and colour assignments.

---

## The one rule that outranks the visual design

Every real-world recommendation carries its source. Rows have a `verified` boolean:

| `verified` | Label | Colour |
|---|---|---|
| `true` | `✓ Verified Information` | `--teal` |
| `false` | `✦ AI Recommendation — Verify Before Booking` | `--amber` |

Hotel names, prices, ratings, review counts, opening hours, train and flight schedules, weather, distances, travel times and availability are **never** presented as fact without a live source. Where live data is missing:

- hotels become **price bands and areas to search**, with descriptive names (`"Mid-range hotel, Hill Cart Road"`), `rating: null`, `booking_url: null`, price marked *approx.*, and a **Find & verify** button rather than **Book**;
- weather falls back to climate normals, labelled *climate normals, not a live forecast*;
- distances become AI estimates and the map says so.

Do not remove these labels while restyling. `docs/service-interfaces.md` explains how the service layer enforces it.

---

## Screens

Sixteen views. `Landing` and `Auth` are standalone; the remaining fourteen sit inside the app shell.

### 1. Landing

**Purpose:** convert. **Layout:** max-width 1240 px, 24 px gutters, centred.

- **Header** — flex, space-between, 26 px vertical padding. Left: wordmark `Contour` in Instrument Serif 27 px, plus `AI TRIP ENGINE` in JetBrains Mono 10 px / `.18em` tracking / uppercase / `--tx3`. Right: theme toggle (pill, 1 px `--line`, 8/14 px padding), `Log in` (outline pill), `Create My Trip` (solid `--amber`, `#12100B` text, 10/20 px).
- **Hero** — two columns, `repeat(auto-fit, minmax(420px, 1fr))`, 48 px gap, 52/64 px vertical padding.
  - Left: eyebrow pill with a 6 px `--teal` dot pulsing on `cPulse 2.2s`; H1 `Plan Your Entire Trip With AI` — Instrument Serif, `clamp(46px, 6.2vw, 78px)`, line-height 1.02, tracking `-.018em`, with *With AI* in italic `--amber`; subtitle 18 px `--tx2`, `max-width: 44ch`, copy **"Enter your source, destination and travel dates. Get a complete personalized itinerary in seconds."**; two CTAs (`Create My Trip` solid, `Explore Features` outline, both 15/28 px pills); a three-stat rule below a 1 px `--line` top border — `6 / Travel modes`, `14 / Planning modules`, `Cloud / Synced across devices` (mono 22 px over mono 10 px uppercase `--tx3`).
  - Right: an instrument-panel card — 18 px radius, `--surf`, 1 px `--line`, `--shadow`. Header strip on `--surf2` with `GENERATED ITINERARY` and a `Saved to cloud` teal dot. Body: mono eyebrow `Bike · Moderate · 4 travellers`; title `Kolkata → Rinchenpong` in Instrument Serif 31 px; date line 13 px `--tx2`; a 4-up stat grid (1 px gaps over a `--line` background, 12 px radius) reading `1,430 km`, `34h ride time`, `82L fuel`, `53k ₹ est.`; then five route legs, each a `18px / 1fr / auto` grid with a coloured dot over a dashed vertical connector.
  - Both columns animate in on `cRise` (.7s, and .8s with a .12s delay).
- **Features** (`#features`) — section heading `Everything the trip needs` (Instrument Serif 38 px) with a mono counter-label on the right, over a 1 px `--line` rule; then a nine-card grid, `repeat(auto-fit, minmax(250px, 1fr))`, joined by 1 px gaps over `--line`, radius `0 0 16px 16px`. Each card: mono index (`01`–`09`) tinted per card, 17 px bold title, 13.5 px `--tx2` body. Hover lifts the background to `--surf2` over .18s. The nine, in order: AI Itinerary, Smart Routes, Hotels, Sightseeing, Restaurants, Budget Planner, Weather, Maps, Packing List.
- **Honesty band** — two columns. Left: `Honest by default` mono eyebrow in `--teal`, heading *Every recommendation carries its source*, body copy. Right: two sample label chips (`✓ Verified Information`, `✦ AI Recommendation`).
- **Closing CTA** — centred, contour-textured `--surf2` panel, 18 px radius, Instrument Serif `clamp(30px, 4vw, 44px)` heading.
- **Footer** — mono 10.5 px uppercase `--tx3`, space-between.

### 2. Auth

Split grid, `1.05fr 1fr` above 900 px, single column below (the brand panel is dropped entirely, not stacked).

- **Left panel** — `--surf` with a contour texture, 34/40 px padding, space-between column: wordmark at top; heading *Your trips live in the cloud, not in this browser.* (Instrument Serif 42 px, line-height 1.08) with supporting copy; `SUPABASE AUTH · ROW LEVEL SECURITY` mono line at the bottom.
- **Right panel** — centred form, `max-width: 400px`, `cRise .5s`. A `← Back` mono button; heading (34 px Instrument Serif) and subtitle that swap by mode; a two-up segmented tab (`Log in` / `Sign up`) built from 1 px gaps over `--line`, active tab `--surf3` + `--tx`, inactive `--surf` + `--tx3`; a full-width `Continue with Google` button with a mono `G` in `--amber`; an `or email` divider (two 1 px rules around a mono label); fields — `Full name` only on signup, then `Email`, then `Password` with a `Forgot?` link inline on the label row. Labels are mono 10 px `.14em` uppercase `--tx3`, 7 px above the input. Inputs: `--surf`, 1 px `--line`, 10 px radius, 13/14 px padding, focus border `--amber`. Submit is a full-width solid `--amber` button.
- **Reset mode** replaces the form with an email field, `Send reset link`, and `Back to log in`.
- **Validation**, inline, in a `--coral` bordered box on `--coralq`: email must contain `@`; password ≥ 8 characters; full name ≥ 2 characters on signup.

### 3. App shell

Desktop (≥ 900 px): fixed 244 px sidebar + fluid main. Below 900 px: sidebar removed, five-item bottom tab bar, `main` gains 70 px bottom padding.

- **Sidebar** — `--surf`, 1 px `--line` right border, `position: sticky; top: 0; height: 100vh`, scrolls internally.
  - Brand block: wordmark + `v1.0`, then a sync indicator — a 5 px dot plus mono 9.5 px uppercase label reading `Connecting` (`--tx3`) → `Saving to cloud` (`--amber`) → `Synced` (`--teal`).
  - **Navigation is typographic, not iconographic** — this is deliberate. Three labelled groups: **Plan** (Dashboard, Trips, Create trip), **<trip name>** (Itinerary, Map, Stays, Food, Sightseeing, Budget, Expenses, Packing, AI assistant), **Account** (Saved places, Profile, Admin). Group labels are mono 9 px `.18em` uppercase `--tx3`. Items are 13.5 px, 9/12 px padding, radius `0 8px 8px 0`, with a 2 px left border — transparent when inactive, `--amber` when active; active also takes `--surf2` and weight 700. Some items carry a mono right-aligned badge (trip count, day count, `12/20` packing progress).
  - Footer: 32 px circular avatar (initials, mono 12 px, `--amberq` fill, 1 px `--amber`), name and email truncated, and an `Out` button that turns `--coral` on hover.
- **Top bar** — sticky, `z-index: 20`, `color-mix(in oklab, var(--bg) 88%, transparent)` with `backdrop-filter: blur(12px)`, 1 px `--line` bottom. Left: mono crumb `Kolkata → Rinchenpong, Sikkim` over a 17 px bold section title. Right: theme toggle and `+ New trip`.
- **Bottom tab bar** (mobile) — `grid-template-columns: repeat(5, 1fr)`, translucent `--surf` with blur, 2 px top border per item (`--amber` when active), mono 9 px uppercase labels: `Home`, `Trips`, `Days`, `Money`, `More`. Minimum 56 px tall, so every target clears 44 px.
- **More sheet** — bottom sheet over `rgba(0,0,0,.55)`, `max-height: 78vh`, radius `18px 18px 0 0`, `cRise .26s`. Lists all sixteen sections in an auto-fit grid plus a `--coral` outlined `Log out`.
- **Toast** — fixed, centred, bottom 28 px (82 px on mobile, clearing the tab bar), `--surf3` pill with 1 px `--line2`, teal dot, 13 px bold label, `cRise .24s`, auto-dismiss after 2.4 s. Fired on every successful mutation with the table it touched — e.g. *"Reordered · itinerary_activities re-indexed"*.

### 4. Dashboard

- Four stat tiles, `repeat(auto-fit, minmax(190px, 1fr))`, 12 px gap, 14 px radius: `Total trips`, `Upcoming` (`--amber`), `Completed` (`--teal`), `Estimated spend`. Mono 27 px value over a 12 px `--tx3` sub-line.
- Two panels side by side: **Estimated spend by trip** — a 150 px-tall CSS bar chart, first bar `--amber`, the rest `--surf3`, mono value above each and a wrapped label below; **Travel patterns** — four labelled 5 px progress rows (most-used mode, favourite region, average trip length, photography-led share).
- **Next departure** band — 1 px `--amber` border, contour texture, `in 128 days` eyebrow, trip title in Instrument Serif 29 px, and `Open itinerary` / `Route map` actions.
- **Smart recommendations** — five cards behind a mono section rule. Each has a tinted dot + category label, body copy, and a working CTA that navigates to the relevant section. The five categories are exactly: Nearby extension, Budget saving, Time optimization, Weather adjustment, Rest recommendation.

### 5. Trips

- Filter row: search input (matches trip name, source and destination), travel-mode select (`All modes` + the six modes), sort select (`Newest first`, `Oldest first`, `Upcoming first`, `Longest trip`).
- Count line: mono `4 of 4 trips · from Supabase`.
- Card grid, `repeat(auto-fit, minmax(300px, 1fr))`, 15 px radius. The active trip's border is `--amber`; others `--line`, `--line2` on hover. Card contents: status pill (`Planned` `--amber`, `Completed` `--teal`, `Draft` `--tx3`), mode label with emoji, 17 px trip name, `source → destination`, a 4-up mono stat row (`Days`, `Pax`, `km`, `Est.`), and a date + budget-type line above a 1 px rule.
- Action strip pinned to the card bottom: five equal cells separated by 1 px `--line` gaps on `--surf2` — `Open` (`--amber`), `Edit`, `Copy`, `Share`, `Del` (`--coral`). Mono 9.5 px uppercase.
- Empty state: dashed `--line2` border, 44 px padding, Instrument Serif heading, `Clear filters` button.

### 6. Create trip — five-step wizard

Max-width 880 px. Stepper row of clickable numbered chips: current step is a solid `--amber` circle with `#12100B` text; completed steps are `--tealq` with a `--teal` border; upcoming are `--surf2` / `--tx3`. Body sits in a single 16 px-radius `--surf` card, footer has `← Back` (hidden on step 1) and `Continue →` (hover turns solid `--amber`).

1. **Basic details** — trip name (full width), source, destination, start date, end date, travellers (`number`, 1–40), and a live two-up readout of computed **Days** and **Nights**.
2. **Mode & type** — `Travel mode` pill group: `Bike`, `Car`, `Train`, `Flight`, `Bus`, `Mixed`. `Trip type` pill group: `Solo`, `Couple`, `Family`, `Friends`, `Group`, `Business`, `Photography`, `Adventure`, `Relaxation`. Selected pills use `--amberq` fill, `--amber` border and text.
3. **Budget** — `Budget`, `Moderate`, `Premium`, `Luxury`, `Custom` pills, plus an optional maximum-budget number field (340 px max) with the helper *"Total for the group, in your default currency."*
4. **Preferences** — fourteen interest pills (multi-select, `--tealq`/`--teal` when on): Nature, Mountains, Beaches, History, Culture, Photography, Adventure, Shopping, Food, Nightlife, Wildlife, Architecture, Spiritual, Relaxation. Then six food-preference pills and eight hotel-preference pills (single-select), and a three-row `Additional requirements` textarea.
5. **Review** — a seven-cell summary grid (route, dates, duration, mode & type, budget, travellers, interests full-width), then a full-width `✨ Generate my itinerary` button — 17 px padding, 15.5 px, weight 800.

**Validation** runs on step 1 and again before generate; errors render in a `--coral` box listing each failure: every required field, `end_date > start_date`, travellers 1–40, and a budget amount when type is `Custom`. `Continue` is blocked on step 1 while errors exist.

### 7. Generation progress

Max-width 620 px, 40 px top margin. Mono percentage eyebrow in `--amber`; Instrument Serif 36 px headline that switches from *Building your itinerary* to *Your itinerary is ready*; a 4 px progress rail (`--surf3` track, `--amber` fill, `width` transitions over .45s); then the twelve-step list in a 16 px-radius card. Each row is a 14 px mono marker plus a 13.5 px label — done `✓` in `--teal`, current `◐` in `--amber` pulsing on `cPulse 1.2s`, pending `·` in `--tx3`. Steps advance every 540 ms:

`Trip details validated` · `Route analyzed` · `Travel time calculated` · `Overnight locations selected` · `Finding attractions` · `Finding hotels` · `Finding restaurants` · `Checking weather` · `Optimizing daily schedule` · `Calculating budget` · `Creating packing list` · `Saving trip to Supabase`

While running, a 12.5 px `--tx3` footnote sets the expectation about labelling. On completion the card is replaced by `Open the itinerary →`.

In production this is driven by **SSE from `/api/trips/:id/generate`** — not a timer. Keep the twelve labels; they map to the pipeline in `docs/api-contract.md`.

### 8. Itinerary (the core screen)

Max-width 1000 px. Four stacked blocks before the days:

1. **Mode stat strip** — six mono cells over 1 px `--line` gaps: Total distance, Fuel required, Fuel cost, Range per tank, Refuels needed, Longest riding day.
2. **Bike-mode assumption panel** — four editable numbers (mileage km/l, fuel price per litre, tank litres, bikes). Every stat above recomputes live: `fuel = distance ÷ mileage`, `cost = fuel × price × bikes`, `range = tank × mileage`. Header carries `✦ Fuel figures are estimates`.
3. **Weather strip** — one card per day: mono day label, rain probability, place, `hi / lo` in mono 16 px, condition, and a `↑ sunrise ↓ sunset` line above a 1 px rule.
4. **Weather provenance note** — `--amber` bordered band stating the figures are climate normals and the live call runs 48 hours out.

Then one card per day, 16 px radius:

- **Header** on `--surf2`: mono `DAY 1 · SAT 23 JAN` in `--amber`; title in Instrument Serif 25 px; location in 12.5 px `--tx3`; an `✨ Optimize day` button on the right that reads `Optimizing…` for 1.1 s while it works. Below, a `max-width: 72ch` summary, then a four-up mono stat row above a 1 px rule (Distance, Travel, Day cost, Weather). A `--coral` alert band appears when the day has a weather warning.
- **Activity rows** — `grid-template-columns: 76px 20px minmax(0,1fr) auto`, 12 px gap, 11/16 px padding, `cursor: grab`, `draggable`.
  - Column 1: start time (mono 12.5 px) over end time (mono 11 px `--tx3`). Both are borderless inputs that show a `--amber` border and `--surf2` fill on focus, and save on blur.
  - Column 2: the **route spine** — an 8 px dot tinted by activity type over a dashed `repeating-linear-gradient` connector running the full row height.
  - Column 3: activity name (14 px bold), a type pill (mono 9 px uppercase, 1 px border in the type colour), the source label, then `location · duration distance`, then a `66ch` description.
  - Column 4: right-aligned mono cost, and three small buttons — `↑` (move to previous day), `↓` (next day), `✕` (delete, `--coral` on hover).
  - Type colours: `travel` `--amber`, `food` `--coral`, `stay` `--violet`, `sight` `--teal`, `rest` / `prep` `--tx3`.
  - Drag state: the dragged row drops to `opacity: .45` on `--surf2`; the row under the cursor takes `--surf3`.
- **Add-activity form**, revealed inline on `--surf2`: name (full width), start, end, type select, location, cost — then `Add activity` / `Cancel`.
- **Footer**: a dashed `+ Add activity` button and a mono hint, *"Drag rows to reorder · ↑↓ moves between days"*.

Every mutation — reorder, cross-day move, time edit, delete, insert, optimize — recalculates day distance, travel time and cost, then the trip total, then saves. Server-side that is `recalculate_trip_totals(trip_id)`.

### 9. Map

- A 440 px panel, contour-textured, holding an `SVG viewBox="0 0 100 100" preserveAspectRatio="none"` with two stacked polylines: a 2.5 px `--amber` base and a 1.5 px `--teal` dashed overlay animating on `cDash 2.4s linear infinite`. Eight waypoints are absolutely positioned from **real latitude/longitude**, linearly projected into the panel with a .25°/.3° margin: Kolkata (22.5726, 88.3639), Berhampore (24.0996, 88.2518), Farakka (24.8167, 87.9167), Malda (25.0119, 88.1433), Siliguri (26.7271, 88.3953), Sevoke (26.8944, 88.4722), Jorethang (27.1083, 88.3236), Rinchenpong (27.2478, 88.2492). Each marker is an 11 px dot with a 2 px `--bg` ring and a 3 px `color-mix` halo, plus a translucent label chip carrying the place name and its role. A mono caption bottom-left states it is a schematic projection.
- Legend row plus `Open route in Maps ↗` (a real deep link).
- An `--amber` provenance band: schematic, not routed; distances are estimates until the routing API returns a polyline.
- **Route legs** — one card per leg: `1. Kolkata → Siliguri` with mono distance and duration on the right, then a four-up detail grid — fuel estimate (litres + cost), toll (`No toll (2-wheeler)` where applicable), recommended breaks, fuel stops.

**In production:** render the provider's map and the returned polyline. Keep the marker taxonomy, the legend, the deep link and the provenance band.

### 10. Stays

A persistent `✦ AI Recommendation — Verify Before Booking` banner (suppressible via the `strictVerification` prop) explaining these are bands and areas, not listings, and that prices are approximate. Then one group per overnight location (Siliguri, Rinchenpong, Malda) — Instrument Serif 24 px heading, mono option count, 1 px rule — each holding three cards in a `minmax(270px, 1fr)` grid, ordered Budget → Mid-Range → Premium.

Card: category pill (`--teal` / `--amber` / `--violet`), `✦ Unverified` mono label, 15 px descriptive name, address, mono 21 px price with an `approx. / night` qualifier, facilities line, a note explaining the trade-off, and two actions — **Find & verify** (primary; hover turns `--amber`) and **Save**. No `Book` button, and no fabricated rating or review count anywhere.

### 11. Food

Same provenance banner, noting the food preference it was filtered against. Four groups — `Breakfast`, `Lunch`, `Snacks`, `Dinner` — each with cards carrying: cuisine label in `--coral`, `✦ Unverified`, descriptive name, `location · address`, a two-up grid of price band and hours (phrased as *"Typically 10:00–22:00"*, never asserted), a `Look for:` dish line, and `Save to places`.

### 12. Sightseeing

- **Photography mode panel** — shown when trip type is `Photography`. `--teal` border, contour texture, mono `PHOTOGRAPHY MODE ACTIVE`, Instrument Serif 26 px *Light schedule for this trip*, then six cells: Sunrise, Golden hour, Sunset, Scenic road, Architecture, Night sky — each with the place, the computed window in `--amber` mono, and a note tying it to a day.
- **Attraction list** — sorted Must Visit → Recommended → Optional. Each card: 16 px name, priority pill, source label, `category · location`, a `72ch` description, a `Save` button, and a four-up detail grid — visit duration, entry fee (`Free` when zero), opening hours, and best time in `--amber`.

### 13. Budget

- Four mono totals over 1 px gaps: `Estimated total`, `Per person`, `Per day`, `Against your cap` — the last turns `--coral` when the estimate exceeds the cap, with a `--coral` warning band naming the overage and a way to recover it.
- **Donut** — a 190 px `conic-gradient` circle with a 124 px `--surf` hole holding the mono total. Nine slice colours in order: `--amber`, `--teal`, `--violet`, `--coral`, `#7FA8D9`, `#D9A87F`, `#8FC98F`, `#C98FBF`, `#9FA8B3`.
- **Legend** — one row per category: 9 px swatch, name, right-aligned percentage, right-aligned amount.
- **Editable estimate table** — `minmax(0,1fr) 60px 120px`: category and description with a 3 px `--amber` share bar beneath, percentage, and a right-aligned number input. Editing recalculates totals, the donut and the legend, then saves on blur.

Categories, fixed: Transportation, Fuel, Toll, Hotel, Food, Activities, Parking, Local Transport, Shopping, Miscellaneous, Emergency Buffer.

### 14. Expenses

- Four totals: `Total estimated`, `Total actual`, then `Remaining` (`--teal`) or `Over budget` (`--coral`) depending on the comparison, and a logged-entry count.
- `+ Record an expense` opens a six-field form in an `--amber` bordered card: category select, description, amount, date, payment method (`UPI`, `Cash`, `Card`, `Net banking`), notes. Rejects an empty description or a non-positive amount.
- **Table** — `minmax(0,1fr) 110px 110px 90px 40px`, mono uppercase header on `--surf2`. Each row: category and description with a two-segment bar beneath (estimated in `--line2`, actual in `--amber`), estimated amount, an inline editable actual-amount input, a signed delta (`--coral` over, `--teal` under, `--tx3` when unlogged), and a delete button.

### 15. Packing & checklist

- **Progress card** — `12 / 20 items packed` in `--amber` mono, a 5 px `--amber` progress rail transitioning over .3s, and an add-item row.
- **Category cards** — Documents, Clothing, Weather Items, Electronics, Bike Gear, Toiletries, Travel Gear. Each has a mono header with a `--teal` `n/m` count, then rows of: an 18 px checkbox button (5 px radius; unchecked is a 1.5 px `--line2` outline, checked fills `--teal` with a `#12100B` tick), the item name (struck through and `--tx3` when checked), a mono quantity when > 1, and a delete `✕`.
- **Pre-trip checklist** — its own card with a `--teal` progress rail flush under the header, nine seeded items, and an add-your-own row. Copy for the nine is in the prototype; it covers bookings, service, documents, fuel plan, weather, emergency contacts, cash, offline maps and packing.

### 16. Saved places · AI assistant · Profile · Admin

- **Saved places** — filter pills (`All`, `Hotel`, `Restaurant`, `Attraction`, `Photography`), then cards with a type pill in the type colour, a delete `✕`, name, location and notes. Empty state matches the Trips pattern.
- **AI assistant** — max-width 800 px. A `min-height: 380px` message column: each message shows a mono `YOU` / `CONTOUR` label in `--amber` / `--teal` above an `84%`-max bubble (user `--amberq` on `--amber`, assistant `--surf` on `--line`), aligned right and left. A busy state shows a 13 px `cSpin` ring and *"Reading the trip and rewriting the affected parts…"*. Six quick-prompt pills sit above a two-row textarea (Enter sends, Shift+Enter newlines) and a solid `Send`. The assistant **mutates the trip** — the prototype's handlers insert activities and navigate; production uses the typed `Mutation` union in `docs/service-interfaces.md`, applied under the caller's RLS context, followed by a recalculation.
- **Profile** — avatar block with name, email and phone; a four-up preference grid (currency, travel mode, budget, food); a **share** panel (enable/disable, the token URL in mono `--teal`, copy, regenerate — regenerating revokes the old token); two **export** cards listing the eleven PDF sections and the nine Excel sheets; and an *About this build* note.
- **Admin** — four mono stat tiles, `Popular destinations` and `Travel modes` progress panels, and an API-usage table (`minmax(0,1fr) 100px 120px 80px`) with a tinted dot per provider, call count, cache hit rate in `--teal` and error count in `--coral`. Guard it twice: middleware on `profiles.is_admin`, and the RLS policies that widen only for `public.is_admin()`.

---

## Interactions & behaviour

**Navigation.** Landing → Auth → app shell. Inside the shell, section state drives which panel renders; the sidebar, the bottom tabs and the more-sheet all write to it. Dashboard recommendation CTAs deep-link into the relevant section, sometimes also setting the open day.

**Drag & drop.** HTML5 drag events on activity rows. `dragStart` records the id; `dragOver` records the hover target and calls `preventDefault`; `drop` moves the dragged activity to the target's position — adopting the target's `day_id`, so cross-day drops work — then renumbers `activity_order` from 1 and recalculates. `↑` / `↓` move an activity to the adjacent day, appending at the end.

**Recalculation.** After any itinerary change: per day, `distance = Σ distance_from_previous`, `travel_time = Σ travel_time_minutes where type = 'travel'`, `cost = Σ estimated_cost`; then the trip's `total_distance`. Server-side, one call to `recalculate_trip_totals`.

**Optimize day.** 1.1 s busy state, then reorder by start time with a type rank tiebreak (`prep` → `travel` → `sight` → `food` → `stay` → `rest`), renumber, recalculate, toast. Production replaces this with `POST /api/trips/:id/optimize`, which orders by geography and opening hours.

**Assistant.** If `window.claude.complete` exists, the prototype sends a JSON trip context with instructions to stay under ninety words and never assert unverified facts; otherwise it falls back to a rule-based responder matched on intent (photography, tiring days, cheaper stays, vegetarian, extra day, family, hotels, weather, route). Several branches mutate real state. Production: `POST /api/assistant`.

**Theme.** `document.body.dataset.theme` switches the whole token set. Persist the *UI preference* in `localStorage`; trip data never goes there.

**Responsive.** One JS breakpoint at **900 px**, tracked via a `resize` listener and initialised from `window.innerWidth` so the first paint is correct. Everything else is `repeat(auto-fit, minmax(…, 1fr))` and `minmax(0, 1fr)` — no other media queries. In a Tailwind implementation, prefer real media queries via `lg:` for the shell and keep `auto-fit` grids as they are.

**Loading.** Initial load shows a `Connecting` sync dot for ~240 ms. Mutations flip the dot to `Saving to cloud` for ~380 ms, then `Synced`, and fire a toast. In production these map to real request lifecycles; add skeleton loaders for the first paint of each section.

**Errors.** Nothing fails silently. Validation collects into a visible `--coral` list. Service failures surface the message from `{ error: { code, message } }`.

---

## State management

Prototype state that must survive the port, grouped by owner:

| Group | Keys |
|---|---|
| Routing | `view` (landing/auth/app), `section`, `moreOpen` |
| Auth | `authMode` (login/signup/reset), field values, `authErr`, `user` |
| Data | `trips`, `days`, `acts`, `routes`, `hotels`, `restos`, `sights`, `expenses`, `packing`, `checklist`, `places`, `weather`, `activeTripId` |
| Sync | `sync` (idle/saving/saved), `toast` |
| Trips list | `tripSearch`, `tripFilterMode`, `tripSort` |
| Wizard | `wizStep`, `draft`, `genIdx`, `genDone` |
| Itinerary | `openDay`, `dragId`, `dragOverId`, `addingTo`, `actDraft`, `optimizing` |
| Money | `expForm` |
| Assistant | `chat`, `chatInput`, `chatBusy` |
| Mode maths | `bike` (`mileage`, `fuelPrice`, `tank`, `bikes`) |
| Sharing | `shareOn`, `shareToken` |
| Prefs | `theme`, `wide`, `savedFilter` |

In production: server state belongs in a data-fetching layer (React Query or RSC + server actions) keyed by trip id, with optimistic updates for the checkbox, reorder and inline-edit interactions — they must feel instant. Only UI state (`section`, `dragId`, `wizStep`, `theme`, form drafts) stays local.

Every mutation in the prototype routes through one `save(label, mutate)` function that sets the sync flag, applies the change, and toasts. **Keep that single choke point** — it is the seam where Supabase calls belong, and it is why the port is small.

---

## Design tokens

Set on `body`; the light theme overrides the same names under `body[data-theme="light"]`.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0E1311` | `#F1EEE6` | page ground |
| `--surf` | `#151C19` | `#FFFDF8` | cards, sidebar |
| `--surf2` | `#1B2420` | `#F8F5EE` | inset panels, headers |
| `--surf3` | `#232E28` | `#EEE9DE` | chart tracks, secondary buttons |
| `--line` | `#2A3630` | `#DFD8C9` | hairlines, default borders |
| `--line2` | `#3B4A43` | `#C6BCA8` | hover borders, emphasis |
| `--tx` | `#ECE9E1` | `#181E1A` | primary text |
| `--tx2` | `#A0ABA4` | `#57615B` | secondary text |
| `--tx3` | `#6D7A73` | `#89928B` | mono labels, tertiary |
| `--amber` | `#E8A33D` | `#A96F14` | primary accent, travel, unverified |
| `--amberq` | `rgba(232,163,61,.13)` | `rgba(169,111,20,.11)` | amber wash |
| `--teal` | `#46C79C` | `#177F5C` | verified, sights, success |
| `--tealq` | `rgba(70,199,156,.13)` | `rgba(23,127,92,.11)` | teal wash |
| `--coral` | `#E4674A` | `#BF4227` | food, errors, over budget |
| `--coralq` | `rgba(228,103,74,.13)` | `rgba(191,66,39,.1)` | coral wash |
| `--violet` | `#9A8EE0` | `#584AA0` | stays, overnight halts |
| `--violetq` | `rgba(154,142,224,.14)` | `rgba(88,74,160,.11)` | violet wash |

On-amber text is always `#12100B`; on-teal is `#0C1410`. Light-mode accents are darkened specifically to hold 4.5:1 against `--surf`.

`--shadow` — dark: `0 1px 2px rgba(0,0,0,.45), 0 10px 30px -12px rgba(0,0,0,.6)`; light: `0 1px 2px rgba(70,58,34,.07), 0 10px 28px -14px rgba(70,58,34,.2)`.

`--contour` — dark `rgba(255,255,255,.028)`, light `rgba(40,30,10,.045)`. Used in `repeating-radial-gradient(circle at X Y, transparent 0 Npx, var(--contour) Npx (N+1)px)` at radii of 34–52 px. This is the signature texture; it appears on the page ground, the auth brand panel, the closing CTA, the next-departure band, the photography panel and the map.

**Typography**

| Role | Stack | Usage |
|---|---|---|
| Display | `'Instrument Serif', Georgia, serif` (`--fd`) | H1 `clamp(46px,6.2vw,78px)` / 1.02 / `-.018em`; section heads 38 px; card titles 23–31 px; day titles 25 px. Regular weight only; italic for emphasis. |
| UI | `'Plus Jakarta Sans', system-ui, sans-serif` | Body 13.5–15 px / 1.55; labels 12–14 px; weights 400/600/700/800. |
| Mono | `'JetBrains Mono', ui-monospace, monospace` (`--fm`) | All numeric readouts (11–27 px) and every small label: 9–10.5 px, `.10–.18em` tracking, uppercase. |

**Spacing** — 2, 3, 5, 7, 10, 12, 14, 16, 18, 20, 22, 24, 26, 30, 40, 48 px. Section padding comes from `--pad` (14 / 20 / 30 px by density prop).

**Radii** — 5–6 px checkboxes and micro-buttons; 8–10 px inputs and buttons; 12–16 px cards and panels; 18 px hero cards and sheets; `999px` pills.

**Motion** — `cRise` (14 px up + fade, .24–.8s), `cFade` (.2–.3s, every section entrance), `cPulse` (2.2s live dots, 1.2s current generation step), `cSpin` (.7s linear, assistant busy), `cDash` (2.4s linear infinite, map overlay), `cSweep` (available, unused). Hover transitions .15–.18s. No animation runs longer than 2.4 s or blocks input.

---

## Assets

**None.** No images, icon fonts or SVG illustrations. Deliberate: navigation is typographic, the contour texture is pure CSS gradients, the map is data-driven SVG, and charts are `conic-gradient` and `width`. The only glyphs are Unicode: `✓ ✦ ✕ ↑ ↓ ← → ↗ ◐ · ✨ !` and the travel-mode emoji `🏍 🚗 🚆 ✈ 🚌 🔀`.

If the target codebase has an icon set, adding icons to the sidebar is fine — but keep the labels. The typographic nav is the design's signature, and label-only navigation also tests better for a product with sixteen sections.

Fonts load from Google Fonts: Instrument Serif (400, 400 italic), Plus Jakarta Sans (400–800), JetBrains Mono (400, 500, 700). Self-host them for production.

---

## Files

| File | What it is |
|---|---|
| `Contour — AI Travel Itinerary Builder.dc.html` | The full interactive prototype. Behavioural spec. |
| `database/schema.sql` | Production schema, RLS, indexes, triggers, transactional functions. Ship as-is. |
| `database/seed.sql` | Demo trip. Development only. |
| `docs/api-contract.md` | Every route, payload and error code. |
| `docs/service-interfaces.md` | Service layer, per-mode ceilings, AI prompt rules, mutation union. |
| `.env.example` | All environment variables. |
| `README.md` | Ten-step Supabase setup, deployment, degradation matrix. |

---

## Build order

1. Scaffold Next.js + TypeScript + Tailwind. Create the Supabase project and run `schema.sql`. Generate `types/database.ts`.
2. Auth: email, Google, reset, `/auth/callback`, middleware-protected routes. Confirm the `profiles` row appears on signup.
3. App shell + navigation + theme. This unlocks every other screen.
4. Trips CRUD and the create wizard, against the real database. **Now run the cloud test** (README step 9) — before building anything on top of it.
5. Service layer behind the interfaces, with `api_cache` wired from the start.
6. The generate pipeline, ending in `save_generated_trip`. Stream progress as SSE.
7. Itinerary screen with drag & drop, inline edits and recalculation. The largest single piece.
8. Budget, expenses, packing, checklist.
9. Stays, food, sightseeing, map, weather.
10. Assistant, sharing, exports, admin.
11. Re-run the full test list (README step 9 plus the brief's section 78) against production.

Step 4's cloud test is the gate. If a trip created in one browser is not visible in another after login, something still reads from browser storage — fix it before going further.
