/*
 * Mock backend.
 *
 * All state lives in localStorage so the prototype runs without a server.
 * Every mutation goes through App.api so it can later be swapped for real HTTP
 * calls. Business rules (pricing, availability, refunds, fraud checks, document
 * expiry, role checks) live here, not in the UI.
 *
 * SECURITY NOTE: this is a client-side demo. Password hashing, role checks and
 * payments here are simulations — in production they must run on the server
 * (bcrypt/argon2, HTTP-only session cookies, a PCI-compliant payment gateway,
 * encrypted document storage).
 */
window.App = window.App || {};

const STORAGE_KEY = 'vanyatra.db.v4';
const DAY = 86400000;

App.iso = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
App.parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
App.nightsBetween = (start, end) => Math.round((App.parseDate(end) - App.parseDate(start)) / DAY);
App.today = () => App.iso(new Date());
App.addDays = (s, n) => App.iso(new Date(App.parseDate(s).getTime() + n * DAY));
App.uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// Demo-only salted hash (FNV-1a). Real systems hash passwords server-side with argon2/bcrypt.
App.hashPassword = (pw) => {
  let h = 0x811c9dc5;
  for (const ch of 'vanyatra-salt:' + pw) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193); }
  return 'fnv1a$' + (h >>> 0).toString(16);
};

/* ---------------- Pricing ---------------- */
App.quote = (van, start, end, extras = {}) => {
  const C = App.C;
  const nights = App.nightsBetween(start, end);
  let base = 0;
  for (let i = 0; i < nights; i++) {
    const dow = App.parseDate(App.addDays(start, i)).getDay();
    base += (dow === 5 || dow === 6) ? (van.weekendPrice || van.pricePerNight) : van.pricePerNight;
  }
  const discountPct = nights >= 28 ? (van.discounts?.monthly || 0) : nights >= 7 ? (van.discounts?.weekly || 0) : 0;
  const discount = Math.round(base * discountPct / 100);
  const rental = base - discount;
  const addOns = (extras.addOns || []).reduce((s, a) => s + a.price * (a.perNight ? nights : 1), 0);
  const cleaning = van.cleaningFee || 0;
  const service = Math.round((rental + addOns) * C.serviceFeeRate);
  const tax = Math.round((rental + addOns + cleaning + service) * C.taxRate);
  const total = rental + addOns + cleaning + service + tax;
  const commission = Math.round((rental + addOns) * C.ownerCommissionRate);
  return {
    nights, base, discountPct, discount, rental, addOns, cleaning, service, tax, total,
    deposit: van.deposit || 0, commission, ownerPayout: rental + addOns + cleaning - commission,
    avgNight: nights ? Math.round(base / nights) : van.pricePerNight
  };
};

App.ADD_ONS = [
  { id: 'bedding', label: 'Bedding & towels pack', price: 800, perNight: false },
  { id: 'kit', label: 'Camping kit (chairs, table, BBQ)', price: 300, perNight: true },
  { id: 'kids', label: 'Child car seat', price: 200, perNight: true },
  { id: 'unlimited', label: 'Unlimited kilometres', price: 900, perNight: true },
  { id: 'cover', label: 'Damage cover — reduce deposit liability by 80%', price: 650, perNight: true }
];

/* ---------------- Store ---------------- */
App.load = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { App.db = JSON.parse(raw); return; }
  } catch (e) { console.warn('Could not read saved data, resetting demo.', e); }
  App.db = App.buildSeed();
  App.save();
};
App.save = () => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(App.db)); }
  catch (e) { App.toast && App.toast('Storage is full — large photos may not be saved.', 'bad'); }
};
App.resetDemo = () => { localStorage.removeItem(STORAGE_KEY); App.load(); };

/* ---------------- Lookups ---------------- */
App.get = {
  user: (id) => App.db.users.find(u => u.id === id),
  van: (id) => App.db.vans.find(v => v.id === id),
  dest: (id) => App.db.destinations.find(d => d.id === id),
  booking: (id) => App.db.bookings.find(b => b.id === id),
  thread: (id) => App.db.threads.find(t => t.id === id),
  reviewsFor: (vanId) => App.db.reviews.filter(r => r.vanId === vanId && r.status === 'published'),
  rating: (vanId) => {
    const rs = App.get.reviewsFor(vanId);
    return rs.length ? { avg: rs.reduce((s, r) => s + r.rating, 0) / rs.length, count: rs.length } : { avg: 0, count: 0 };
  },
  ownerVerified: (ownerId) => {
    const o = App.db.owners[ownerId];
    return !!o && ['account', 'kyc', 'business', 'payout'].every(k => o[k]?.status === 'verified');
  },
  docsFor: (filter) => App.db.documents.filter(d => Object.entries(filter).every(([k, v]) => d[k] === v))
};

App.me = () => {
  const s = App.db.session;
  if (!s || s.expires < Date.now()) return null;
  return App.get.user(s.userId) || null;
};

/* ---------------- Availability ---------------- */
App.unavailableDates = (vanId, ignoreBookingId) => {
  const set = new Set();
  const van = App.get.van(vanId);
  const addRange = (s, e) => { for (let d = s; d < e; d = App.addDays(d, 1)) set.add(d); };
  (van?.blocked || []).forEach(r => addRange(r.start, App.addDays(r.end, 1)));
  App.db.bookings.filter(b => b.vanId === vanId && b.id !== ignoreBookingId && ['confirmed', 'requested'].includes(b.status))
    .forEach(b => addRange(b.start, b.end));
  return set;
};
App.isAvailable = (vanId, start, end) => {
  if (!start || !end || end <= start) return true;
  const un = App.unavailableDates(vanId);
  for (let d = start; d < end; d = App.addDays(d, 1)) if (un.has(d)) return false;
  return true;
};

/* ---------------- Refunds ---------------- */
App.refundFor = (booking, when = new Date()) => {
  const van = App.get.van(booking.vanId);
  const policy = App.CANCELLATION_POLICIES[van?.cancellation || 'moderate'];
  const daysBefore = App.nightsBetween(App.iso(when), booking.start);
  // 24-hour grace period after booking for a full refund if trip is 7+ days away
  const withinGrace = (when - new Date(booking.createdAt)) < DAY && daysBefore >= 7;
  let pct = 0;
  if (withinGrace) pct = 1;
  else for (const t of policy.tiers) { if (daysBefore >= t.daysBefore) { pct = t.refund; break; } }
  if (booking.status === 'requested') pct = 1; // nothing captured yet
  const p = booking.pricing;
  // Rental is refunded by policy %; cleaning and service fees only on a full refund; tax follows the refunded amount
  const taxable = (p.rental + p.addOns) * pct + (pct === 1 ? p.cleaning + p.service : 0);
  const amount = pct === 1 ? p.total : Math.round(taxable * (1 + App.C.taxRate));
  return { pct, daysBefore, amount, policy, withinGrace };
};

/* ---------------- Fraud & safety checks ---------------- */
App.riskCheck = (user, van, quote, driver) => {
  const flags = [];
  let score = 0;
  const ageDays = (Date.now() - new Date(user.createdAt)) / DAY;
  if (ageDays < 30 && quote.total > 60000) { flags.push('High-value booking from an account under 30 days old'); score += 35; }
  if (!user.phoneVerified) { flags.push('Phone number not verified'); score += 20; }
  const recent = App.db.bookings.filter(b => b.customerId === user.id && (Date.now() - new Date(b.createdAt)) < DAY).length;
  if (recent >= 3) { flags.push('3+ bookings in the last 24 hours'); score += 30; }
  if (driver && driver.age < App.C.minDriverAge) { flags.push('Driver below minimum age'); score += 50; }
  if (driver && driver.check?.status === 'review') { flags.push('Driving licence needs manual review: ' + driver.check.note); score += 30; }
  if (driver && App.serverOnline && !driver.check) { flags.push('Driving licence not verified with SARATHI'); score += 30; }
  if (quote.nights > 21) { flags.push('Long rental (21+ nights)'); score += 10; }
  return { score: Math.min(100, score), flags };
};

// Hide phone numbers / emails / links in messages before a booking is confirmed to keep payments on-platform
App.filterContact = (text) => {
  let hidden = false;
  const out = text
    .replace(/(\+?\d[\d\s-]{7,}\d)/g, () => { hidden = true; return '[number hidden]'; })
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, () => { hidden = true; return '[email hidden]'; })
    .replace(/(https?:\/\/|www\.)\S+/gi, () => { hidden = true; return '[link hidden]'; });
  return { text: out, hidden };
};

/* ---------------- Notifications & audit ---------------- */
App.notify = (userId, text, link = '', email = true) => {
  App.db.notifications.unshift({ id: App.uid('n'), userId, text, link, at: new Date().toISOString(), read: false });
  const u = App.get.user(userId);
  if (email && u) App.db.outbox.unshift({ id: App.uid('m'), to: u.email, subject: text.slice(0, 70), body: text, at: new Date().toISOString() });
};
App.audit = (action, target) => {
  const me = App.me();
  App.db.audit.unshift({ id: App.uid('a'), actorId: me ? me.id : 'system', action, target, at: new Date().toISOString() });
};

/* ---------------- Daily housekeeping ---------------- */
// Document expiry runs on the server (server/market.js). Here we only close finished trips.
App.runExpiryChecks = () => {
  const today = App.today();
  let changed = false;
  // Move trips past their end date to completed and release deposits
  for (const b of App.db.bookings) {
    if (b.status === 'confirmed' && b.end < today) {
      b.status = 'completed';
      b.depositStatus = 'released';
      changed = true;
    }
  }
  if (changed) App.save();
};

App.docExpiryState = (doc) => {
  if (!doc.expiry) return null;
  const days = App.nightsBetween(App.today(), doc.expiry);
  if (days < 0) return { tone: 'bad', label: `Expired ${-days}d ago`, days };
  if (days <= App.C.expiryWarningDays) return { tone: 'warn', label: `Expires in ${days}d`, days };
  return { tone: 'muted', label: 'Valid until ' + App.fmtDate(doc.expiry), days };
};

/* ---------------- Server (auth + government-document verification) ---------------- */
App.server = async (method, path, body) => {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json.error || 'Request failed (' + res.status + ')'); e.status = res.status; e.code = json.code; throw e; }
  return json;
};

// Make sure a server account has a matching record in the local demo data
const bindLocalUser = (su) => {
  let u = App.get.user(su.id) || App.db.users.find(x => x.email.toLowerCase() === su.email.toLowerCase());
  if (!u) {
    u = { id: su.id, name: su.name, email: su.email, phone: '', role: su.role, emailVerified: true, phoneVerified: false, status: 'active', savedVans: [], createdAt: new Date().toISOString(), avatarHue: Math.floor(Math.random() * 360) };
    App.db.users.push(u);
    if (u.role === 'owner' && !App.db.owners[u.id]) App.db.owners[u.id] = { account: { status: 'action_required', note: 'Verify your email and mobile number.' } };
  }
  App.db.session = { userId: u.id, expires: Date.now() + 8 * 3600 * 1000 };
  App.save();
  return u;
};

// The server is the source of truth for who is signed in. Without it (e.g. the
// page opened from disk) the app falls back to local demo sign-in and
// verification features are disabled.
App.syncSession = async () => {
  try {
    const [{ user }, cfg] = await Promise.all([App.server('GET', '/api/auth/me'), App.server('GET', '/api/config')]);
    App.serverOnline = true;
    App.verifyConfig = cfg;
    if (user) bindLocalUser(user); else { App.db.session = null; App.save(); }
    await App.syncMarket();
  } catch (e) {
    App.serverOnline = false;
    App.verifyConfig = null;
  }
};

// Vans, documents, owner verification and their notifications come from the
// server, which decides every status. Bookings, messages and reviews are still
// local demo data, so vans the server doesn't return are kept (hidden) for them.
App.syncMarket = async () => {
  if (!App.serverOnline) return;
  const m = await App.server('GET', '/api/market');
  const local = new Map(App.db.vans.map(v => [v.id, v]));
  const ids = new Set(m.vans.map(v => v.id));
  App.db.vans = [
    ...m.vans.map(v => ({ ...v, views: local.get(v.id)?.views ?? v.views })),
    ...[...local.values()].filter(v => !ids.has(v.id)).map(v => ({ ...v, status: 'hidden' }))
  ];
  App.db.documents = m.documents;
  App.db.owners = m.owners;
  // People this browser hasn't seen yet (e.g. an owner who signed up elsewhere)
  for (const p of m.people || []) {
    const u = App.get.user(p.id);
    if (u) Object.assign(u, { name: p.name, role: p.role, ...(p.status ? { status: p.status } : {}) });
    else App.db.users.push({ id: p.id, name: p.name, email: p.email || '', phone: '', role: p.role, status: p.status || 'active', emailVerified: false, phoneVerified: false, savedVans: [], createdAt: p.createdAt || new Date().toISOString(), avatarHue: [...p.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360 });
  }
  App.db.notifications = [...m.notifications.map(n => ({ ...n, server: true })), ...App.db.notifications.filter(n => !n.server)];
  App.save();
};
// Ask the server to change something, then refresh from it
App.market = async (method, path, body) => {
  if (!App.serverOnline) throw new Error('This needs the VanYatra server. Start it with npm start.');
  const r = await App.server(method, path, body);
  await App.syncMarket();
  return r;
};

// Verification calls. Results: { status: 'verified' | 'review' | 'failed', reasons: [{level, text}], data, source, checkedAt }
App.verify = {
  run: (type, body) => App.server('POST', '/api/verify/' + type, { ...body, consent: true }).then(r => r.result),
  mine: () => App.server('GET', '/api/verify/mine'),
  startDigiLocker: (returnTo) => App.server('GET', '/api/digilocker/start?returnTo=' + encodeURIComponent(returnTo)).then(r => r.url),
  // Map a verification outcome onto a document status
  docStatus: (r) => r.status === 'verified' ? 'verified' : r.status === 'review' ? 'pending' : 'action_required',
  note: (r) => r.reasons.filter(x => x.level !== 'ok').map(x => x.text).join(' ')
};

/* ---------------- API ---------------- */
App.api = {
  async login(email, password) {
    if (App.serverOnline) {
      const { user } = await App.server('POST', '/api/auth/login', { email, password });
      const u = bindLocalUser(user);
      App.audit('user.login', u.email); App.save();
      await App.syncMarket();
      return u;
    }
    const u = App.db.users.find(x => x.email.toLowerCase() === String(email).trim().toLowerCase());
    if (!u || u.password !== App.hashPassword(password)) throw new Error('Email or password is incorrect.');
    if (u.status === 'suspended') throw new Error('This account is suspended. Contact support.');
    App.db.session = { userId: u.id, expires: Date.now() + 8 * 3600 * 1000 };
    App.audit('user.login', u.email);
    App.save();
    return u;
  },
  async logout() {
    if (App.serverOnline) await App.server('POST', '/api/auth/logout', {}).catch(() => {});
    App.db.session = null; App.save();
    await App.syncMarket().catch(() => {});
  },
  async signup({ name, email, phone, password, role }) {
    if (App.db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with this email already exists.');
    if (password.length < 8 || !/\d/.test(password) || !/[a-z]/i.test(password)) throw new Error('Password needs at least 8 characters including a letter and a number.');
    const server = App.serverOnline ? (await App.server('POST', '/api/auth/signup', { name, email, password, role })).user : null;
    const u = {
      id: server ? server.id : App.uid('u_'), name, email, phone, password: server ? 'server' : App.hashPassword(password), role: role === 'owner' ? 'owner' : 'customer',
      emailVerified: false, phoneVerified: false, status: 'active', savedVans: [], createdAt: new Date().toISOString(), avatarHue: Math.floor(Math.random() * 360)
    };
    App.db.users.push(u);
    if (u.role === 'owner') App.db.owners[u.id] = { account: { status: 'action_required', note: 'Verify your email and mobile number.' } };
    App.db.session = { userId: u.id, expires: Date.now() + 8 * 3600 * 1000 };
    App.notify(u.id, 'Welcome to VanYatra! Please verify your email and phone.');
    App.audit('user.signup', email);
    App.save();
    await App.syncMarket();
    return u;
  },
  toggleSave(vanId) {
    const me = App.me();
    const i = me.savedVans.indexOf(vanId);
    if (i >= 0) me.savedVans.splice(i, 1); else me.savedVans.push(vanId);
    App.save();
    return i < 0;
  },
  createBooking({ vanId, start, end, adults, children, addOnIds, driver, payment, specialRequests }) {
    const me = App.me();
    const van = App.get.van(vanId);
    if (!me) throw new Error('Please sign in to book.');
    if (van.status !== 'published') throw new Error('This van is not currently accepting bookings.');
    if (!App.isAvailable(vanId, start, end)) throw new Error('Sorry — those dates were just booked. Pick different dates.');
    const nights = App.nightsBetween(start, end);
    if (nights < van.minNights) throw new Error(`Minimum stay is ${van.minNights} nights.`);
    if (adults + children > van.sleeps) throw new Error(`This van sleeps up to ${van.sleeps}.`);
    if (driver.age < App.C.minDriverAge) throw new Error(`Main driver must be at least ${App.C.minDriverAge}.`);
    const addOns = App.ADD_ONS.filter(a => addOnIds.includes(a.id));
    const pricing = App.quote(van, start, end, { addOns });
    const risk = App.riskCheck(me, van, pricing, driver);
    const status = van.instantBook && risk.score < 50 ? 'confirmed' : 'requested';
    let id;
    do { id = 'VY' + (1000 + Math.floor(Math.random() * 9000)); } while (App.get.booking(id));
    const b = {
      id, vanId, ownerId: van.ownerId, customerId: me.id,
      start, end, nights, adults, children, travelers: adults + children, addOns: addOns.map(a => a.id), pricing, status,
      paymentStatus: status === 'confirmed' ? 'paid' : 'authorised', depositStatus: status === 'confirmed' ? 'held' : 'none',
      driver: { name: driver.name, age: driver.age, licenceMasked: 'XXXXXXXX' + driver.licence.slice(-4), check: driver.check || null },
      payment: { method: payment.method, label: payment.label }, specialRequests,
      createdAt: new Date().toISOString(), risk, itinerary: []
    };
    App.db.bookings.push(b);
    App.db.transactions.unshift({ id: App.uid('tx'), type: 'payment', bookingId: b.id, customerId: me.id, ownerId: van.ownerId, amount: pricing.total, at: b.createdAt, status: status === 'confirmed' ? 'captured' : 'authorised', method: payment.label });
    let t = App.db.threads.find(x => x.vanId === vanId && x.customerId === me.id);
    if (!t) { t = { id: App.uid('t'), vanId, customerId: me.id, ownerId: van.ownerId, messages: [] }; App.db.threads.push(t); }
    t.bookingId = b.id;
    if (specialRequests) t.messages.push({ from: me.id, text: status === 'confirmed' ? specialRequests : App.filterContact(specialRequests).text, at: b.createdAt });
    if (status === 'confirmed') {
      App.notify(me.id, `Booking ${b.id} confirmed: ${van.name}, ${App.fmtDate(start)} – ${App.fmtDate(end)}.`, '#/account/bookings');
      App.notify(van.ownerId, `New confirmed booking ${b.id} for ${van.name} (${App.fmtDate(start)}).`, '#/owner/bookings');
    } else {
      App.notify(me.id, `Request ${b.id} sent to the owner of ${van.name}. You won't be charged unless they accept (within 24 h).`, '#/account/bookings');
      App.notify(van.ownerId, `New booking request ${b.id} for ${van.name}. Respond within 24 hours.`, '#/owner/bookings');
    }
    if (risk.score >= 50) App.db.users.filter(u => u.role === 'admin').forEach(a => App.notify(a.id, `Booking ${b.id} flagged for review (risk ${risk.score}).`, '#/admin/bookings', false));
    App.save();
    return b;
  },
  respondToRequest(bookingId, accept, reason = '') {
    const b = App.get.booking(bookingId);
    const van = App.get.van(b.vanId);
    if (accept) {
      b.status = 'confirmed'; b.paymentStatus = 'paid'; b.depositStatus = 'held';
      const tx = App.db.transactions.find(t => t.bookingId === b.id && t.type === 'payment');
      if (tx) tx.status = 'captured';
      App.notify(b.customerId, `Great news! ${van.name} is confirmed for ${App.fmtDate(b.start)}. Booking ${b.id}.`, '#/account/bookings');
    } else {
      b.status = 'declined'; b.paymentStatus = 'voided'; b.declineReason = reason;
      App.notify(b.customerId, `The owner couldn't accept request ${b.id}. Your card authorisation was released.`, '#/search');
    }
    App.audit(accept ? 'booking.accept' : 'booking.decline', b.id);
    App.save();
  },
  cancelBooking(bookingId, by = 'customer', reason = '') {
    const b = App.get.booking(bookingId);
    const r = by === 'customer' ? App.refundFor(b) : { amount: b.pricing.total, pct: 1 };
    b.status = 'cancelled'; b.cancelledBy = by; b.cancelReason = reason;
    b.refund = r.amount; b.paymentStatus = r.amount >= b.pricing.total ? 'refunded' : r.amount > 0 ? 'partially_refunded' : 'paid';
    b.depositStatus = 'released';
    if (r.amount > 0) App.db.transactions.unshift({ id: App.uid('tx'), type: 'refund', bookingId: b.id, customerId: b.customerId, ownerId: b.ownerId, amount: r.amount, at: new Date().toISOString(), status: 'refunded' });
    App.notify(b.customerId, `Booking ${b.id} cancelled. Refund: ${App.money(r.amount)} (5–7 business days).`, '#/account/payments');
    App.notify(b.ownerId, `Booking ${b.id} was cancelled by the ${by}. Those dates are open again.`, '#/owner/bookings');
    App.audit('booking.cancel', `${b.id} by ${by}`);
    App.save();
    return r;
  },
  sendMessage(threadId, text) {
    const me = App.me();
    const t = App.get.thread(threadId);
    const confirmed = t.bookingId && ['confirmed', 'completed'].includes(App.get.booking(t.bookingId)?.status);
    const filtered = confirmed ? { text, hidden: false } : App.filterContact(text);
    t.messages.push({ from: me.id, text: filtered.text, at: new Date().toISOString() });
    const other = me.id === t.customerId ? t.ownerId : t.customerId;
    App.notify(other, `New message from ${me.name}`, me.id === t.customerId ? '#/owner/messages/' + t.id : '#/account/messages/' + t.id, false);
    App.save();
    return filtered;
  },
  startThread(vanId) {
    const me = App.me();
    const van = App.get.van(vanId);
    let t = App.db.threads.find(x => x.vanId === vanId && x.customerId === me.id);
    if (!t) { t = { id: App.uid('t'), vanId, customerId: me.id, ownerId: van.ownerId, messages: [] }; App.db.threads.push(t); App.save(); }
    return t;
  },
  addReview(bookingId, rating, categories, text) {
    const b = App.get.booking(bookingId);
    const flagged = App.filterContact(text).hidden;
    App.db.reviews.unshift({ id: App.uid('r'), vanId: b.vanId, bookingId, authorId: b.customerId, ownerId: b.ownerId, rating, categories, text, createdAt: new Date().toISOString(), status: flagged ? 'flagged' : 'published', flagReason: flagged ? 'Auto-flagged: contains contact details' : '', ownerReply: '' });
    App.notify(b.ownerId, `New ${rating}★ review for ${App.get.van(b.vanId).name}.`, '#/owner/reviews');
    App.save();
    return flagged;
  },
};

App.rollup = (statuses) => {
  if (statuses.includes('rejected')) return 'rejected';
  if (statuses.includes('action_required')) return 'action_required';
  if (statuses.includes('pending')) return 'pending';
  if (statuses.every(s => s === 'verified')) return 'verified';
  return 'not_started';
};
