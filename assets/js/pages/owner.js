/*
 * Van owner dashboard.
 */
(() => {
const { h, money, photo, fmtDate } = App;

App.occupancy = (vanIds, fromIso, toIso) => {
  const days = App.nightsBetween(fromIso, toIso) * vanIds.length;
  if (!days) return 0;
  let booked = 0;
  App.db.bookings.filter(b => vanIds.includes(b.vanId) && ['confirmed', 'completed'].includes(b.status)).forEach(b => {
    const s = b.start > fromIso ? b.start : fromIso, e = b.end < toIso ? b.end : toIso;
    if (e > s) booked += App.nightsBetween(s, e);
  });
  return booked / days;
};
App.monthly = (items, dateKey, valFn, months = 6) => {
  const out = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    out.push({ label: d.toLocaleDateString('en', { month: 'short' }), value: items.filter(x => String(x[dateKey]).startsWith(key)).reduce((s, x) => s + valFn(x), 0) });
  }
  return out;
};
const compact = (v) => v >= 100000 ? '₹' + (v / 100000).toFixed(1) + 'L' : v >= 1000 ? '₹' + Math.round(v / 1000) + 'k' : '₹' + v;

App.pages.owner = (el, { tab = 'overview', id }) => {
  const me = App.me();
  const vans = App.db.vans.filter(v => v.ownerId === me.id);
  const vanIds = vans.map(v => v.id);
  const bookings = App.db.bookings.filter(b => vanIds.includes(b.vanId));
  const docs = App.db.documents.filter(d => d.ownerId === me.id);
  const docAlerts = docs.filter(d => ['action_required', 'rejected'].includes(d.status) || (App.docExpiryState(d)?.tone === 'warn') || (App.docExpiryState(d)?.tone === 'bad'));
  const requests = bookings.filter(b => b.status === 'requested');
  const unread = App.db.threads.filter(t => t.ownerId === me.id && t.messages.length && t.messages.at(-1).from !== me.id).length;
  const main = App.dashLayout(el, {
    title: 'Owner dashboard', subtitle: me.business || me.name, base: '#/owner', active: tab === 'overview' ? 'overview' : tab,
    nav: [
      { id: 'overview', icon: '🏠', label: 'Overview' },
      { id: 'vans', icon: '🚐', label: 'My vans', count: vans.length },
      { id: 'bookings', icon: '📋', label: 'Bookings', count: requests.length },
      { id: 'calendar', icon: '📅', label: 'Calendar & pricing' },
      { id: 'earnings', icon: '💰', label: 'Earnings & payouts' },
      { id: 'messages', icon: '💬', label: 'Messages', count: unread },
      { id: 'reviews', icon: '★', label: 'Reviews' },
      { id: 'documents', icon: '📄', label: 'Documents', count: docAlerts.length },
      { id: 'analytics', icon: '📈', label: 'Analytics' }
    ]
  });
  const ctx = { me, vans, vanIds, bookings, docs, docAlerts, requests, id };
  const views = { overview, vans: id ? vanEditor : vansTab, bookings: bookingsTab, calendar: calendarTab, earnings, messages: (m) => App.messagesView(m, 'owner', id), reviews: reviewsTab, documents: documentsTab, analytics };
  (views[tab] || overview)(main, ctx);
};

/* ---------- Overview ---------- */
const overview = (m, { me, vans, vanIds, bookings, docAlerts, requests }) => {
  const today = App.today();
  const monthKey = today.slice(0, 7);
  const payouts = App.db.transactions.filter(t => t.ownerId === me.id && t.type === 'payout');
  const earnedMonth = payouts.filter(t => t.at.startsWith(monthKey)).reduce((s, t) => s + t.amount, 0);
  const upcoming = bookings.filter(b => b.status === 'confirmed' && b.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const pendingPayout = upcoming.reduce((s, b) => s + b.pricing.ownerPayout, 0);
  const occ = App.occupancy(vanIds.filter(id => App.get.van(id).status === 'published'), App.addDays(today, -30), today);
  const rs = App.db.reviews.filter(r => vanIds.includes(r.vanId) && r.status === 'published');
  const avg = rs.length ? rs.reduce((s, r) => s + r.rating, 0) / rs.length : 0;
  const onboardingIncomplete = !App.get.ownerVerified(me.id) || vans.some(v => ['draft', 'in_review'].includes(v.status));
  m.innerHTML = String(h`
    <h1>Welcome back, ${me.name.split(' ')[0]}</h1>
    ${onboardingIncomplete ? h`<div class="alert alert-warn row-between wrap"><span>🪪 ${!vans.length ? 'Finish onboarding to list your first van.' : 'Some verification steps are still in progress.'}</span><a class="btn btn-sm" href="#/owner/onboarding">Continue onboarding</a></div>` : ''}
    <div class="kpis">
      <div class="kpi"><span>Earned this month</span><strong>${money(earnedMonth)}</strong></div>
      <div class="kpi"><span>Upcoming payouts</span><strong>${money(pendingPayout)}</strong><small>${App.plural(upcoming.length, 'trip')}</small></div>
      <div class="kpi"><span>Occupancy (30 days)</span><strong>${Math.round(occ * 100)}%</strong></div>
      <div class="kpi"><span>Average rating</span><strong>${avg ? '★ ' + avg.toFixed(2) : '—'}</strong><small>${App.plural(rs.length, 'review')}</small></div>
    </div>
    <div class="grid-2 align-start">
      <section class="card"><h2>Needs your attention</h2>
        ${!requests.length && !docAlerts.length ? h`<p class="muted">All clear — nothing needs action. 🎉</p>` : ''}
        <ul class="alert-list">
          ${requests.map(b => h`<li><span class="badge badge-warn">Request</span> <span>${App.get.user(b.customerId).name} · ${App.get.van(b.vanId).name} · ${fmtDate(b.start)}</span><a href="#/owner/bookings" class="link">Respond</a></li>`)}
          ${docAlerts.map(d => { const ex = App.docExpiryState(d); return h`<li><span class="badge badge-${d.status === 'verified' ? ex.tone : App.VERIFICATION_STATUS[d.status].tone}">${d.status === 'verified' ? ex.label : App.VERIFICATION_STATUS[d.status].label}</span> <span>${d.label}${d.vanId ? ' · ' + App.get.van(d.vanId).name : ''}</span><a href="#/owner/documents" class="link">Update</a></li>`; })}
        </ul>
      </section>
      <section class="card"><h2>Upcoming trips</h2>
        ${upcoming.length ? h`<ul class="plain list-rows">${upcoming.slice(0, 5).map(b => h`<li><div><strong>${App.get.user(b.customerId).name}</strong><div class="small muted">${App.get.van(b.vanId).name} · ${fmtDate(b.start)} → ${fmtDate(b.end)}</div></div><span>${money(b.pricing.ownerPayout)}</span></li>`)}</ul>` : h`<p class="muted">No upcoming trips.</p>`}
        <a class="link-arrow" href="#/owner/bookings">All bookings →</a>
      </section>
    </div>
    <section class="card"><h2>Payouts, last 6 months</h2>${App.barChart(App.monthly(payouts, 'at', t => t.amount), { format: compact, label: 'Monthly payouts' })}</section>`);
};

/* ---------- Vans ---------- */
const vansTab = (m, { vans }) => {
  m.innerHTML = String(h`<div class="row-between wrap"><h1>My vans</h1><a class="btn btn-primary" href="#/owner/onboarding?van=new">＋ Add a van</a></div>
    ${vans.length ? h`<div class="owner-vans">${vans.map(v => {
      const steps = App.ONBOARDING_STEPS.map(s => App.stepStatus(s, v.ownerId, v));
      const r = App.get.rating(v.id);
      return h`<article class="owner-van card">
        <img src="${photo(v.photos[0], 400)}" alt="">
        <div class="ov-body">
          <div class="row-between"><h3>${v.name || 'Untitled van'}</h3>${App.pill(v.status)}</div>
          <p class="small muted">${v.type} · ${v.pickup.city || '—'} · ${money(v.pricePerNight)}/night · ${r.count ? '★ ' + r.avg.toFixed(1) : 'no reviews'}</p>
          <div class="mini-steps" aria-label="Verification progress">${steps.map((s, i) => h`<span class="ms ms-${s}" title="${App.ONBOARDING_STEPS[i].title}: ${App.VERIFICATION_STATUS[s].label}"></span>`)}</div>
          <div class="row gap wrap">
            <a class="btn btn-sm" href="#/owner/vans/${v.id}">Manage</a>
            <a class="btn btn-sm btn-ghost" href="#/vans/${v.id}">Preview</a>
            <a class="btn btn-sm btn-ghost" href="#/owner/onboarding?van=${v.id}">Verification</a>
            ${v.status === 'published' ? h`<button class="btn btn-sm btn-ghost" data-pause="${v.id}">Pause</button>` : v.status === 'paused' ? h`<button class="btn btn-sm btn-ghost" data-resume="${v.id}">Resume</button>` : ''}
          </div>
        </div></article>`;
    })}</div>` : App.emptyState('🚐', 'No vans yet', 'Add your first van to start earning.', h`<a class="btn btn-primary" href="#/owner/onboarding?van=new">Add a van</a>`)}`);
  m.querySelectorAll('[data-pause]').forEach(b => b.onclick = async () => {
    if (!(await App.confirm('Pause listing?', 'Travellers won’t be able to find or book this van. Existing bookings are not affected.', 'Pause'))) return;
    App.get.van(b.dataset.pause).status = 'paused'; App.save(); App.render();
  });
  m.querySelectorAll('[data-resume]').forEach(b => b.onclick = () => { App.get.van(b.dataset.resume).status = 'published'; App.save(); App.toast('Listing is live again', 'good'); App.render(); });
};

const vanEditor = (m, { me, id }) => {
  const van = App.get.van(id);
  if (!van || van.ownerId !== me.id) { m.innerHTML = String(App.emptyState('🚐', 'Van not found', '')); return; }
  m.innerHTML = String(h`<a class="back-link" href="#/owner/vans">← My vans</a>
    <div class="row-between wrap"><h1>${van.name}</h1>${App.pill(van.status)}</div>
    <div class="grid-2 align-start">
      <form class="card" id="price-form"><h2>Pricing & rules</h2>
        <div class="grid-2">
          <label class="field"><span>Nightly price</span><input type="number" name="pricePerNight" min="1000" step="100" value="${van.pricePerNight}" required></label>
          <label class="field"><span>Fri & Sat price</span><input type="number" name="weekendPrice" min="1000" step="100" value="${van.weekendPrice}"></label>
          <label class="field"><span>Cleaning fee</span><input type="number" name="cleaningFee" min="0" step="100" value="${van.cleaningFee}"></label>
          <label class="field"><span>Security deposit</span><input type="number" name="deposit" min="0" step="500" value="${van.deposit}"></label>
          <label class="field"><span>Weekly discount %</span><input type="number" name="weekly" min="0" max="50" value="${van.discounts.weekly}"></label>
          <label class="field"><span>Monthly discount %</span><input type="number" name="monthly" min="0" max="60" value="${van.discounts.monthly}"></label>
          <label class="field"><span>Minimum nights</span><input type="number" name="minNights" min="1" max="14" value="${van.minNights}"></label>
          <label class="field"><span>Cancellation</span><select name="cancellation">${Object.entries(App.CANCELLATION_POLICIES).map(([k, p]) => h`<option value="${k}" ${van.cancellation === k ? 'selected' : ''}>${p.label}</option>`)}</select></label>
        </div>
        <label class="check"><input type="checkbox" name="instantBook" ${van.instantBook ? 'checked' : ''}> Instant book</label>
        <p class="small muted" id="price-preview"></p>
        <button class="btn btn-primary">Save pricing</button>
      </form>
      <section class="card"><h2>Listing content</h2>
        <p class="small muted">Edit photos, specs, amenities, description and pickup details.</p>
        <div class="photo-strip small">${van.photos.slice(0, 4).map(p => h`<img src="${photo(p, 200)}" alt="">`)}</div>
        <div class="stack"><a class="btn btn-ghost" href="#/owner/onboarding?van=${van.id}&step=8">📷 Photos & specifications</a><a class="btn btn-ghost" href="#/owner/onboarding?van=${van.id}&step=9">🧰 Amenities, description & pickup</a><a class="btn btn-ghost" href="#/owner/calendar?van=${van.id}">📅 Availability calendar</a><a class="btn btn-ghost" href="#/owner/documents">📄 Documents</a></div>
      </section>
    </div>`);
  const f = m.querySelector('#price-form');
  const preview = () => {
    const d = App.formData(f);
    const t = { ...van, pricePerNight: +d.pricePerNight, weekendPrice: +d.weekendPrice, cleaningFee: +d.cleaningFee, discounts: { weekly: +d.weekly, monthly: +d.monthly } };
    const q = App.quote(t, App.addDays(App.today(), 30), App.addDays(App.today(), 37));
    m.querySelector('#price-preview').textContent = `Example 7-night trip: traveller pays ${money(q.total)}, you receive ${money(q.ownerPayout)} after ${Math.round(App.C.ownerCommissionRate * 100)}% commission.`;
  };
  f.oninput = preview; preview();
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!f.checkValidity()) return f.reportValidity();
    const d = App.formData(f);
    Object.assign(van, { pricePerNight: +d.pricePerNight, weekendPrice: +d.weekendPrice || +d.pricePerNight, cleaningFee: +d.cleaningFee, deposit: +d.deposit, discounts: { weekly: +d.weekly, monthly: +d.monthly }, minNights: +d.minNights, cancellation: d.cancellation, instantBook: !!d.instantBook });
    App.save(); App.toast('Pricing saved', 'good');
  };
};

/* ---------- Bookings ---------- */
const bookingsTab = (m, { bookings }) => {
  const today = App.today();
  const groups = {
    requests: ['Requests', bookings.filter(b => b.status === 'requested')],
    upcoming: ['Upcoming', bookings.filter(b => b.status === 'confirmed' && b.end >= today).sort((a, b) => a.start.localeCompare(b.start))],
    past: ['Past', bookings.filter(b => b.status === 'completed').sort((a, b) => b.start.localeCompare(a.start))],
    cancelled: ['Cancelled / declined', bookings.filter(b => ['cancelled', 'declined'].includes(b.status))]
  };
  let active = groups.requests[1].length ? 'requests' : 'upcoming';
  const draw = () => {
    const list = groups[active][1];
    m.innerHTML = String(h`<h1>Bookings</h1>
      <div class="tabs" role="tablist">${Object.entries(groups).map(([k, [l, arr]]) => h`<button role="tab" aria-selected="${k === active}" class="${k === active ? 'on' : ''}" data-tab="${k}">${l} <span class="count">${arr.length}</span></button>`)}</div>
      ${list.length ? h`<div class="table-wrap"><table class="table"><thead><tr><th>Booking</th><th>Traveller</th><th>Van</th><th>Dates</th><th class="num">Your payout</th><th>Status</th><th></th></tr></thead><tbody>
        ${list.slice(0, 60).map(b => { const c = App.get.user(b.customerId); return h`<tr>
          <td>${b.id}${b.risk?.score >= 50 ? h`<br><span class="badge badge-serious" title="${b.risk.flags.join('; ')}">⚠ Risk ${b.risk.score}</span>` : ''}</td>
          <td>${c.name}<br><span class="small muted">${c.phoneVerified ? '✓ phone verified' : 'phone unverified'} · ${b.travelers} guests</span></td>
          <td>${App.get.van(b.vanId).name}</td>
          <td>${fmtDate(b.start)} → ${fmtDate(b.end)}<br><span class="small muted">${App.plural(b.nights, 'night')}</span></td>
          <td class="num">${money(b.pricing.ownerPayout)}</td>
          <td>${App.pill(b.status)}</td>
          <td class="actions">${b.status === 'requested' ? h`<button class="btn btn-sm btn-primary" data-accept="${b.id}">Accept</button><button class="btn btn-sm btn-ghost" data-decline="${b.id}">Decline</button>`
            : b.status === 'confirmed' ? h`<button class="btn btn-sm btn-ghost danger-text" data-ocancel="${b.id}">Cancel</button>` : ''}</td></tr>`; })}
      </tbody></table></div>` : App.emptyState('📋', 'Nothing here', 'Bookings will appear here.')}`);
    m.querySelectorAll('[data-tab]').forEach(t => t.onclick = () => { active = t.dataset.tab; draw(); });
    m.querySelectorAll('[data-accept]').forEach(b => b.onclick = async () => {
      const bk = App.get.booking(b.dataset.accept);
      const taken = App.unavailableDates(bk.vanId, bk.id);
      for (let d = bk.start; d < bk.end; d = App.addDays(d, 1)) if (taken.has(d)) return App.toast('These dates overlap another booking or blocked dates.', 'bad');
      if (!(await App.confirm('Accept booking ' + bk.id + '?', `The traveller will be charged ${money(bk.pricing.total)} and the dates will be blocked.`, 'Accept'))) return;
      App.api.respondToRequest(bk.id, true); App.toast('Booking accepted', 'good'); App.render();
    });
    m.querySelectorAll('[data-decline]').forEach(b => b.onclick = async () => {
      const reason = await App.prompt('Decline request', 'Reason (shared with the traveller)', 'e.g. van is in service those dates');
      if (!reason) return;
      App.api.respondToRequest(b.dataset.decline, false, reason); App.toast('Request declined'); App.render();
    });
    m.querySelectorAll('[data-ocancel]').forEach(b => b.onclick = async () => {
      const reason = await App.prompt('Cancel a confirmed booking?', 'Owner cancellations give the traveller a full refund and may affect your listing ranking. Reason:', '');
      if (!reason) return;
      App.api.cancelBooking(b.dataset.ocancel, 'owner', reason); App.toast('Booking cancelled — traveller fully refunded'); App.render();
    });
  };
  draw();
};

/* ---------- Calendar ---------- */
const calendarTab = (m, { vans }) => {
  const q = App.parseHash().query;
  const pub = vans.filter(v => v.status !== 'draft');
  if (!pub.length) { m.innerHTML = String(h`<h1>Calendar</h1>${App.emptyState('📅', 'No vans yet', 'Add a van first.')}`); return; }
  const van = App.get.van(q.van) || pub[0];
  m.innerHTML = String(h`<h1>Calendar & availability</h1>
    <div class="row gap wrap"><label class="field inline"><span>Van</span><select id="cal-van">${pub.map(v => h`<option value="${v.id}" ${v.id === van.id ? 'selected' : ''}>${v.name}</option>`)}</select></label>
    <span class="small muted">Click a date to block or unblock it. Booked dates can’t be changed.</span></div>
    <div class="grid-2 align-start">
      <div class="card" id="cal"></div>
      <div class="card"><h2>Blocked periods</h2><ul class="plain list-rows" id="blocked-list"></ul>
        <form id="block-form" class="stack"><h3>Block a range</h3><div class="grid-2"><label class="field"><span>From</span><input type="date" name="start" min="${App.today()}" required></label><label class="field"><span>To</span><input type="date" name="end" min="${App.today()}" required></label></div><label class="field"><span>Note</span><input name="note" placeholder="Service, personal use…"></label><button class="btn">Block dates</button></form>
        <h3>Seasonal pricing</h3><p class="small muted">Base ${money(van.pricePerNight)}/night, Fri–Sat ${money(van.weekendPrice)}. <a href="#/owner/vans/${van.id}">Edit pricing</a></p>
      </div>
    </div>`);
  m.querySelector('#cal-van').onchange = (e) => App.go('#/owner/calendar?van=' + e.target.value);
  const drawList = () => {
    m.querySelector('#blocked-list').innerHTML = String(van.blocked.length ? h`${van.blocked.map((r, i) => h`<li><span>${fmtDate(r.start)} → ${fmtDate(r.end)} <span class="small muted">${r.note || ''}</span></span><button class="link" data-unblock="${i}">Remove</button></li>`)}` : h`<li class="muted">No blocked dates.</li>`);
    m.querySelectorAll('[data-unblock]').forEach(b => b.onclick = () => { van.blocked.splice(+b.dataset.unblock, 1); App.save(); drawList(); cal.redraw(); });
  };
  const cal = App.calendar(m.querySelector('#cal'), {
    vanId: van.id, mode: 'block', months: 2,
    onChange: (d) => {
      const idx = van.blocked.findIndex(r => d >= r.start && d <= r.end);
      const bookedSet = App.unavailableDates(van.id);
      if (idx >= 0) {
        const r = van.blocked[idx];
        van.blocked.splice(idx, 1);
        if (r.start < d) van.blocked.push({ start: r.start, end: App.addDays(d, -1), note: r.note });
        if (r.end > d) van.blocked.push({ start: App.addDays(d, 1), end: r.end, note: r.note });
      } else if (bookedSet.has(d)) { App.toast('That date is booked by a traveller.', 'bad'); return; }
      else van.blocked.push({ start: d, end: d, note: 'Blocked' });
      van.blocked.sort((a, b) => a.start.localeCompare(b.start));
      App.save(); drawList();
    }
  });
  drawList();
  m.querySelector('#block-form').onsubmit = (e) => {
    e.preventDefault();
    const d = App.formData(e.target);
    if (d.end < d.start) return App.toast('End date must be after start date.', 'bad');
    if (!App.isAvailable(van.id, d.start, App.addDays(d.end, 1))) return App.toast('That range overlaps an existing booking or block.', 'bad');
    van.blocked.push({ start: d.start, end: d.end, note: d.note }); App.save(); e.target.reset(); drawList(); cal.redraw(); App.toast('Dates blocked', 'good');
  };
};

/* ---------- Earnings ---------- */
const earnings = (m, { me, bookings }) => {
  const tx = App.db.transactions.filter(t => t.ownerId === me.id && t.type === 'payout').sort((a, b) => b.at.localeCompare(a.at));
  const lifetime = tx.reduce((s, t) => s + t.amount, 0);
  const upcoming = bookings.filter(b => b.status === 'confirmed');
  const scheduled = upcoming.reduce((s, b) => s + b.pricing.ownerPayout, 0);
  const commission = bookings.filter(b => b.status === 'completed').reduce((s, b) => s + b.pricing.commission, 0);
  const payout = App.db.owners[me.id]?.payout;
  m.innerHTML = String(h`<h1>Earnings & payouts</h1>
    <div class="kpis">
      <div class="kpi"><span>Lifetime payouts</span><strong>${money(lifetime)}</strong></div>
      <div class="kpi"><span>Scheduled</span><strong>${money(scheduled)}</strong><small>${App.plural(upcoming.length, 'upcoming trip')}</small></div>
      <div class="kpi"><span>Platform commission paid</span><strong>${money(commission)}</strong><small>${Math.round(App.C.ownerCommissionRate * 100)}% of rental</small></div>
      <div class="kpi"><span>Payout account</span><strong class="small-strong">${payout?.data ? `${payout.data.bank} ••${payout.data.last4}` : 'Not set'}</strong>${App.statusBadge(payout?.status || 'not_started')}</div>
    </div>
    <section class="card"><h2>Payouts by month</h2>${App.barChart(App.monthly(tx, 'at', t => t.amount), { format: compact, label: 'Monthly payouts' })}</section>
    <section class="card"><div class="row-between"><h2>Transaction history</h2><button class="btn btn-sm btn-ghost" id="csv">⬇ Export CSV</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Date</th><th>Booking</th><th>Van</th><th class="num">Gross</th><th class="num">Commission</th><th class="num">Payout</th><th>Status</th></tr></thead><tbody>
      ${tx.slice(0, 50).map(t => { const b = App.get.booking(t.bookingId); return h`<tr><td>${fmtDate(t.at)}</td><td>${t.bookingId}</td><td>${b ? App.get.van(b.vanId).name : ''}</td><td class="num">${b ? money(b.pricing.rental + b.pricing.addOns + b.pricing.cleaning) : ''}</td><td class="num">${b ? '−' + money(b.pricing.commission) : ''}</td><td class="num"><strong>${money(t.amount)}</strong></td><td>${App.pill(t.status)}</td></tr>`; })}
      </tbody></table></div></section>`);
  m.querySelector('#csv').onclick = () => {
    const rows = [['date', 'booking', 'amount', 'status'], ...tx.map(t => [t.at.slice(0, 10), t.bookingId, t.amount, t.status])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'vanyatra-payouts.csv'; a.click();
  };
};

/* ---------- Reviews ---------- */
const reviewsTab = (m, { vanIds, me }) => {
  const rs = App.db.reviews.filter(r => vanIds.includes(r.vanId) && r.status !== 'removed').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  m.innerHTML = String(h`<h1>Reviews</h1>
    ${rs.length ? rs.slice(0, 40).map(r => { const a = App.get.user(r.authorId); return h`<article class="review card">${App.avatar(a, 40)}<div class="grow">
      <div class="row-between"><strong>${a.name} · ${App.get.van(r.vanId).name}</strong>${r.status !== 'published' ? App.pill(r.status) : ''}</div>
      <div class="small muted">${fmtDate(r.createdAt)} · ${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div><p>${r.text}</p>
      ${r.ownerReply ? h`<div class="reply"><strong>Your reply</strong><p>${r.ownerReply}</p></div>`
        : h`<form class="reply-form" data-reply="${r.id}"><label class="sr-only" for="rp-${r.id}">Reply</label><textarea id="rp-${r.id}" rows="2" placeholder="Write a public reply…" required maxlength="600"></textarea><div class="row gap"><button class="btn btn-sm btn-primary">Reply</button><button type="button" class="btn btn-sm btn-ghost" data-report="${r.id}">Report review</button></div></form>`}
    </div></article>`; }) : App.emptyState('★', 'No reviews yet', 'Reviews from completed trips will appear here.')}`);
  m.querySelectorAll('[data-reply]').forEach(f => f.onsubmit = (e) => { e.preventDefault(); const r = App.db.reviews.find(x => x.id === f.dataset.reply); r.ownerReply = f.querySelector('textarea').value.trim(); App.save(); App.toast('Reply posted', 'good'); App._keepScroll = true; App.render(); });
  m.querySelectorAll('[data-report]').forEach(b => b.onclick = async () => {
    const reason = await App.prompt('Report review', 'Why should our team review this?');
    if (!reason) return;
    const r = App.db.reviews.find(x => x.id === b.dataset.report);
    r.status = 'flagged'; r.flagReason = 'Reported by owner: ' + reason; App.save(); App.toast('Sent to moderation', 'good'); App.render();
  });
};

/* ---------- Documents ---------- */
const documentsTab = (m, { me, docs, vans }) => {
  const stepFor = (d) => d.type === 'insurance' ? 6 : d.type === 'inspection' ? 7 : d.type.startsWith('ownership') ? 4 : ['aadhaar', 'pan', 'selfie'].includes(d.type) ? 2 : 5;
  const groups = [['Identity (KYC)', docs.filter(d => !d.vanId)], ...vans.map(v => [v.name || 'Untitled van', docs.filter(d => d.vanId === v.id)])];
  m.innerHTML = String(h`<h1>Documents & verification</h1>
    <p class="muted">We’ll remind you ${App.C.expiryWarningDays} days before anything expires. Listings pause automatically if a required document lapses.</p>
    ${groups.filter(g => g[1].length).map(([title, list]) => h`<section class="card"><h2>${title}</h2>
      <div class="table-wrap"><table class="table"><thead><tr><th>Document</th><th>Number</th><th>Expiry</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map(d => { const ex = App.docExpiryState(d); return h`<tr><td>${d.label}<br><span class="small muted">${d.fileName || ''}</span>${d.note ? h`<div class="small error">${d.note}</div>` : ''}</td><td>${d.number || '—'}</td><td>${ex ? h`<span class="badge badge-${ex.tone}">${ex.label}</span>` : '—'}</td><td>${App.statusBadge(d.status)}</td>
        <td><a class="btn btn-sm ${['action_required', 'rejected'].includes(d.status) || (ex && ex.tone !== 'muted') ? 'btn-primary' : 'btn-ghost'}" href="#/owner/onboarding?${d.vanId ? 'van=' + d.vanId + '&' : ''}step=${stepFor(d)}">${d.status === 'verified' && ex?.tone === 'muted' ? 'View' : 'Update'}</a></td></tr>`; })}
      </tbody></table></div></section>`)}`);
};

/* ---------- Analytics ---------- */
const analytics = (m, { vans, vanIds, bookings }) => {
  const today = App.today(), from = App.addDays(today, -90);
  const rows = vans.filter(v => v.status !== 'draft').map(v => {
    const bs = bookings.filter(b => b.vanId === v.id && ['confirmed', 'completed'].includes(b.status));
    const recent = bs.filter(b => b.start >= from);
    const r = App.get.rating(v.id);
    return { v, bookings: recent.length, revenue: recent.reduce((s, b) => s + b.pricing.ownerPayout, 0), occ: App.occupancy([v.id], from, today), views: v.views || 0, conv: v.views ? bs.length / v.views : 0, rating: r.avg };
  });
  const completed = bookings.filter(b => ['completed', 'confirmed'].includes(b.status));
  const leadTimes = completed.map(b => App.nightsBetween(b.createdAt.slice(0, 10), b.start)).filter(n => n >= 0);
  m.innerHTML = String(h`<h1>Analytics</h1>
    <div class="kpis">
      <div class="kpi"><span>Bookings (90 days)</span><strong>${rows.reduce((s, r) => s + r.bookings, 0)}</strong></div>
      <div class="kpi"><span>Revenue (90 days)</span><strong>${money(rows.reduce((s, r) => s + r.revenue, 0))}</strong></div>
      <div class="kpi"><span>Occupancy (90 days)</span><strong>${Math.round(App.occupancy(vanIds, from, today) * 100)}%</strong></div>
      <div class="kpi"><span>Avg. booking lead time</span><strong>${leadTimes.length ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) + ' days' : '—'}</strong></div>
    </div>
    <section class="card"><h2>Bookings per month</h2>${App.barChart(App.monthly(completed, 'start', () => 1), { label: 'Bookings per month' })}</section>
    <section class="card"><h2>Listing performance</h2><div class="table-wrap"><table class="table"><thead><tr><th>Van</th><th class="num">Views</th><th class="num">Bookings (90d)</th><th class="num">Conversion</th><th class="num">Occupancy</th><th class="num">Revenue (90d)</th><th class="num">Rating</th></tr></thead><tbody>
      ${rows.map(r => h`<tr><td><a href="#/owner/vans/${r.v.id}">${r.v.name}</a></td><td class="num">${r.views.toLocaleString()}</td><td class="num">${r.bookings}</td><td class="num">${(r.conv * 100).toFixed(1)}%</td><td class="num">${Math.round(r.occ * 100)}%</td><td class="num">${money(r.revenue)}</td><td class="num">${r.rating ? r.rating.toFixed(1) : '—'}</td></tr>`)}
    </tbody></table></div>
    <p class="small muted">Tip: vans with instant book and 8+ photos convert about twice as often.</p></section>`);
};
})();
