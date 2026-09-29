# VanYatra — roadmap

*Maps the improvement brief onto this codebase. Effort: **S** ≈ under half a day, **M** ≈ 1–2 days, **L** ≈ 3+ days. "Status" says what exists today (see [AUDIT.md](AUDIT.md)).*

**Ground rules**
- Keep the no-build, plain-JavaScript architecture and all existing URLs.
- Keep the design language (primary `#1f6f54`, warm neutrals).
- Everything is mobile-first at 360px, keyboard-usable and WCAG AA.
- One feature per commit.
- After each phase: `npm test`, lint, a scripted headless browser run of the renter and owner journeys at 360px and on desktop, and a console-error check. Then publish to GitHub Pages.

## Decisions

Agreed on 28 Sep 2026: go ahead with the recommendations below.

| # | Decision | My recommendation |
|---|---|---|
| D1 | **Lint and checks.** The brief says "run the build and lint", but there is no build step. | Add **ESLint as a dev-only tool** (`npm run lint`), plus `npm run check` (syntax check, tests, headless journey script). There's still no build step, and the site deploys as-is. **Update after P2:** a small esbuild step now joins and minifies the scripts (`npm run build`), and the built files are committed. |
| D2 | **Icons** (Lucide) | Copy the ~40 icons we use into one **inline SVG sprite** (`assets/icons.svg`, ISC licence credited). There's no runtime library and no CDN call. |
| D3 | **SEO** (P2). Hash URLs aren't indexable. | A **pre-render script** writes static HTML for the home page, the 10 destinations, 32 vans and the help pages, with meta tags, OG and JSON-LD. The app then takes over in the browser. Moving to history routing on GitHub Pages needs a 404.html redirect hack that's fragile. Old `#/` links keep working either way. |
| D4 | **Hindi** (P2) | Build the i18n layer and extract the strings. Machine-drafted Hindi must be **reviewed by a native speaker** before launch; I'll mark it as a draft. |
| D5 | **Scope.** The full brief is about 6–8 weeks of work. | Build **P0 fully**, then P1 in the order listed. Stop after each phase for your review, as the brief asks. |

## Needs a real backend: adapter now, real service later

| Capability | Adapter built now | Real service later |
|---|---|---|
| Payments (UPI, cards, net banking, EMI, part-payment, deposit refunds) | Extend `App.payments` with `createOrder`, `checkout`, `verify`, `refund`, `schedule` (balance due), Razorpay-shaped | Razorpay or Cashfree PG, with server-side order and signature verification and Route or Easy Split payouts |
| KYC, licence, ID | Already adapter-based (sandbox or Cashfree Secure ID, DigiLocker) | Provider contract and DigiLocker partner approval |
| WhatsApp and SMS notifications | `App.notifyChannels` adapter: writes to the in-app outbox and shows "would send via WhatsApp" in the demo | WhatsApp Business API (Gupshup or Meta Cloud API) and a DLT-registered SMS sender |
| Photo storage, check-in/out evidence | Files resized in the browser to JPEG data URLs; the backend stores them (demo size limits) | Encrypted object storage with signed URLs (S3 or R2) |
| iCal sync | Export `.ics` feed per van (download); import by pasting an `.ics` URL, parsed in the demo | Server fetch plus a scheduled refresh |
| Saved-search alerts, push | Stored searches and an in-app alert when a matching van frees up | Web Push (VAPID) from the server, or WhatsApp |
| Road closures and weather | A hand-maintained `closures` list per destination; the policy logic uses it | A feed from BRO/state disaster-management sites, or a manual admin toggle |
| Bookings across browsers | *Not in this brief*, but it's the top launch blocker | Move bookings, reviews and messages to the server (the same pattern as vans) |

## P0 — Fix friction and trust

**Status: ✅ done (28 Sep 2026).** Details, before/after notes and open TODOs are in [CHANGELOG.md](CHANGELOG.md).

| Item | Status | Change | Files | Effort |
|---|---|---|---|---|
| P0.1 Date-range picker | Native inputs (B1) | New `App.dateRange` component: popover calendar showing `DD MMM YYYY` (en-IN), night count, past dates disabled, booked and blocked dates greyed for a van, and min-nights shown inline. Keyboard support: arrows, Enter, Esc. On mobile it opens as a bottom sheet. Used on the home, search, van card and booking step 1 (the owner calendar keeps its grid). The native input stays as a no-JS fallback. | `ui/daterange.js` (new), `ui.js`, `pages/public.js`, `pages/booking.js`, `app.css` | M |
| P0.2 One format module | Spread out (B9) | `App.fmt`: `money` (₹1,25,000 via `Intl.NumberFormat('en-IN')`), `date`, `dateRange`, `nights`, `km`, `relative`. All existing callers use it; the core rules use the same helpers. | `assets/js/format.js` (new), all pages, `core/*` | S |
| P0.3 Routing and 404 | Breadcrumb is fine (B2); bare 404 (B7) | Add a routing test for every route and breadcrumb. New 404 with search, popular destinations, help and "report a broken link". | `app.js`, `pages/public.js`, check script | S |
| P0.4 All-in prices | Mostly done (§7 of the audit) | "Total for N nights" everywhere once dates exist (cards, map cards, van page, similar vans). **Price breakdown drawer** listing weekday and weekend nights separately, cleaning, service fee, GST, protection plan, add-ons, the deposit (separate, refundable) and included km. `App.quote` becomes the one source used by every screen. Add a test that the card, van page and checkout match. | `db.js`, `booking.js`, `public.js`, `ui.js` | M |
| P0.5 Avatars and verified stays | "AI" and "N&" (B3) | First initial only on a coloured disc (photo if one exists). Fix names containing "&". Add a "✓ Verified stay" badge when the review has a completed booking. Rewrite the seed reviews so text isn't reused (B4). | `ui.js`, `public.js`, `seed.js` | S |
| P0.6 Photos | Stock photos, 4 minimum (B8) | `PhotoGuide` component for owners with 6 required shots (exterior, bed made up, kitchen, bathroom or toilet, dashboard, storage), each with a tip and an example. Uploads are tagged by shot. **At least 5 real owner photos to go live** (a shared rule, enforced by the backend). "Real photos verified" badge on cards when an admin has approved the photos. `srcset` plus WebP from the image CDN, `sizes`, and a blur-up placeholder (a tiny background colour or LQIP). Demo vans are flagged "Demo photos". | `onboarding.js`, `core/market-rules.js`, `ui.js`, `public.js`, `admin.js`, `app.css` | M |
| P0.7 SVG icons | Emoji (B6) | Lucide-based sprite plus `App.icon(name)`. Replace emoji in the UI chrome: specs, amenities, nav, tab bar, badges and buttons. Emoji stay only in user-written content. | `assets/icons.svg` (new), `ui.js`, all pages, `app.css` | M |
| P0.8 Low review counts | "5.0 (1)" (B5) | Under 3 reviews, show "New on VanYatra" plus the **host rating across all their vans** ("Host ★ 4.8 · 23 reviews"). Show the star average only from 3 reviews up. | `db.js` (`App.get.hostRating`), `ui.js`, `public.js` | S |
| P0.9 Tooling | None (B15) | ESLint config, `npm run lint`, `npm run check`, and `scripts/journeys.mjs`: a headless Chrome run over the renter and owner flows at 360px with a console-error check. It uses a Chrome already installed on this machine through the DevTools protocol, with no npm dependency. If that isn't possible, I'll ask first. | `package.json`, `eslint.config.js`, `scripts/` | M |

## P1 — Journey features

**Status: ✅ done (29 Sep 2026)**, all 20 items. Details and open TODOs are in [CHANGELOG.md](CHANGELOG.md).

| Item | Status | Change | Files | Effort | Depends |
|---|---|---|---|---|---|
| P1.1 Four-step booking | 3 steps | 1 Dates & guests → 2 Protection & add-ons → 3 Driver (licence upload or verified profile, age check) → 4 Review & pay. Progress bar, sticky price summary, **progress saved** to storage, **guest checkout up to payment** (sign-in or quick signup at step 4). | `booking.js`, `db.js`, `auth.js` | M | P0.1, P0.4 |
| P1.2 India payments | UPI first, full payment | Pay-in-full vs **"Reserve with 25%, balance 7 days before pickup"** (scheduled charge and reminders). EMI option shown above a minimum amount (mocked). **Deposit paid by UPI** with an auto-refund timeline, or an optional **Zero-deposit upgrade** (a fee). Gateway adapter gets `refund` and `schedule`. | `payments.js`, `booking.js`, `account.js`, `db.js`, `config.js` | M | P1.1 |
| P1.3 Protection tiers | None | Basic, Standard and Premium in `config.js`: liability cap, deposit, what's covered (roadside, towing, tyres and glass) and price per night. Shown as a comparison table in step 2. The deposit depends on the tier. | `config.js`, `booking.js`, `db.js` (quote) | S | P1.1 |
| P1.4 Add-ons per van | 5 global add-ons | Catalogue of 10 add-ons (bedding, extra gas, chairs, bike rack, child seat, snow chains for Himalayan vans only, portable toilet, Wi-Fi dongle, extra driver, pet fee). Owners switch each on and set its price per van in onboarding and the dashboard. | `config.js`, `onboarding.js`, `owner.js`, `booking.js`, `core/market-rules.js` | M | — |
| P1.5 Distance packages | 250 km/day and ₹12/km | 250/day, 400/day or unlimited packages, priced per van. **Route km estimate** from the destination routes data (e.g. Manali → Kaza ≈ 200 km) shown next to the packages with a recommendation. | `config.js`, `seed.js`, `booking.js`, `public.js` | S | P1.1 |
| P1.6 With driver | None | Self-drive or with-driver toggle, a daily driver fee, bata and stay rules, and driver verification (owner uploads the driver's licence and badge; checked the same way). "Drive" filter in search. With a driver, the traveller doesn't need their own licence. | `onboarding.js`, `core/*`, `booking.js`, `public.js`, `db.js` | M | P1.1 |
| P1.7 Delivery and one-way | Fixed pickup | Owners list delivery points (airport, station, hotel) with a fee per km, and one-way hubs with a fee. "Pickup location" field in search. | `onboarding.js`, `public.js`, `booking.js`, `config.js` | M | — |
| P1.8 Digital check-in/out | None | Pre-check-in (ID or licence confirmation, arrival time). A guided **photo inspection** at pickup and at return (8 angles, fuel, odometer, damage marks), timestamped, and signed off by both parties. The evidence is shown in the booking and used in deposit disputes. | `pages/trip.js` (new), `account.js`, `owner.js`, `admin.js` | L | photo storage adapter |
| P1.9 Weather and closure promise | None | Policy page, plus a "Covered by the Mountain Promise" badge on eligible bookings. If a listed closure hits the route, the traveller can change dates for free or take credit (demo: an admin marks a closure). | `help` content, `config.js`, `account.js`, `admin.js` | S | — |
| P1.10 Owner-cancel guarantee | Refund exists | Instant full refund plus "similar vans for your dates" suggestions and a rebooking credit. | `db.js`, `account.js` | S | — |
| P1.11 Messaging upgrades | In-app chat exists | Quick-question chips, owner response time and rate on the van page, and opt-in WhatsApp notifications through the adapter (confirmation, pickup reminder with map pin, trip tips). | `account.js`, `public.js`, `db.js`, adapter | S | — |
| P1.12 Search upgrades | Filters exist | Sticky chip bar (price, sleeps, transmission, fuel, toilet, AC, heater, 4x4, pets, child-seat anchors, driver, delivery, instant book), active count, clear all, and an empty state that suggests nearby dates or regions. **Saved searches** with an in-app alert when a match frees up. | `public.js`, `app.css`, `db.js` | M | P1.6, P1.7 |
| P1.13 Van page upgrades | Mostly there | Sticky desktop card; the mobile bar says **"Reserve – ₹X total"** after dates are picked. Photo captions (the shot type from P0.6). Optional video or 360° link. "Good to know" block (height and length for low bridges, fuel, best destinations). Owner response time and rate. | `public.js`, `app.css` | S | P0.6 |
| P1.14 Destination routes | Routes list exists | Day-by-day plans with driving hours, road conditions, altitude and acute mountain sickness notes, **permits with links to official sources** (checked at build time; unverified claims are left out), fuel gaps, network coverage, campsites, and a "Vans for this route" CTA. | `seed.js`/`data`, `public.js` | M (content-heavy) | — |
| P1.15 Trip planner | Itinerary per booking exists | Standalone planner: destination and dates → route, suitable vans (4x4 or heater for high passes) and a packing list. Save to account and share via a WhatsApp link. | `pages/planner.js` (new), `account.js` | M | P1.14 |
| P1.16 Spots directory | Campsites on the map | Campsites, dhabas with parking, van-friendly homestays, dump and water points, with type filters on the map. | `seed.js`, `public.js` (map) | S | — |
| P1.17 First-timer guide | Help pages exist | Guide page (legality, overnight parking, toilets and showers, cooking, safety for families and solo women, a driving video placeholder). | `public.js` help content | S | — |
| P1.18 List-your-van page | Landing page exists | Earnings calculator (van type × region × nights per month) with the commission and payout breakdown from `config.js`. | `auth.js` (`ownerLanding`) | S | — |
| P1.19 Onboarding additions | 12 steps exist | Seasonal rates, early-bird and last-minute rules, add-ons (P1.4), delivery, one-way and driver (P1.6, P1.7). Progress already saves. | `onboarding.js`, `core/market-rules.js` | M | P1.4–P1.7 |
| P1.20 Owner dashboard | Mostly exists | iCal export and import, listing health score, pricing tips ("similar vans in Goa in December earn ₹X/night", from our own data). | `owner.js`, `db.js` | M | iCal adapter |

## P2 — Growth and polish

**Status: ✅ done (29 Sep 2026)**, all 9 items, with two caveats. The Hindi is a draft that needs a native review. Lighthouse mobile performance is 72–82, not yet 90. Details and open TODOs are in [CHANGELOG.md](CHANGELOG.md).

| Item | Change | Effort |
|---|---|---|
| P2.1 Deals | Last-minute, early-bird and long-stay badges and pricing; a seasonal landing page (Diwali, winter in Rajasthan); referral credits | M |
| P2.2 Post-trip | Review request with sub-scores and photos, "Book again", trip memories page | S |
| P2.3 Hindi | `App.t()` with `en` and `hi` string files, language switcher, `lang` attribute (see D4) | L |
| P2.4 PWA | Service worker: cache the app shell, **offline booking details and trip plan**, update prompt. Push through the adapter. | M |
| P2.5 SEO | Pre-render (see D3), titles, meta descriptions, OG images, JSON-LD (Product/Offer, LocalBusiness, BreadcrumbList, FAQPage), `sitemap.xml`, `robots.txt` | M |
| P2.6 Home social proof | Totals from the data, stories, "Why VanYatra" comparison | S |
| P2.7 Support | Searchable help, live-chat entry point, emergency number during active trips, **SOS button** (shares location via `geolocation` and a WhatsApp or SMS link) | M |
| P2.8 Analytics | `App.track(event, props)` with a local event log and a funnel view in admin. No third-party trackers without a consent banner. | S |
| P2.9 Performance | Lighthouse mobile ≥ 90 across the board. Leaflet already loads on demand; add IntersectionObserver so maps load only when visible. Defer page scripts, self-host the font subset, and use the image CDN. | M |

## Acceptance checks, run after every phase

- The full renter journey works at **360px** with no horizontal scroll (automated check).
- The **same price** shows on the card, van page and checkout for the same dates and options (automated check).
- Every existing route resolves, with no console errors (automated crawl).
- `npm test`, `npm run lint` and the journey script pass. `docs/CHANGELOG.md` is updated.
