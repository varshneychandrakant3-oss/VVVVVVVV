# VanYatra — camper van rental marketplace

A working prototype of a camper van marketplace for India: travellers discover destinations and book vans, owners get verified and manage their fleet, and admins run verification, payments and moderation.

It is plain HTML, CSS and JavaScript with no build step. All data lives in the browser's `localStorage` behind a mock API (`assets/js/db.js`), so every flow can be clicked through without a server.

## Run it

Windows (no Node or Python needed):

```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Then open http://localhost:8080. Any static file server works too, for example `npx serve` or `python -m http.server`.

### Demo accounts

All passwords are `demo1234`. The sign-in page has one-click buttons for each.

| Role | Email | What to try |
|---|---|---|
| Traveller | traveller@vanyatra.in | Upcoming Ladakh trip, itinerary planner, cancel with refund preview, messages, reviews |
| Van owner | owner@vanyatra.in | 5 vans, booking requests, calendar blocking, earnings, expiring document alerts |
| New owner | karan@vanyatra.in | Onboarding with KYC still pending |
| Admin | admin@vanyatra.in | Verification queue, listing approval, disputes, flagged reviews, audit log |

Use **Reset demo data** in the footer to start over.

## What's included

**Travellers**
- Home page with a destination, dates, travellers and van-type search
- Destination guides: highlights, attractions, suggested routes, best months, family suitability, activities and campsites on a map
- Search with filters for price, destination, dates, travellers, van type, amenities, family-friendly, pet-friendly, instant book and transmission, plus list and map views. Filters are kept in the URL so searches can be shared.
- Van page: photo gallery, specifications, sleeping arrangements, amenities, availability calendar, approximate pickup location, house rules, cancellation policy, deposit and reviews
- Booking flow: extras → driver details → payment (simulated gateway) → confirmation. The price breakdown shows GST, fees and the deposit before you pay.
- Account: trips, itinerary planner and packing list, saved vans, messages, payments and receipts, reviews, and profile. Profile includes email/phone verification, password change, data export and account deletion.

**Owners**
- 12-step onboarding wizard. Each step shows Pending / Verified / Action required / Rejected.
- Owner dashboard: vans, requests (accept or decline), calendar and pricing, earnings and payouts (CSV export), messages, review replies, document expiry and analytics

**Admins**
- Users and owners (suspend or reactivate), listing approval, KYC and document review, bookings with risk flags, disputes and refunds, review moderation, destination editing, platform analytics, announcements and email outbox, audit log

**Trust and safety built into the rules (`db.js`)**
- Document expiry job: reminders 30 days ahead. Listings are suspended automatically when insurance, RC, permit, PUC or fitness documents lapse, and reinstated once renewed documents are verified.
- Fraud checks on bookings (new account with a high-value booking, unverified phone, rapid repeat bookings, driver age). High-risk bookings skip instant book and are flagged to admins.
- Phone numbers, emails and links are hidden in messages until a booking is confirmed, to keep payments on the platform.
- Reviews that contain contact details are auto-flagged. Owners can also report reviews.
- Cancellation policies (flexible, moderate, strict), a 24-hour grace period and pro-rata GST refunds

## Country configuration

Everything country-specific is in `assets/js/config.js`: currency, GST, fees, KYC documents (Aadhaar, PAN, selfie), vehicle documents, the inspection checklist and payout fields. It is set up for **India** (Rent-a-Motor-Cab licence, commercial registration, PUC, fitness certificate, All India Tourist Permit, commercial insurance). To launch elsewhere, add a profile to `COUNTRY_PROFILES`. Confirm legal requirements and tax rates with local counsel before going live, because rules vary by state.

## Project structure

```
index.html              App shell
serve.ps1               Local static server
_headers                Security headers (CSP etc.) for static hosting
assets/css/app.css      Styles (mobile-first, light + dark)
assets/js/config.js     Country, fees, policies, amenities
assets/js/seed.js       Demo data (dates relative to today)
assets/js/db.js         Mock backend: store, pricing, availability, refunds, risk, expiry, API
assets/js/ui.js         Escaped HTML templating, calendar, charts, maps, modals
assets/js/app.js        Router with role guards, header, footer
assets/js/pages/*.js    Public, booking, auth/help, account, onboarding, owner, admin
```

## Moving to production

This prototype is designed so the UI calls one API layer (`App.api`). For a real launch:

- **Backend and auth:** move `App.api` behind a server. Use a real database, argon2/bcrypt password hashing, HTTP-only session cookies, and server-side role checks. The client-side checks here are for UX only.
- **Payments:** use a PCI-DSS gateway with hosted checkout (UPI, cards with 3-D Secure, net banking), deposit pre-authorisation and marketplace payouts.
- **KYC:** connect DigiLocker/UIDAI for Aadhaar, NSDL for PAN, a penny-drop bank check and a face-match provider. Store documents encrypted, with access logging.
- **Email and SMS:** send the queued `outbox` messages through a provider. The daily expiry job in `runExpiryChecks` should become a scheduled job.
- **Maps:** OpenStreetMap tiles via Leaflet work for a demo. Use a commercial tile or geocoding plan at scale.
- **Images:** the demo uses Unsplash photos. Owner uploads are resized in the browser. Production needs object storage and a CDN.
