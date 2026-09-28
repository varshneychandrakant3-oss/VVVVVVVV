# VanYatra — codebase audit

*28 Sep 2026 · branch `camper-van-marketplace` @ `63c6b78` · written before any P0 work*

## 1. Stack

| Layer | What it is |
|---|---|
| Front end | Plain HTML, CSS and JavaScript. **No framework, bundler, build step, linter or `node_modules`.** Classic `<script>` tags load in a fixed order from `index.html`, and every module attaches to a global `window.App`. |
| Templating | `App.h` tagged template (`assets/js/ui.js`): it HTML-escapes every interpolated value unless the value is already `SafeHTML`. Pages render by setting `innerHTML`. |
| Styles | One file, `assets/css/app.css` (~850 lines), mobile-first. Design tokens are CSS variables on `:root` (primary `#1f6f54`). Dark mode uses `prefers-color-scheme`. Font is Plus Jakarta Sans (Google Fonts). |
| Maps | Leaflet 1.9.4 and leaflet.markercluster from cdnjs, loaded only when a page has a map. Esri World Imagery tiles, plus India's official boundary from `assets/data/india-boundary.geojson` (DataMeet, CC BY 4.0). |
| Server (optional) | Node ≥ 20 with **no dependencies** (`server/`). It handles scrypt auth with signed HttpOnly cookies, rate limits, CSP, a JSON file store in `data/`, the verification providers (sandbox or Cashfree Secure ID) and DigiLocker OAuth + PKCE. |
| No-server mode | `assets/js/mock-server.js` answers the same `/api/*` routes inside the browser, using localStorage. It's picked automatically when `/api/config` doesn't return JSON, so it runs on **GitHub Pages**. |
| Shared rules | `assets/js/core/*.js` holds validation, name matching, the test-mode provider, verification outcomes, marketplace rules and traveller eligibility. These run in the browser **and** in Node (loaded with `vm` in `server/core.js`), so both backends decide statuses the same way. |
| Tests | `npm test` runs `node --test` (24 tests: unit, API and marketplace). They cover the server only; there are no front-end tests. |
| Hosting | GitHub Pages serves the `camper-van-marketplace` branch at `/VVVVVVVV/`. A `_headers` file holds security headers for other static hosts. |

> The brief asks to "run the build and lint". Neither exists today. §6 proposes adding a lint and check step without adding a build step.

## 2. Folder structure

```
index.html                  App shell and script order
assets/css/app.css          All styles
assets/js/config.js         Country config (App.C): currency, GST, fees, min driver age, document lists, destinations helpers
assets/js/core/             Shared rules (browser + Node): validate, sandbox, verify-rules, market-rules
assets/js/seed.js           App.buildSeed(): demo destinations, 12 users, 32 vans, documents, bookings, reviews, threads
assets/js/db.js             Local state (localStorage), pricing (App.quote), availability, risk scoring, backend detection, App.api
assets/js/mock-server.js    In-browser backend (same API as server/)
assets/js/ui.js             h`` templating, formatting helpers, avatars, badges, toasts, modals, maps, charts, validation messages
assets/js/payments.js       Payment service: createOrder → checkout → verify (test checkout dialog)
assets/js/pages/            public (home, destinations, search, map, van), booking, auth, account, verification,
                            onboarding (12 steps), owner dashboard, admin console
assets/js/app.js            Header, footer, tab bar, hash router with role guards
assets/data/                india-boundary.geojson
assets/icons/, manifest     PWA icons and web app manifest (no service worker)
server/                     index.js (HTTP + routes), market.js, verify.js, digilocker.js, providers/, lib/, test/
docs/                       This audit, the roadmap and the changelog
```

## 3. Data model

These shapes come from `assets/js/seed.js`, `db.js` and `core/market-rules.js`.

**Destination**: `{ id, name, region, lat, lng, hero, tagline, description, bestMonths[], familyScore, highlights[], activities[], attractions[], routes[{name, days, km, stops[]}], campsites[{name, type, lat, lng, facilities[]}], photos[] }`

**Van**:
- **Identity:** `{ id, ownerId, name, type (Campervan|Motorhome|Pop-top|4x4 Overlander|Caravan), destinationId, city, make, model, year, fuel, transmission }`
- **Space:** `{ sleeps, seats, beds, length, licence, mileage, amenities[], familyFriendly, petFriendly }`
- **Price and booking rules:** `{ pricePerNight, weekendPrice, cleaningFee, deposit, discounts{weekly, monthly}, minNights, kmPerDay, extraKmFee, instantBook, cancellation (flexible|moderate|strict) }`
- **Place and content:** `{ pickup{city, address, lat, lng, time, returnTime}, rules[], description, photos[], blocked[{start, end, note}] }`
- **Status:** `{ status (draft|in_review|published|paused|suspended|hidden), verification{ownership, registration, insurance, inspection, photos, listing, review}, registry (VAHAN result, owner/admin only), trust (public summary) }`
- **Photos:** `photos[]` holds Unsplash IDs (`photo-…`) or JPEG data URLs uploaded by owners.

**Owner** (`owners[userId]`): per-step statuses `{ account, kyc, business, payout }`, each `{ status, data?, note? }`.

**Document**: `{ id, ownerId, vanId?, type, label, number, expiry, insurer, fileName, status (pending|verified|action_required|rejected), note, check{source, checkedAt, outcome}, coverApproved?, reminded }`

**Traveller** (`travellers[userId]`): `{ residency, identity{status, method (aadhaar|passport), data, files?, expiry?}, licence{status, kind (indian|idp), validUpto, data} }`

**Booking** (local only):
- **Trip:** `{ id (VY####), vanId, ownerId, customerId, start, end, nights, adults, children, travelers, addOns[] }`
- **Money:** `{ pricing (App.quote result), status, paymentStatus, depositStatus, payment{method, orderId, paymentId} }`
- **People and risk:** `{ driver{name, age, licenceMasked, check}, traveller{level, …}, risk{score, flags[]}, specialRequests, itinerary[], createdAt }`

**Review** (local only): `{ id, vanId, bookingId, authorId, ownerId, rating, categories{cleanliness, accuracy, communication, value}, text, createdAt, status (published|flagged), ownerReply }`

**Also local:** threads/messages, transactions, disputes, notifications, audit, outbox (simulated emails), recentSearches.

## 4. State and persistence

- **Who owns what:**
  - **Local demo state** (`App.db`, localStorage key `vanyatra.db.v4`) holds bookings, reviews, messages, transactions, disputes, saved vans and preferences. It is per browser.
  - **Backend state** (the Node server's `data/*.json`, or the mock-server's localStorage key `vanyatra.demobackend.v1`) holds accounts, sessions, vans, documents, owner steps, traveller verification, verification records, notifications and the audit log.
- **Sync:** `App.syncMarket()` pulls `/api/market` into `App.db` after sign-in and after every `App.market()` write. The backend's view of vans is authoritative; local-only vans are kept but hidden.
- **Consequence:** bookings don't cross browsers. An owner in another browser won't see a traveller's booking. Booking rules, such as traveller eligibility and availability, are enforced client-side. This is the biggest gap before a real launch.

## 5. Routing

- **Hash router** in `assets/js/app.js`:
  - `ROUTES` is a list of `[pattern, pageName, roles?]`.
  - `App.parseHash()` matches path segments and splits the query string into `query`.
  - Role-guarded routes redirect to `#/login?next=…`, or show an access-denied page.
- **Pages:** each is `App.pages[name](el, params, query)`.
- **Scroll:** `history.scrollRestoration='manual'`, and the page scrolls to the top on each route change.
- **Routes:**
  - Public: `/`, `/destinations`, `/destinations/:id`, `/search`, `/map`, `/vans/:id`, `/list-your-van`, `/help`, `/help/:topic`, `/login`, `/signup`
  - Signed in: `/book/:id`, `/booking/:id/confirmed`, `/verify`, `/account[/:tab[/:id]]`, `/digilocker-demo`
  - Owner: `/owner/onboarding`, `/owner[/:tab[/:id]]`
  - Admin: `/admin[/:tab[/:id]]`
- **Unknown paths** fall back to `notFound`.
- **SEO:** every page is `index.html#/…`, so crawlers see a single URL. The `<title>` is updated per page, but there are no per-page meta descriptions, Open Graph tags or JSON-LD.

## 6. Bugs and findings

Checked on the live site (Chrome, `en-US`, 360px and desktop) and in the code.

| # | Finding | Severity | Status |
|---|---|---|---|
| B1 | **Date inputs are native `<input type="date">`** on the home, search, van, booking, onboarding and calendar pages (22 in all). With an `en-US` browser they show `mm/dd/yyyy`, and they can't grey out booked dates. | High (friction) | Confirmed |
| B2 | **Goa breadcrumb.** `#/destinations/goa` from a Goa van page lands correctly on the Goa page. | — | **Not reproduced.** The link and route are correct. |
| B3 | **Avatars use two initials.** "Ananya Iyer" shows "AI". Also, "Neha & Vikram Joshi" shows **"N&"**, a bug in `App.initials`. | Medium (trust) | Confirmed, plus the new "N&" case |
| B4 | **Duplicate review text.** The seed reuses 7 review texts across about 80 reviews, so the same sentence appears on different vans. This looks fake. | Medium (trust) | Confirmed (`seed.js` `reviewTexts`) |
| B5 | **Thin review counts.** 27 of 32 vans have 3 or fewer reviews, and cards show "★ 5.0 (1)" as if it were strong evidence. There's no host-level rating. | Medium | Confirmed |
| B6 | **Emoji icons.** 34 emoji show on a van page alone. They render differently across Android, iOS and Windows. | Low–Medium | Confirmed |
| B7 | **404 page** has only "Back to home". There are no helpful links. | Low | Confirmed |
| B8 | **Photos are Unsplash stock** for all demo vans. There's no photo-type guidance, and the minimum to go live is 4 photos (not 5). No `srcset`/WebP or blur placeholder. | Medium | Confirmed |
| B9 | **Money and date formatting** is spread across `App.money`, `App.fmtDate` and inline `toLocaleDateString` calls. The core rules format dates separately. No single format module. | Low | Confirmed |
| B10 | **Price consistency.** Card, van page and checkout totals match for the same dates, with no add-ons (checked: ₹26,777 card = quote; ₹35,825 van page = quote). | — | OK |
| B11 | **Search result count** already excludes vans booked for the chosen dates. Those vans are listed separately under "Booked for your dates". | — | OK |
| B12 | **360px width:** no horizontal scroll on the home, search, van, destination, map, list-your-van, help or login pages. | — | OK |
| B13 | **Only service worker missing:** there's a manifest and icons, so it's installable on some browsers, but there's no offline cache or push notifications. | Low | Confirmed |
| B14 | **Bookings are client-side** (see §4). Traveller eligibility and the payment "verify" step run in the browser. The mock gateway's signature is not a real security control. | High for launch | Known, documented in the README |
| B15 | **No lint and no front-end tests.** Regressions are caught only by manual or scripted browser runs. | Medium | Confirmed |

## 7. Already in place (the brief assumes some of these are missing)

- Dates carry from search → van page → checkout through the URL. Cards show the **total trip price** once dates are set, and the van page shows the full breakdown.
- A booking stepper (3 steps), a UPI-first payment choice, a payment-gateway interface (`App.payments`), and failure and retry handling.
- Traveller verification (Aadhaar/DigiLocker or passport, SARATHI or IDP) with licence reuse, and an age check against `App.C.minDriverAge`.
- Owner onboarding (12 steps with Pending / Verified / Action required / Rejected), document expiry reminders and auto-suspension.
- Owner dashboard: vans, requests, calendar blocking, earnings, messages, reviews, documents and analytics. Admin console with an audit log.
- In-app messaging with contact-detail masking before confirmation.
- Map clustering with van, destination and campsite preview cards. Destination pages with routes, best months, family score and campsites.
