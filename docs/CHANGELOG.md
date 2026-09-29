# VanYatra — changelog

Before and after notes for the improvement brief. Plan and status: [ROADMAP.md](ROADMAP.md). Starting point: [AUDIT.md](AUDIT.md).

## P1 — Journeys, trip planning and hosts (29 Sep 2026)

`npm run check` covers everything below:
- lint
- 30 server tests: 6 new price and payment-plan tests
- 24 headless journeys at 360px, in demo mode and against a fresh Node server for each journey; also passed at 1280px

Pricing now lives in one shared module (`assets/js/core/pricing.js`). The server uses the same file, so every screen and the server agree on the price.

### Checkout (P1.1–P1.7, P1.10)
- **Four steps (P1.1).**
  - **Before:** three steps, and sign-in was needed to open checkout.
  - **After:**
    - 1 Dates & guests → 2 Protection & extras → 3 Driver → 4 Review & pay, with a progress bar, a price summary that stays in view (a total bar on phones) and Edit links on the review.
    - Progress is saved in the browser. Guests can price a whole trip, then sign in at the driver step and return where they left off.
- **Protection (P1.3).** Basic (included), Standard (₹499/night) and Premium (₹999/night):
  - A comparison table shows each plan's damage liability, deposit, roadside help, towing, tyres & glass and theft cover.
  - The deposit depends on the plan.
- **Extras (P1.4).** Ten extras:
  - bedding kit, gas cylinder, chairs & table, bike rack, child seat, Wi-Fi dongle, extra driver
  - snow chains (Himalayan vans only), portable toilet (vans without a toilet), pet fee (pet-friendly vans only)

  Owners switch each on and set its price.
- **Distance (P1.5).** 250 km a day included, or 400 km a day or unlimited for a nightly fee. There's a route-based estimate (e.g. Manali → Leh ≈ 480 km) and a "suits your route" badge.
- **With a driver (P1.6).** Daily fee, bata and a night-stay allowance. The driver's licence is checked with SARATHI, and the option only appears once it's verified. The renter then doesn't give a licence. Search has a "Driver available" filter.
- **Delivery and one-way (P1.7).**
  - Delivery to airports, stations and hotels, priced by km both ways.
  - One-way drop-offs between hubs (e.g. Manali → Delhi).
  - Search has a "Pickup location" filter.
- **India payments (P1.2).**
  - Pay in full, or reserve with 25%. The balance is charged automatically 7 days before pickup, with a reminder 3 days before.
  - Deposit: pay by UPI (refunded automatically), hold on a card at pickup, or choose zero-deposit (a non-refundable fee).
  - UPI is offered first, then card, net banking, and EMI above ₹10,000.
  - The gateway adapter gained `charge()` and `refund()`.
- **Owner-cancellation guarantee (P1.10).** Everything paid is refunded at once, plus ₹2,000 credit and a search for similar vans on the same dates. Credit is applied automatically at the next checkout.

### Trips (P1.8, P1.9, P1.11)
- **Digital check-in and check-out (P1.8).**
  - Pre-check-in from 7 days before pickup.
  - Guided photo inspection at pickup and return: 8 angles, fuel gauge, odometer and damage marks, all timestamped. Both parties sign, and the record then locks.
  - The return inspection compares photos, km and fuel with pickup.
  - Owners can claim from the deposit within 48 hours. The claim carries both inspections as evidence, which admins see.
  - UPI deposits are refunded after that window, minus any amount awarded, and are held while a claim is open.
- **Mountain Promise (P1.9).**
  - Covers mountain regions. If an official closure blocks the route, the traveller can change dates for free or take full credit.
  - Admins record closures (region, dates, source). Travellers and owners are told at once.
- **Messaging (P1.11).**
  - The host's response time and rate are computed from message history.
  - Quick questions for travellers and quick replies for owners.
  - Opt-in WhatsApp updates: confirmation, a pickup reminder with a map pin, and trip-day tips. They're queued through an adapter; the admin outbox shows them.

### Search and van page (P1.12, P1.13)
- **Search.**
  - A sticky row of 13 quick-filter chips, an active-filter count and Clear all.
  - New filters for fuel, driver, delivery and pickup location.
  - When nothing matches, it suggests nearby free dates and other regions, using the same filters.
  - Saved searches send an in-app alert when a matching van frees up.
- **Van page.**
  - "Good to know": length, height, fuel gaps, licence, and where the van suits best.
  - "Trip options", with every add-on and its price.
  - Height in the specifications, and an updated deposit section.
  - An optional YouTube or Vimeo walkthrough, embedded privately and loaded only when asked for.
  - The phone bar reads "Reserve · ₹X".

### Trip planning (P1.14–P1.17)
- **Routes.** Every suggested route has a day-by-day plan: km, driving hours and overnight altitude, plus "Vans for this route".
- **"Before you go".** Each region covers altitude and mountain sickness, permits, fuel gaps, mobile network and roads.
  - Permits link to official sites, checked on 29 Sep 2026:
    - Leh District Permit Tracking System
    - district sites for Leh, Kullu, Lahaul & Spiti and Kinnaur
    - state tourism departments
  - The Rohtang permit domain didn't resolve, so the Kullu district site is linked instead.
- **Spots directory (P1.16).** Dhabas with parking, van-friendly homestays, and water & waste points, on destination maps and as map layers. These are demo data, not endorsements.
- **Trip planner (P1.15)** (`#/plan`).
  - Suggests routes that fit, and ranks vans for the route: heater and 4x4 first for high passes, family-friendly vans for kids.
  - Builds a packing checklist by region, month and group.
  - Plans can be saved to the account or shared on WhatsApp.
- **First-timer's guide (P1.17)** (`#/guide`). Covers legality and where to sleep, toilets and showers, cooking, safety for families and solo women, and driving a camper. The video is a placeholder.

### Hosts (P1.18–P1.20)
- **Earnings calculator.** Van type × region × nights per month, starting from what similar vans charge. Shows commission, payout and a season estimate.
- **Owner options (P1.19).** Onboarding's pricing step sets:
  - extras and their prices, and distance packages
  - driver, with licence verification
  - delivery points and one-way cities
  - seasonal prices, early-bird and last-minute deals

  The backend validates all of these. The best single discount applies; discounts don't stack.
- **Owner dashboard (P1.20).**
  - A listing health score (0–100) that shows what to fix.
  - Pricing tips drawn from VanYatra's listings and bookings.
  - Calendar sync: export `.ics`, and import another site's `.ics` as blocked dates. Clashes are flagged.

### Open TODOs from P1
- **Server-side booking data.** Bookings, inspections, closures, saved searches and plans are still stored in each browser. Moving them to the server would also make the rules server-enforced: eligibility, credit, and the 48-hour claim window.
- **Services to connect:**
  - A real payment gateway, for orders, signature checks, recurring charges for balances, refunds and payouts.
  - WhatsApp Business API templates.
  - Object storage for inspection photos.
  - Server-side iCal fetching, for sync by link.
- **Content.** The driving video and more day plans. Spots should be verified with local partners.
- **Single-date fields** still use the browser's date input.

## P0 — Friction and trust (28 Sep 2026)

Every item was checked with `npm run check` (lint, 24 server tests, and 12 headless-Chrome journeys at 360px in demo mode and against the Node server). The journeys also ran at 1280px.

### P0.1 Date-range picker
- **Before:**
  - Native `<input type="date">` showed `mm/dd/yyyy` in US-English browsers.
  - Booked dates weren't marked.
  - The minimum stay was only reported after an error.
- **After:**
  - One pickup → return field shows `12 Nov 2026 → 16 Nov 2026 · 4 nights`.
  - It opens as a two-month popover on desktop and a bottom sheet on phones.
  - Past dates are disabled. For a van, booked and blocked nights are greyed out, and a return date can't jump over them.
  - Returns shorter than the minimum stay are disabled, and the rule is shown inline.
  - Fully usable by keyboard (arrow keys, PageUp/PageDown, Home/End, Enter, Esc). Focus is trapped in the picker and returned to the field.
  - Used on the home page, search filters, the van booking card and booking step 1 (`assets/js/daterange.js`). URLs and forms are unchanged.
- **Also:**
  - The van page's phone bar opens the picker. Once dates are set, it reads **Reserve · ₹X** and goes to checkout.
  - The search bar's label style no longer uppercases the values inside it.

### P0.2 One formatting module
- **Before:** money and dates were formatted in several places. Dates depended on each browser's locale data ("Sept" vs "Sep").
- **After:** `App.fmt` (`assets/js/core/format.js`), shared with the server:
  - ₹1,25,000
  - DD MMM YYYY
  - date ranges (`12 – 16 Nov 2026`)
  - nights and km
  - compact chart labels (₹4.5L)

### P0.3 Routing and 404
- **Goa breadcrumb:** not a bug. It opens the Goa page. The crawl journey now checks it and every link the site renders on each run.
- **404:** before, it only had "Back to home". Now it has a proper heading, a destination search, popular road trips, the main sections and a "tell us it's broken" link.
- **Fix:** 16 pages using `container section` had lost their side margins on phones. These included help, sign-in, sign-up and destinations.

### P0.4 All-in prices
- **Before:**
  - Cards showed totals with dates, but the breakdown lumped all nights together at an average rate.
  - There was no way to see the full breakdown from search.
- **After:**
  - The quote splits weeknights from Friday and Saturday nights, lists each add-on and includes the km allowance.
  - Every card with dates has **Price details**. The van page and checkout have **See full price breakdown**. Both open a drawer explaining each line: rates, cleaning, service fee, GST, km, the refundable deposit (shown separately) and protection.
  - Similar vans and map pins show trip totals once dates are set.
- **Checked:** the renter journey confirms the card, drawer, van page, checkout and stored booking all show the same total.

### P0.5 Reviews you can trust
- **Avatars:** before, "Ananya Iyer" showed as "AI" and "Neha & Vikram Joshi" as "N&". Now they show a first initial only, or a profile photo when there is one.
- **Verified stay:** reviews tied to a completed booking show **✓ Verified stay**.
- **Unique text:** the demo reused 7 review texts across all vans. All 74 demo reviews are now unique, with varied sub-scores.

### P0.6 Photos
- **Before:**
  - The owner photo step asked for 4 photos, with no guidance.
  - Nothing showed whether photos were real.
  - Images were a single size, with no placeholder while loading.
- **After:**
  - The owner photo step is a guide with a slot per shot: outside (required, used as the cover), bed made up, kitchen, toilet or shower, driver's seat and dashboard, and storage. Each has a tip, and extra photos can be tagged.
  - A shared rule requires **at least 5 photos, including the outside**, before a listing can go live.
  - The admin listing review shows every photo with its tag. Approving a listing confirms the photos are real and adds a **Real photos verified** badge to its cards and van page. Demo listings say they use sample photos.
  - Images use `srcset`/`sizes`, WebP or AVIF from the image service, lazy loading and a blurred placeholder while loading. Gallery and lightbox captions come from the photo tags.

### P0.7 Icons
- **Before:** 70+ different emoji were used as icons, and they render differently on Android, iOS and Windows.
- **After:** 88 Lucide SVG icons (ISC licence) are built into `assets/js/icons.js`, with no extra request. They're used for specs, amenities, dashboard navigation, help tiles, badges, map pins, payment methods and empty states. Plain text marks (✓ ✕ ★ →) stay.

### P0.8 Low review counts
- **Before:** "★ 5.0 (1)" showed on cards as if it were strong evidence, and one 5★ review outranked many 4.8s.
- **After:**
  - Below 3 reviews, a van shows **New on VanYatra** plus the host's rating across all their vans, and no average.
  - "Top rated" sorting uses a weighted score.

### P0.9 Tooling
- `npm run lint`: ESLint 9, used only on your computer. The site still has no build step.
- `npm run journeys`: headless Chrome at 360px, in demo mode and with the Node server. It covers:
  - crawl
  - renter
  - dates
  - verification gate
  - owner
  - admin

  It fails on errors, console errors, same-origin 404s, horizontal scrolling or mismatched prices. `--width 1280` runs it at desktop width. `--screens dir "#/route"` takes screenshots.
- `npm run check` runs all of the above.
- **Fix:** GitHub Pages logged a 404 console error on every visit while looking for a server. The app now reads `assets/backend.json` instead.

### Open TODOs from P0
- Single dates (date of birth, document expiry, the owner's block-dates form) still use the browser's date input. The format there follows the browser's language.
- Photos are stored as data URLs in the demo. Real uploads need object storage (see ROADMAP, "Needs a real backend").
- "Real photos verified" can only appear on listings created and approved in the app. The 32 demo vans use sample photos, so they correctly don't get the badge.
- Returning visitors get fresh demo data (local data v5), because the review data changed.
