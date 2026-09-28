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
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
// Like GitHub Pages: plain files, no /api (so the app uses its in-browser backend)
async function startStatic() {
  const port = await freePort();
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !(rel === 'index.html' || rel.startsWith('assets/')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
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
    await T.go('#/vans/' + van.id + '?start=' + s + '&end=' + e); T.noOverflow();
    const vanTotal = T.rupees((T.text('#booking-card').match(/Total\s*₹[\d,]+/) || [''])[0]);
    T.assert(vanTotal === quote, 'Van page total ' + vanTotal + ' ≠ quote ' + quote);
    T.$('#book-btn').click(); await T.until(() => T.$('#book-form'), 6000, 'booking form');
    const checkoutTotal = T.rupees((T.text('.book-summary').match(/Total\s*₹[\d,]+/) || [''])[0]);
    T.assert(checkoutTotal === quote, 'Checkout total ' + checkoutTotal + ' ≠ quote ' + quote);
    T.noOverflow();
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('#book-form [name=phone]'), 6000, 'driver step');
    T.assert(!T.$('#book-form [name=licence]'), 'Verified traveller was asked for their licence again');
    T.$('#book-form').requestSubmit(); await T.until(() => T.$('[name=payMethod]'), 6000, 'payment step');
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
    T.assert(T.$('.drp').classList.contains('sheet'), 'Picker should be a bottom sheet on phones');
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

  // An unverified traveller can't pay until identity is verified
  async gate() {
    await T.login('sam@example.com', '/');
    const [s, e] = T.futureRange(60, 4);
    const van = App.db.vans.find(v => v.status === 'published' && App.isAvailable(v.id, s, e) && v.minNights <= 4);
    await T.go('#/book/' + van.id + '?start=' + s + '&end=' + e + '&adults=2&children=0');
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
    await T.go('#/owner/calendar');
    const f = T.$('input[name=start]').form; const [s, e] = T.futureRange(200, 2);
    f.start.value = s; f.end.value = e; f.note.value = 'Journey test'; f.requestSubmit(); await T.wait(900);
    const vanId = T.$('#cal-van').value;
    T.assert(App.get.van(vanId).blocked.some(b => b.start === s), 'Blocked dates not saved');
    T.assert(!App.isAvailable(vanId, s, e), 'Blocked dates still bookable');
    await T.go('#/owner/onboarding?van=' + vanId + '&step=9');
    await T.until(() => T.$('#ls-save'), 6000, 'listing step'); T.$('#ls-save').click();
    await T.until(() => /step=10/.test(location.hash), 6000, 'listing step save');
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
  }
};

/* ---------- Runner ---------- */
async function run(mode) {
  const host = mode === 'demo' ? await startStatic() : await startNode();
  const chrome = await launchChrome();
  const problems = [];
  const origin = new URL(host.url).origin;
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
    // Fresh demo data for each journey
    await chrome.send('Page.navigate', { url: host.url });
    await sleep(700);
    await chrome.send('Runtime.evaluate', { expression: 'localStorage.clear(); sessionStorage.clear();' });
    await chrome.send('Page.navigate', { url: host.url });
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
    if (problems.length) { ok = false; detail += (detail ? ' · ' : '') + [...new Set(problems)].slice(0, 5).join(' | '); }
    results.push({ mode, name, ok, detail, ms: Date.now() - t0 });
    console.log(`${ok ? '✓' : '✗'} [${mode}] ${name.padEnd(8)} ${String(Date.now() - t0).padStart(5)}ms  ${detail}`);
  }
  chrome.close(); host.stop();
  return results;
}

// Screenshots for visual review (demo mode):
//   node scripts/journeys.mjs --screens out/ "#/vans/v1" "traveller@vanyatra.in#/account/verification" ...
// A route may be prefixed with an email to sign in first, suffixed with @selector to scroll
// to it, and then with !selector to click it (e.g. to open a picker).
async function screens(dir, routes) {
  fs.mkdirSync(dir, { recursive: true });
  const host = await startStatic(), chrome = await launchChrome();
  await chrome.send('Page.enable'); await chrome.send('Runtime.enable');
  await chrome.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: Number(opt('height', 780)), deviceScaleFactor: 1, mobile: WIDTH < 768 });
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: HELPERS });
  await chrome.send('Page.navigate', { url: host.url }); await sleep(1500);
  for (const [i, spec] of routes.entries()) {
    const [, email, hash, sel, click] = spec.match(/^([^#]*)(#[^@!]*)(?:@([^!]+))?(?:!(.+))?$/) || [];
    const js = `(async () => { await T.until(() => window.App && App.backend, 10000); ${email ? `await T.login(${JSON.stringify(email)}, '/');` : ''} await T.go(${JSON.stringify(hash)}); await T.wait(900); ${sel ? `document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start', behavior: 'instant' }); scrollBy(0, -70); await T.wait(300);` : 'scrollTo(0, 0);'} ${click ? `document.querySelector(${JSON.stringify(click)})?.click(); await T.wait(500);` : ''} })()`;
    const r = await chrome.send('Runtime.evaluate', { expression: js, awaitPromise: true });
    if (r.exceptionDetails) console.log('✗', spec, r.exceptionDetails.exception?.description?.split('\n')[0]);
    const shot = await chrome.send('Page.captureScreenshot', { format: 'png' });
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')}-${hash.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'home'}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log('📸', file);
  }
  chrome.close(); host.stop();
}
if (opt('screens')) { await screens(opt('screens'), args.slice(args.indexOf('--screens') + 2).filter(a => a.includes('#'))); process.exit(0); }

const all = [];
for (const m of MODES) all.push(...await run(m));
const failed = all.filter(r => !r.ok);
console.log(`\n${all.length - failed.length}/${all.length} journeys passed at ${WIDTH}px`);
process.exit(failed.length ? 1 : 0);
