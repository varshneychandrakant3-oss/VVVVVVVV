/*
 * Checkout in four steps:
 *   1 Dates & guests  →  2 Protection & extras  →  3 Driver  →  4 Review & pay
 * The price summary stays in view throughout (a bar with the total on phones).
 * Progress is saved in this browser, so travellers can leave and come back, and a
 * guest can price the whole trip before signing in. An account is needed from the
 * driver step, because the renter's ID and licence are checked there.
 */
(() => {
const { h, money, photo, fmtDate } = App;
const SAVE_KEY = 'vanyatra.checkout.v1';
const STEPS = ['Dates & guests', 'Protection & extras', 'Driver', 'Review & pay'];
const KEEP = ['vanId', 'start', 'end', 'adults', 'children', 'options', 'payPlan', 'depositMethod', 'payMethod', 'specialRequests'];
const loadSaved = (vanId) => {
  try { const x = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return x && x.vanId === vanId && Date.now() - x.savedAt < 7 * 864e5 ? x : null; } catch (e) { return null; }
};
// Licence numbers and check results are not saved: the driver step is quick to redo
const saveProgress = (s) => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...Object.fromEntries(KEEP.map(k => [k, s[k]])), step: Math.min(s.step, 3), savedAt: Date.now() })); } catch (e) { /* storage blocked */ } };
const clearProgress = () => { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } };

App.pages.book = (el, { id }, q) => {
  const van = App.get.van(id);
  const me = App.me();
  if (!van || van.status !== 'published') return App.pages.notFound(el);
  if (me && me.id === van.ownerId) { el.innerHTML = String(App.emptyState('🚐', 'You own this van', 'Owners can block dates from the dashboard instead of booking.', h`<a class="btn" href="#/owner/calendar">Open calendar</a>`)); return; }
  const saved = loadSaved(van.id);
  const start = q.start || saved?.start, end = q.end || saved?.end;
  if (!start || !end || end <= start) return App.go('#/vans/' + id);
  const resume = saved && saved.start === start && saved.end === end ? saved : null;
  const s = {
    vanId: van.id, start, end,
    step: resume ? resume.step || 1 : 1,
    adults: +q.adults || resume?.adults || 2, children: q.children !== undefined ? Math.max(0, +q.children) : resume?.children || 0,
    options: { addOns: [], protection: 'basic', km: 'standard', driver: false, delivery: null, oneWay: null, zeroDeposit: false, ...(resume?.options || {}) },
    payPlan: resume?.payPlan || 'full', depositMethod: resume?.depositMethod || 'hold', payMethod: resume?.payMethod || 'upi',
    specialRequests: resume?.specialRequests || '',
    driver: { name: me?.name || '', licence: '', phone: me?.phone || '' }
  };
  const driverOffer = App.driverFor(van);
  if (!driverOffer) s.options.driver = false;
  const quote = () => App.quote(van, s.start, s.end, s.options);
  // Credit (e.g. from an owner cancellation) pays part of what's due now
  const planFor = (qte) => {
    const p = App.paymentPlan(qte, s.start, { plan: s.payPlan, deposit: s.depositMethod });
    const credit = me && s.useCredit !== false ? Math.min(me.credit || 0, p.dueNow) : 0;
    return { ...p, credit, chargeNow: p.chargeNow - credit };
  };
  // Instant book needs a fully verified traveller; anything under review becomes a request
  const instantNow = () => !!me && van.instantBook && App.core.travellerEligibility(App.travellerRecord(me), s.end).instant;
  const bookUrl = () => `/book/${van.id}?start=${s.start}&end=${s.end}&adults=${s.adults}&children=${s.children}`;
  const optionsAttr = () => JSON.stringify(s.options);

  const draw = () => {
    const qte = quote(), plan = planFor(qte);
    const available = App.isAvailable(van.id, s.start, s.end);
    saveProgress(s);
    el.innerHTML = String(h`
    <div class="container book-page">
      <a href="#/vans/${van.id}?start=${s.start}&end=${s.end}" class="back-link">← Back to van</a>
      <h1>${instantNow() ? 'Confirm and pay' : 'Request to book'}</h1>
      <div class="book-progress" role="progressbar" aria-label="Checkout progress" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${s.step}" aria-valuetext="Step ${s.step} of 4: ${STEPS[s.step - 1]}"><span style="width:${s.step / 4 * 100}%"></span></div>
      <ol class="stepper" aria-label="Checkout steps">${STEPS.map((t, i) => h`<li class="${i + 1 < s.step ? 'done' : i + 1 === s.step ? 'current' : ''}" ${i + 1 === s.step ? h`aria-current="step"` : ''}>${i + 1 < s.step ? h`<button type="button" class="step-link" data-goto="${i + 1}" aria-label="Back to step ${i + 1}: ${t}"><span>✓</span>${t}</button>` : h`<span>${i + 1}</span>${t}`}</li>`)}</ol>
      ${!available ? h`<div class="alert alert-bad" role="alert">These dates are no longer available. <a href="#/vans/${van.id}">Choose new dates</a></div>` : ''}
      <div class="book-layout">
        <form class="book-main card" id="book-form" novalidate>${stepBody(qte, plan)}</form>
        <aside class="book-summary card" aria-label="Price summary">${summary(qte, plan)}</aside>
      </div>
      <div class="book-bar only-mobile" role="region" aria-label="Trip total">
        <div><strong>${money(qte.total)}</strong> <span class="small muted">total · ${App.fmt.nights(qte.nights)}</span>${plan.chargeNow !== qte.total ? h`<div class="small">${money(plan.chargeNow)} due now</div>` : ''}</div>
        <button type="button" class="btn btn-ghost btn-sm" data-price-van="${van.id}" data-start="${s.start}" data-end="${s.end}" data-options="${optionsAttr()}">Price details</button>
      </div>
    </div>`);
    bind(qte, plan);
  };

  const travelLine = () => s.options.driver ? 'With a driver' : 'Self-drive';
  const placeLine = (qte) => `${qte.delivery ? 'Delivered to ' + qte.delivery.label : 'Pickup at ' + van.pickup.city}${qte.oneWay ? ' · drop-off in ' + qte.oneWay.label : ''}`;
  const summary = (qte, plan) => h`
    <div class="bs-van">${App.img(van.photos[0], { w: 400, alt: '', sizes: '120px' })}<div><strong>${van.name}</strong><div class="small muted">${van.type} · ${van.pickup.city}</div>${App.vanRating(van)}</div></div>
    <dl class="trip-lines">
      <div><dt>Dates</dt><dd>${App.fmt.dateRange(s.start, s.end)}<br><span class="small muted">Pickup ${van.pickup.time} · return by ${van.pickup.returnTime}</span></dd></div>
      <div><dt>Travellers</dt><dd>${App.plural(s.adults, 'adult')}${s.children ? ', ' + App.fmt.plural(s.children, 'child', 'children') : ''}</dd></div>
      <div><dt>Trip</dt><dd>${travelLine()} · ${placeLine(qte)}</dd></div>
      <div><dt>Cancellation</dt><dd>${App.CANCELLATION_POLICIES[van.cancellation].label}: ${App.CANCELLATION_POLICIES[van.cancellation].summary}</dd></div>
    </dl>
    ${App.priceLines(qte)}
    ${s.step === 4 && plan.chargeNow !== qte.total ? h`<dl class="price-lines due-now"><div class="total"><dt>Due now</dt><dd>${money(plan.chargeNow)}</dd></div>
      ${plan.type === 'part' ? h`<div class="muted"><dt>Balance, charged ${fmtDate(plan.balanceDueOn)}</dt><dd>${money(plan.balance)}</dd></div>` : ''}
      ${plan.depositNow ? h`<div class="muted"><dt>Includes refundable deposit</dt><dd>${money(plan.depositNow)}</dd></div>` : ''}
      ${plan.credit ? h`<div class="good"><dt>VanYatra credit used</dt><dd>−${money(plan.credit)}</dd></div>` : ''}</dl>` : ''}
    <button type="button" class="link small" data-price-van="${van.id}" data-start="${s.start}" data-end="${s.end}" data-options="${optionsAttr()}">See full price breakdown</button>
    <p class="small muted">${App.icon('lock')} Payments are processed by a PCI-DSS compliant gateway. VanYatra never sees or stores your full card number.</p>`;

  /* ---------- Steps ---------- */
  const stepBody = (qte, plan) => [null, step1, step2, step3, step4][s.step](qte, plan);

  const step1 = (qte) => h`
    <h2>Dates & guests</h2>
    <div class="grid-2">
      <div class="field span-2"><span id="bk-dates-l">Dates</span><div id="bk-dates" role="group" aria-labelledby="bk-dates-l"></div>${van.minNights > 1 ? h`<small class="muted">Minimum stay ${App.fmt.nights(van.minNights)}</small>` : ''}</div>
      <label class="field"><span>Adults</span><input type="number" name="adults" min="1" max="${van.sleeps}" value="${s.adults}" inputmode="numeric"></label>
      <label class="field"><span>Children (under 12)</span><input type="number" name="children" min="0" max="${van.sleeps - 1}" value="${s.children}" inputmode="numeric"></label>
    </div>
    ${driverOffer ? h`<fieldset class="field"><legend>How will you travel?</legend>
      <div class="choice-grid">
        <label class="choice ${!s.options.driver ? 'on' : ''}"><input type="radio" name="drive" value="self" ${!s.options.driver ? 'checked' : ''}><span><strong>${App.icon('car')} Self-drive</strong><span class="small muted">You drive. Your licence is checked before pickup.</span></span></label>
        <label class="choice ${s.options.driver ? 'on' : ''}"><input type="radio" name="drive" value="driver" ${s.options.driver ? 'checked' : ''}><span><strong>${App.icon('user')} With a driver</strong><span class="small muted">A verified local driver who knows the roads · ${money(driverOffer.feePerDay + driverOffer.bataPerDay)}/day incl. bata, + ${money(driverOffer.stayPerNight)}/night stay${driverOffer.languages ? ' · speaks ' + driverOffer.languages.join(', ') : ''}</span></span></label>
      </div></fieldset>` : ''}
    ${van.delivery?.points?.length ? h`<fieldset class="field"><legend>Pickup</legend>
      <div class="choice-grid">
        <label class="choice ${!s.options.delivery ? 'on' : ''}"><input type="radio" name="delivery" value="" ${!s.options.delivery ? 'checked' : ''}><span><strong>${App.icon('map-pin')} ${van.pickup.city}</strong><span class="small muted">At the owner’s base · free</span></span></label>
        ${van.delivery.points.map(p => h`<label class="choice ${s.options.delivery === p.id ? 'on' : ''}"><input type="radio" name="delivery" value="${p.id}" ${s.options.delivery === p.id ? 'checked' : ''}><span><strong>${App.icon(p.type === 'airport' ? 'plane' : p.type === 'station' ? 'route' : 'house')} ${p.name}</strong><span class="small muted">Delivered and collected · ${money(Math.round(p.km * (van.delivery.perKm || 20) * 2))} (${App.fmt.km(p.km)} each way)</span></span></label>`)}
      </div></fieldset>` : ''}
    ${van.delivery?.oneWay?.length ? h`<fieldset class="field"><legend>Return</legend>
      <div class="choice-grid">
        <label class="choice ${!s.options.oneWay ? 'on' : ''}"><input type="radio" name="oneWay" value="" ${!s.options.oneWay ? 'checked' : ''}><span><strong>Same place</strong><span class="small muted">Round trip</span></span></label>
        ${van.delivery.oneWay.map(o => h`<label class="choice ${s.options.oneWay === o.id ? 'on' : ''}"><input type="radio" name="oneWay" value="${o.id}" ${s.options.oneWay === o.id ? 'checked' : ''}><span><strong>${App.icon('route')} Drop off in ${o.name}</strong><span class="small muted">One-way fee ${money(o.fee)}</span></span></label>`)}
      </div></fieldset>` : ''}
    <div class="form-actions"><button class="btn btn-primary btn-lg" type="submit">Continue</button></div>`;

  const cover = (on) => on ? h`<span class="yes">${App.icon('check', { label: 'Included' })}</span>` : h`<span class="no">${App.icon('x', { label: 'Not included' })}</span>`;
  const step2 = (qte) => {
    const dest = App.get.dest(van.destinationId);
    const pkgs = App.kmPackagesFor(van);
    const route = dest?.routes?.[s.routeIdx ?? -1];
    const recommend = route ? pkgs.find(p => !p.kmPerDay || p.kmPerDay * qte.nights >= route.km * 1.15) || pkgs.at(-1) : null;
    const baseDeposit = App.quote(van, s.start, s.end, { ...s.options, zeroDeposit: false }).deposit;
    return h`
    <h2>Protection</h2>
    <p class="small muted">Every plan includes insurance and 24×7 roadside help. Higher plans lower what you’d pay if the van is damaged, and the deposit.</p>
    <fieldset class="prot-wrap"><legend class="sr-only">Choose a protection plan</legend>
    <div class="prot-scroll"><table class="prot-table">
      <thead><tr><th scope="col"><span class="sr-only">Feature</span></th>${App.PROTECTION.map(p => h`<th scope="col" class="${s.options.protection === p.id ? 'on' : ''}"><label><input type="radio" name="protection" value="${p.id}" ${s.options.protection === p.id ? 'checked' : ''}><span>${p.label}</span></label>${p.popular ? h`<span class="badge badge-new">Popular</span>` : ''}</th>`)}</tr></thead>
      <tbody>
        <tr><th scope="row">Price</th>${App.PROTECTION.map(p => h`<td class="${s.options.protection === p.id ? 'on' : ''}">${p.perNight ? h`${money(p.perNight)}<span class="small muted">/night</span>` : 'Included'}</td>`)}</tr>
        <tr><th scope="row">Damage liability</th>${App.PROTECTION.map(p => h`<td class="${s.options.protection === p.id ? 'on' : ''}">up to ${App.fmt.moneyCompact(p.liability)}</td>`)}</tr>
        <tr><th scope="row">Deposit</th>${App.PROTECTION.map(p => h`<td class="${s.options.protection === p.id ? 'on' : ''}">${money(App.quote(van, s.start, s.end, { protection: p.id }).deposit)}</td>`)}</tr>
        ${Object.entries(App.COVER_LABELS).map(([k, label]) => h`<tr><th scope="row">${label}</th>${App.PROTECTION.map(p => h`<td class="${s.options.protection === p.id ? 'on' : ''}">${cover(p.covers[k])}</td>`)}</tr>`)}
      </tbody></table></div></fieldset>
    ${baseDeposit ? h`<label class="choice zero-dep ${s.options.zeroDeposit ? 'on' : ''}"><input type="checkbox" name="zeroDeposit" ${s.options.zeroDeposit ? 'checked' : ''}><span><strong>Zero-deposit</strong><span class="small muted">Pay a one-off ${money(App.quote(van, s.start, s.end, { ...s.options, zeroDeposit: true }).zeroDepositFee)} (non-refundable) instead of a ${money(baseDeposit)} refundable deposit. Nothing is held on your card.</span></span></label>` : ''}

    <h2>Distance</h2>
    <div class="choice-grid">${pkgs.map(p => h`<label class="choice ${s.options.km === p.id ? 'on' : ''}"><input type="radio" name="km" value="${p.id}" ${s.options.km === p.id ? 'checked' : ''}><span><strong>${p.label}</strong><span class="small muted">${p.kmPerDay ? `${App.fmt.km(p.kmPerDay * qte.nights)} for your trip` : 'Drive as far as you like'} · ${p.perNight ? `+${money(p.perNight)}/night` : 'included'}</span>${recommend?.id === p.id ? h`<span class="badge badge-good">Suits your route</span>` : ''}</span></label>`)}</div>
    ${dest?.routes?.length ? h`<label class="field"><span>Planning a route? We’ll estimate the distance</span><select id="route-pick"><option value="">Choose a suggested route…</option>${dest.routes.map((r, i) => h`<option value="${i}" ${s.routeIdx === i ? 'selected' : ''}>${r.name} · ≈ ${App.fmt.km(r.km)}, ${App.fmt.plural(r.days, 'day')}</option>`)}</select>
      ${route ? h`<small class="muted">${route.name} is about ${App.fmt.km(route.km)}${route.days > qte.nights + 1 ? `, usually driven over ${App.fmt.plural(route.days, 'day')}` : ''}. Extra km cost ${money(van.extraKmFee)}/km beyond your allowance.</small>` : ''}</label>` : ''}

    <h2>Extras</h2>
    <div class="addon-list">${App.addOnsFor(van).map(a => h`<label class="addon ${s.options.addOns.includes(a.id) ? 'on' : ''}"><input type="checkbox" name="addOns" value="${a.id}" ${s.options.addOns.includes(a.id) ? 'checked' : ''}>${App.icon(a.icon)}<span><strong>${a.label}</strong><span class="muted small">${money(a.price)}${a.perNight ? ' / night' : ' per trip'}${a.note ? ' · ' + a.note : ''}</span></span></label>`)}</div>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button class="btn btn-primary btn-lg" type="submit">Continue</button></div>`;
  };

  const step3 = () => {
    if (!me) return h`
      <h2>Who’s renting?</h2>
      <div class="callout"><strong>Sign in to continue.</strong> Before any van leaves its base we verify the renter’s identity and driving licence, so this step needs an account. Your trip and choices are saved.</div>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button>
        <a class="btn btn-ghost" href="#/signup?next=${encodeURIComponent(bookUrl())}">Create an account</a>
        <a class="btn btn-primary btn-lg" href="#/login?next=${encodeURIComponent(bookUrl())}">Sign in</a></div>`;
    const trav = App.travellerRecord(me), elig = App.core.travellerEligibility(trav, s.end);
    const verifyLink = '#/account/verification?next=' + encodeURIComponent(location.hash);
    // Identity is needed before anyone can take a van away
    if (!elig.ok) return h`
      <h2>${['verified', 'pending'].includes(trav.identity.status) ? 'Your documents need attention' : 'Verify it’s you'}</h2>
      <div class="alert alert-warn" role="alert">${elig.blockers.map(b => h`<div>${b}</div>`)}</div>
      <p class="muted">Every renter confirms their identity once — Aadhaar through DigiLocker, or a passport and visa for visitors from abroad — and their driving licence. It takes about 2 minutes, and your trip details are kept.</p>
      <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><a class="btn btn-primary btn-lg" href="${verifyLink}">Verify now</a></div>`;
    const idLine = h`<div class="trav-ok">${App.travellerBadge(trav)} <span class="small">${trav.identity.method === 'aadhaar' ? 'ID verified with DigiLocker' : trav.identity.method === 'passport' ? (trav.identity.status === 'verified' ? 'Passport & visa verified' : 'Passport & visa under review') : 'ID verified'}</span></div>
      ${elig.notes.map(n => h`<p class="small muted">${App.icon('info')} ${n}</p>`)}`;
    const phoneField = h`<label class="field"><span>Mobile number</span><input type="tel" name="phone" autocomplete="tel" value="${s.driver.phone}" required pattern="(\\+[1-9][0-9 \\-]{7,16})|((\\+?91[ \\-]?)?[6-9][0-9]{4}[ \\-]?[0-9]{5})" title="A 10-digit Indian mobile number, or your number with its country code (e.g. +44 7700 900123)"></label>`;
    const note = h`<label class="field"><span>Message to the owner (optional)</span><textarea name="specialRequests" rows="3" placeholder="Who's coming, your route, any questions…">${s.specialRequests}</textarea></label>`;
    const actions = h`<div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button class="btn btn-primary btn-lg" type="submit">Continue to review</button></div>`;
    if (s.options.driver) return h`
      ${idLine}
      <h2>Your driver</h2>
      <p class="muted">The owner provides a driver verified by VanYatra (licence checked with SARATHI, plus a police-verified badge). You don’t need to drive, so we don’t need your licence. You’ll get the driver’s name and number 48 hours before pickup.</p>
      <div class="grid-2">${phoneField}</div>${note}${actions}`;
    const lic = trav.licence, profileLic = elig.useProfileLicence || (lic.kind === 'idp' && lic.status === 'pending');
    const selfDrive = s.selfDriver !== false && profileLic;
    return h`
      ${idLine}
      <h2>Main driver</h2>
      <p class="muted small">The main driver must be at least ${App.C.minDriverAge} on the pickup date, hold a valid licence and bring it to pickup. ${App.serverOnline ? 'We check the licence with the government SARATHI registry. ' : ''}Only the last 4 characters are stored.</p>
      ${profileLic ? h`<fieldset class="field"><legend>Who’s driving?</legend>
        <label class="check"><input type="radio" name="who" value="me" ${selfDrive ? 'checked' : ''}> I am — use the licence on my profile <span class="small muted">(${lic.data?.dlMasked || lic.data?.licenceMasked}, valid until ${fmtDate(lic.validUpto)}${lic.status === 'pending' ? ', under review' : ''})</span></label>
        <label class="check"><input type="radio" name="who" value="other" ${selfDrive ? '' : 'checked'}> Someone else</label></fieldset>`
      : lic.status === 'verified' ? h`<p class="small alert alert-warn">The licence on your profile expires on ${fmtDate(lic.validUpto)}, before this trip ends. Enter a renewed licence below.</p>`
      : trav.identity.method === 'aadhaar' ? h`<p class="small muted">Tip: <a href="${verifyLink}">save your licence to your profile</a> so you don’t have to enter it again.</p>` : ''}
      <div class="grid-2">
        ${selfDrive ? '' : h`
        <label class="field"><span>Full name (as on licence)</span><input name="name" autocomplete="name" value="${s.driver.name}" required></label>
        <label class="field"><span>Date of birth</span><input type="date" name="dob" max="${App.addDays(App.today(), -365 * 18)}" value="${s.driver.dob || ''}" required></label>
        <label class="field"><span>Driving licence number</span><input name="licence" autocomplete="off" title="Your licence number as printed, e.g. DL-0420110012345" value="${s.driver.licence}" placeholder="e.g. DL-0420110012345" required pattern="[A-Za-z0-9 \\-]{8,20}"></label>
        <label class="field"><span>Photo of the licence <span class="muted small">(optional, speeds up pickup)</span></span><input type="file" name="licencePhoto" accept="image/*,application/pdf"></label>`}
        ${phoneField}
      </div>
      ${selfDrive ? '' : h`
      ${App.serverOnline && App.verifyConfig?.testMode ? h`<p class="test-hint">${App.icon('flask-conical')} <strong>Test mode</strong> — licences ending 0000 are “not found”, ending 1111 are expired.</p>` : ''}
      ${App.serverOnline ? h`<label class="check consent"><input type="checkbox" name="dlConsent" required ${s.dlConsent ? 'checked' : ''}> I consent to VanYatra verifying this driving licence with the SARATHI registry.</label>` : ''}
      <div id="dl-result">${s.dlCheck ? App.checkResultBox(s.dlCheck) : ''}</div>`}
      ${note}${actions}`;
  };

  const step4 = (qte, plan) => {
    const extras = qte.addOnLines.map(a => a.label).join(', ');
    const row = (label, value, step) => h`<div><dt>${label}</dt><dd>${value} <button type="button" class="link small" data-goto="${step}">Edit</button></dd></div>`;
    const methods = [['upi', 'UPI', 'GPay, PhonePe, Paytm, BHIM'], ['card', 'Credit / debit card', 'Visa, Mastercard, RuPay, Amex'], ['netbanking', 'Net banking', 'All major Indian banks']];
    if (plan.emiAllowed) methods.push(['emi', 'EMI', `From about ${money(Math.ceil(plan.chargeNow / 6))}/month over 6 months on credit cards`]);
    if (s.payMethod === 'emi' && !plan.emiAllowed) s.payMethod = 'upi';
    const request = !instantNow();
    return h`
    <h2>Review your trip</h2>
    <dl class="trip-lines review-lines">
      ${row('Dates', h`${App.fmt.dateRange(s.start, s.end)} · ${App.fmt.nights(qte.nights)}`, 1)}
      ${row('Travellers', `${App.plural(s.adults, 'adult')}${s.children ? ', ' + App.fmt.plural(s.children, 'child', 'children') : ''}`, 1)}
      ${row('Trip', `${travelLine()} · ${placeLine(qte)}`, 1)}
      ${row('Protection', h`${qte.protection.label} · liability up to ${money(qte.protection.liability)}${qte.depositWaived ? ' · zero-deposit' : ''}`, 2)}
      ${row('Distance', qte.km.label, 2)}
      ${row('Extras', extras || 'None', 2)}
      ${row('Driver', s.options.driver ? 'Provided by the owner' : `${s.driver.name}${s.driver.check?.status === 'verified' ? ' · licence verified' : ''}`, 3)}
    </dl>

    <h2>How would you like to pay?</h2>
    ${s.payError ? h`<div class="alert alert-bad" role="alert"><strong>Payment didn’t go through.</strong> ${s.payError}</div>` : ''}
    <fieldset class="field"><legend>Payment plan</legend><div class="choice-grid">
      <label class="choice ${plan.type === 'full' ? 'on' : ''}"><input type="radio" name="payPlan" value="full" ${plan.type === 'full' ? 'checked' : ''}><span><strong>Pay in full · ${money(qte.total)}</strong><span class="small muted">Nothing more to pay later.</span></span></label>
      <label class="choice ${plan.type === 'part' ? 'on' : ''} ${plan.partAllowed ? '' : 'disabled'}"><input type="radio" name="payPlan" value="part" ${plan.type === 'part' ? 'checked' : ''} ${plan.partAllowed ? '' : 'disabled'}><span><strong>Reserve with 25% · ${money(Math.round(qte.total * App.PART_PAY.share))} now</strong><span class="small muted">${plan.partAllowed ? `The rest (${money(qte.total - Math.round(qte.total * App.PART_PAY.share))}) is charged automatically on ${fmtDate(App.addDays(s.start, -App.PART_PAY.balanceDaysBefore))}, ${App.PART_PAY.balanceDaysBefore} days before pickup. We remind you 3 days before.` : `Available when pickup is more than ${App.PART_PAY.minDaysAhead - 1} days away.`}</span></span></label>
    </div></fieldset>
    ${qte.deposit ? h`<fieldset class="field"><legend>Refundable deposit · ${money(qte.deposit)}</legend><div class="choice-grid">
      <label class="choice ${plan.depositMethod === 'upi' ? 'on' : ''}"><input type="radio" name="depositMethod" value="upi" ${plan.depositMethod === 'upi' ? 'checked' : ''}><span><strong>Pay now by UPI</strong><span class="small muted">Refunded automatically to the same UPI account within ${App.C.depositReleaseDays} days of return if there’s no damage. No credit card needed.</span></span></label>
      <label class="choice ${plan.depositMethod === 'hold' ? 'on' : ''}"><input type="radio" name="depositMethod" value="hold" ${plan.depositMethod === 'hold' ? 'checked' : ''}><span><strong>Hold on a credit card at pickup</strong><span class="small muted">The amount is blocked, not charged, and released within ${App.C.depositReleaseDays} days of return.</span></span></label>
    </div><small class="muted">Prefer no deposit? <button type="button" class="link small" data-goto="2">Choose zero-deposit</button></small></fieldset>`
      : qte.depositWaived ? h`<p class="small">${App.icon('check')} No deposit — you chose zero-deposit.</p>` : ''}
    ${me.credit ? h`<label class="choice ${plan.credit ? 'on' : ''}"><input type="checkbox" name="useCredit" ${s.useCredit !== false ? 'checked' : ''}><span><strong>Use ${money(Math.min(me.credit, plan.dueNow + plan.credit))} of your VanYatra credit</strong><span class="small muted">You have ${money(me.credit)} credit.</span></span></label>` : ''}
    <fieldset class="field"><legend>Payment method</legend><div class="pay-methods">
      ${methods.map(([v, l, d]) => h`<label class="pay-opt ${s.payMethod === v ? 'on' : ''}"><input type="radio" name="payMethod" value="${v}" ${s.payMethod === v ? 'checked' : ''}><span><strong>${l}</strong><span class="small muted">${d}</span></span></label>`)}
    </div></fieldset>
    <div class="callout">
      ${request ? h`We’ll <strong>authorise ${money(plan.chargeNow)}</strong> now but only charge it if ${App.get.user(van.ownerId).name.split(' ')[0]} accepts within 24 hours.`
        : h`You’ll pay <strong>${money(plan.chargeNow)}</strong> now${plan.type === 'part' ? h`, and ${money(plan.balance)} on ${fmtDate(plan.balanceDueOn)}` : ''}${plan.depositNow ? h` (including the ${money(plan.depositNow)} refundable deposit)` : ''}.`}
    </div>
    <label class="check"><input type="checkbox" name="agree" ${s.agree ? 'checked' : ''} required> I agree to the <a href="#/help/terms" target="_blank">rental terms</a>, <a href="#/help/cancellation" target="_blank">cancellation policy</a> and the owner’s house rules.</label>
    <div class="form-actions"><button type="button" class="btn btn-ghost" data-back>Back</button><button class="btn btn-accent btn-lg" type="submit">${App.icon('lock')} ${request ? 'Send request · authorise ' + money(plan.chargeNow) : 'Pay ' + money(plan.chargeNow)}</button></div>`;
  };

  /* ---------- Behaviour ---------- */
  const go = (n) => { s.step = n; draw(); window.scrollTo({ top: 0, behavior: 'instant' }); el.querySelector('#book-form h2')?.focus?.(); };

  const bind = (qte, plan) => {
    const f = el.querySelector('#book-form');
    el.querySelectorAll('[data-goto]').forEach(b => b.onclick = () => go(+b.dataset.goto));
    const back = f.querySelector('[data-back]');
    if (back) back.onclick = () => go(s.step - 1);

    if (s.step === 1) {
      App.dateRangeField(f.querySelector('#bk-dates'), { start: s.start, end: s.end, vanId: van.id, minNights: van.minNights, clearable: false });
      f.addEventListener('change', () => {
        const d = App.formData(f);
        s.start = d.start; s.end = d.end > d.start ? d.end : App.addDays(d.start, van.minNights);
        s.adults = Math.max(1, +d.adults || 1); s.children = Math.max(0, +d.children || 0);
        if (driverOffer) s.options.driver = d.drive === 'driver';
        if ('delivery' in d) s.options.delivery = d.delivery || null;
        if ('oneWay' in d) s.options.oneWay = d.oneWay || null;
        history.replaceState(null, '', '#' + bookUrl());
        draw();
      });
    }
    if (s.step === 2) {
      f.addEventListener('change', (e) => {
        if (e.target.id === 'route-pick') { s.routeIdx = e.target.value === '' ? undefined : +e.target.value; return draw(); }
        const d = App.formData(f);
        s.options.protection = d.protection || 'basic';
        s.options.zeroDeposit = !!d.zeroDeposit;
        s.options.km = d.km || 'standard';
        s.options.addOns = [].concat(d.addOns || []);
        draw();
      });
    }
    if (s.step === 3) f.querySelectorAll('[name=who]').forEach(r => r.onchange = () => { s.selfDriver = r.value === 'me'; s.specialRequests = f.specialRequests.value; if (f.phone) s.driver.phone = f.phone.value; draw(); });
    if (s.step === 4) f.addEventListener('change', (e) => {
      if (e.target.name === 'agree') { s.agree = e.target.checked; return; }
      const d = App.formData(f);
      s.payPlan = d.payPlan || 'full'; s.depositMethod = d.depositMethod || s.depositMethod; s.payMethod = d.payMethod || 'upi';
      if (f.useCredit) s.useCredit = f.useCredit.checked;
      s.agree = !!d.agree; s.payError = null;
      draw();
    });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (s.step === 1) {
        if (s.adults + s.children > van.sleeps) return App.toast(`This van sleeps up to ${van.sleeps}.`, 'bad');
        if (App.nightsBetween(s.start, s.end) < van.minNights) return App.toast(`Minimum rental is ${van.minNights} nights.`, 'bad');
        if (!App.isAvailable(van.id, s.start, s.end)) return App.toast('Those dates are not available.', 'bad');
        return go(2);
      }
      if (s.step === 2) return go(3);
      if (s.step === 3) return submitDriver(f);
      return pay(f, qte, plan);
    });
  };

  const submitDriver = async (f) => {
    if (!f.checkValidity()) { f.reportValidity(); return; }
    const d = App.formData(f);
    const ageOn = (dob) => Math.floor((new Date(s.start) - new Date(dob)) / (365.25 * 86400000));
    s.specialRequests = (d.specialRequests || '').trim();
    const trav = App.travellerRecord(me);
    if (s.options.driver) {
      // The owner's verified driver drives; the renter is the verified account holder
      s.driver = { name: trav.identity.data?.name || me.name, age: App.C.minDriverAge, licence: '', phone: d.phone.trim(), provided: true, check: { status: 'verified', source: 'Driver provided and verified by the owner', note: 'Chauffeur' } };
      return go(4);
    }
    if (f.querySelector('[name=who]:checked')?.value === 'me') {
      // The verified licence on the traveller's profile covers this trip
      const lic = trav.licence, dob = trav.identity.data?.dob;
      s.driver = {
        name: trav.identity.data?.name || me.name, dob, age: dob ? ageOn(dob) : App.C.minDriverAge, phone: d.phone.trim(),
        licence: lic.data?.dlMasked || lic.data?.licenceMasked || '',
        check: { status: lic.status === 'verified' ? 'verified' : 'review', validUpto: lic.validUpto, source: lic.check?.source || 'International Driving Permit (reviewed by VanYatra)', checkedAt: lic.check?.checkedAt || lic.reviewedAt || lic.submittedAt, note: lic.status === 'verified' ? 'Verified on the traveller’s profile' : 'International Driving Permit under review', fromProfile: true }
      };
      if (s.driver.age < App.C.minDriverAge) return App.toast(`The main driver must be at least ${App.C.minDriverAge} on the pickup date.`, 'bad');
      return go(4);
    }
    const age = ageOn(d.dob);
    s.driver = { name: d.name.trim(), dob: d.dob, age, licence: d.licence.trim(), phone: d.phone.trim(), licencePhoto: f.licencePhoto?.files?.[0]?.name || null };
    s.dlConsent = !!f.dlConsent?.checked;
    if (age < App.C.minDriverAge) return App.toast(`The main driver must be at least ${App.C.minDriverAge} on the pickup date.`, 'bad');
    if (App.serverOnline) {
      const btn = f.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Checking licence…';
      try {
        s.dlCheck = await App.verify.run('dl', { dlNumber: s.driver.licence, dob: d.dob, name: s.driver.name, tripEnd: s.end });
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Continue to review';
        return App.toast(err.message, 'bad');
      }
      if (s.dlCheck.status === 'failed') { draw(); return App.toast('We couldn’t verify this driving licence — see details.', 'bad'); }
      s.driver.check = { status: s.dlCheck.status, validUpto: s.dlCheck.data.validUpto, source: s.dlCheck.source, checkedAt: s.dlCheck.checkedAt, note: App.verify.note(s.dlCheck) };
    }
    go(4);
  };

  const pay = async (f, qte, plan) => {
    if (!f.agree.checked) return App.toast('Please accept the terms to continue.', 'bad');
    s.agree = true;
    // Dates can be taken while the traveller is on this page
    if (!App.isAvailable(van.id, s.start, s.end)) { s.payError = 'Sorry — these dates were just booked by someone else. Go back and pick new dates.'; return draw(); }
    const btn = f.querySelector('[type=submit]');
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Starting secure checkout…';
    try {
      const request = !instantNow();
      // Fully covered by credit: nothing to send to the gateway
      const covered = plan.chargeNow <= 0;
      const order = covered ? { id: 'order_credit_' + Date.now().toString(36) } : await App.payments.createOrder({ amount: plan.chargeNow, receipt: `${van.id}:${s.start}:${s.end}`, notes: { van: van.name, plan: plan.type, deposit: plan.depositMethod } });
      const what = plan.type === 'part' ? '25% reservation' : 'Trip total';
      const pay = covered ? { status: 'paid', method: 'credit', label: 'VanYatra credit', paymentId: 'credit_' + Date.now().toString(36), signature: null }
        : await App.payments.checkout(order, { method: s.payMethod, description: `${request ? 'Authorise' : 'Pay'}: ${what}${plan.depositNow ? ' + refundable deposit' : ''}` });
      if (pay.status === 'cancelled') { btn.disabled = false; btn.innerHTML = label; return App.toast('Payment cancelled — you haven’t been charged.'); }
      if (pay.status === 'failed') { s.payError = pay.reason + ' You haven’t been charged. Try again or choose another payment method.'; return draw(); }
      btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Confirming payment…';
      if (!covered && !(await App.payments.verify(order, pay))) { s.payError = 'We couldn’t confirm this payment. You haven’t been charged. Please try again.'; return draw(); }
      const b = App.api.createBooking({
        vanId: van.id, start: s.start, end: s.end, adults: s.adults, children: s.children, options: s.options, driver: s.driver,
        payment: { method: pay.method, label: pay.label, orderId: order.id, paymentId: pay.paymentId, plan, creditUsed: plan.credit }, specialRequests: s.specialRequests
      });
      clearProgress();
      App.go('#/booking/' + b.id + '/confirmed');
    } catch (err) {
      s.payError = err.message; draw();
    }
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
      <div class="confirm-icon" aria-hidden="true">${App.icon(confirmed ? 'party-popper' : 'hourglass')}</div>
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
          <div><dt>${b.driver.provided ? 'Driver' : 'Main driver'}</dt><dd>${b.driver.provided ? 'Provided by the owner (verified by VanYatra)' : h`${b.driver.name} · licence ${b.driver.licenceMasked}`}</dd></div>
          ${b.pricing.delivery || b.pricing.oneWay ? h`<div><dt>Pickup & return</dt><dd>${b.pricing.delivery ? 'Delivered to ' + b.pricing.delivery.label : 'At the owner’s base'}${b.pricing.oneWay ? ' · drop-off in ' + b.pricing.oneWay.label : ''}</dd></div>` : ''}
          ${b.pricing.protection ? h`<div><dt>Protection</dt><dd>${b.pricing.protection.label} · liability up to ${money(b.pricing.protection.liability)}</dd></div>` : ''}
          <div><dt>Payment</dt><dd>${b.payment?.label || ''} · ${String(b.paymentStatus).replace('-', ' ')}${b.payment?.paymentId ? h`<br><span class="small muted">Ref ${b.payment.paymentId}</span>` : ''}
            ${b.payment?.plan?.type === 'part' ? h`<br><span class="small">${money(b.payment.plan.dueNow)} ${confirmed ? 'paid' : 'authorised'} now · ${money(b.payment.plan.balance)} charged automatically on ${fmtDate(b.payment.plan.balanceDueOn)}</span>` : ''}</dd></div>
          <div><dt>Deposit</dt><dd>${b.depositMethod === 'upi' ? h`${money(b.pricing.deposit)} paid by UPI · refunded automatically within ${App.C.depositReleaseDays} days of return` : b.depositMethod === 'none' ? 'None (zero-deposit)' : h`${money(b.pricing.deposit)} held on a card at pickup`}</dd></div>
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
          <a class="btn btn-primary" href="#/account/trips/${b.id}">${App.icon('map')} Plan itinerary</a>
          ${thread ? h`<a class="btn btn-ghost" href="#/account/messages/${thread.id}">${App.icon('message-circle')} Message ${owner.name.split(' ')[0]}</a>` : ''}
          <button class="btn btn-ghost" id="ics">${App.icon('calendar-days')} Add to calendar</button>
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
