# VanYatra — changelog

Before and after notes for the improvement brief. Plan and status: [ROADMAP.md](ROADMAP.md). Starting point: [AUDIT.md](AUDIT.md).

## P2 — Growth and polish (29 Sep 2026)

`npm run check` covers everything below:
- pre-render
- lint
- 30 server tests
- 38 headless journeys at 360px, in demo mode and against a fresh Node server for each journey; also passed at 1280px

New journeys: analytics, deals, posttrip, support, offline, seo, lang.

### P2.1 Deals and referrals
- **Before:** early-bird and last-minute discounts existed only as pricing rules, so travellers never saw them.
- **After:**
  - Van cards show a deal badge (Early-bird −10%, Last minute −15%, Long stay) when the chosen dates qualify. The card, van page and checkout use the same `App.quote`.
  - `#/deals` lists live deals. There are four seasonal landing pages: Diwali road trips, Rajasthan in winter, Himalayan summer and Kerala monsoon. Each has dates inside its season and pre-filtered vans.
  - **Referral credits:** every traveller has a code and link (copy or WhatsApp) in Payments. A friend who signs up with it and completes a first trip earns both people ₹1,000 of credit.
- The demo data was refreshed (server seed v4, demo backend v2), so existing installs get the new deal fields.

### P2.2 After the trip
- **Before:** a review form with only a star rating.
- **After:**
  - When a trip ends, the traveller gets a review request (in-app, plus WhatsApp if they opted in). `#/account/bookings?review=ID` opens the form directly.
  - The review has sub-scores and up to 4 photos. Review photos show on the van page.
  - Past trips have **Trip memories** (`#/trip/:id/memories`: route, stops, photos and the review) and **Book again**.

### P2.3 Hindi (draft)
- **Before:** English only.
- **After:**
  - `App.t()` looks up the English text in a Hindi dictionary (`assets/js/i18n.js`) and falls back to English.
  - Translated so far: the header, menus, tab bar, footer, home page, search form, date field and the analytics notice.
  - A language switch in the menu and footer (`हिन्दी` / `English`) remembers the choice and sets `<html lang>`. Hindi uses the system's Devanagari font.
  - While Hindi is on, the footer says the translation is a draft and some pages are still in English.
- ⚠️ **The Hindi was written without a native reviewer.** Have a native Hindi speaker review it before launch.

### P2.4 Works offline, installable, trip alerts
- **Before:** no service worker. The app didn't work without a connection.
- **After:**
  - `sw.js` caches the app. It reads the file list from `index.html`, so there's no list to maintain.
  - Photos are cached as they're viewed (up to 150).
  - Offline, **My trips, the itinerary, pre-check-in and trip plans still open**, with an "offline" notice.
  - When a new version is out, an "Update available — Refresh" bar appears.
  - The app is installable (manifest and icons).
  - "Trip alerts on this device" (Profile) turns on device notifications for booking and trip updates. Tapping one opens the right page.

### P2.5 Search engines and link previews
- **Before:** every page was `index.html#/…`. Search engines saw one empty page, and shared links had no preview.
- **After:**
  - `npm run prerender` (also part of `npm run check`) writes a real page for each of these: 10 destinations, 32 published vans, the help topics, the FAQ, the guide and deals. That's 52 pages.
  - Each page has its own title, description, canonical URL, Open Graph and Twitter image, readable content, and JSON-LD:
    - Product/Offer with a nightly price, plus AggregateRating from 3 reviews up
    - TouristDestination
    - FAQPage
    - BreadcrumbList

    The page then starts the app on the same screen.
  - Also written: `sitemap.xml`, `robots.txt`, and a `404.html` that sends clean links (`/vans/v1`, `/search?dest=goa`) to the matching `#/` screen.
  - The home page has Organization JSON-LD.
  - The app updates the description, canonical and share tags per screen.
  - Old `#/` links work as before.

### P2.6 Home page social proof
Trip and review totals come from the data, alongside traveller stories and a "Why VanYatra" table comparing VanYatra with car + hotels and with unverified rentals.

### P2.7 Support
- **Help search:** covers the FAQ, policies, the first-timer guide and each destination's practical info.
- **"Chat with us":** a live-chat entry with an instant first reply. Admins are notified.
- **During an active trip:** a bar shows the roadside number and an **SOS** button. SOS shares the traveller's location (with permission) with the owner and our team, and offers call, SMS and WhatsApp links.

### P2.8 Analytics
- **Before:** none.
- **After:** `App.track(event, props)` records page views, searches, filters, van views, date picks and each checkout step, payment and booking. It records **only after the visitor agrees** in a consent bar, and there are no third-party trackers.
  - Admin → Analytics shows the funnel.
  - Profile & privacy can turn it off, which deletes the recorded events.

### P2.9 Performance
Lighthouse, mobile (simulated slow 4G, 4× CPU), home page on the Node server:

| | Before | After |
|---|---|---|
| Performance | 16 | 72–82 (varies run to run) |
| First contentful paint | 6.2 s | 1.4 s |
| Largest contentful paint | 10.0 s | 3.7–4.4 s |
| Total blocking time | 780 ms | 310–570 ms |
| Layout shift | 1.05 | 0.06 |
| Accessibility / Best practices / SEO | 95 / 100 / 100 | 97 / 100 / 100 |

What changed:
- The owner and admin screens (about 165 KB) load when first opened. The service worker still caches them for offline use.
- All scripts are deferred. A small `boot.js` loads the web font off the critical path and preloads the home hero.
- Hero and destination photos use responsive `srcset` (previously one 1800px image for every screen). Off-screen photos load at low priority.
- Maps load Leaflet and tiles only when scrolled near (IntersectionObserver).
- The Node server gzips files and large API responses, and answers repeat requests with ETag/304.
- Layout shift is fixed by reserving the header's height.
- Below-the-fold home sections skip layout until needed (`content-visibility`).
- A forced reflow when setting the page title is gone.
- Accessibility fixes: footer heading order, the date button's name, link underline and chip tap size.

### After P2: build step (29 Sep 2026)
Approved after the P2 review. Lighthouse mobile, Node server, two runs each:

| Page | After P2 | With the build step |
|---|---|---|
| Home | 72–82 | 84–85 |
| Van page (`/vans/v1/`) | 71–78 | 71–78 |
| Destination (`/destinations/goa/`) | — | 75–79 |

- **Build (`npm run build`, esbuild):**
  - `app.html` is now the source shell. The build writes `index.html` with one minified script bundle instead of 28 files (174 KB → 147 KB gzipped), plus a CSS bundle (92 KB → 78 KB) and an owner/admin bundle loaded on demand.
  - File names carry a content hash, so they can be cached for a year (the Node server and `_headers` say so).
  - The built files are committed, so GitHub Pages needs no build.
- **Start-up requests run in parallel:**
  - Before: backend check → config → session → market data, one after another.
  - After: `boot.js` starts the backend check while the scripts download, and the other three requests are made together.
- **Render:** the page is scrolled to the top only when it isn't already there. Reading the scroll position forced an extra layout on every screen (about 350 ms on a slow phone).
- **Pre-rendered pages** show the loader while the app starts, rather than painting the static copy and then swapping it. Before, this could shift the layout by up to 0.9. Search engines and visitors without JavaScript still get the static copy.
- **Tried and reverted:** preloading the main photo on van and destination pages. It competed with the scripts for bandwidth and made the largest paint slower (6.5 s).

**Still not 90.** On a slow phone, most of the remaining time is the first render: laying out the page for the first time (fonts, about 1,000 elements) and running the app code. The next steps would be:
- render the first screen without waiting for all of the market data
- trim the demo seed data from the main bundle when a server is present
- pre-render the home page shell

### After P2: spacing and alignment review (29 Sep 2026)
Reported in review: the home page looked crowded, with the buttons under "How it works" pressed against the cards and out of line. Every main page was then checked at 1024, 1100, 1200, 1280 and 360px.

- **Buttons:**
  - Before: buttons lined up on the text baseline, so a button with an icon sat 4 px off one without.
  - After: they line up on their centre. A new `.btn-row` gives rows of buttons even gaps and wraps on phones.
  - The home page's button row now has space above it.
- **Header:**
  - Before: seven links, the language switch and the account menu didn't fit below about 1200px, so links wrapped onto two lines ("Find a / van").
  - After: from 1024 to 1199px the header uses the menu button, like tablets. Links never wrap.
- **Van cards:**
  - Before: "New on VanYatra · Host ★" squeezed the van type and town into two lines.
  - After: the rating moves to its own line when both don't fit.
- **Stories:** the three cards fill the row instead of leaving an empty fourth column.
- **Space between blocks:** added where a note, button, form or heading touched the grid, list or form above it. Places fixed:
  - the booking card ("Minimum stay", "Select dates…")
  - sign-in and sign-up
  - the support form
  - "Extras" and "Best for" on the van page
  - "Before you go" notes
  - the earnings calculator
  - Profile
  - owner and admin overview lists
  - the owner calendar
- **Menus:** the Reviews item in the account, owner and admin menus shows a star icon like the others, instead of a text ★ that sat off-line.
- **New `spacing` journey:** checks 40 pages at every width, including the owner and admin dashboards. It fails if buttons in a row are out of line or touching, or if a block is glued to the card, grid, form or list above it.
- `npm run journeys -- --full --screens out/ "#/…"` saves whole-page screenshots in tiles for visual review.

### After P2: real photos of each place (29 Sep 2026)
Reported in review: van cards didn't show the places they're named after. For example, "Chopta Trail Pop-top" showed a van in American red-rock desert.

- **How photos were checked:** every place photo now comes from Unsplash with a free licence, and the photographer's recorded location (or "in <place>" in the description) is that place. Each one was also looked at, to leave out portraits, pets, paintings and collages.
- **Van listings open with where the van is based:**
  - The cover and the last photo are of the place in the van's name or its town. Examples: the road to Chopta, a car beside Pangong Lake, the Hunder dunes in Nubra, the Khardung La sign, Abbey Falls, the Dawki river, and the dead trees in Periyar Lake at Thekkady.
  - The photo caption names the place.
- **The van's own photos** (outside, interior, kitchen) are still sample photos. Very few campervans on Unsplash were photographed in India, so only neutral shots are kept. Removed:
  - recognisably foreign backdrops: red-rock desert, snowy Alps, aurora, sea cliffs, American RV parks
  - posed photos of people in bed

  Listings still show the "Sample photos · demo listing" tag.
- **Destinations:** the cover and gallery of all 9 destinations were replaced with location-checked photos, for example Pangong Lake, Key Monastery, Palolem, the Alappuzha backwaters, Jaisalmer Fort and Manali.
- **Site photos:**
  - home page: a road in Lahaul & Spiti
  - owner page: Ladakh
  - sign-in: a Spiti road
  - sign-up: a campsite at Korlai
  - family section: tents near Dharamshala
- **Existing demo data:**
  - Vans that still have sample photos get the new set on next load (server seed v5, demo backend v3). Photos an owner uploaded are kept.
  - Destination photos are refreshed in saved browser data.
- **TODO:** replace the sample van photos with each owner's real photos when listings go live (the photo guide and "Real photos verified" check already exist). Photo credits are recorded on Unsplash; add a credits page if the licence terms need one at launch.

### After P2: confirmed campsites across India (29 Sep 2026)
Requested in review: campsites on the map, only verified and real.

- **Before:** each destination had 2–3 campsites with made-up names, for example "Pangong Lakeside Camp" and "Kaza Van Park". They are removed.
- **After:** `assets/js/data/campsites.js` lists **13 campsites in 6 states** (Himachal Pradesh, Uttarakhand, Karnataka, Kerala, Gujarat, West Bengal). Each one:
  - is mapped on OpenStreetMap (which gives its position), and isn't marked disused;
  - has a website, either its own or its operator's official site (Jungle Lodges & Resorts, Gujarat's tent cities), that loads and names the campsite (checked 29 Sep 2026);
  - is open to travellers. The Indiahikes trek campuses are real but only for its own groups, so they're left out.
- **How the list was narrowed:**
  - 1,292 named campsites are mapped in India, but only 42 list a website or phone number. Of those, 9 had a live website that names them.
  - Four government-run camps were added after checking their official sites: Galibore, Kali Adventure Camp, Tent City Dhordo and Tent City Narmada.
  - Left out: phone-only listings, sites that are down or block checks, and India's "caravan sites" on OpenStreetMap, which are mostly mis-tagged (car dealers, parking).
- **Where they show:**
  - Map: a "Confirmed campsites" layer, plus a list by state under the map.
  - Destination pages: confirmed campsites within 160 km, with the distance.
  - Trip itinerary: the "Fill from suggested route" button suggests them as overnight ideas.
  - Admin → Destinations: a count per destination.
- **Map card:** where the campsite is and whether vans are allowed. OpenStreetMap records that for only one of them; the rest say "Ask before arriving in a van". The card also has the website, the phone, and a link to the OpenStreetMap entry with the check date.
- **Credit:** the maps now credit OpenStreetMap, as its licence (ODbL) requires.
- **Other map layers:** dhabas, homestays and water points are general areas, not checked places. They're now labelled that way and switched off by default on the map.
- **TODO:**
  - Re-check the campsite links before launch and every few months.
  - Add more campsites as owners and partners confirm them. Ideally VanYatra verifies van-friendly campsites itself (a visit or a call, plus photos) and marks them "VanYatra checked".

### Open TODOs from P2
- **Performance ≥ 90 is not reached yet.** The build step is done (see above). The next steps are listed there, plus self-hosting a Latin subset of the font.
- **Hindi:** have a native speaker review it. Then extract strings for search results, the van page, checkout and account.
- **Push notifications** only work while the site is open or installed. Real push (when the app is closed) needs a push service and VAPID keys on the server.
- **SOS and live chat** are front-end only in this demo. Connect them to a real support desk and an on-call phone line.
- **Pre-rendered pages** use the seed data. At launch, run `npm run prerender` against live data on each deploy.
- **Analytics** events are stored in the browser (demo) or with other demo data. Send them to the server for real reporting.
- **Referral credit** is applied in the demo backend. Move it to the server with the booking records.

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
