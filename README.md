# VanYatra — camper van rental marketplace

A working prototype of a camper van marketplace for India: travellers discover destinations and book vans, owners get verified and manage their fleet, and admins run verification, payments and moderation.

The web app is plain HTML, CSS and JavaScript with no build step. A small Node.js server (no third-party packages) handles:
- **Sign-in**
- **Government document verification:** Aadhaar through DigiLocker, and PAN, GSTIN, vehicle RC/insurance/PUC/permit, driving licence and bank-account checks through an authorised verification provider
- **Everything that affects trust:** vans and their verification status, documents, owner verification steps, admin decisions, owner notifications and the audit log

The server decides every status. Browsers can only display it and ask for changes, and every admin sees the same queue. Bookings, messages and reviews are still demo data in each browser's `localStorage` (`assets/js/db.js`).

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm start
```

Then open http://localhost:8080. It starts in **test mode**: every check returns realistic results without contacting any government system, so you can click through every flow for free.

Run the server tests:

```bash
npm test
```

### Demo accounts

All passwords are `demo1234`. The sign-in page has one-click buttons for each.

| Role | Email | What to try |
|---|---|---|
| Traveller | traveller@vanyatra.in | Upcoming Ladakh trip, itinerary planner, cancel with refund preview, messages, reviews. The driving licence is checked at booking. |
| Van owner | owner@vanyatra.in | 5 vans, booking requests, calendar blocking, earnings, expiring document alerts |
| New owner | karan@vanyatra.in | Onboarding with KYC still pending. Try "Verify with DigiLocker". |
| Admin | admin@vanyatra.in | Verification queue, the **Government checks log**, VAHAN re-checks, listing approval, disputes, audit log |

Use **Reset demo data** in the footer to start over.

## Government document verification

| Document | Where it's checked | What happens |
|---|---|---|
| Aadhaar | UIDAI eAadhaar via **DigiLocker** (OAuth 2.0 + PKCE) | The owner approves sharing in DigiLocker. We keep only name, date of birth, gender and the last 4 digits. The XML is checked with DigiLocker's HMAC, then discarded, and the access token is revoked. |
| PAN | Income Tax Department | Name and date of birth are matched and Aadhaar–PAN linking is checked. Only a masked PAN is stored. |
| GSTIN | GST Network | The check digit is validated locally first. Then status (must be Active), legal name, and whether the PAN inside the GSTIN matches the owner's PAN. |
| Vehicle RC | MoRTH **VAHAN** | Registered owner vs verified identity, RC status and validity, blacklist, and commercial vs private registration |
| Insurance, PUC, permit | VAHAN (same lookup) | Expiry dates come straight from the registry. Insurance also needs a person to confirm the policy schedule covers self-drive rental, because the registry can't show that. |
| Driving licence (travellers) | MoRTH **SARATHI** | Must be valid through the end of the trip, and the name must match the driver. This happens before payment. |
| Bank account | Penny drop (₹1) | The account must exist and the name at the bank must match the owner's verified name. Only the last 4 digits are kept. |

Names are matched across all documents, allowing for initials, titles, word order and small spelling differences. Each check ends as **Verified** (approved automatically), **Needs review** (goes to the admin queue) or **Failed** (the owner is told why). If a government source is down, the check falls back to manual review instead of blocking the owner.

**What still needs a person:** the selfie-to-Aadhaar photo match, rent-a-cab licence, fitness certificate, NOCs, the insurance rental-cover check and the safety inspection. No government API covers these.

**Safeguards:**
- Every check needs a signed-in user with the right role and an explicit consent tick. Consent is enforced by the server.
- Checks are rate-limited per user, because each one costs money.
- Every check is recorded server-side (`data/verifications.json`) and in an audit log (`data/audit.jsonl`). Admins see it under **KYC & documents → Government checks log**.
- Admins can re-check any vehicle with VAHAN, one at a time or in bulk for expiring documents, to pick up renewals.
- **Statuses can't be faked from a browser.** Check results feed straight into the server's records (`server/market.js`, stored in `data/market.json`). There is no endpoint that sets a status directly. Owners can only submit details and files. Only admins decide on documents and listings, and the server enforces the order: all 10 steps verified before approval, approval before publishing.
- **Document expiry** is a server job (run at startup and hourly). Owners get reminders 30 days ahead. A listing is suspended when a required document expires, and reinstated automatically once renewed documents are verified.

### Test-mode values

In test mode the ending of an identifier decides the outcome, so you can try every path:

| Check | Outcome |
|---|---|
| Vehicle reg. number | `…0000` not found · `…1111` insurance expired · `…2222` different owner · `…3333` blacklisted · `…4444` private vehicle · `…5555` PUC expired · `…9999` registry down |
| PAN | last letter `X` = not found · 5th letter `Z` = name mismatch |
| GSTIN | any valid check digit (use **Fill test GSTIN**) · 13th character `9` = cancelled |
| Driving licence | `…0000` not found · `…1111` expired |
| Bank account | `…0000` invalid · `…2222` name mismatch |
| DigiLocker | a test consent screen where you choose the name on "Aadhaar" |

### Going live with real verification

1. **Sign up with the verification provider.** The adapter included is for Cashfree Secure ID (`server/providers/cashfree.js`), written against their v2 API reference. You'll need a registered business, KYC and a signed agreement. Ask them to enable PAN, GSTIN, Vehicle RC, Driving Licence and Bank Account Verification, and whitelist your server's IP address. Another provider can be added by writing one adapter file with the same five functions.
2. **Register as a DigiLocker partner** (Requester) on the DigiLocker partner portal. Register the redirect URI `https://<your-domain>/api/digilocker/callback` and request eAadhaar plus issued-documents access. Approval is done by MeitY and can take several weeks.
3. **Configure the server.** Copy `.env.example` to `.env` and set:
   - `SESSION_SECRET`
   - `PUBLIC_URL`, which must be `https://`
   - `VERIFY_PROVIDER=cashfree`, `CASHFREE_ENV=production`, and the client ID and secret
   - `DIGILOCKER_MODE=live`, and the DigiLocker client ID, secret and redirect URI

   The server refuses to start with real credentials unless these are set.
4. **Legal and privacy:**
   - Publish consent text and a privacy notice that meet the Digital Personal Data Protection Act, 2023.
   - Appoint a grievance officer.
   - Set retention periods for verification records.
   - Have counsel confirm the document list in `assets/js/config.js` for each state you operate in.
5. **Run a pilot:** test with your own PAN, vehicle and bank account in the provider's sandbox before switching to production.

## What's included

**Travellers**
- Home page with a destination, dates, travellers and van-type search
- Destination guides: highlights, attractions, suggested routes, best months, family suitability, activities and campsites on a map
- Search with filters (price, destination, dates, travellers, van type, amenities, family-friendly, pet-friendly, instant book, transmission) and list and map views
- Van page: photo gallery, specifications, sleeping arrangements, amenities, availability calendar, approximate pickup location, house rules, cancellation policy, deposit and reviews
- Booking flow: extras → driver details with licence check → payment (simulated gateway) → confirmation, with GST, fees and the deposit shown up front
- Account: trips, itinerary planner and packing list, saved vans, messages, payments and receipts, reviews, and profile. Profile covers verification, password change, data export and account deletion.

**Owners**
- 12-step onboarding wizard with automatic government checks. Each step shows Pending / Verified / Action required / Rejected.
- Dashboard: vans, requests, calendar and pricing, earnings and payouts, messages, review replies, document expiry and analytics

**Admins**
- Users, listing approval, KYC and document review with source tags, the government checks log, VAHAN re-checks, bookings with risk flags (including licence status), disputes and refunds, review moderation, destinations, analytics, announcements, audit log

**Other trust and safety rules**
- Document expiry reminders 30 days ahead. Listings are suspended automatically when required documents lapse.
- Booking fraud scoring. Contact details are hidden in messages before confirmation. Reviews with contact details are auto-flagged. Cancellation tiers come with a 24-hour grace period.

## Security

- Passwords are hashed with scrypt on the server, and sign-in takes the same time whether or not the email exists.
- Sessions use random IDs in `HttpOnly`, `SameSite=Lax` cookies signed with `SESSION_SECRET` (`Secure` on https). Changing your password signs out your other sessions.
- The server blocks cross-site POSTs by checking the `Origin` header. It sends a strict Content-Security-Policy and other security headers.
- Only `index.html` and `assets/` are served, so `.env`, `data/` and `server/` can never be downloaded.
- Sign-in, sign-up and verification are rate-limited. Request bodies are size-limited.
- Server data files are written with owner-only permissions.

## Project structure

```
index.html                 App shell
package.json               npm start / npm test
.env.example               Settings template (copy to .env)
server/index.js            HTTP server: static files, auth, verification API, DigiLocker callback
server/verify.js           Checks, cross-document name matching, outcomes, records
server/market.js           Vans, documents, owner verification, admin decisions, expiry job
server/digilocker.js       DigiLocker OAuth + PKCE, eAadhaar parsing, test-mode consent page
server/providers/          cashfree.js (real) and sandbox.js (test mode)
server/lib/                auth (scrypt, sessions), validation (PAN/GSTIN/IFSC…), names, rate limits, store
server/test/               Unit and end-to-end API tests (node --test)
assets/js/                 Web app (config, seed data, mock marketplace API, UI, pages)
assets/css/app.css         Styles (mobile-first, light + dark)
_headers                   Security headers for static hosting
```

## Still to do before a real launch

- **Bookings, messages and reviews:** these are still per-browser demo data. Move them to the server the same way vans and documents were moved.
- **Database:** the server stores JSON files, which is fine for a single-server pilot. Swap `server/lib/store.js` for Postgres or similar before running more than one server.
- **Payments:** use a PCI-DSS gateway with hosted checkout (UPI, cards with 3-D Secure, net banking), deposit pre-authorisation and marketplace payouts.
- **Document storage:** uploaded files need encrypted object storage with access logging. Today only file names are kept.
- **Face match:** compare the selfie with the Aadhaar photo through the provider's face-match and liveness APIs.
- **Scheduled jobs:** re-check VAHAN nightly for documents close to expiry, and send email and SMS through a provider.
- **Maps and images:** move to a commercial map tile plan and a CDN at scale.
