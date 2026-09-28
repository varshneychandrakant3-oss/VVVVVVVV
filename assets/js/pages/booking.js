/*
 * Booking flow: trip & extras → driver details → payment → confirmation.
 */
(() => {
const { h, money, photo, fmtDate } = App;

// Price lines and the breakdown drawer live in ui.js (App.priceLines, App.priceDrawer)


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
  // Instant book needs a fully verified traveller; anything under review becomes a request
  const instantNow = () => van.instantBook && App.core.travellerEligibility(App.travellerRecord(me), s.end).instant;
  const draw = () => {
    const addOns = App.ADD_ONS.filter(a => s.addOns.includes(a.id));
    const qte = App.quote(van, s.start, s.end, { addOns });
    const available = App.isAvailable(van.id, s.start, s.end);
    el.innerHTML = String(h`
    <div class="container book-page">
      <a href="#/vans/${van.id}?start=${s.start}&end=${s.end}" class="back-link">← Back to van</a>
      <h1>${instantNow() ? 'Confirm and pay' : 'Request to book'}</h1>
      <ol class="stepper" aria-label="Booking steps">${steps.map((t, i) => h`<li class="${i + 1 < s.step ? 'done' : i + 1 === s.step ? 'current' : ''}" ${i + 1 === s.step ? h`aria-current="step"` : ''}><span>${i + 1 < s.step ? '✓' : i + 1}</span>${t}</li>`)}</ol>
      ${!available ? h`<div class="alert alert-bad">These dates are no longer available. <a href="#/vans/${van.id}">Choose new dates</a></div>` : ''}
      <div class="book-layout">
        <form class="book-main card" id="book-form" novalidate>${stepBody(qte)}</form>
        <aside class="book-summary card">
          <div class="bs-van"><img src="${photo(van.photos[0], 400)}" alt=""><div><strong>${van.name}</strong><div class="small muted">${van.type} · ${van.pickup.city}</div>${App.vanRating(van)}</div></div>
          <dl class="trip-lines">
            <div><dt>Dates</dt><dd>${App.fmt.dateRange(s.start, s.end)}<br><span class="small muted">Pickup ${van.pickup.time} · return by ${van.pickup.returnTime}</span></dd></div>
            <div><dt>Travellers</dt><dd>${App.plural(s.adults, 'adult')}${s.children ? ', ' + App.plural(s.children, 'child').replace('childs', 'children') : ''}</dd></div>
            <div><dt>Cancellation</dt><dd>${App.CANCELLATION_POLICIES[van.cancellation].label}: ${App.CANCELLATION_POLICIES[van.cancellation].summary}</dd></div>
          </dl>
          ${App.priceLines(qte)}
          <button type="button" class="link small" data-price-van="${van.id}" data-start="${s.start}" data-end="${s.end}" data-addons="${s.addOns.join(',')}">See full price breakdown</button>
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
        <div class="field span-2"><span id="bk-dates-l">Dates</span><div id="bk-dates" role="group" aria-labelledby="bk-dates-l"></div>${van.minNights > 1 ? h`<small class="muted">Minimum stay ${App.fmt.nights(van.minNights)}</small>` : ''}</div>
        <label class="field"><span>Adults</span><input type="number" name="adults" min="1" max="${van.sleeps}" value="${s.adults}"></label>
        <label class="field"><span>Children (under 12)</span><input type="number" name="children" min="0" max="${van.sleeps - 1}" value="${s.children}"></label>
      </div>
      <h2>Add extras</h2>
      <div class="addon-list">${App.ADD_ONS.map(a => h`<label class="addon ${s.addOns.includes(a.id) ? 'on' : ''}"><input type="checkbox" name="addOns" value="${a.id}" ${s.addOns.includes(a.id) ? 'checked' : ''}><span><strong>${a.label}</strong><span class="muted small">${money(a.price)}${a.perNight ? ' / night' : ' per trip'}</span></span></label>`)}</div>
      <div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">Continue</button></div>`;
    if (s.step === 2) {
      const trav = App.travellerRecord(me), elig = App.core.travellerEligibility(trav, s.end);
      const verifyLink = '#/account/verification?next=' + encodeURIComponent(location.hash);
      // Identity is needed before anyone can take a van away
      if (!elig.ok) return h`
        <h2>${['verified', 'pending'].includes(trav.identity.status) ? 'Your documents need attention' : 'Verify it’s you'}</h2>
        <div class="alert alert-warn" role="alert">${elig.blockers.map(b => h`<div>${b}</div>`)}</div>
        <p class="muted">Every renter confirms their identity once — Aadhaar through DigiLocker, or a passport and visa for visitors from abroad — and their driving licence. It takes about 2 minutes, and your trip details are kept.</p>
        <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><a class="btn btn-primary btn-lg" href="${verifyLink}">Verify now</a></div>`;
      const lic = trav.licence, profileLic = elig.useProfileLicence || (lic.kind === 'idp' && lic.status === 'pending');
      const selfDrive = s.selfDriver !== false && profileLic;
      return h`
      <div class="trav-ok">${App.travellerBadge(trav)} <span class="small">${trav.identity.method === 'aadhaar' ? 'ID verified with DigiLocker' : trav.identity.method === 'passport' ? (trav.identity.status === 'verified' ? 'Passport & visa verified' : 'Passport & visa under review') : 'ID verified'}</span></div>
      ${elig.notes.map(n => h`<p class="small muted">ℹ️ ${n}</p>`)}
      <h2>Main driver</h2>
      <p class="muted small">The main driver must be at least ${App.C.minDriverAge}, hold a valid licence and present it at pickup. ${App.serverOnline ? 'We check the licence with the government SARATHI registry. ' : ''}Only the last 4 characters of the licence are stored.</p>
      ${profileLic ? h`<fieldset class="field"><legend>Who’s driving?</legend>
        <label class="check"><input type="radio" name="who" value="me" ${selfDrive ? 'checked' : ''}> I am — use the licence on my profile <span class="small muted">(${lic.data?.dlMasked || lic.data?.licenceMasked}, valid until ${fmtDate(lic.validUpto)}${lic.status === 'pending' ? ', under review' : ''})</span></label>
        <label class="check"><input type="radio" name="who" value="other" ${selfDrive ? '' : 'checked'}> Someone else</label></fieldset>`
      : lic.status === 'verified' ? h`<p class="small alert alert-warn">The licence on your profile expires on ${fmtDate(lic.validUpto)}, before this trip ends. Enter a renewed licence below.</p>`
      : trav.identity.method === 'aadhaar' ? h`<p class="small muted">Tip: <a href="${verifyLink}">save your licence to your profile</a> so you don’t have to enter it again.</p>` : ''}
      <div class="grid-2">
        ${selfDrive ? '' : h`
        <label class="field"><span>Full name (as on licence)</span><input name="name" autocomplete="name" value="${s.driver.name}" required></label>
        <label class="field"><span>Date of birth</span><input type="date" name="dob" max="${App.addDays(App.today(), -365 * 18)}" value="${s.driver.dob || ''}" required></label>
        <label class="field"><span>Driving licence number</span><input name="licence" autocomplete="off" title="Your licence number as printed, e.g. DL-0420110012345" value="${s.driver.licence}" placeholder="e.g. DL-0420110012345" required pattern="[A-Za-z0-9 \\-]{8,20}"></label>`}
        <label class="field"><span>Mobile number</span><input type="tel" name="phone" autocomplete="tel" value="${s.driver.phone}" required pattern="(\\+[1-9][0-9 \\-]{7,16})|((\\+?91[ \\-]?)?[6-9][0-9]{4}[ \\-]?[0-9]{5})" title="A 10-digit Indian mobile number, or your number with its country code (e.g. +44 7700 900123)"></label>
      </div>
      ${selfDrive ? '' : h`
      ${App.serverOnline && App.verifyConfig?.testMode ? h`<p class="test-hint">🧪 <strong>Test mode</strong> — licences ending 0000 are “not found”, ending 1111 are expired.</p>` : ''}
      ${App.serverOnline ? h`<label class="check consent"><input type="checkbox" name="dlConsent" required ${s.dlConsent ? "checked" : ""}> I consent to VanYatra verifying this driving licence with the SARATHI registry.</label>` : ''}
      <div id="dl-result">${s.dlCheck ? App.checkResultBox(s.dlCheck) : ''}</div>`}
      <label class="field"><span>Message to the owner (optional)</span><textarea name="specialRequests" rows="3" placeholder="Who's coming, your route, any questions…">${s.specialRequests}</textarea></label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button class="btn btn-primary btn-lg" type="submit">Continue to payment</button></div>`;
    }
    return h`
      <h2>Payment</h2>
      ${s.payError ? h`<div class="alert alert-bad" role="alert"><strong>Payment didn’t go through.</strong> ${s.payError}</div>` : ''}
      <div class="pay-methods" role="radiogroup" aria-label="Payment method">
        ${[['upi', 'UPI', 'GPay, PhonePe, Paytm, BHIM'], ['card', 'Credit / debit card', 'Visa, Mastercard, RuPay, Amex'], ['netbanking', 'Net banking', 'All major Indian banks']].map(([v, l, d]) => h`<label class="pay-opt ${s.payMethod === v ? 'on' : ''}"><input type="radio" name="payMethod" value="${v}" ${s.payMethod === v ? 'checked' : ''}><span><strong>${l}</strong><span class="small muted">${d}</span></span></label>`)}
      </div>
      <div class="callout">
        ${instantNow() ? h`You’ll pay <strong>${money(qte.total)}</strong> now. The ${money(qte.deposit)} deposit is authorised (held) at pickup and released within ${App.C.depositReleaseDays} days of return.`
          : h`We’ll <strong>authorise ${money(qte.total)}</strong> now but only charge it if ${App.get.user(van.ownerId).name.split(' ')[0]} accepts within 24 hours.`}
      </div>
      <label class="check"><input type="checkbox" name="agree" ${s.agree ? 'checked' : ''} required> I agree to the <a href="#/help/terms" target="_blank">rental terms</a>, <a href="#/help/cancellation" target="_blank">cancellation policy</a> and the owner’s house rules.</label>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button class="btn btn-accent btn-lg" type="submit">🔒 ${instantNow() ? 'Pay ' + money(qte.total) : 'Send request'}</button></div>`;
  };

  const bind = (qte) => {
    const f = el.querySelector('#book-form');
    const back = f.querySelector('[data-back]');
    if (back) back.onclick = () => { s.step--; draw(); };
    if (s.step === 1) App.dateRangeField(f.querySelector('#bk-dates'), { start: s.start, end: s.end, vanId: van.id, minNights: van.minNights, clearable: false });
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
        const ageOn = (dob) => Math.floor((new Date(s.start) - new Date(dob)) / (365.25 * 86400000));
        s.specialRequests = d.specialRequests.trim();
        const trav = App.travellerRecord(me);
        if (f.querySelector('[name=who]:checked')?.value === 'me') {
          // The verified licence on the traveller's profile covers this trip
          const lic = trav.licence, dob = trav.identity.data?.dob;
          s.driver = {
            name: trav.identity.data?.name || me.name, dob, age: dob ? ageOn(dob) : App.C.minDriverAge, phone: d.phone.trim(),
            licence: lic.data?.dlMasked || lic.data?.licenceMasked || '',
            check: { status: lic.status === 'verified' ? 'verified' : 'review', validUpto: lic.validUpto, source: lic.check?.source || 'International Driving Permit (reviewed by VanYatra)', checkedAt: lic.check?.checkedAt || lic.reviewedAt || lic.submittedAt, note: lic.status === 'verified' ? 'Verified on the traveller’s profile' : 'International Driving Permit under review', fromProfile: true }
          };
          if (s.driver.age < App.C.minDriverAge) return App.toast(`The main driver must be at least ${App.C.minDriverAge} on the pickup date.`, 'bad');
          s.step = 3; return draw();
        }
        const age = ageOn(d.dob);
        s.driver = { name: d.name.trim(), dob: d.dob, age, licence: d.licence.trim(), phone: d.phone.trim() };
        s.dlConsent = !!f.dlConsent?.checked;
        if (age < App.C.minDriverAge) return App.toast(`The main driver must be at least ${App.C.minDriverAge} on the pickup date.`, 'bad');
        if (App.serverOnline) {
          const btn = f.querySelector('[type=submit]');
          btn.disabled = true; btn.textContent = 'Checking licence…';
          try {
            s.dlCheck = await App.verify.run('dl', { dlNumber: s.driver.licence, dob: d.dob, name: s.driver.name, tripEnd: s.end });
          } catch (err) {
            btn.disabled = false; btn.textContent = 'Continue to payment';
            return App.toast(err.message, 'bad');
          }
          if (s.dlCheck.status === 'failed') { draw(); return App.toast('We couldn’t verify this driving licence — see details.', 'bad'); }
          s.driver.check = { status: s.dlCheck.status, validUpto: s.dlCheck.data.validUpto, source: s.dlCheck.source, checkedAt: s.dlCheck.checkedAt, note: App.verify.note(s.dlCheck) };
        }
        s.step = 3; return draw();
      }
      const d = App.formData(f);
      s.payMethod = d.payMethod; s.agree = !!d.agree;
      if (!s.agree) return App.toast('Please accept the terms to continue.', 'bad');
      // Dates can be taken while the traveller is on this page
      if (!App.isAvailable(van.id, s.start, s.end)) { s.payError = 'Sorry — these dates were just booked by someone else. Go back and pick new dates.'; return draw(); }
      const btn = f.querySelector('[type=submit]');
      const label = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Starting secure checkout…';
      try {
        const order = await App.payments.createOrder({ amount: qte.total, receipt: `${van.id}:${s.start}:${s.end}`, notes: { van: van.name } });
        const pay = await App.payments.checkout(order, { method: s.payMethod, description: instantNow() ? 'Pay now' : 'Authorise (charged if accepted)' });
        if (pay.status === 'cancelled') { btn.disabled = false; btn.innerHTML = label; return App.toast('Payment cancelled — you haven’t been charged.'); }
        if (pay.status === 'failed') { s.payError = pay.reason + ' You haven’t been charged. Try again or choose another payment method.'; return draw(); }
        btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Confirming payment…';
        if (!(await App.payments.verify(order, pay))) { s.payError = 'We couldn’t confirm this payment. You haven’t been charged. Please try again.'; return draw(); }
        const b = App.api.createBooking({ vanId: van.id, start: s.start, end: s.end, adults: s.adults, children: s.children, addOnIds: s.addOns, driver: s.driver, payment: { method: pay.method, label: pay.label, orderId: order.id, paymentId: pay.paymentId }, specialRequests: s.specialRequests });
        App.go('#/booking/' + b.id + '/confirmed');
      } catch (err) {
        s.payError = err.message; draw();
      }
    });
    if (s.step === 2) f.querySelectorAll('[name=who]').forEach(r => r.onchange = () => { s.selfDriver = r.value === 'me'; s.specialRequests = f.specialRequests.value; if (f.phone) s.driver.phone = f.phone.value; draw(); });
    if (s.step === 3) f.querySelectorAll('[name=payMethod]').forEach(r => r.onchange = () => { s.payMethod = r.value; s.agree = f.agree.checked; s.payError = null; draw(); });
  };

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
          <div><dt>Payment</dt><dd>${b.payment?.label || ''} · ${b.paymentStatus}${b.payment?.paymentId ? h`<br><span class="small muted">Ref ${b.payment.paymentId}</span>` : ''}</dd></div>
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
