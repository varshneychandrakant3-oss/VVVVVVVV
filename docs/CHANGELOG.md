# VanYatra — changelog

Before and after notes for the improvement brief. Plan and status: [ROADMAP.md](ROADMAP.md). Starting point: [AUDIT.md](AUDIT.md).

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
