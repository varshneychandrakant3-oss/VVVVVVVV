#!/usr/bin/env node
// End-to-end journeys in headless Chrome, with no npm dependencies (Chrome DevTools
// Protocol over Node's built-in WebSocket).
//
//   node scripts/journeys.mjs              demo mode (static files, in-browser backend) and server mode
//   node scripts/journeys.mjs --mode demo  only one mode
//   node scripts/journeys.mjs --only renter
//
// Every journey runs at 360×780 as a phone and fails on: a thrown error, a console
// error, a same-origin request that fails, or horizontal scrolling.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const MODES = opt('mode', 'both') === 'both' ? ['demo', 'server'] : [opt('mode')];
const ONLY = opt('only', '');
const WIDTH = Number(opt('width', 360));
// --shell app.html runs the journeys on the source files instead of the built bundles
const SHELL = opt('shell', '');

const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
].find(p => p && fs.existsSync(p));
if (!CHROME) { console.error('Chrome or Edge not found. Set CHROME_PATH.'); process.exit(2); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });

/* ---------- App hosts ---------- */
const TYPES = { '.xml': 'application/xml', '.txt': 'text/plain', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
// Like GitHub Pages: plain files, no /api (so the app uses its in-browser backend)
async function startStatic() {
  const port = await freePort();
  const server = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !(['index.html', 'app.html', 'sw.js', '404.html', 'sitemap.xml', 'robots.txt'].includes(rel) || ['assets/', 'vans/', 'destinations/', 'help/', 'guide/', 'deals/'].some(d => rel.startsWith(d))) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(port);
  return { url: `http://localhost:${port}/`, stop: () => server.close() };
}
// The Node server in test mode with a throwaway data folder (never real providers)
async function startNode() {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vanyatra-journeys-'));
  const env = { ...process.env, PORT: String(port), PUBLIC_URL: `http://localhost:${port}`, DATA_DIR: dataDir, SESSION_SECRET: 'journeys-secret-journeys-secret-123', VERIFY_PROVIDER: 'sandbox', DIGILOCKER_MODE: 'sandbox' };
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${port}/api/config`)).ok) break; } catch { /* starting */ } await sleep(100); }
  return { url: `http://localhost:${port}/`, stop: () => { child.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); }, log: () => log };
}

/* ---------- Chrome ---------- */
async function launchChrome() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vanyatra-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
    else if (msg.method) listeners.forEach(l => l(msg));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const close = () => { try { ws.close(); } catch { /* closed */ } proc.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500); };
  return { send, on: (fn) => listeners.push(fn), close };
}

/* ---------- Helpers injected into the page ---------- */
const HELPERS = String.raw`
window.T = {
  wait: (ms) => new Promise(r => setTimeout(r, ms)),
  async until(fn, ms = 8000, what = 'condition') { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch {} await T.wait(80); } throw new Error('Timed out waiting for ' + what + ' at ' + location.hash); },
  assert(cond, msg) { if (!cond) throw new Error(msg + ' (at ' + location.hash + ')'); },
  $: (s) => document.querySelector(s), $$: (s) => [...document.querySelectorAll(s)],
  main: () => document.querySelector('main'),
  text: (s = 'main') => (document.querySelector(s)?.innerText || '').replace(/\s+/g, ' '),
  rupees: (s) => { const m = String(s).match(/₹\s?([\d,]+)/); return m ? Number(m[1].replace(/,/g, '')) : NaN; },
  async go(hash) { location.hash = hash; await T.wait(250); await T.until(() => !T.$('.boot-loading') && T.main().children.length, 8000, 'page ' + hash); await T.wait(350); },
  noOverflow() { const w = document.documentElement.scrollWidth; T.assert(w <= innerWidth + 1, 'Horizontal scroll: page is ' + w + 'px wide at ' + innerWidth + 'px'); },
  async login(email, next = '/') { await App.api.logout(); await T.go('#/login?next=' + encodeURIComponent(next)); const f = T.$('main form'); f.email.value = email; f.password.value = 'demo1234'; f.requestSubmit(); await T.until(() => !location.hash.startsWith('#/login'), 8000, 'sign-in'); await T.wait(600); },
  modalButtons: () => T.$$('dialog[open] button, .modal button'),
  async clickModal(label) { await T.until(() => T.modalButtons().some(b => b.innerText.includes(label)), 6000, 'dialog button ' + label); T.modalButtons().find(b => b.innerText.includes(label)).click(); },
  futureRange(offset, nights) { return [App.addDays(App.today(), offset), App.addDays(App.today(), offset + nights)]; }
};`;

/* ---------- Journeys (run inside the page) ---------- */
const JOURNEYS = {
  // Every link the site renders, logged out: no 404s, no errors, no sideways scroll
  async crawl() {
    const seen = new Set(), queue = ['#/'], bad = [];
    const norm = (h) => h.split('?')[0];
    while (queue.length && seen.size < 60) {
      const r = queue.shift(); if (seen.has(norm(r))) continue; seen.add(norm(r));
      await T.go(r);
      if (/couldn’t find that page/.test(T.text())) bad.push(r);
      T.noOverflow();
      for (const a of T.$$('a[href^="#/"]')) { const h = a.getAttribute('href'); if (!seen.has(norm(h)) && !/\/(vans|destinations)\/[\w-]+$/.test(norm(h))) queue.push(h); }
    }
    for (const r of ['#/vans/v1', '#/destinations/goa', '#/destinations/ladakh', '#/help/cancellation', '#/help/support']) { await T.go(r); T.assert(!/couldn’t find that page/.test(T.text()), 'Route broken: ' + r); T.noOverflow(); }
    await T.go('#/vans/v6'); const crumb = T.$$('.crumbs a').find(a => a.innerText === 'Goa'); crumb.click(); await T.wait(600);
    T.assert(location.hash === '#/destinations/goa' && /Goa/.test(T.$('main h1').innerText), 'Goa breadcrumb went to ' + location.hash);
    await T.go('#/no-such-page'); T.assert(/couldn’t find that page/.test(T.text()), '404 page missing');
    // Earnings calculator: type × region → market price, commission and payout breakdown
    await T.go('#/list-your-van');
    const reg = T.$('#ec-region'); reg.value = 'goa'; reg.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(100);
    T.assert(/typical for similar vans/.test(T.text('#ec-hint')) && /commission/.test(T.text('#ec-lines')) && T.rupees(T.text('#ec-out')) > 0, 'Earnings calculator incomplete');
    T.assert(!bad.length, 'Broken links: ' + bad.join(', '));
    return seen.size + ' pages';
  },

  // Search → van → checkout with the same price everywhere → pay (fail, then succeed) → My trips
  async renter() {
    await T.login('traveller@vanyatra.in', '/');
    const [s, e] = T.futureRange(52, 4);
    const van = App.db.vans.find(v => v.status === 'published' && v.instantBook && App.isAvailable(v.id, s, e) && v.minNights <= 4);
    await T.go('#/search?dest=' + van.destinationId + '&start=' + s + '&end=' + e + '&guests=2');
    T.noOverflow();
    const card = T.$('.van-card[data-van="' + van.id + '"]'); T.assert(card, 'Van card missing in search');
    const quote = App.quote(van, s, e).total;
    const cardTotal = T.rupees((card.innerText.match(/₹[\d,]+(?=\s*total)/i) || [''])[0]);
    T.assert(cardTotal === quote, 'Card total ' + cardTotal + ' ≠ quote ' + quote);
    // Price breakdown drawer from the card: same total, weekday/weekend split, deposit apart
    card.querySelector('[data-price-van]').click();
    await T.until(() => T.$('.modal'), 3000, 'price breakdown');
    const drawer = T.text('.modal');
    T.assert(T.rupees((drawer.match(/Total\s*₹[\d,]+/) || [''])[0]) === quote, 'Drawer total differs from the card');
    T.assert(/weeknight|weekend night/.test(drawer) && /Refundable security deposit/.test(drawer) && /km/.test(drawer), 'Drawer is missing lines');
    T.$('.modal [data-close]').click(); await T.wait(200);
    await T.go('#/vans/' + van.id + '?start=' + s + '&end=' + e); T.noOverflow();
    const vanTotal = T.rupees((T.text('#booking-card').match(/Total\s*₹[\d,]+/) || [''])[0]);
    T.assert(vanTotal === quote, 'Van page total ' + vanTotal + ' ≠ quote ' + quote);
    T.$('#book-btn').click(); await T.until(() => T.$('#book-form'), 6000, 'booking form');
    const checkoutTotal = T.rupees((T.text('.book-summary').match(/Total\s*₹[\d,]+/) || [''])[0]);
    T.assert(checkoutTotal === quote, 'Checkout total ' + checkoutTotal + ' ≠ quote ' + quote);
    T.noOverflow();
    // Step 1 → 2 (defaults) → 3 → 4
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('.prot-table'), 6000, 'protection & extras step');
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('#book-form [name=phone]'), 6000, 'driver step');
    T.assert(!T.$('#book-form [name=licence]'), 'Verified traveller was asked for their licence again');
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('[name=payMethod]'), 6000, 'review & pay step');
    T.noOverflow();
    T.$('#book-form').agree.checked = true; T.$('#book-form').requestSubmit();
    await T.clickModal('failed'); await T.until(() => T.$('.alert-bad'), 6000, 'payment failure message');
    const before = App.db.bookings.length;
    T.$('#book-form').agree.checked = true; T.$('#book-form').requestSubmit();
    await T.clickModal('successful'); await T.until(() => /confirmed/.test(location.hash), 8000, 'confirmation');
    const b = App.db.bookings.at(-1);
    T.assert(App.db.bookings.length === before + 1 && b.vanId === van.id && b.pricing.total === quote, 'Booking not stored with the quoted total');
    await T.until(() => /Ref pay_/.test(T.text()), 4000, 'payment reference on the confirmation page');
    await T.go('#/account/bookings'); T.assert(T.text().includes(b.id), 'Booking missing from My trips');
    return b.id + ' ' + b.status + ' ' + App.fmt.money(quote);
  },

  // Date-range picker: DD MMM YYYY, nights, past/booked/too-short dates blocked, keyboard, carried to search
  async dates() {
    const dayBtn = (d) => T.$(`.drp [data-d="${d}"]`);
    await T.go('#/');
    const field = T.$('#search-form .drf-btn'); T.assert(field, 'No date field on home');
    T.assert(!T.$('#search-form input[type=date]'), 'Native date inputs still on home');
    field.click(); await T.until(() => T.$('.drp'), 3000, 'picker to open');
    T.assert(T.$('.drp').classList.contains('sheet') === innerWidth < 640, innerWidth < 640 ? 'Picker should be a bottom sheet on phones' : 'Picker should be a popover on wide screens');
    const yesterday = App.addDays(App.today(), -1);
    if (dayBtn(yesterday)) T.assert(dayBtn(yesterday).hasAttribute('aria-disabled'), 'Past date is pickable');
    // Keyboard: focus is on a day; ArrowRight moves one day, Enter picks
    const focused = document.activeElement; T.assert(focused.classList.contains('drp-day'), 'Focus not on a day when the picker opens');
    focused.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    T.assert(document.activeElement.dataset.d === App.addDays(focused.dataset.d, 7), 'ArrowDown did not move a week');
    // Pick a start in next month, then an end 4 nights later (navigate months if needed)
    const start = App.addDays(App.today(), 20), end = App.addDays(start, 4);
    const pickDay = async (d) => { for (let i = 0; i < 3 && !dayBtn(d); i++) { T.$('.drp [data-nav="1"]').click(); await T.wait(80); } dayBtn(d).click(); await T.wait(120); };
    await pickDay(start);
    T.assert(/Choose your return date/.test(T.text('.drp')), 'Picker did not ask for the return date');
    await pickDay(end);
    T.assert(!T.$('.drp'), 'Picker did not close after choosing the return date');
    const label = T.text('#search-form .drf-btn');
    T.assert(label.includes(App.fmt.date(start)) && label.includes(App.fmt.date(end)) && /4 nights/.test(label), 'Field shows "' + label + '"');
    T.assert(/^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(App.fmt.date(start)), 'Not DD MMM YYYY: ' + App.fmt.date(start));
    T.$('#search-form').requestSubmit(); await T.wait(700);
    T.assert(location.hash.includes('start=' + start) && location.hash.includes('end=' + end), 'Dates not carried to search: ' + location.hash);
    T.assert(T.text('#result-count').includes(App.fmt.dateRange(start, end)), 'Search page lost the dates: ' + T.text('#result-count'));
    T.assert(T.$('#filter-form').start.value === start && T.$('#filter-form').end.value === end, 'Search filters lost the dates');
    // Van page: a booked night can't be picked, and a return can't jump over it
    const b = App.db.bookings.find(x => ['confirmed', 'requested'].includes(x.status) && x.start > App.addDays(App.today(), 3) && App.get.van(x.vanId)?.status === 'published');
    await T.go('#/vans/' + b.vanId);
    T.$('#bc-dates .drf-btn').click(); await T.until(() => T.$('.drp'), 3000, 'van picker');
    for (let i = 0; i < 20 && !dayBtn(b.start); i++) { T.$('.drp [data-nav="1"]').click(); await T.wait(60); }
    T.assert(dayBtn(b.start).hasAttribute('aria-disabled') && dayBtn(b.start).classList.contains('unavail'), 'Booked night is pickable');
    const before = App.addDays(b.start, -3);
    if (before > App.today() && !App.unavailableDates(b.vanId).has(before)) {
      await pickDay(before);
      T.assert(dayBtn(App.addDays(b.start, 2))?.hasAttribute('aria-disabled'), 'Return date can cross a booked night');
    }
    T.$('.drp .drp-close').click(); await T.wait(100);
    // Minimum stay: a van with minNights > 1 disables shorter returns
    const van = App.db.vans.find(v => v.status === 'published' && v.minNights >= 2);
    await T.go('#/vans/' + van.id);
    T.assert(/Minimum stay/.test(T.text('#booking-card')), 'Min-night rule not shown on the van page');
    T.$('#bc-dates .drf-btn').click(); await T.until(() => T.$('.drp'), 3000, 'van picker');
    let s = App.addDays(App.today(), 40); while (!App.isAvailable(van.id, s, App.addDays(s, van.minNights + 2))) s = App.addDays(s, 5);
    await pickDay(s);
    T.assert(dayBtn(App.addDays(s, 1)).classList.contains('too-short'), 'Too-short return not disabled');
    await pickDay(App.addDays(s, van.minNights));
    const total = T.rupees((T.text('#booking-card').match(/Total\s*₹[\d,]+/) || [''])[0]);
    T.assert(total === App.quote(van, s, App.addDays(s, van.minNights)).total, 'Van page total wrong after picking dates');
    T.assert(/Reserve · ₹/.test(T.text('#mobile-bar')), 'Phone bar did not switch to "Reserve · ₹X"');
    T.noOverflow();
    return 'range ' + App.fmt.dateRange(start, end);
  },

  // Checkout options: a guest prices a trip, signs in, and pays 25% with a driver, delivery,
  // one-way drop-off, Standard protection, extras, a km package and a UPI deposit
  async checkout() {
    await App.api.logout();
    const [s, e] = T.futureRange(70, 5);
    const van = App.db.vans.find(v => v.status === 'published' && v.instantBook && App.driverFor(v) && v.delivery?.oneWay?.length && App.isAvailable(v.id, s, e) && v.minNights <= 5)
      || App.db.vans.find(v => v.status === 'published' && App.driverFor(v) && v.delivery?.oneWay?.length && App.isAvailable(v.id, s, e) && v.minNights <= 5);
    T.assert(van, 'No demo van with a driver and one-way option');
    await T.go('#/book/' + van.id + '?start=' + s + '&end=' + e + '&adults=2&children=1');
    T.assert(T.$('.book-progress') && T.$$('.stepper li').length === 4, 'Checkout should have 4 steps and a progress bar');
    // Step 1 as a guest: with driver, delivered to the first point, dropped in another city
    const f1 = T.$('#book-form');
    const pick = (name, value) => { const r = f1.querySelector(`[name="${name}"][value="${value}"]`); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); };
    pick('drive', 'driver'); await T.wait(150);
    pick('delivery', van.delivery.points[0].id); await T.wait(150);
    pick('oneWay', van.delivery.oneWay[0].id); await T.wait(150);
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('.prot-table'), 6000, 'step 2');
    // Step 2: Standard protection, an extra, the 400 km package
    const f2 = () => T.$('#book-form');
    const set = (sel) => { const x = f2().querySelector(sel); x.checked = true; x.dispatchEvent(new Event('change', { bubbles: true })); };
    set('[name=protection][value=standard]'); await T.wait(150);
    set('[name=km][value=plus]'); await T.wait(150);
    set('[name=addOns][value=bedding]'); await T.wait(150);
    const opts = { addOns: ['bedding'], protection: 'standard', km: 'plus', driver: true, delivery: van.delivery.points[0].id, oneWay: van.delivery.oneWay[0].id, zeroDeposit: false };
    const quote = App.quote(van, s, e, opts);
    T.assert(T.rupees((T.text('.book-summary').match(/Total\s*₹[\d,]+/) || [''])[0]) === quote.total, 'Summary total differs from the quote with options');
    T.assert(/Standard protection/.test(T.text('.book-summary')) && /Driver/.test(T.text('.book-summary')) && /One-way/.test(T.text('.book-summary')), 'Summary is missing chosen options');
    T.noOverflow();
    // Step 3 as a guest: must sign in; choices survive the sign-in
    T.$('#book-form').requestSubmit(); await T.until(() => /Sign in to continue/.test(T.text()), 6000, 'sign-in prompt');
    const next = T.$$('main a').find(a => a.innerText.trim() === 'Sign in').getAttribute('href');
    location.hash = next; await T.until(() => T.$('main form [name=email]'), 6000, 'login form');
    const lf = T.$('main form'); lf.email.value = 'traveller@vanyatra.in'; lf.password.value = 'demo1234'; lf.requestSubmit();
    await T.until(() => location.hash.startsWith('#/book/'), 8000, 'return to checkout');
    await T.until(() => T.$('#book-form'), 6000, 'checkout after sign-in');
    T.assert(T.$$('.stepper li')[2].classList.contains('current'), 'Did not resume at the driver step');
    T.assert(T.rupees((T.text('.book-summary').match(/Total\s*₹[\d,]+/) || [''])[0]) === quote.total, 'Options were lost across sign-in');
    // With a driver, no licence is asked
    T.assert(!T.$('[name=licence]') && /Your driver/.test(T.text()), 'With-driver trip asked for a licence');
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('[name=payPlan]'), 6000, 'review & pay');
    // Step 4: 25% now, deposit by UPI, EMI offered
    set('[name=payPlan][value=part]'); await T.wait(150);
    set('[name=depositMethod][value=upi]'); await T.wait(150);
    const plan = App.paymentPlan(quote, s, { plan: 'part', deposit: 'upi' });
    T.assert(plan.type === 'part' && T.text('.book-summary').includes('Due now') && T.rupees((T.text('.book-summary').match(/Due now\s*₹[\d,]+/) || [''])[0]) === plan.chargeNow, 'Due-now amount wrong');
    T.assert(T.$('[name=payMethod][value=emi]'), 'EMI not offered for a large amount');
    T.assert(T.$$('[data-goto]').length >= 3, 'Review should link back to earlier steps');
    T.noOverflow();
    T.$('#book-form').agree.checked = true; T.$('#book-form').requestSubmit();
    await T.clickModal('successful'); await T.until(() => /confirmed/.test(location.hash), 8000, 'confirmation');
    const b = App.db.bookings.at(-1);
    T.assert(b.pricing.total === quote.total && b.payment.plan.type === 'part' && b.payment.plan.paid === plan.dueNow && b.depositMethod === 'upi' && b.driver.provided, 'Booking did not store the plan and options');
    await T.until(() => /charged automatically/.test(T.text()) && /paid by UPI/.test(T.text()), 4000, 'confirmation explaining the plan and deposit');
    T.assert(!localStorage.getItem('vanyatra.checkout.v1'), 'Saved checkout not cleared after booking');
    // The balance is charged automatically when due; the UPI deposit comes back after the trip
    if (b.status === 'confirmed') {
      b.payment.plan.balanceDueOn = App.addDays(App.today(), -1); App.save();
      App.runExpiryChecks();
      T.assert(b.payment.plan.balance === 0 && b.payment.plan.paid === quote.total && b.paymentStatus === 'paid', 'Balance was not charged');
      b.start = App.addDays(App.today(), -7); b.end = App.addDays(App.today(), -2); App.save();
      App.runExpiryChecks();
      T.assert(b.status === 'completed' && b.depositStatus === 'refunded', 'UPI deposit not refunded after the trip');
    }
    // Owner cancellation guarantee: full refund of what was paid plus a rebooking credit
    const [s2, e2] = T.futureRange(120, 4);
    const van2 = App.db.vans.find(v => v.status === 'published' && App.isAvailable(v.id, s2, e2) && v.minNights <= 4);
    const b2 = App.api.createBooking({ vanId: van2.id, start: s2, end: e2, adults: 2, children: 0, options: {}, driver: { name: 'Priya Sharma', age: 30, licence: 'XXXX2345', phone: '9876543210', check: { status: 'verified' } }, payment: { method: 'upi', label: 'UPI', plan: { type: 'part', depositMethod: 'upi' } }, specialRequests: '' });
    const creditBefore = App.me().credit || 0;
    App.api.cancelBooking(b2.id, 'owner', 'Van broke down');
    T.assert(b2.refund === b2.payment.plan.paid && b2.depositStatus !== 'paid' && (App.me().credit || 0) === creditBefore + App.C.rebookCredit && b2.rebook?.search.includes(s2), 'Owner cancellation guarantee not applied');
    // The credit is used on the next booking
    await T.go('#/book/' + van2.id + '?start=' + s2 + '&end=' + e2 + '&adults=2&children=0');
    for (const wait of ['.prot-table', '[name=phone]', '[name=payPlan]']) { T.$('#book-form').requestSubmit(); await T.until(() => T.$(wait), 6000, wait); }
    T.assert(T.$('[name=useCredit]')?.checked && /VanYatra credit used/.test(T.text('.book-summary')), 'Credit not offered at checkout');
    const creditNow = App.me().credit;
    T.$('#book-form').agree.checked = true; T.$('#book-form').requestSubmit();
    await T.clickModal('successful'); await T.until(() => /confirmed/.test(location.hash), 8000, 'confirmation with credit');
    T.assert(App.me().credit === creditNow - App.db.bookings.at(-1).payment.creditUsed && App.db.bookings.at(-1).payment.creditUsed > 0, 'Credit not deducted');
    return b.id + ' ' + App.fmt.money(quote.total) + ' · 25% ' + App.fmt.money(plan.dueNow);
  },

  // Search: quick-filter chips, pickup location, helpful empty results, saved search alerts
  async search() {
    await T.login('traveller@vanyatra.in', '/');
    await T.go('#/search');
    const count = () => +(T.text('#result-count').match(/^(\d+)/) || [0, 0])[1];
    const all = count();
    T.assert(T.$$('.fchip').length >= 12, 'Quick-filter chips missing');
    T.$('[data-chip="driver"]').click(); await T.wait(200);
    T.assert(location.hash.includes('driver=1') && count() === App.db.vans.filter(v => v.status === 'published' && App.driverFor(v)).length && count() < all, 'Driver chip did not filter');
    T.assert(/1 filter on/.test(T.text('.results-meta')), 'Active filter count not shown');
    T.$('[data-chip="driver"]').click(); await T.wait(200);
    T.assert(count() === all, 'Chip did not toggle off');
    // Pickup location: an airport someone delivers to
    const pt = App.db.vans.find(v => v.status === 'published' && v.delivery?.points?.length).delivery.points[0];
    const sel = T.$('#filter-form [name=pickup]'); sel.value = pt.id; sel.dispatchEvent(new Event('input', { bubbles: true })); await T.wait(200);
    T.assert(count() > 0 && T.$$('.van-card').every(c => App.get.van(c.dataset.van).delivery?.points?.some(p => p.id === pt.id) || c.closest('.dim')), 'Pickup location filter wrong');
    // Empty results suggest other dates or regions
    const b = App.db.bookings.find(x => x.status === 'confirmed' && x.start > App.addDays(App.today(), 5) && App.get.van(x.vanId)?.status === 'published');
    const v = App.get.van(b.vanId);
    await T.go('#/search?dest=' + v.destinationId + '&start=' + b.start + '&end=' + b.end + '&type=' + encodeURIComponent(v.type) + '&min=' + v.pricePerNight + '&max=' + v.pricePerNight);
    if (count() === 0) T.assert(/Free on nearby dates|another region/.test(T.text()), 'Empty results give no suggestions');
    // Save a search where the van is booked, then free it up: an alert arrives
    await T.go('#/search?dest=' + v.destinationId + '&start=' + b.start + '&end=' + b.end);
    T.$('#save-search').click(); await T.wait(200);
    const ss = App.db.savedSearches.find(s => s.params.includes(b.start));
    T.assert(ss && !ss.known.includes(v.id), 'Search not saved');
    b.status = 'cancelled'; App.save();
    const before = App.db.notifications.length;
    App.checkSavedSearches();
    T.assert(App.db.notifications.length === before + 1 && App.db.notifications[0].text.includes(v.name), 'No alert when a matching van freed up');
    await T.go('#/account/saved'); T.assert(T.text().includes(ss.label), 'Saved search not listed in the account');
    T.noOverflow();
    return all + ' vans, alerts work';
  },

  // Van page facts, host response time, quick questions and opt-in WhatsApp reminders
  async vanpage() {
    const van = App.db.vans.find(v => v.status === 'published' && App.driverFor(v) && v.delivery?.points?.length);
    await T.go('#/vans/' + van.id);
    const text = T.text();
    T.assert(/Good to know/.test(text) && text.includes(van.height) && /Best for:/.test(text), 'Good to know block missing');
    T.assert(/Trip options/.test(text) && /With a driver/.test(text) && /Delivery/.test(text) && /Protection/.test(text), 'Trip options missing');
    const resp = T.text('.owner-strip').match(/responds [^·]+/)?.[0];
    T.assert(/Usually responds .* response rate/.test(T.text('.owner-strip')), 'Host response time missing');
    T.assert(/Height/.test(T.text('.spec-table')), 'Height missing from specs');
    T.noOverflow();
    // Quick questions in chat
    await T.login('traveller@vanyatra.in', '/');
    await T.go('#/vans/' + van.id); T.$('#msg-owner').click();
    await T.until(() => T.$('[data-quick]'), 6000, 'quick questions');
    T.$('[data-quick]').click(); T.assert(T.$('#chat-input').value.length > 5, 'Quick question did not fill the message');
    // WhatsApp: opt in, then a confirmed trip starting tomorrow gets a pickup reminder with a map pin
    await T.go('#/account/profile'); const wa = T.$('[data-pref="whatsapp"]'); wa.checked = true; wa.dispatchEvent(new Event('change', { bubbles: true }));
    T.assert(App.me().prefs.whatsapp, 'WhatsApp preference not saved');
    const b = App.db.bookings.find(x => x.customerId === App.me().id && x.status === 'confirmed');
    b.start = App.addDays(App.today(), 1); b.end = App.addDays(App.today(), 5); b.sent = {}; App.save();
    App.runExpiryChecks();
    const wamsg = App.db.outbox.find(m => m.channel === 'whatsapp' && m.template === 'pickup_reminder');
    T.assert(wamsg && /maps\.google\.com\/\?q=/.test(wamsg.body), 'No WhatsApp pickup reminder with a map pin');
    return resp;
  },

  // Digital check-in/out: pre-check-in, photo inspections signed by both sides, deposit claim with evidence
  async inspection() {
    const photo = async (label) => {
      const c = document.createElement('canvas'); c.width = 320; c.height = 240;
      const g = c.getContext('2d'); g.fillStyle = '#1f6f54'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '24px sans-serif'; g.fillText(label, 20, 120);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7));
      return new File([blob], label + '.jpg', { type: 'image/jpeg' });
    };
    const upload = async (input, label) => { const dt = new DataTransfer(); dt.items.add(await photo(label)); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(250); };
    const fillInspection = async (odo) => {
      for (const k of ['front', 'back', 'left', 'right', 'fl', 'fr', 'rl', 'rr', 'fuel', 'odometer']) await upload(T.$(`[data-shot="${k}"]`), k);
      const fuel = T.$('#fuel'); fuel.value = '3/4'; fuel.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(100);
      const o = T.$('#odo'); o.value = String(odo); o.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(100);
    };
    const sign = async () => { T.$('#agree').checked = true; T.$('#sign').click(); await T.wait(200); };
    await T.login('traveller@vanyatra.in', '/');
    // A confirmed trip starting tomorrow, deposit paid by UPI
    const id = App.db.bookings.find(x => x.customerId === App.me().id && x.status === 'confirmed').id;
    let b = App.get.booking(id);
    const fresh = () => { b = App.get.booking(id); return b; };
    b.start = App.addDays(App.today(), 1); b.end = App.addDays(App.today(), 5); b.depositStatus = 'paid'; b.depositMethod = 'upi'; delete b.inspections; delete b.checkin; App.save();
    fresh(); await T.go('#/account/bookings');
    T.assert(T.$(`a[href="#/trip/${b.id}/checkin"]`) && T.$(`a[href="#/trip/${b.id}/inspection/pickup"]`), 'Trip card lacks pre-check-in or inspection');
    // Pre-check-in
    fresh(); await T.go(`#/trip/${b.id}/checkin`);
    const f = T.$('#ci-form'); f.ecName.value = 'Rahul Sharma'; f.ecPhone.value = '9811122233'; f.rules.checked = true; f.inspection.checked = true; f.requestSubmit();
    await T.until(() => b.checkin, 4000, 'pre-check-in saved');
    T.noOverflow();
    // Pickup inspection by the traveller, with a damage mark
    fresh(); await T.go(`#/trip/${b.id}/inspection/pickup`);
    T.assert(T.$('#sign').disabled, 'Could sign before all photos were added');
    await fillInspection(12000);
    const df = T.$('#dmg-form'); df.note.value = 'Scratch on rear bumper'; df.requestSubmit(); await T.wait(300);
    T.assert(!T.$('#sign').disabled, 'Sign button still disabled with everything filled in');
    await sign(); fresh();
    T.assert(b.inspections.pickup.signed.customer && Object.keys(b.inspections.pickup.photos).length === 10 && b.inspections.pickup.damages.length === 1, 'Pickup inspection not recorded');
    T.noOverflow();
    // The owner reviews and signs; the record then locks
    const ownerEmail = { u_owner1: 'owner@vanyatra.in', u_owner2: 'meera@vanyatra.in', u_owner3: 'tenzin@vanyatra.in' }[b.ownerId];
    fresh(); await T.login(ownerEmail, '/owner/bookings'); fresh();
    fresh(); await T.go(`#/trip/${b.id}/inspection/pickup`);
    await sign(); fresh();
    T.assert(b.inspections.pickup.signed.owner && !T.$('[data-shot]'), 'Pickup record did not lock after both signed: ' + JSON.stringify({ signed: b.inspections.pickup.signed, me: App.me()?.id, owner: b.ownerId, sign: !!T.$('#sign'), agree: !!T.$('#agree'), toast: T.$$('.toast').map(t => t.innerText).join('|'), h1: T.text('main h1') }));
    // Return: more km than included → extra km shown; owner signs and claims from the deposit
    b.start = App.addDays(App.today(), -5); b.end = App.addDays(App.today(), -1); App.save();
    fresh(); await T.go(`#/trip/${b.id}/inspection/return`);
    const driven = (b.pricing.kmIncluded || 1000) + 150;
    await fillInspection(12000 + driven);
    T.assert(/extra/.test(T.text('.callout')) && T.$$('.compare-grid figure').length === 8, 'Return comparison missing');
    await sign(); fresh();
    fresh(); await T.login('traveller@vanyatra.in', '/'); fresh();
    fresh(); await T.go(`#/trip/${b.id}/inspection/return`); await sign(); fresh();
    T.assert(b.inspections.return.signed.customer && b.inspections.return.signed.owner, 'Return not signed by both');
    fresh(); await T.login(ownerEmail, '/owner/bookings'); fresh();
    fresh(); await T.go(`#/trip/${b.id}/inspection/return`);
    T.$('#claim').click(); await T.until(() => T.$('#c-note'), 3000, 'claim form');
    T.$('#c-amt').value = '3000'; T.$('#c-note').value = 'New dent on the passenger door, see return photos';
    await T.clickModal('Submit claim'); await T.wait(300);
    const d = App.db.disputes.find(x => x.bookingId === b.id && x.status === 'open');
    T.assert(d && d.evidence.includes('pickup') && d.evidence.includes('return'), 'Claim did not attach the inspections');
    // Deposit is held while the claim is open, even after the 48-hour window
    b.end = App.addDays(App.today(), -3); App.save(); App.runExpiryChecks();
    T.assert(b.depositStatus === 'paid', 'Deposit refunded while a claim was open');
    fresh(); await T.login('admin@vanyatra.in', '/admin/disputes'); fresh();
    T.assert(T.$(`a[href="#/trip/${b.id}/inspection/return"]`), 'Admin does not see the evidence');
    return b.id + ' · claim ' + App.fmt.money(d.amount);
  },

  // Mountain Promise: a recorded closure lets the traveller move dates free or take credit
  async promise() {
    await T.login('traveller@vanyatra.in', '/');
    const b0 = App.db.bookings.find(x => x.customerId === App.me().id && ['confirmed', 'requested'].includes(x.status) && App.MOUNTAIN_REGIONS.includes(App.get.van(x.vanId)?.destinationId));
    T.assert(b0, 'No upcoming mountain trip in the demo data');
    const id = b0.id, dest = App.get.van(b0.vanId).destinationId, nights = App.nightsBetween(b0.start, b0.end);
    await T.go('#/vans/' + b0.vanId); T.assert(/Mountain Promise included/.test(T.text()), 'Van page lacks the promise');
    // Admin records an official closure over the trip
    await T.login('admin@vanyatra.in', '/admin/destinations');
    const f = T.$('#closure-form'); f.destinationId.value = dest; f.title.value = 'Main highway closed after landslide'; f.source.value = 'https://example.gov.in/notice';
    f.start.value = App.get.booking(id).start; f.end.value = App.get.booking(id).start; f.requestSubmit(); await T.wait(300);
    T.assert(App.get.booking(id).promise?.closureId, 'Closure did not reach the affected trip');
    // Traveller moves dates for free
    await T.login('traveller@vanyatra.in', '/account/bookings');
    await T.go('#/account/bookings');
    T.assert(T.$(`[data-promise-move="${id}"]`), 'Trip card lacks the promise options');
    let s = App.addDays(App.today(), 150);
    while (!App.isAvailable(App.get.booking(id).vanId, s, App.addDays(s, nights))) s = App.addDays(s, 3);
    App.api.usePromise(id, { type: 'move', start: s, end: App.addDays(s, nights) });
    const b = App.get.booking(id);
    T.assert(b.start === s && b.promise.used?.type === 'move', 'Dates not moved');
    let err = ''; try { App.api.usePromise(id, { type: 'credit' }); } catch (e) { err = e.message; }
    T.assert(err, 'Promise could be used twice');
    await T.go('#/help/mountain-promise'); T.assert(/Change your dates for free/.test(T.text()), 'Policy page missing');
    T.noOverflow();
    return id + ' moved to ' + App.fmt.dateRange(b.start, b.end);
  },

  // Trip planning: destination guides, spots, planner, first-timer's guide
  async plan() {
    await T.go('#/destinations/ladakh');
    const t = T.text();
    T.assert(/Before you go/.test(t) && /Inner Line Permit/.test(t) && T.$('a[href="https://www.lahdclehpermit.in/"]'), 'Permits with the official link missing');
    T.assert(T.$$('.day-plan').length >= 2 && /Sarchu → Leh/.test(T.$('.day-plan').textContent), 'Day-by-day plans missing');
    T.assert(T.$$('.route a.btn').every(a => a.getAttribute('href').includes('dest=ladakh')), 'Vans-for-route links wrong');
    T.assert(/Dhabas with parking|Water & waste/i.test(t), 'Spots missing from the destination');
    T.noOverflow();
    await T.go('#/map'); T.assert(T.$$('[data-layer]').length === 6, 'Map lacks spot layers');
    // Campsites: only confirmed ones, each with its source, website and check date
    T.assert(App.CAMPSITES.length >= 5 && App.CAMPSITES.every(c => c.website && /^(node|way)\/\d+$/.test(c.osm) && c.checked && c.lat > 6 && c.lat < 37 && c.lng > 68 && c.lng < 98), 'Campsite data incomplete');
    T.assert(new RegExp('Confirmed campsites \\(' + App.CAMPSITES.length + '\\)').test(T.text()), 'Campsite layer missing');
    T.assert(App.CAMPSITES.every(c => T.text('#loc-list').includes(c.name)), 'Campsite list incomplete');
    await T.until(() => /OpenStreetMap/.test(T.$('.leaflet-control-attribution')?.innerText || ''), 8000, 'OpenStreetMap credit');
    await T.go('#/destinations/himachal'); T.assert(/Confirmed campsites nearby/.test(T.text()) && App.campsitesNear(App.get.dest('himachal')).length && /km ·/i.test(T.text('.camp-list')), 'Nearby campsites missing on Manali');
    // Planner: Ladakh in July for a family of 4 with kids
    const y = new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0);
    const s = `${y}-07-10`, e = `${y}-07-15`;
    await T.go(`#/plan?dest=ladakh&start=${s}&end=${e}&guests=4&kids=1`);
    const pt = T.text();
    T.assert(T.$$('.route').length >= 1 && /Packing checklist/.test(pt) && /Sleeping bags rated below 0/.test(pt) && /Printed Inner Line Permits/.test(pt) && /For the kids/.test(pt), 'Planner content incomplete');
    const first = App.get.van(T.$('.van-card')?.dataset.van);
    T.assert(!first || first.amenities.includes('heater') || first.type === '4x4 Overlander' || !App.db.vans.some(v => v.destinationId === 'ladakh' && v.amenities.includes('heater')), 'Heater vans not ranked first for high passes');
    T.assert(/wa\.me\/\?text=/.test(T.$('#share-plan').href), 'WhatsApp share link missing');
    await T.login('traveller@vanyatra.in', '/');
    await T.go(`#/plan?dest=ladakh&start=${s}&end=${e}&guests=4&kids=1`);
    T.$('[data-pack]').click(); T.$('#save-plan').click(); await T.wait(200);
    await T.go('#/account/saved'); T.assert(/Trip plans/.test(T.text()) && /Ladakh/.test(T.text()), 'Saved plan not in the account');
    await T.go('#/guide'); T.assert(T.$$('.guide section').length >= 6 && /Is van life legal in India/.test(T.text()), 'Guide incomplete');
    T.noOverflow();
    return 'plans, spots, guide ok';
  },

  // Analytics: nothing is recorded until the visitor allows it; then the funnel counts each step
  async analytics() {
    T.assert(T.$('#consent-bar'), 'Analytics notice not shown to a new visitor');
    await T.go('#/search'); await T.go('#/vans/v1');
    T.assert(!(App.db.events || []).length, 'Events recorded before consent');
    T.$('[data-consent="granted"]').click(); await T.wait(100);
    T.assert(!T.$('#consent-bar'), 'Notice did not go away');
    await T.login('traveller@vanyatra.in', '/');
    const [s, e] = T.futureRange(95, 4);
    const van = App.db.vans.find(v => v.status === 'published' && v.instantBook && App.isAvailable(v.id, s, e) && v.minNights <= 4);
    await T.go('#/search?dest=' + van.destinationId);
    T.$('[data-chip="instant"]').click(); await T.wait(150);
    await T.go('#/vans/' + van.id);
    T.$('#bc-dates .drf-btn').click(); await T.until(() => T.$('.drp'), 3000, 'picker');
    const pickDay = async (d) => { for (let i = 0; i < 6 && !T.$(`.drp [data-d="${d}"]`); i++) { T.$('.drp [data-nav="1"]').click(); await T.wait(60); } T.$(`.drp [data-d="${d}"]`).click(); await T.wait(120); };
    await pickDay(s); await pickDay(e);
    T.$('#book-btn').click(); await T.until(() => T.$('#book-form'), 6000, 'checkout');
    for (const w of ['.prot-table', '[name=phone]', '[name=payPlan]']) { T.$('#book-form').requestSubmit(); await T.until(() => T.$(w), 6000, w); }
    T.$('#book-form').agree.checked = true; T.$('#book-form').requestSubmit();
    await T.clickModal('successful'); await T.until(() => /confirmed/.test(location.hash), 8000, 'confirmation');
    const names = new Set(App.db.events.map(x => x.name));
    for (const n of ['page_view', 'search', 'filter_use', 'van_view', 'date_select', 'begin_checkout', 'checkout_step', 'payment_attempt', 'payment_result', 'booking']) T.assert(names.has(n), 'Event not recorded: ' + n);
    const f = App.analytics.funnel();
    T.assert(f.every(st => st.sessions >= 1), 'Funnel has an empty step: ' + JSON.stringify(f));
    await T.login('admin@vanyatra.in', '/admin/analytics');
    T.assert(T.$$('.funnel li').length === 6, 'Admin funnel missing');
    // Turning it off deletes what was collected
    await T.go('#/account/profile'); const c = T.$('#analytics-ok'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true }));
    T.assert(!App.db.events.length && App.analytics.consent() === 'denied', 'Opting out did not delete events');
    T.noOverflow();
    return f.map(st => st.sessions).join('→');
  },

  // Deals and referrals: deal badges and prices, seasonal pages, invite credit for both sides
  async deals() {
    await T.go('#/deals');
    T.assert(T.$$('.campaign').length === 4, 'Seasonal campaigns missing');
    const cards = T.$$('.van-card');
    T.assert(cards.length >= 3, 'Deals page has no offers');
    // The deal is already in the card's total
    const lastCard = T.$$('section.block')[0].querySelector('.van-card');
    if (lastCard) {
      const v = App.get.van(lastCard.dataset.van), [s, e] = lastCard.querySelector('a').getAttribute('href').match(/start=([\d-]+)&end=([\d-]+)/).slice(1);
      const q = App.quote(v, s, e);
      T.assert(q.discountKind === 'lastMinute' && T.rupees((lastCard.innerText.match(/₹[\d,]+(?=\s*total)/i) || [''])[0]) === q.total && /last-minute/i.test(lastCard.innerText), 'Last-minute deal not applied on the card');
    }
    await T.go('#/deals/winter-rajasthan'); T.assert(/Winter in Rajasthan/.test(T.text('main h1')), 'Campaign page missing');
    T.noOverflow();
    // Referral: Priya invites a new traveller; both get credit
    await T.login('traveller@vanyatra.in', '/account/payments');
    await T.go('#/account/payments');
    const code = T.$('.ref-code').innerText.trim();
    T.assert(code.length >= 6 && /wa\.me/.test(T.$('.refer-card a[href*="wa.me"]').href), 'Invite link missing');
    const inviterId = App.me().id, before = App.me().credit || 0;
    await App.api.logout();
    await T.go('#/signup?ref=' + code);
    T.assert(/invited you/.test(T.text()), 'Invite not shown on sign-up');
    const f = T.$('#signup-form'); f.name.value = 'Kavya Menon'; f.email.value = 'kavya' + Date.now() + '@example.com'; f.phone.value = '9876500011'; f.password.value = 'journey123'; f.terms.checked = true; f.requestSubmit();
    await T.until(() => App.me()?.name === 'Kavya Menon', 8000, 'sign-up');
    T.assert(App.me().credit === App.C.referralCredit && App.me().referredBy === inviterId, 'Invitee credit not granted');
    // Her first confirmed booking rewards the inviter
    const [s2, e2] = T.futureRange(140, 3);
    const van = App.db.vans.find(v => v.status === 'published' && v.instantBook && App.isAvailable(v.id, s2, e2) && v.minNights <= 3);
    App.db.traveller = { identity: { status: 'verified', method: 'aadhaar', data: { name: 'Kavya Menon', dob: '1994-01-01' } }, licence: { status: 'verified', kind: 'indian', validUpto: '2035-01-01', data: { dlMasked: 'XXXX1234' } } };
    const b = App.api.createBooking({ vanId: van.id, start: s2, end: e2, adults: 2, children: 0, options: {}, driver: { name: 'Kavya Menon', age: 32, licence: 'XXXX1234', phone: '9876500011', check: { status: 'verified' } }, payment: { method: 'upi', label: 'UPI', plan: { type: 'full' } }, specialRequests: '' });
    if (b.status === 'requested') App.api.respondToRequest(b.id, true);
    T.assert((App.get.user(inviterId).credit || 0) === before + App.C.referralCredit, 'Inviter not credited');
    return 'code ' + code;
  },

  // After the trip: review request, review with photos, trip memories, book again
  async posttrip() {
    const jpeg = async (label) => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d'); g.fillStyle = '#f28c38'; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '24px sans-serif'; g.fillText(label, 20, 120); return new File([await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7))], label + '.jpg', { type: 'image/jpeg' }); };
    await T.login('traveller@vanyatra.in', '/');
    const id = App.db.bookings.find(x => x.customerId === App.me().id && x.status === 'confirmed').id;
    const b0 = App.get.booking(id); b0.start = App.addDays(App.today(), -6); b0.end = App.addDays(App.today(), -1); App.save();
    App.runExpiryChecks();
    const b = App.get.booking(id);
    T.assert(b.status === 'completed' && App.db.notifications.some(n => n.link === '#/account/bookings?review=' + id), 'No review request after the trip');
    await T.go('#/account/bookings?review=' + id);
    await T.until(() => T.$('#rv-text'), 4000, 'review form from the request');
    T.$('#rv-text').value = 'Wonderful week in the hills — the heater kept the kids warm and the owner was lovely.';
    const dt = new DataTransfer(); dt.items.add(await jpeg('view')); T.$('#rv-photos').files = dt.files;
    await T.clickModal('Post review'); await T.wait(600);
    const rv = App.db.reviews.find(r => r.bookingId === id);
    T.assert(rv && rv.photos.length === 1 && rv.categories.cleanliness, 'Review with sub-scores and photo not saved');
    await T.go('#/vans/' + b.vanId); T.assert(T.$('.review-photos-row img'), 'Review photo not shown on the van page');
    await T.go('#/account/bookings');
    T.assert(T.$(`a[href="#/trip/${id}/memories"]`) && T.$(`a[href="#/vans/${b.vanId}"]`), 'Memories or Book again missing');
    await T.go(`#/trip/${id}/memories`);
    T.assert(/Trip memories/i.test(T.text()) && T.$$('.mem-grid img').length === 1 && /wa\.me/.test(T.$('a[href*="wa.me"]').href), 'Memories page incomplete');
    const dt2 = new DataTransfer(); dt2.items.add(await jpeg('sunset')); const add = T.$('#mem-add'); add.files = dt2.files; add.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(500);
    T.assert(T.$$('.mem-grid img').length === 2, 'Adding a memory photo failed');
    T.noOverflow();
    return id;
  },

  // Support: help search across everything, live chat, trip-time roadside bar and SOS
  async support() {
    await T.go('#/help');
    const q = T.$('#help-q'); q.value = 'deposit refund'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.wait(100);
    T.assert(T.$$('.help-results li').length >= 2 && /Policy|FAQ/.test(T.text('#help-results')), 'Help search found nothing for "deposit refund"');
    q.value = 'inner line permit'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.wait(100);
    T.assert(/Ladakh/.test(T.text('#help-results')), 'Help search misses destination guides');
    await T.login('traveller@vanyatra.in', '/help');
    await T.go('#/help');
    T.$('#open-chat').click(); await T.until(() => T.$('#sc-input'), 3000, 'chat');
    T.$('#sc-input').value = 'How do I get my deposit back?'; T.$('#sc-form').requestSubmit(); await T.wait(200);
    T.assert(T.$$('.support-chat .msg').length === 2 && /specialist/.test(T.text('.support-chat')), 'Chat did not reply');
    T.$('.modal [data-close]').click(); await T.wait(100);
    // A trip in progress: roadside bar and SOS
    const b = App.db.bookings.find(x => x.customerId === App.me().id && x.status === 'confirmed');
    b.start = App.addDays(App.today(), -1); b.end = App.addDays(App.today(), 3); b.checkin = { ecName: 'Rahul', ecPhone: '9811122233' }; App.save();
    await T.go('#/');
    T.assert(T.$('#trip-bar') && /Roadside/.test(T.text('#trip-bar')), 'Trip bar missing during a trip');
    navigator.geolocation.getCurrentPosition = (ok) => ok({ coords: { latitude: 32.2432, longitude: 77.1892, accuracy: 25 } });
    const before = App.db.notifications.length;
    T.$('#sos-btn').click(); await T.until(() => T.$('#sos-loc'), 3000, 'SOS');
    T.assert(T.$(`.sos a[href="tel:${App.C.emergencyNumber}"]`), 'SOS lacks the emergency number');
    T.$('#sos-loc').click(); await T.wait(200);
    T.assert(/Location sent/.test(T.text('#sos-out')) && T.$('#sos-out a[href^="sms:"]') && App.db.notifications.length > before && App.db.notifications.some(n => n.userId === b.ownerId && /maps\.google\.com\/\?q=32\.2432,77\.1892/.test(n.text)), 'SOS location not shared');
    T.$('.modal [data-close]').click(); await T.wait(100);
    T.noOverflow();
    return 'help, chat, SOS ok';
  },

  // Offline (part 1): the service worker caches the app; then the runner cuts the network (part 2 below)
  async offline() {
    T.assert('serviceWorker' in navigator, 'No service worker support');
    await Promise.race([navigator.serviceWorker.ready, T.wait(8000)]);
    await T.until(() => navigator.serviceWorker.controller || true, 1000);
    const keys = await caches.keys();
    const shell = keys.find(k => k.startsWith('vanyatra-shell-'));
    T.assert(shell, 'App shell not cached: ' + keys.join(','));
    const c = await caches.open(shell);
    // The shell and every file it links to (the built bundles, including the on-demand owner/admin one)
    const shellHtml = await (await fetch('index.html')).text();
    const files = ['./index.html', ...[...shellHtml.matchAll(/(?:src|href)="(assets\/build\/[^"]+)"/g)].map(m => './' + m[1])];
    T.assert(files.length >= 5, 'Built files not found in index.html');
    for (const p of files) T.assert(await c.match(p), 'Not cached: ' + p);
    await T.login('traveller@vanyatra.in', '/account/bookings');
    await T.go('#/account/bookings');
    window.__tripIds = T.$$('.trip-card .eyebrow').map(x => x.innerText);
    localStorage.setItem('journey.tripIds', JSON.stringify(window.__tripIds));
    T.assert(window.__tripIds.length, 'No trips to check offline');
    return 'cached ' + (await c.keys()).length + ' files';
  },

  // An unverified traveller can't pay until identity is verified
  async gate() {
    await T.login('sam@example.com', '/');
    const [s, e] = T.futureRange(60, 4);
    const van = App.db.vans.find(v => v.status === 'published' && App.isAvailable(v.id, s, e) && v.minNights <= 4);
    await T.go('#/book/' + van.id + '?start=' + s + '&end=' + e + '&adults=2&children=0');
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('.prot-table'), 6000, 'step 2');
    T.$('#book-form').requestSubmit(); await T.wait(500);
    T.assert(!T.$('[name=phone]') && T.$$('main a').some(a => a.innerText.includes('Verify now')), 'Unverified traveller was not asked to verify');
    T.noOverflow();
    await T.go('#/account/verification'); T.assert(T.$('.verify-card'), 'Verification page missing'); T.noOverflow();
    return 'blocked before payment';
  },

  // Owner: dashboard sections, accept a request, block dates, listing step saves
  async owner() {
    await T.login('meera@vanyatra.in', '/owner');
    const tabs = T.$$('.dash-nav a').map(a => a.getAttribute('href'));
    T.assert(tabs.length >= 9, 'Owner nav has ' + tabs.length + ' sections');
    for (const t of tabs) { await T.go(t); T.assert(T.$('main h1'), 'No heading on ' + t); T.noOverflow(); }
    await T.go('#/owner/bookings');
    const acc = T.$('[data-accept]');
    if (acc) { const id = acc.dataset.accept; acc.click(); await T.clickModal('Accept'); await T.wait(500); T.assert(App.get.booking(id).status === 'confirmed', 'Accept did not confirm'); }
    await T.go('#/owner/vans');
    T.assert(/Listing health \d+\/100/i.test(T.text()), 'Listing health score missing');
    await T.go('#/owner/calendar');
    T.assert(T.$$('.tips li').length >= 2, 'Pricing tips missing');
    // Calendar sync: export has the van's bookings and blocks; import adds another site's bookings
    const calVan = App.get.van(T.$('#cal-van').value);
    const ics = App.icsFor(calVan);
    T.assert(/BEGIN:VCALENDAR/.test(ics) && (ics.match(/BEGIN:VEVENT/g) || []).length >= (calVan.blocked || []).length, 'Calendar export incomplete');
    const [i1, i2] = T.futureRange(230, 3);
    const other = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:' + i1.replace(/-/g, ''), 'DTEND;VALUE=DATE:' + i2.replace(/-/g, ''), 'SUMMARY:Airbnb booking', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const dt = new DataTransfer(); dt.items.add(new File([other], 'airbnb.ics', { type: 'text/calendar' }));
    const imp = T.$('#ics-import'); imp.files = dt.files; imp.dispatchEvent(new Event('change', { bubbles: true })); await T.wait(600);
    T.assert(App.get.van(calVan.id).blocked.some(b => b.start === i1 && b.end === App.addDays(i2, -1) && /Imported/.test(b.note)), 'Calendar import did not block the dates');
    const f = T.$('input[name=start]').form; const [s, e] = T.futureRange(200, 2);
    f.start.value = s; f.end.value = e; f.note.value = 'Journey test'; f.requestSubmit(); await T.wait(900);
    const vanId = T.$('#cal-van').value;
    T.assert(App.get.van(vanId).blocked.some(b => b.start === s), 'Blocked dates not saved');
    T.assert(!App.isAvailable(vanId, s, e), 'Blocked dates still bookable');
    // Photo guide: slots for each shot, 5 photos with an outside shot needed
    await T.go('#/owner/onboarding?van=' + vanId + '&step=8');
    await T.until(() => T.$('.shot-grid'), 6000, 'photo guide');
    T.assert(T.$$('.shot').length === 6, 'Photo guide should list 6 shots');
    T.$$('[data-del-shot]').forEach(b => b.click()); await T.wait(150);
    while (T.$('[data-del]')) { T.$('[data-del]').click(); await T.wait(60); }
    T.$('#ph-save').click(); await T.wait(300);
    T.assert(/outside of the van/i.test(T.$$('.toast').map(t => t.innerText).join(' ')), 'Saving with no photos was not refused');
    T.$('#sample').click(); await T.wait(200);
    T.$('#f').video.value = 'https://example.com/tour'; T.$('#ph-save').click(); await T.wait(600);
    T.assert(/YouTube or Vimeo/.test(T.$$('.toast').map(t => t.innerText).join(' ')), 'Bad video link accepted');
    T.$('#f').video.value = 'https://youtu.be/AbCdEfGhIjK';
    T.assert(T.$('.photo-progress.ok'), 'Progress not complete with 5 photos incl. outside');
    T.$('#ph-save').click();
    await T.until(() => /step=9/.test(location.hash), 6000, 'photos step save');
    T.assert(App.get.van(vanId).photoLabels[0] === 'exterior' && App.get.van(vanId).photos.length === 5, 'Photo tags not saved');
    T.assert(App.get.van(vanId).video === 'https://www.youtube-nocookie.com/embed/AbCdEfGhIjK', 'Video link not stored as a privacy-friendly embed');
    await T.go('#/owner/onboarding?van=' + vanId + '&step=9');
    await T.until(() => T.$('#ls-save'), 6000, 'listing step');
    // Owner options: price an extra, add a season, a delivery point and a verified driver
    const opt = (sel) => T.$('#van-options ' + sel);
    T.assert(opt('[data-addon="gas"]'), 'Extras editor missing');
    if (!opt('[data-addon="gas"]').checked) { opt('[data-addon="gas"]').click(); }
    opt('[data-addon-price="gas"]').disabled = false; opt('[data-addon-price="gas"]').value = '750';
    opt('#add-se').click(); await T.wait(100);
    const se = T.$$('#van-options [data-se]'); se.find(i => i.dataset.k === 'name').value = 'Christmas & New Year'; se.find(i => i.dataset.k === 'pct').value = '25';
    opt('#add-pt').click(); await T.wait(100);
    const pts = T.$$('#van-options [data-pt]'); pts.filter(i => i.dataset.k === 'name').at(-1).value = 'Journey test hotel'; pts.filter(i => i.dataset.k === 'km').at(-1).value = '12';
    opt('#eb-pct').value = '10'; opt('#eb-days').value = '60';
    opt('#drv-on').checked = true;
    opt('#drv-name').value = 'Rakesh Kumar'; opt('#drv-dl').value = 'KL0720150054321'; opt('#drv-dob').value = '1985-05-05'; opt('#drv-consent').checked = true;
    opt('#drv-verify').click();
    await T.until(() => App.get.van(vanId).driver?.check?.status === 'verified', 8000, 'driver licence check');
    // The editor redraws after the check; set the driver on again in case it was re-read
    if (!opt('#drv-on').checked) opt('#drv-on').checked = true;
    T.$('#ls-save').click();
    await T.until(() => /step=10/.test(location.hash), 6000, 'listing step save');
    const sv = App.get.van(vanId);
    T.assert(sv.addOns.find(a => a.id === 'gas')?.price === 750, 'Extra price not saved');
    T.assert(sv.seasons.some(x => x.name === 'Christmas & New Year' && x.pct === 25 && x.from === '12-20'), 'Season not saved');
    T.assert(sv.delivery.points.some(p => p.name === 'Journey test hotel' && p.km === 12), 'Delivery point not saved');
    T.assert(sv.earlyBird?.pct === 10 && App.driverFor(sv), 'Early-bird or verified driver not saved');
    const xmas = App.quote(sv, '2026-12-24', '2026-12-27');
    T.assert(xmas.season?.amount > 0 && xmas.total > App.quote({ ...sv, seasons: [] }, '2026-12-24', '2026-12-27').total, 'Season not applied to prices');
    return tabs.length + ' sections';
  },

  // Admin: every section loads; a visitor's ID can be approved
  async admin() {
    await T.login('admin@vanyatra.in', '/admin');
    const tabs = T.$$('.dash-nav a').map(a => a.getAttribute('href'));
    for (const t of tabs) { await T.go(t); T.assert(T.$('main h1'), 'No heading on ' + t); T.noOverflow(); }
    await T.go('#/admin/verifications?filter=travellers');
    const btn = T.$('[data-tdec="verified"][data-uid="u_cust6"][data-part="identity"]');
    T.assert(btn, 'Visitor ID not in the review queue'); btn.click(); await T.wait(900);
    T.assert(App.db.travellers.u_cust6.identity.status === 'verified', 'Approval not saved');
    return tabs.length + ' sections';
  },
  // Spacing: buttons in a row line up and don't touch; blocks after cards, grids, forms and
  // lists aren't glued to them (the kind of crowding a reviewer spotted on the home page)
  spacing: async function () {
    const vis = (e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const audit = () => {
      const out = [];
      document.querySelectorAll('main *').forEach(p => {
        const kids = [...p.children].filter(k => vis(k) && getComputedStyle(k).display !== 'inline' && !['absolute', 'fixed'].includes(getComputedStyle(k).position));
        for (let i = 1; i < kids.length; i++) {
          const a = kids[i - 1], b = kids[i], ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          if (rb.top < ra.bottom - 2 || Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left) < 20) continue;
          if (rb.top - ra.bottom < 4 && a.matches('.card, .grid-2, .grid-3, .steps-3, form, ul, dl, .opt-cards, .btn, .drf') && !b.matches('label, .field')) out.push(`${Math.round(rb.top - ra.bottom)}px gap: ${name(a)} → ${name(b)}`);
        }
        const bs = [...p.children].filter(k => vis(k) && k.matches('.btn'));
        for (let i = 1; i < bs.length; i++) {
          const a = bs[i - 1].getBoundingClientRect(), b = bs[i].getBoundingClientRect(), d = Math.abs((a.top + a.bottom) - (b.top + b.bottom)) / 2;
          if (d > 1.5 && d < Math.max(a.height, b.height) / 2) out.push(`buttons out of line by ${Math.round(d)}px in ${name(p)}`);
          if (d < 2 && b.left > a.left && b.left - a.right < 6) out.push(`buttons touching in ${name(p)}`);
        }
      });
      return out;
    };
    const problems = [];
    const check = async (route) => { await T.go(route); document.querySelectorAll('.section').forEach(s => { s.style.contentVisibility = 'visible'; }); await T.wait(150); for (const x of audit()) problems.push(route + ': ' + x); };
    for (const r of ['#/login', '#/signup']) await check(r);
    await T.login('traveller@vanyatra.in', '/');
    const routes = ['#/', '#/destinations', '#/destinations/goa', '#/search', '#/vans/v1', '#/book/v1', '#/deals', '#/deals/diwali', '#/plan', '#/guide', '#/help', '#/help/support', '#/list-your-van',
      '#/account/bookings', '#/account/profile', '#/account/payments', '#/account/verification', '#/account/saved'];
    for (const r of routes) await check(r);
    const owner = ['overview', 'vans', 'bookings', 'calendar', 'earnings', 'messages', 'reviews', 'documents', 'analytics'].map(t => '#/owner/' + t);
    await T.login('meera@vanyatra.in', '/owner');
    for (const r of owner) await check(r);
    const admin = ['overview', 'users', 'listings', 'verifications', 'bookings', 'disputes', 'reviews', 'destinations', 'analytics', 'notifications', 'audit'].map(t => '#/admin/' + t);
    await T.login('admin@vanyatra.in', '/admin');
    for (const r of admin) await check(r);
    T.assert(!problems.length, [...new Set(problems)].join(' | '));
    return (routes.length + owner.length + admin.length + 2) + ' pages';
  },
  // Hindi (draft): switch, chrome and home page translated, still fits at 360px, choice remembered
  lang: async function () {
    T.$('.footer-lang').click();
    await T.until(() => document.documentElement.lang === 'hi' && /पहियों/.test(T.text('main h1')), 3000, 'Hindi home');
    T.assert(/गंतव्य/.test(T.text('#site-nav')) && /होम/.test(T.text('#tabbar')), 'Chrome not translated');
    T.assert(/पिकअप/.test(T.text('#search-form')) && /ड्राफ़्ट/.test(T.text('#site-footer')), 'Search form or draft note missing');
    T.noOverflow();
    await T.go('#/search'); T.noOverflow();
    await T.go('#/help'); T.noOverflow();
    await T.go('#/'); await T.until(() => T.$('.nav-lang'), 3000, 'switch');
    T.assert(localStorage.getItem('vanyatra.lang.v1') === 'hi', 'Choice not saved');
    T.$('.nav-lang').click();
    await T.until(() => document.documentElement.lang === 'en-IN' && /Your home on wheels/.test(T.text('main h1')), 3000, 'back to English');
    return 'hi ↔ en';
  },
  // Pre-rendered pages (npm run prerender): structured data for search engines, then the app boots on the same screen
  seo: async function () {
    const html = await (await fetch('vans/v1/')).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(x => JSON.parse(x.textContent));
    T.assert(ld.some(x => x['@type'] === 'Product' && x.offers) && ld.some(x => x['@type'] === 'BreadcrumbList'), 'Van JSON-LD missing');
    T.assert(doc.querySelector('link[rel=canonical]') && doc.querySelector('meta[property="og:image"]') && doc.querySelector('main h1'), 'Van page meta/content missing');
    const faq = new DOMParser().parseFromString(await (await fetch('help/faq/')).text(), 'text/html');
    T.assert([...faq.querySelectorAll('script[type="application/ld+json"]')].some(x => /FAQPage/.test(x.textContent)), 'FAQPage JSON-LD missing');
    T.assert(/<loc>/.test(await (await fetch('sitemap.xml')).text()), 'Sitemap empty');
    // The Node server forbids framing (X-Frame-Options), so the boot check runs on the static host
    if (App.backend === 'server') return ld.length + ' JSON-LD blocks';
    const f = document.createElement('iframe'); f.style.cssText = 'width:360px;height:700px'; f.src = 'destinations/goa/'; document.body.append(f);
    await T.until(() => f.contentWindow.App && f.contentDocument.querySelector('main h1') && !f.contentDocument.querySelector('.prerendered') && /goa/i.test(f.contentDocument.querySelector('main h1').innerText), 10000, 'pre-rendered page boot');
    T.assert(f.contentDocument.querySelector('link[rel=canonical]').href.endsWith('destinations/goa/') && (f.contentDocument.querySelector('link[rel=canonical]').href), 'Canonical not kept');
    f.remove();
    return ld.length + ' JSON-LD blocks, page boots';
  }
};

// Second halves run after the network is cut (see the runner)
const OFFLINE_CHECKS = {
  offline: async function () {
    await T.until(() => window.App && App.backend && document.querySelector('main') && !document.querySelector('.boot-loading'), 10000, 'app start offline');
    await T.until(() => T.$$('.trip-card').length, 6000, 'trips offline');
    const want = JSON.parse(localStorage.getItem('journey.tripIds') || '[]');
    const got = T.$$('.trip-card .eyebrow').map(x => x.innerText);
    T.assert(want.length && want.every(id => got.includes(id)), 'Trips missing offline: ' + got.join(','));
    T.assert(!navigator.onLine && /You’re offline/.test(T.text()), 'Offline notice missing: onLine=' + navigator.onLine + ' text=' + T.text().slice(0, 200));
    await T.go('#/account/trips/' + got[0]); T.assert(T.$('main h1'), 'Itinerary did not open offline');
    return got.length + ' trips readable';
  }
};

/* ---------- Runner ---------- */
async function run(mode) {
  // Server mode gets a fresh server (and data) per journey, so sign-in rate limits and
  // earlier journeys' changes don't carry over; demo mode clears the browser instead.
  let host = mode === 'demo' ? await startStatic() : await startNode();
  const chrome = await launchChrome();
  const problems = [];
  let origin = new URL(host.url).origin;
  chrome.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') problems.push('Exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console.error: ' + m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && (!m.params.entry.url || m.params.entry.url.startsWith(origin))) problems.push('Log: ' + m.params.entry.text + ' ' + (m.params.entry.url || ''));
  });
  await chrome.send('Runtime.enable'); await chrome.send('Log.enable'); await chrome.send('Page.enable');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: 780, deviceScaleFactor: 2, mobile: true });
  await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });
  const results = [];
  for (const [name, fn] of Object.entries(JOURNEYS)) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    problems.length = 0;
    if (mode === 'server' && results.length) { host.stop(); host = await startNode(); origin = new URL(host.url).origin; }
    // Fresh demo data for each journey
    await chrome.send('Page.navigate', { url: host.url + SHELL });
    await sleep(700);
    await chrome.send('Runtime.evaluate', { expression: 'localStorage.clear(); sessionStorage.clear();' });
    await chrome.send('Page.navigate', { url: host.url + SHELL });
    await sleep(900);
    const t0 = Date.now();
    let ok = true, detail = '';
    try {
      await chrome.send('Runtime.evaluate', { expression: 'T.until(() => window.App && App.backend && document.querySelector("main") && !document.querySelector(".boot-loading"), 10000, "app start")', awaitPromise: true });
      const r = await chrome.send('Runtime.evaluate', { expression: `(${fn.toString().replace(/^async \w+\(\)/, 'async function ()')})()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) { ok = false; detail = r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text; }
      else detail = String(r.result.value ?? '');
    } catch (e) { ok = false; detail = e.message; }
    await sleep(200);
    // Offline phase: cut the network, reload, and check the cached app still shows the traveller's trips
    if (ok && OFFLINE_CHECKS[name]) {
      if (problems.length) { ok = false; detail += ' · ' + [...new Set(problems)].slice(0, 5).join(' | '); }
      await chrome.send('Network.enable');
      await chrome.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await chrome.send('Page.reload', {});
      await sleep(2500);
      const r2 = await chrome.send('Runtime.evaluate', { expression: `(${OFFLINE_CHECKS[name].toString()})()`, awaitPromise: true, returnByValue: true });
      if (r2.exceptionDetails) { ok = false; detail += ' · offline: ' + (r2.exceptionDetails.exception?.description?.split('\n')[0] || r2.exceptionDetails.text); }
      else detail += ' · offline: ' + r2.result.value;
      await chrome.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      // Expected while offline: requests that can't reach the network
      problems.splice(0, problems.length, ...problems.filter(p => !/ERR_INTERNET_DISCONNECTED|Failed to fetch|NetworkError/.test(p)));
    }
    if (problems.length) { ok = false; detail += (detail ? ' · ' : '') + [...new Set(problems)].slice(0, 5).join(' | '); }
    results.push({ mode, name, ok, detail, ms: Date.now() - t0 });
    console.log(`${ok ? '✓' : '✗'} [${mode}] ${name.padEnd(8)} ${String(Date.now() - t0).padStart(5)}ms  ${detail}`);
  }
  chrome.close(); host.stop();
  return results;
}

// Screenshots for visual review (demo mode):
//   node scripts/journeys.mjs [--full] --screens out/ "#/vans/v1" "traveller@vanyatra.in#/account/verification" ...
// A route may be prefixed with an email to sign in first, suffixed with @selector to scroll
// to it, and then with !selector to click it (e.g. to open a picker).
// --full saves the whole page as tiles, --tile px high (default 1000)
const FULL = args.includes('--full');
const TILE = Number(opt('tile', 1000));
async function screens(dir, routes) {
  fs.mkdirSync(dir, { recursive: true });
  const host = await startStatic(), chrome = await launchChrome();
  await chrome.send('Page.enable'); await chrome.send('Runtime.enable');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: Number(opt('height', 780)), deviceScaleFactor: 1, mobile: WIDTH < 768 });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });
  await chrome.send('Page.navigate', { url: host.url + SHELL }); await sleep(1500);
  for (const [i, spec] of routes.entries()) {
    const [, email, hash, sel, click] = spec.match(/^([^#]*)(#[^@!]*)(?:@([^!]+))?(?:!(.+))?$/) || [];
    const js = `(async () => { await T.until(() => window.App && App.backend, 10000); ${email ? `await T.login(${JSON.stringify(email)}, '/');` : ''} await T.go(${JSON.stringify(hash)}); await T.wait(900); ${sel ? `document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start', behavior: 'instant' }); scrollBy(0, -70); await T.wait(300);` : 'scrollTo(0, 0);'} ${click ? `document.querySelector(${JSON.stringify(click)})?.click(); await T.wait(500);` : ''} })()`;
    const r = await chrome.send('Runtime.evaluate', { expression: js, awaitPromise: true });
    if (r.exceptionDetails) console.log('✗', spec, r.exceptionDetails.exception?.description?.split('\n')[0]);
    const base = path.join(dir, `${String(i + 1).padStart(2, '0')}-${hash.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'home'}`);
    if (FULL) {
      // The whole page, in tiles of TILE px (sections that skip rendering off-screen are drawn first)
      await chrome.send('Runtime.evaluate', { expression: "document.querySelectorAll('.section').forEach(s => s.style.contentVisibility = 'visible'); document.getElementById('consent-bar')?.remove(); scrollTo(0, 0)" });
      await sleep(400);
      const { cssContentSize } = await chrome.send('Page.getLayoutMetrics');
      const height = Math.min(Math.ceil(cssContentSize.height), 12000);
      for (let y = 0, n = 1; y < height; y += TILE, n++) {
        const clip = { x: 0, y, width: WIDTH, height: Math.min(TILE, height - y), scale: 1 };
        const shot = await chrome.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
        fs.writeFileSync(`${base}-${n}.png`, Buffer.from(shot.data, 'base64'));
      }
      console.log('📸', base, Math.ceil(height / TILE) + ' tiles');
    } else {
      const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(base + '.png', Buffer.from(shot.data, 'base64'));
      console.log('📸', base + '.png');
    }
  }
  chrome.close(); host.stop();
}
if (opt('screens')) { await screens(opt('screens'), args.slice(args.indexOf('--screens') + 2).filter(a => a.includes('#'))); process.exit(0); }

const all = [];
for (const m of MODES) all.push(...await run(m));
const failed = all.filter(r => !r.ok);
console.log(`\n${all.length - failed.length}/${all.length} journeys passed at ${WIDTH}px`);
process.exit(failed.length ? 1 : 0);
