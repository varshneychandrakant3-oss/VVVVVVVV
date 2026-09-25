/*
 * Booking flow: trip & extras → driver details → payment → confirmation.
 */
(() => {
const { h, money, photo, fmtDate } = App;

App.priceLines = (p, { deposit = true } = {}) => h`<dl class="price-lines">
  <div><dt>${money(p.avgNight)} × ${App.plural(p.nights, 'night')}</dt><dd>${money(p.base)}</dd></div>
  ${p.discount ? h`<div class="good"><dt>${p.discountPct}% long-stay discount</dt><dd>−${money(p.discount)}</dd></div>` : ''}
  ${p.addOns ? h`<div><dt>Extras</dt><dd>${money(p.addOns)}</dd></div>` : ''}
  <div><dt>Cleaning fee</dt><dd>${money(p.cleaning)}</dd></div>
  <div><dt>Service fee</dt><dd>${money(p.service)}</dd></div>
  <div><dt>${App.C.taxLabel} (${Math.round(App.C.taxRate * 100)}%)</dt><dd>${money(p.tax)}</dd></div>
  <div class="total"><dt>Total</dt><dd>${money(p.total)}</dd></div>
  ${deposit ? h`<div class="muted"><dt>Security deposit — held, not charged</dt><dd>${money(p.deposit)}</dd></div>` : ''}
</dl>`;

App.pages.book = (el, { id }, q) => {
  const van = App.get.van(id);
  const me = App.me();
  if (!van || van.status !== 'published') return App.pages.notFound(el);
  if (!q.start || !q.end || q.end <= q.start) return App.go('#/vans/' + id);
  if (me.id === van.ownerId) { el.innerHTML = String(App.emptyState('🚐', 'You own this van', 'Owners can block dates from the dashboard instead of booking.', h`<a class="btn" href="#/owner/calendar">Open calendar</a>`)); return; }
  const s = {
    step: 1, start: q.start, end: q.end, adults: +q.adults || 2, children: +q.children || 0, addOns: [],
    driver: { name: me.name, age: '', licence: '', phone: me.phone || '' }, specialRequests: '', payMethod: 'upi', agree: false, paid: null
  };
  const steps = ['Trip & extras', 'Driver details', 'Payment'];
  const draw = () => {
    const addOns = App.ADD_ONS.filter(a => s.addOns.includes(a.id));
    const qte = App.quote(van, s.start, s.end, { addOns });
    const available = App.isAvailable(van.id, s.start, s.end);
    el.innerHTML = String(h`
    <div class="container book-page">
      <a href="#/vans/${van.id}?start=${s.start}&end=${s.end}" class="back-link">← Back to van</a>
      <h1>${van.instantBook ? 'Confirm and pay' : 'Request to book'}</h1>
      <ol class="stepper" aria-label="Booking steps">${steps.map((t, i) => h`<li class="${i + 1 < s.step ? 'done' : i + 1 === s.step ? 'current' : ''}" ${i + 1 === s.step ? h`aria-current="step"` : ''}><span>${i + 1 < s.step ? '✓' : i + 1}</span>${t}</li>`)}</ol>
      ${!available ? h`<div class="alert alert-bad">These dates are no longer available. <a href="#/vans/${van.id}">Choose new dates</a></div>` : ''}
      <div class="book-layout">
        <form class="book-main card" id="book-form" novalidate>${stepBody(qte)}</form>
        <aside class="book-summary card">
          <div class="bs-van"><img src="${photo(van.photos[0], 400)}" alt=""><div><strong>${van.name}</strong><div class="small muted">${van.type} · ${van.pickup.city}</div>${App.stars(App.get.rating(van.id).avg, App.get.rating(van.id).count)}</div></div>
          <dl class="trip-lines">
            <div><dt>Dates</dt><dd>${fmtDate(s.start)} → ${fmtDate(s.end)}<br><span class="small muted">Pickup ${van.pickup.time} · return by ${van.pickup.returnTime}</span></dd></div>
            <div><dt>Travellers</dt><dd>${App.plural(s.adults, 'adult')}${s.children ? ', ' + App.plural(s.children, 'child').replace('childs', 'children') : ''}</dd></div>
            <div><dt>Cancellation</dt><dd>${App.CANCELLATION_POLICIES[van.cancellation].label}: ${App.CANCELLATION_POLICIES[van.cancellation].summary}</dd></div>
          </dl>
          ${App.priceLines(qte)}
          <p class="small muted">🔒 Payments are processed by a PCI-DSS compliant gateway. VanYatra never sees or stores your full card number.</p>
        </aside>
      </div>
    </div>`);
    bind(qte);
  };

  const stepBody = (qte) => {
    if (s.step === 1) return h`
      <h2>Your trip</h2>
      <div class="grid-2">
        <label class="field"><span>Pickup</span><input type="date" name="start" value="${s.start}" min="${App.today()}" required></label>
        <label class="field"><span>Return</span><input type="date" name="end" value="${s.end}" min="${App.addDays(s.start, 1)}" required></label>
        <label class="field"><span>Adults</span><input type="number" name="adults" min="1" max="${van.sleeps}" value="${s.adults}"></label>
        <label class="field"><span>Children (under 12)</span><input type="number" name="children" min="0" max="${van.sleeps - 1}" value="${s.children}"></label>
      </div>
      <h2>Add extras</h2>
      <div class="addon-list">${App.ADD_ONS.map(a => h`<label class="addon ${s.addOns.includes(a.id) ? 'on' : ''}"><input type="checkbox" name="addOns" value="${a.id}" ${s.addOns.includes(a.id) ? 'checked' : ''}><span><strong>${a.label}</strong><span class="muted small">${money(a.price)}${a.perNight ? ' / night' : ' per trip'}</span></span></label>`)}</div>
      <div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">Continue</button></div>`;
    if (s.step === 2) return h`
      <h2>Main driver</h2>
      <p class="muted small">The main driver must be at least ${App.C.minDriverAge}, hold a valid licence for 2+ years and present it at pickup. Only the last 4 characters of the licence are stored.</p>
      <div class="grid-2">
        <label class="field"><span>Full name (as on licence)</span><input name="name" autocomplete="name" value="${s.driver.name}" required></label>
        <label class="field"><span>Age</span><input type="number" name="age" min="18" max="90" value="${s.driver.age}" required></label>
        <label class="field"><span>Driving licence number</span><input name="licence" autocomplete="off" value="${s.driver.licence}" placeholder="e.g. DL-0420110012345" required pattern="[A-Za-z0-9 \\-]{8,20}"></label>
        <label class="field"><span>Mobile number</span><input type="tel" name="phone" autocomplete="tel" value="${s.driver.phone}" required></label>
      </div>
      <label class="field"><span>Message to the owner (optional)</span><textarea name="specialRequests" rows="3" placeholder="Who's coming, your route, any questions…">${s.specialRequests}</textarea></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button class="btn btn-primary btn-lg" type="submit">Continue to payment</button></div>`;
    return h`
      <h2>Payment</h2>
      <div class="pay-methods" role="radiogroup" aria-label="Payment method">
        ${[['upi', 'UPI', 'GPay, PhonePe, Paytm, BHIM'], ['card', 'Credit / debit card', 'Visa, Mastercard, RuPay, Amex'], ['netbanking', 'Net banking', 'All major Indian banks']].map(([v, l, d]) => h`<label class="pay-opt ${s.payMethod === v ? 'on' : ''}"><input type="radio" name="payMethod" value="${v}" ${s.payMethod === v ? 'checked' : ''}><span><strong>${l}</strong><span class="small muted">${d}</span></span></label>`)}
      </div>
      <div class="callout">
        ${van.instantBook ? h`You’ll pay <strong>${money(qte.total)}</strong> now. The ${money(qte.deposit)} deposit is authorised (held) at pickup and released within ${App.C.depositReleaseDays} days of return.`
          : h`We’ll <strong>authorise ${money(qte.total)}</strong> now but only charge it if ${App.get.user(van.ownerId).name.split(' ')[0]} accepts within 24 hours.`}
      </div>
      <label class="check"><input type="checkbox" name="agree" ${s.agree ? 'checked' : ''} required> I agree to the <a href="#/help/terms" target="_blank">rental terms</a>, <a href="#/help/cancellation" target="_blank">cancellation policy</a> and the owner’s house rules.</label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button class="btn btn-accent btn-lg" type="submit">🔒 ${van.instantBook ? 'Pay ' + money(qte.total) : 'Send request'}</button></div>`;
  };

  const bind = (qte) => {
    const f = el.querySelector('#book-form');
    const back = f.querySelector('[data-back]');
    if (back) back.onclick = () => { s.step--; draw(); };
    if (s.step === 1) f.addEventListener('change', () => {
      const d = App.formData(f);
      s.start = d.start; s.end = d.end > d.start ? d.end : App.addDays(d.start, van.minNights);
      s.adults = Math.max(1, +d.adults); s.children = Math.max(0, +d.children);
      s.addOns = [].concat(d.addOns || []);
      draw();
    });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (s.step === 1) {
        if (s.adults + s.children > van.sleeps) return App.toast(`This van sleeps up to ${van.sleeps}.`, 'bad');
        if (App.nightsBetween(s.start, s.end) < van.minNights) return App.toast(`Minimum rental is ${van.minNights} nights.`, 'bad');
        if (!App.isAvailable(van.id, s.start, s.end)) return App.toast('Those dates are not available.', 'bad');
        s.step = 2; return draw();
      }
      if (s.step === 2) {
        if (!f.checkValidity()) { f.reportValidity(); return; }
        const d = App.formData(f);
        s.driver = { name: d.name.trim(), age: +d.age, licence: d.licence.trim(), phone: d.phone.trim() };
        s.specialRequests = d.specialRequests.trim();
        if (s.driver.age < App.C.minDriverAge) return App.toast(`The main driver must be at least ${App.C.minDriverAge}.`, 'bad');
        s.step = 3; return draw();
      }
      const d = App.formData(f);
      s.payMethod = d.payMethod; s.agree = !!d.agree;
      if (!s.agree) return App.toast('Please accept the terms to continue.', 'bad');
      const paid = await gateway(qte, s.payMethod);
      if (!paid) return;
      try {
        const b = App.api.createBooking({ vanId: van.id, start: s.start, end: s.end, adults: s.adults, children: s.children, addOnIds: s.addOns, driver: s.driver, payment: paid, specialRequests: s.specialRequests });
        App.go('#/booking/' + b.id + '/confirmed');
      } catch (err) { App.toast(err.message, 'bad'); }
    });
    if (s.step === 3) f.querySelectorAll('[name=payMethod]').forEach(r => r.onchange = () => { s.payMethod = r.value; s.agree = f.agree.checked; draw(); });
  };

  // Stand-in for a hosted payment page / SDK. Card data never touches our code.
  const gateway = (qte, method) => App.modal({
    title: 'Secure payment gateway (simulated)',
    body: h`<div class="gateway">
      <p class="small muted">In production this is the payment provider's hosted checkout (3-D Secure / UPI collect). This demo does not take real payment details.</p>
      <div class="gw-amount"><span>Amount</span><strong>${money(qte.total)}</strong></div>
      <div class="gw-method">${method === 'upi' ? '📱 Approve the request in your UPI app' : method === 'card' ? '💳 Card entered on the gateway’s secure page, verified with 3-D Secure OTP' : '🏦 Redirect to your bank to approve'}</div>
    </div>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Simulate successful payment', primary: true, value: () => ({ method, label: method === 'upi' ? 'UPI' : method === 'card' ? 'Card •• 4242' : 'Net banking' }) }]
  });
  draw();
};

App.pages.bookingConfirmed = (el, { id }) => {
  const b = App.get.booking(id);
  const me = App.me();
  if (!b || (b.customerId !== me.id && me.role !== 'admin')) return App.pages.notFound(el);
  const van = App.get.van(b.vanId);
  const owner = App.get.user(b.ownerId);
  const confirmed = b.status === 'confirmed';
  const thread = App.db.threads.find(t => t.bookingId === b.id);
  el.innerHTML = String(h`
  <div class="container confirm-page">
    <div class="confirm-hero ${confirmed ? 'ok' : 'wait'}">
      <div class="confirm-icon" aria-hidden="true">${confirmed ? '🎉' : '⏳'}</div>
      <h1>${confirmed ? 'You’re booked! Pack your bags.' : 'Request sent!'}</h1>
      <p>${confirmed ? h`Booking <strong>${b.id}</strong> is confirmed. A confirmation email has been sent to ${me.email}.` : h`${owner.name} will respond within 24 hours. Your payment is authorised but not charged yet. Reference <strong>${b.id}</strong>.`}</p>
    </div>
    <div class="confirm-grid">
      <section class="card">
        <div class="bs-van"><img src="${photo(van.photos[0], 400)}" alt=""><div><strong>${van.name}</strong><div class="small muted">${van.type} · hosted by ${owner.name}</div>${App.pill(b.status)}</div></div>
        <dl class="trip-lines">
          <div><dt>Pickup</dt><dd>${fmtDate(b.start)}, from ${van.pickup.time}<br>${confirmed ? van.pickup.address : h`<span class="muted">Address shared once confirmed</span>`}</dd></div>
          <div><dt>Return</dt><dd>${fmtDate(b.end)}, by ${van.pickup.returnTime}</dd></div>
          <div><dt>Travellers</dt><dd>${b.travelers}</dd></div>
          <div><dt>Main driver</dt><dd>${b.driver.name} · licence ${b.driver.licenceMasked}</dd></div>
          <div><dt>Payment</dt><dd>${b.payment?.label || ''} · ${b.paymentStatus}</dd></div>
        </dl>
        ${App.priceLines(b.pricing)}
      </section>
      <section class="card">
        <h2>What happens next</h2>
        <ol class="next-steps">
          ${confirmed ? '' : h`<li><strong>Owner reviews your request</strong><span>Usually within a few hours.</span></li>`}
          <li><strong>Plan your trip</strong><span>Build a day-by-day itinerary with suggested routes and campsites.</span></li>
          <li><strong>Pickup day</strong><span>Bring your original driving licence and ID. The owner will walk you through the van and note its condition with photos.</span></li>
          <li><strong>On the road</strong><span>24×7 roadside help: ${App.C.supportPhone}. Emergencies: ${App.C.emergencyNumber}.</span></li>
          <li><strong>Return & review</strong><span>Deposit released within ${App.C.depositReleaseDays} days. Leave a review to help other travellers.</span></li>
        </ol>
        <div class="stack">
          <a class="btn btn-primary" href="#/account/trips/${b.id}">🗺 Plan itinerary</a>
          ${thread ? h`<a class="btn btn-ghost" href="#/account/messages/${thread.id}">💬 Message ${owner.name.split(' ')[0]}</a>` : ''}
          <button class="btn btn-ghost" id="ics">📅 Add to calendar</button>
          <a class="btn btn-ghost" href="#/account/bookings">View all trips</a>
        </div>
      </section>
    </div>
  </div>`);
  el.querySelector('#ics').onclick = () => App.downloadIcs(b, van);
};

App.downloadIcs = (b, van) => {
  const d = (s) => s.replace(/-/g, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//VanYatra//EN', 'BEGIN:VEVENT', `UID:${b.id}@vanyatra.in`, `DTSTART;VALUE=DATE:${d(b.start)}`, `DTEND;VALUE=DATE:${d(App.addDays(b.end, 1))}`, `SUMMARY:Camper van trip — ${van.name}`, `LOCATION:${van.pickup.city}`, `DESCRIPTION:Booking ${b.id}. Pickup ${van.pickup.time}.`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = `vanyatra-${b.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
})();
