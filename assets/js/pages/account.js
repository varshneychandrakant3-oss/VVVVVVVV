/*
 * Customer account: trips, itinerary, saved vans, messages, payments, reviews, profile.
 * Also exports App.messagesView, shared with the owner dashboard.
 */
(() => {
const { h, money, photo, fmtDate } = App;

App.pages.account = (el, { tab = 'bookings', id }) => {
  const me = App.me();
  const mine = App.db.bookings.filter(b => b.customerId === me.id);
  const unreadThreads = App.db.threads.filter(t => t.customerId === me.id && t.messages.length && t.messages[t.messages.length - 1].from !== me.id).length;
  const toReview = mine.filter(b => b.status === 'completed' && !App.db.reviews.some(r => r.bookingId === b.id)).length;
  const main = App.dashLayout(el, {
    title: 'My account', subtitle: me.name, base: '#/account', active: tab,
    nav: [
      { id: 'bookings', icon: '🧳', label: 'My trips', count: mine.filter(b => ['confirmed', 'requested'].includes(b.status)).length },
      { id: 'saved', icon: '♡', label: 'Saved vans', count: me.savedVans.length },
      { id: 'messages', icon: '💬', label: 'Messages', count: unreadThreads },
      { id: 'payments', icon: '💳', label: 'Payments' },
      { id: 'reviews', icon: '★', label: 'Reviews', count: toReview },
      { id: 'profile', icon: '⚙', label: 'Profile & privacy' }
    ]
  });
  const views = { bookings: tripsTab, saved: savedTab, messages: (m) => App.messagesView(m, 'customer', id), payments: paymentsTab, reviews: reviewsTab, profile: profileTab, trips: (m) => itineraryTab(m, id) };
  (views[tab] || tripsTab)(main, me, mine);
};

/* ---------- Trips ---------- */
const tripCard = (b) => {
  const van = App.get.van(b.vanId);
  const owner = App.get.user(b.ownerId);
  const thread = App.db.threads.find(t => t.vanId === b.vanId && t.customerId === b.customerId);
  const reviewed = App.db.reviews.some(r => r.bookingId === b.id);
  const upcoming = ['confirmed', 'requested'].includes(b.status);
  const days = App.nightsBetween(App.today(), b.start);
  return h`<article class="trip-card">
    <img src="${photo(van.photos[0], 400)}" alt="">
    <div class="trip-body">
      <div class="row-between"><span class="eyebrow">${b.id}</span>${App.pill(b.status)}</div>
      <h3><a href="#/vans/${van.id}">${van.name}</a></h3>
      <p class="meta">${fmtDate(b.start)} → ${fmtDate(b.end)} · ${App.plural(b.nights, 'night')} · ${b.travelers} travellers · hosted by ${owner.name}</p>
      ${b.status === 'confirmed' && days >= 0 ? h`<p class="small"><strong>${days === 0 ? 'Pickup is today!' : `Pickup in ${App.plural(days, 'day')}`}</strong> · ${van.pickup.address}, from ${van.pickup.time}</p>` : ''}
      ${b.status === 'requested' ? h`<p class="small muted">Waiting for the owner to respond. You haven’t been charged.</p>` : ''}
      ${b.status === 'cancelled' ? h`<p class="small muted">Cancelled by ${b.cancelledBy || 'you'}${b.refund !== undefined ? ` · refund ${money(b.refund)}` : ''}</p>` : ''}
      ${b.status === 'declined' ? h`<p class="small muted">The owner couldn’t accept this request. Your authorisation was released.</p>` : ''}
      <div class="trip-actions">
        <strong>${money(b.pricing.total)}</strong>
        ${upcoming ? h`<a class="btn btn-sm" href="#/account/trips/${b.id}">🗺 Itinerary</a>` : ''}
        ${thread ? h`<a class="btn btn-sm btn-ghost" href="#/account/messages/${thread.id}">💬 Message</a>` : ''}
        <button class="btn btn-sm btn-ghost" data-receipt="${b.id}">🧾 Receipt</button>
        ${upcoming ? h`<button class="btn btn-sm btn-ghost danger-text" data-cancel="${b.id}">Cancel</button>` : ''}
        ${b.status === 'completed' && !reviewed ? h`<button class="btn btn-sm btn-primary" data-review="${b.id}">★ Leave review</button>` : ''}
        ${b.status === 'completed' ? h`<button class="btn btn-sm btn-ghost" data-issue="${b.id}">Report an issue</button>` : ''}
      </div>
    </div>
  </article>`;
};

const tripsTab = (m, me, mine) => {
  const groups = [
    ['Upcoming', mine.filter(b => ['confirmed', 'requested'].includes(b.status)).sort((a, b) => a.start.localeCompare(b.start))],
    ['Past trips', mine.filter(b => b.status === 'completed').sort((a, b) => b.start.localeCompare(a.start))],
    ['Cancelled & declined', mine.filter(b => ['cancelled', 'declined'].includes(b.status))]
  ];
  m.innerHTML = String(h`<h1>My trips</h1>
    ${!me.phoneVerified || !me.emailVerified ? h`<div class="alert alert-warn">Verify your email and mobile to speed up bookings. <a href="#/account/profile">Verify now</a></div>` : ''}
    ${mine.length ? groups.filter(g => g[1].length).map(([t, list]) => h`<h2 class="section-sub">${t}</h2><div class="trip-list">${list.map(tripCard)}</div>`)
      : App.emptyState('🧭', 'No trips yet', 'Find a van and start planning your first road trip.', h`<a class="btn btn-primary" href="#/search">Find a van</a>`)}`);
  bindTripActions(m);
};

const bindTripActions = (m) => {
  m.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => cancelFlow(b.dataset.cancel));
  m.querySelectorAll('[data-review]').forEach(b => b.onclick = () => reviewFlow(b.dataset.review));
  m.querySelectorAll('[data-receipt]').forEach(b => b.onclick = () => App.receipt(b.dataset.receipt));
  m.querySelectorAll('[data-issue]').forEach(b => b.onclick = () => issueFlow(b.dataset.issue));
};

const cancelFlow = async (id) => {
  const b = App.get.booking(id);
  const r = App.refundFor(b);
  const ok = await App.modal({
    title: 'Cancel booking ' + b.id + '?',
    body: h`<p>${App.get.van(b.vanId).name}, ${fmtDate(b.start)} → ${fmtDate(b.end)}</p>
      <div class="callout"><strong>Refund: ${money(r.amount)}</strong> of ${money(b.pricing.total)} (${Math.round(r.pct * 100)}%)<br><span class="small">${b.status === 'requested' ? 'Request not yet accepted — nothing has been charged.' : r.withinGrace ? 'You’re within the 24-hour grace period.' : `${r.policy.label} policy · ${App.plural(Math.max(0, r.daysBefore), 'day')} before pickup.`}</span></div>
      <label class="field"><span>Reason (optional)</span><select id="c-reason"><option>Change of plans</option><option>Found another option</option><option>Travel restrictions / weather</option><option>Health reasons</option><option>Other</option></select></label>`,
    actions: [{ label: 'Keep booking', value: false }, { label: 'Cancel booking', danger: true, value: (mm) => mm.querySelector('#c-reason').value }]
  });
  if (!ok) return;
  App.api.cancelBooking(id, 'customer', ok);
  App.toast(`Booking cancelled. ${money(r.amount)} will be refunded.`, 'good');
  App.render();
};

const reviewFlow = async (id) => {
  const b = App.get.booking(id);
  const cats = ['cleanliness', 'accuracy', 'communication', 'value'];
  const starInput = (name) => h`<div class="star-input" role="radiogroup" aria-label="${name}">${[5, 4, 3, 2, 1].map(n => h`<input type="radio" id="${name}-${n}" name="${name}" value="${n}" ${n === 5 ? 'checked' : ''}><label for="${name}-${n}" title="${n} stars">★</label>`)}</div>`;
  const res = await App.modal({
    title: 'Review ' + App.get.van(b.vanId).name,
    body: h`<div class="review-form"><div class="row-between"><strong>Overall</strong>${starInput('overall')}</div>
      ${cats.map(c => h`<div class="row-between small"><span>${c[0].toUpperCase() + c.slice(1)}</span>${starInput(c)}</div>`)}
      <label class="field"><span>Tell other travellers about your trip</span><textarea id="rv-text" rows="4" maxlength="1000" placeholder="What did you love? Anything to improve?"></textarea></label>
      <p class="small muted">Reviews must be about your own trip and can’t include contact details.</p></div>`,
    actions: [{ label: 'Cancel', value: null }, {
      label: 'Post review', primary: true,
      validate: (mm) => mm.querySelector('#rv-text').value.trim().length >= 20 || (App.toast('Please write at least 20 characters.', 'bad'), false),
      value: (mm) => ({ rating: +mm.querySelector('[name=overall]:checked').value, categories: Object.fromEntries(cats.map(c => [c, +mm.querySelector(`[name=${c}]:checked`).value])), text: mm.querySelector('#rv-text').value.trim() })
    }]
  });
  if (!res) return;
  const flagged = App.api.addReview(id, res.rating, res.categories, res.text);
  App.toast(flagged ? 'Thanks! Your review is being checked by our team before it appears.' : 'Thanks for your review!', 'good');
  App.render();
};

const issueFlow = async (id) => {
  const b = App.get.booking(id);
  const res = await App.modal({
    title: 'Report an issue with ' + b.id,
    body: h`<label class="field"><span>What went wrong?</span><select id="is-type"><option>Van not as described</option><option>Something broke during the trip</option><option>Deposit deduction disagreement</option><option>Cleanliness</option><option>Safety concern</option></select></label>
      <label class="field"><span>Details</span><textarea id="is-text" rows="4"></textarea></label>
      <label class="field"><span>Refund requested (${App.C.currency})</span><input type="number" id="is-amt" min="0" max="${b.pricing.total}" value="0"></label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Submit to support', primary: true, validate: (mm) => mm.querySelector('#is-text').value.trim().length > 10 || (App.toast('Please describe the issue.', 'bad'), false), value: (mm) => ({ type: mm.querySelector('#is-type').value, text: mm.querySelector('#is-text').value.trim(), amount: +mm.querySelector('#is-amt').value }) }]
  });
  if (!res) return;
  App.db.disputes.unshift({ id: App.uid('dp'), bookingId: id, raisedBy: 'customer', reason: `${res.type}: ${res.text}`, amount: res.amount, status: 'open', createdAt: new Date().toISOString(), messages: [] });
  App.db.users.filter(u => u.role === 'admin').forEach(a => App.notify(a.id, `New dispute on ${id}: ${res.type}`, '#/admin/disputes', false));
  App.notify(b.ownerId, `A traveller reported an issue on booking ${id}. Our team will be in touch.`, '#/owner/bookings');
  App.save();
  App.toast('Issue reported. Our team will respond within 1 business day.', 'good');
};

App.receipt = (id) => {
  const b = App.get.booking(id);
  const van = App.get.van(b.vanId);
  App.modal({
    title: 'Receipt · ' + b.id,
    body: h`<div class="receipt"><p><strong>VanYatra Marketplace Pvt. Ltd.</strong> (demo)<br><span class="small muted">Tax invoice · ${App.C.taxLabel} registered</span></p>
      <p>${van.name} · ${fmtDate(b.start)} → ${fmtDate(b.end)}<br>Booked ${fmtDate(b.createdAt)} · Status: ${b.status} · Payment: ${b.paymentStatus}</p>
      ${App.priceLines(b.pricing)}${b.refund ? h`<p class="good">Refunded: ${money(b.refund)}</p>` : ''}</div>`,
    actions: [{ label: 'Print', value: 'print' }, { label: 'Close', primary: true, value: null }]
  }).then(v => { if (v === 'print') window.print(); });
};

/* ---------- Itinerary ---------- */
const PACKING = ['Driving licence & ID (originals)', 'Phone chargers & power bank', 'Warm layers & rain jacket', 'Sunscreen, sunglasses, hat', 'Personal medicines & first-aid', 'Headlamp / torch', 'Reusable water bottles', 'Snacks & basic groceries', 'Cash for tolls and remote areas', 'Offline maps downloaded'];
const itineraryTab = (m, id) => {
  const me = App.me();
  const b = App.get.booking(id);
  if (!b || b.customerId !== me.id) { m.innerHTML = String(App.emptyState('🗺️', 'Trip not found', '')); return; }
  const van = App.get.van(b.vanId);
  const dest = App.get.dest(van.destinationId);
  if (!b.itinerary || !b.itinerary.length) b.itinerary = Array.from({ length: b.nights }, (_, i) => ({ day: i + 1, title: '', notes: '' }));
  b.checklist = b.checklist || {};
  m.innerHTML = String(h`
    <a class="back-link" href="#/account/bookings">← My trips</a>
    <h1>Trip itinerary</h1>
    <div class="trip-summary card">
      <img src="${photo(dest?.hero || van.photos[0], 600)}" alt="">
      <div><span class="eyebrow">${b.id} · ${b.status}</span><h2>${dest ? dest.name : ''} with ${van.name}</h2>
        <p>${fmtDate(b.start)} → ${fmtDate(b.end)} · ${App.plural(b.nights, 'night')}</p>
        <p class="small">📍 Pickup: ${b.status === 'confirmed' ? van.pickup.address : van.pickup.city + ' (address after confirmation)'} · ${van.pickup.time}</p>
        <div class="row gap wrap"><button class="btn btn-sm" id="ics">📅 Add to calendar</button>${dest ? h`<button class="btn btn-sm btn-ghost" id="suggest">✨ Fill from suggested route</button>` : ''}</div></div>
    </div>
    <div class="itin-layout">
      <form id="itin-form" class="itin-days">
        ${b.itinerary.map((d, i) => h`<div class="itin-day"><div class="itin-date"><strong>Day ${d.day}</strong><span class="small muted">${fmtDate(App.addDays(b.start, i), { weekday: 'short', day: 'numeric', month: 'short' })}</span></div>
          <div class="itin-fields"><input name="title-${i}" value="${d.title}" placeholder="Where are you heading?" aria-label="Day ${d.day} plan"><textarea name="notes-${i}" rows="2" placeholder="Notes, campsite, fuel stops…" aria-label="Day ${d.day} notes">${d.notes}</textarea></div></div>`)}
        <button class="btn btn-primary">Save itinerary</button>
      </form>
      <aside>
        ${dest ? h`<div class="card"><h3>Routes in ${dest.name}</h3>${dest.routes.map(r => h`<div class="mini-route"><strong>${r.name}</strong><span class="small muted">${r.days} days · ${r.km} km</span></div>`)}
          <h3>Campsites</h3><div class="map map-sm" id="itin-map"></div><ul class="small">${dest.campsites.map(c => h`<li>⛺ ${c.name}</li>`)}</ul></div>` : ''}
        <div class="card"><h3>Packing checklist</h3>${PACKING.map((p, i) => h`<label class="check"><input type="checkbox" data-pack="${i}" ${b.checklist[i] ? 'checked' : ''}> ${p}</label>`)}</div>
      </aside>
    </div>`);
  m.querySelector('#ics').onclick = () => App.downloadIcs(b, van);
  m.querySelector('#itin-form').onsubmit = (e) => {
    e.preventDefault();
    const d = App.formData(e.target);
    b.itinerary.forEach((day, i) => { day.title = d['title-' + i].trim(); day.notes = d['notes-' + i].trim(); });
    App.save(); App.toast('Itinerary saved', 'good');
  };
  m.querySelectorAll('[data-pack]').forEach(c => c.onchange = () => { b.checklist[c.dataset.pack] = c.checked; App.save(); });
  const sg = m.querySelector('#suggest');
  if (sg) sg.onclick = () => {
    const stops = [...dest.highlights, ...dest.attractions];
    b.itinerary.forEach((day, i) => {
      if (day.title) return;
      day.title = i === 0 ? `Pickup in ${van.pickup.city}` : i === b.itinerary.length - 1 ? `Head back to ${van.pickup.city}` : stops[(i - 1) % stops.length];
      day.notes = day.notes || (dest.campsites[i % dest.campsites.length] ? 'Overnight: ' + dest.campsites[i % dest.campsites.length].name : '');
    });
    App.save(); App._keepScroll = true; App.render(); App.toast('Suggestions added — edit anything you like.', 'good');
  };
  if (dest) App.mountMap(m.querySelector('#itin-map'), dest.campsites.map(c => ({ lat: c.lat, lng: c.lng, label: '⛺', kind: 'camp', html: h`<strong>${c.name}</strong>` })));
};

/* ---------- Saved ---------- */
const savedTab = (m, me) => {
  const vans = me.savedVans.map(App.get.van).filter(v => v && v.status === 'published');
  m.innerHTML = String(h`<h1>Saved vans</h1>${vans.length ? h`<div class="van-grid">${vans.map(v => App.vanCard(v))}</div>` : App.emptyState('♡', 'Nothing saved yet', 'Tap the heart on any van to save it for later.', h`<a class="btn btn-primary" href="#/search">Browse vans</a>`)}`);
  m.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => setTimeout(() => { App._keepScroll = true; App.render(); }, 50)));
};

/* ---------- Payments ---------- */
const paymentsTab = (m, me) => {
  const tx = App.db.transactions.filter(t => t.customerId === me.id && t.type !== 'payout');
  const held = App.db.bookings.filter(b => b.customerId === me.id && b.depositStatus === 'held');
  m.innerHTML = String(h`<h1>Payments</h1>
    ${held.length ? h`<div class="callout">🔒 Deposits currently held: ${held.map(b => h`<strong>${money(b.pricing.deposit)}</strong> for ${b.id} `)}— released within ${App.C.depositReleaseDays} days of return.</div>` : ''}
    <div class="card"><h2>Saved payment methods</h2><p class="muted small">Cards are tokenised by our payment gateway; we only keep the brand and last 4 digits.</p>
      <ul class="plain"><li>💳 Visa •• 4242 <span class="badge badge-muted">default</span></li><li>📱 UPI · ${me.email.split('@')[0]}@okbank</li></ul></div>
    <h2 class="section-sub">Transaction history</h2>
    ${tx.length ? h`<div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Booking</th><th>Type</th><th>Method</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>
      ${tx.map(t => h`<tr><td>${fmtDate(t.at)}</td><td>${t.bookingId}</td><td>${t.type}</td><td>${t.method || '—'}</td><td class="num ${t.type === 'refund' ? 'good' : ''}">${t.type === 'refund' ? '+' : ''}${money(t.amount)}</td><td>${App.pill(t.status)}</td><td><button class="link" data-receipt="${t.bookingId}">Receipt</button></td></tr>`)}
    </tbody></table></div>` : App.emptyState('💳', 'No payments yet', '')}`);
  m.querySelectorAll('[data-receipt]').forEach(b => b.onclick = () => App.receipt(b.dataset.receipt));
};

/* ---------- Reviews ---------- */
const reviewsTab = (m, me, mine) => {
  const pending = mine.filter(b => b.status === 'completed' && !App.db.reviews.some(r => r.bookingId === b.id));
  const written = App.db.reviews.filter(r => r.authorId === me.id);
  m.innerHTML = String(h`<h1>Reviews</h1>
    ${pending.length ? h`<h2 class="section-sub">Waiting for your review</h2><div class="trip-list">${pending.map(tripCard)}</div>` : ''}
    <h2 class="section-sub">Reviews you’ve written</h2>
    ${written.length ? written.map(r => h`<article class="review card"><img class="thumb" src="${photo(App.get.van(r.vanId).photos[0], 200)}" alt=""><div><strong>${App.get.van(r.vanId).name}</strong> ${App.pill(r.status)}<div class="small muted">${fmtDate(r.createdAt)} · ${'★'.repeat(r.rating)}</div><p>${r.text}</p>${r.ownerReply ? h`<div class="reply"><strong>Owner replied</strong><p>${r.ownerReply}</p></div>` : ''}</div></article>`)
      : h`<p class="muted">You haven’t written any reviews yet.</p>`}`);
  bindTripActions(m);
};

/* ---------- Profile & privacy ---------- */
const profileTab = (m, me) => {
  m.innerHTML = String(h`<h1>Profile & privacy</h1>
    <form class="card" id="profile-form"><h2>Personal details</h2>
      <div class="grid-2"><label class="field"><span>Full name</span><input name="name" value="${me.name}" required></label>
      <label class="field"><span>City</span><input name="city" value="${me.city || ''}"></label></div>
      <button class="btn btn-primary">Save changes</button></form>
    <div class="card"><h2>Verification</h2><div id="otp"></div></div>
    <form class="card" id="pw-form"><h2>Change password</h2>
      <div class="grid-2"><label class="field"><span>Current password</span><input type="password" name="old" autocomplete="current-password" required></label>
      <label class="field"><span>New password</span><input type="password" name="new" autocomplete="new-password" minlength="8" required></label></div>
      <button class="btn">Update password</button></form>
    <div class="card"><h2>Notifications</h2>
      ${[['email', 'Booking updates by email', true], ['sms', 'Trip reminders by SMS', true], ['marketing', 'Trip ideas & offers', false]].map(([k, l, d]) => h`<label class="check"><input type="checkbox" data-pref="${k}" ${(me.prefs?.[k] ?? d) ? 'checked' : ''}> ${l}</label>`)}</div>
    <div class="card"><h2>Your data</h2><p class="small muted">Download a copy of everything we hold about you, or ask us to delete your account.</p>
      <div class="row gap wrap"><button class="btn" id="export">⬇ Download my data</button><button class="btn btn-danger" id="delete">Request account deletion</button></div></div>`);
  m.querySelector('#profile-form').onsubmit = (e) => { e.preventDefault(); const d = App.formData(e.target); me.name = d.name.trim() || me.name; me.city = d.city.trim(); App.save(); App.renderHeader(); App.toast('Profile updated', 'good'); };
  m.querySelector('#pw-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = App.formData(e.target);
    if (d.new.length < 8 || !/\d/.test(d.new) || !/[a-z]/i.test(d.new)) return App.toast('New password needs 8+ characters with a letter and a number.', 'bad');
    if (App.serverOnline) {
      try { await App.server('POST', '/api/auth/password', { oldPassword: d.old, newPassword: d.new }); }
      catch (err) { return App.toast(err.message, 'bad'); }
    } else {
      if (App.hashPassword(d.old) !== me.password) return App.toast('Current password is incorrect.', 'bad');
      me.password = App.hashPassword(d.new);
    }
    App.audit('user.password_change', me.email); App.save(); e.target.reset(); App.toast('Password updated. Other devices were signed out.', 'good');
  };
  m.querySelectorAll('[data-pref]').forEach(c => c.onchange = () => { me.prefs = { ...(me.prefs || {}), [c.dataset.pref]: c.checked }; App.save(); App.toast('Preferences saved', 'good'); });
  App.otpWidget(m.querySelector('#otp'), me);
  m.querySelector('#export').onclick = () => {
    const { password, ...profile } = me;
    const data = { profile, bookings: App.db.bookings.filter(b => b.customerId === me.id), reviews: App.db.reviews.filter(r => r.authorId === me.id), messages: App.db.threads.filter(t => t.customerId === me.id || t.ownerId === me.id), exportedAt: new Date().toISOString() };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    a.download = 'vanyatra-my-data.json'; a.click();
    App.audit('user.data_export', me.email); App.save();
  };
  m.querySelector('#delete').onclick = async () => {
    const active = App.db.bookings.some(b => (b.customerId === me.id || b.ownerId === me.id) && ['confirmed', 'requested'].includes(b.status));
    if (active) return App.modal({ title: 'You have active bookings', body: h`<p>Please complete or cancel your upcoming bookings before deleting your account.</p>` });
    if (!(await App.confirm('Delete your account?', 'Your profile will be deleted within 30 days. Booking and tax records are kept as required by law. You will be signed out now.', 'Request deletion', true))) return;
    me.status = 'deletion_requested'; App.audit('user.deletion_request', me.email); await App.api.logout(); App.toast('Deletion requested. We’ve emailed you a confirmation.'); App.go('#/');
  };
};

/* ---------- Messaging (shared by customer + owner) ---------- */
App.messagesView = (m, role, activeId) => {
  const me = App.me();
  const threads = App.db.threads.filter(t => (role === 'customer' ? t.customerId : t.ownerId) === me.id)
    .sort((a, b) => (b.messages.at(-1)?.at || '').localeCompare(a.messages.at(-1)?.at || ''));
  const active = App.get.thread(activeId) || (window.innerWidth > 800 ? threads[0] : null);
  const base = role === 'customer' ? '#/account/messages/' : '#/owner/messages/';
  const other = (t) => App.get.user(role === 'customer' ? t.ownerId : t.customerId);
  m.innerHTML = String(h`<h1>Messages</h1>
    ${threads.length ? h`<div class="inbox ${active ? 'has-active' : ''}">
      <ul class="thread-list">${threads.map(t => { const o = other(t); const last = t.messages.at(-1); return h`<li><a href="${base}${t.id}" class="${active && active.id === t.id ? 'active' : ''}">${App.avatar(o, 40)}<div><strong>${o.name}</strong><span class="small muted">${App.get.van(t.vanId).name}</span><span class="small ellipsis">${last ? last.text : 'No messages yet'}</span></div></a></li>`; })}</ul>
      ${active ? (() => {
        const o = other(active);
        const b = active.bookingId && App.get.booking(active.bookingId);
        const confirmed = b && ['confirmed', 'completed'].includes(b.status);
        return h`<section class="chat">
          <header class="chat-head"><a href="${base}" class="back-link only-sm">←</a>${App.avatar(o, 36)}<div><strong>${o.name}</strong><div class="small muted">${App.get.van(active.vanId).name}${b ? h` · ${b.id} ${App.pill(b.status)}` : ''}</div></div></header>
          <div class="chat-body" id="chat-body">${active.messages.length ? active.messages.map(msg => h`<div class="msg ${msg.from === me.id ? 'me' : ''}"><p>${msg.text}</p><time class="small muted">${App.fmtDateTime(msg.at)}</time></div>`) : h`<p class="muted center">Say hello and ask anything about the van or route.</p>`}</div>
          ${!confirmed ? h`<p class="chat-note small">🔒 For your safety, phone numbers, emails and links are hidden until a booking is confirmed. Always pay through VanYatra.</p>` : ''}
          <form class="chat-form" id="chat-form"><label class="sr-only" for="chat-input">Message</label><textarea id="chat-input" rows="2" maxlength="2000" placeholder="Write a message…" required></textarea><button class="btn btn-primary">Send</button></form>
        </section>`;
      })() : ''}
    </div>` : App.emptyState('💬', 'No messages yet', role === 'customer' ? 'Message an owner from any van page to ask questions before booking.' : 'Traveller questions will appear here.')}`);
  const body = m.querySelector('#chat-body');
  if (body) body.scrollTop = body.scrollHeight;
  const form = m.querySelector('#chat-form');
  if (form) {
    const input = form.querySelector('#chat-input');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.onsubmit = (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const r = App.api.sendMessage(active.id, text);
      if (r.hidden) App.toast('Contact details were hidden for your safety.', 'info');
      App._keepScroll = true;
      App.go(base + active.id);
    };
  }
};
})();
