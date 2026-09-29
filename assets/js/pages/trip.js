/*
 * Digital check-in and check-out.
 *
 *  #/trip/:id/checkin             — traveller's pre-check-in (from 7 days before pickup)
 *  #/trip/:id/inspection/pickup   — guided photo inspection at pickup
 *  #/trip/:id/inspection/return   — the same at return, compared with pickup
 *
 * Both the traveller and the owner see and sign the same record, so there is
 * shared, timestamped evidence if the deposit is disputed (the most common
 * complaint about camper rentals). Photos are resized in the browser; live, they
 * go to encrypted object storage (see ROADMAP → "Needs a real backend").
 */
(() => {
const { h, money, fmtDate } = App;

App.INSPECTION = {
  angles: [
    ['front', 'Front'], ['back', 'Back'], ['left', 'Driver side'], ['right', 'Passenger side'],
    ['fl', 'Front-left corner'], ['fr', 'Front-right corner'], ['rl', 'Rear-left corner'], ['rr', 'Rear-right corner']
  ],
  gauges: [['fuel', 'Fuel gauge'], ['odometer', 'Odometer']],
  fuel: ['Empty', '1/4', '1/2', '3/4', 'Full'],
  areas: ['Front bumper', 'Rear bumper', 'Driver side', 'Passenger side', 'Roof / awning', 'Windscreen & glass', 'Tyres & wheels', 'Interior', 'Kitchen & appliances', 'Other']
};
const PHASE = { pickup: 'Pickup', return: 'Return' };

const access = (b, me) => b && me && (b.customerId === me.id || b.ownerId === me.id || me.role === 'admin');
const roleOf = (b, me) => (me.id === b.customerId ? 'customer' : me.id === b.ownerId ? 'owner' : 'admin');
const record = (b, phase) => {
  b.inspections = b.inspections || {};
  return b.inspections[phase] || (b.inspections[phase] = { photos: {}, fuel: '', odometer: '', damages: [], signed: {} });
};
const complete = (r) => [...App.INSPECTION.angles, ...App.INSPECTION.gauges].every(([k]) => r.photos[k]) && r.fuel && r.odometer;
const locked = (r) => !!(r.signed.customer && r.signed.owner);

// Where a booking is in the check-in / check-out process (for trip cards and dashboards)
App.tripSteps = (b) => {
  const today = App.today();
  const pick = b.inspections?.pickup, ret = b.inspections?.return;
  return {
    checkinOpen: b.status === 'confirmed' && today >= App.addDays(b.start, -7) && today <= b.start,
    checkinDone: !!b.checkin,
    pickupOpen: ['confirmed', 'completed'].includes(b.status) && today >= App.addDays(b.start, -1),
    pickupDone: !!(pick && locked(pick)),
    returnOpen: ['confirmed', 'completed'].includes(b.status) && today >= b.start,
    returnDone: !!(ret && locked(ret))
  };
};

/* ---------- Pre-check-in ---------- */
App.pages.checkin = (el, { id }) => {
  const me = App.me(), b = App.get.booking(id);
  if (!access(b, me) || me.id !== b.customerId) return App.pages.notFound(el);
  const van = App.get.van(b.vanId), trav = App.travellerRecord(me);
  const ci = b.checkin || {};
  el.innerHTML = String(h`<div class="container narrow section">
    <a class="back-link" href="#/account/bookings">← My trips</a>
    <h1>Pre-check-in</h1>
    <p class="muted">${van.name} · ${App.fmt.dateRange(b.start, b.end)} · pickup from ${van.pickup.time} in ${van.pickup.city}. Doing this now makes pickup take about 15 minutes instead of an hour.</p>
    <form class="card" id="ci-form" novalidate>
      <h2>Documents</h2>
      <ul class="plain list-rows">
        <li><span>${App.icon('id-card')} Identity</span>${App.statusBadge(trav.identity.status)}</li>
        <li><span>${App.icon('car')} ${b.driver.provided ? 'Driver provided by the owner' : `Driving licence · ${b.driver.name}`}</span>${b.driver.provided ? App.statusBadge('verified') : App.statusBadge(b.driver.check?.status === 'verified' ? 'verified' : b.driver.check ? 'pending' : 'not_started')}</li>
      </ul>
      ${trav.identity.status !== 'verified' ? h`<p class="small"><a href="#/account/verification">Finish your verification</a> before pickup.</p>` : ''}
      <p class="small muted">Bring the original ${b.driver.provided ? 'ID' : 'driving licence and ID'} — the owner checks them against these records.</p>
      <h2>Arrival</h2>
      <div class="grid-2">
        <label class="field"><span>Arrival time</span><select name="arrival" required>${['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(t => h`<option ${(ci.arrival || van.pickup.time) === t ? 'selected' : ''}>${t}</option>`)}</select></label>
        <label class="field"><span>Travellers</span><input type="number" name="travellers" min="1" max="${van.sleeps}" value="${ci.travellers || b.travelers}" required></label>
        <label class="field"><span>Emergency contact name</span><input name="ecName" value="${ci.ecName || ''}" required autocomplete="off"></label>
        <label class="field"><span>Emergency contact phone</span><input type="tel" name="ecPhone" value="${ci.ecPhone || ''}" required pattern="(\\+[1-9][0-9 \\-]{7,16})|((\\+?91[ \\-]?)?[6-9][0-9]{4}[ \\-]?[0-9]{5})" title="A 10-digit Indian mobile number, or with country code"></label>
      </div>
      <h2>Before you go</h2>
      <label class="check"><input type="checkbox" name="rules" required ${ci.rules ? 'checked' : ''}> I’ve read the house rules: ${van.rules.slice(0, 3).join('; ')}.</label>
      <label class="check"><input type="checkbox" name="inspection" required ${ci.inspection ? 'checked' : ''}> I’ll do the photo walkaround with the owner at pickup and return.</label>
      <div class="form-actions"><button class="btn btn-primary btn-lg">${b.checkin ? 'Update pre-check-in' : 'Complete pre-check-in'}</button></div>
    </form>
  </div>`);
  const f = el.querySelector('#ci-form');
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!f.checkValidity()) return f.reportValidity();
    const d = App.formData(f);
    b.checkin = { arrival: d.arrival, travellers: +d.travellers, ecName: d.ecName.trim(), ecPhone: d.ecPhone.trim(), rules: true, inspection: true, at: new Date().toISOString() };
    App.notify(b.ownerId, `${me.name} completed pre-check-in for ${b.id}: arriving ${d.arrival} on ${fmtDate(b.start)}.`, '#/owner/bookings');
    App.save();
    App.toast('Pre-check-in done. See you at pickup!', 'good');
    App.go('#/account/bookings');
  };
};

/* ---------- Photo inspection ---------- */
App.pages.inspection = (el, { id, phase }) => {
  const me = App.me(), b = App.get.booking(id);
  if (!access(b, me) || !PHASE[phase]) return App.pages.notFound(el);
  const van = App.get.van(b.vanId), role = roleOf(b, me);
  const r = record(b, phase);
  const pick = b.inspections?.pickup;
  const steps = App.tripSteps(b);
  const open = phase === 'pickup' ? steps.pickupOpen : steps.returnOpen && !!(pick && locked(pick));
  // Locked once both have signed; re-checked on every redraw
  let readOnly = locked(r) || role === 'admin' || !open;
  const back = role === 'owner' ? '#/owner/bookings' : role === 'admin' ? '#/admin/disputes' : '#/account/bookings';

  const slot = (k, label) => {
    const p = r.photos[k];
    return h`<div class="insp-slot ${p ? 'done' : ''}">
      <div class="insp-media">${p ? h`<img src="${p.src}" alt="${label} at ${PHASE[phase].toLowerCase()}">` : h`<span class="shot-ph">${App.icon('camera', { size: 26 })}</span>`}</div>
      <div class="insp-body"><strong>${label}</strong>${p ? h`<span class="small muted">${App.fmtDateTime(p.at)}</span>` : ''}
        ${readOnly ? '' : h`<label class="btn btn-sm ${p ? 'btn-ghost' : ''}"><input type="file" accept="image/*" capture="environment" class="sr-only" data-shot="${k}" aria-label="${p ? 'Retake' : 'Take'} ${label} photo">${p ? 'Retake' : 'Take photo'}</label>`}</div>
    </div>`;
  };
  const km = () => (pick?.odometer && r.odometer && phase === 'return' ? +r.odometer - +pick.odometer : null);
  const draw = () => {
    readOnly = locked(r) || role === 'admin' || !open;
    const done = complete(r);
    const driven = km();
    const included = b.pricing.kmIncluded;
    el.innerHTML = String(h`<div class="container section">
      <a class="back-link" href="${back}">← Back</a>
      <h1>${PHASE[phase]} inspection</h1>
      <p class="muted">${van.name} · ${b.id} · ${App.fmt.dateRange(b.start, b.end)}. Walk around the van together and photograph each angle. Photos are timestamped and shared with both of you${phase === 'return' ? ', and compared with pickup' : ''}.</p>
      ${!open && !locked(r) ? h`<div class="alert alert-warn">${phase === 'pickup' ? `The pickup inspection opens the day before pickup (${fmtDate(App.addDays(b.start, -1))}).` : 'The return inspection opens once the pickup inspection is signed by both of you.'}</div>` : ''}
      <div class="insp-status">
        <span>${r.signed.customer ? App.icon('check') : App.icon('clock')} Traveller ${r.signed.customer ? 'signed ' + App.fmtDateTime(r.signed.customer) : 'not signed'}</span>
        <span>${r.signed.owner ? App.icon('check') : App.icon('clock')} Owner ${r.signed.owner ? 'signed ' + App.fmtDateTime(r.signed.owner) : 'not signed'}</span>
      </div>
      <h2>Outside (8 angles)</h2>
      <div class="insp-grid">${App.INSPECTION.angles.map(([k, l]) => slot(k, l))}</div>
      <h2>Fuel and distance</h2>
      <div class="insp-grid">${App.INSPECTION.gauges.map(([k, l]) => slot(k, l))}</div>
      <div class="grid-2">
        <label class="field"><span>Fuel level</span><select id="fuel" ${readOnly ? 'disabled' : ''}><option value="">Choose…</option>${App.INSPECTION.fuel.map(x => h`<option ${r.fuel === x ? 'selected' : ''}>${x}</option>`)}</select></label>
        <label class="field"><span>Odometer (km)</span><input type="number" id="odo" min="0" max="999999" inputmode="numeric" value="${r.odometer}" ${readOnly ? 'disabled' : ''}></label>
      </div>
      ${phase === 'return' && pick ? h`<div class="callout">
        <strong>Compared with pickup:</strong> fuel ${pick.fuel || '—'} → ${r.fuel || '—'}${pick.fuel && r.fuel && App.INSPECTION.fuel.indexOf(r.fuel) < App.INSPECTION.fuel.indexOf(pick.fuel) ? h` <span class="badge badge-warn">lower</span>` : ''} ·
        ${driven != null ? h`${App.fmt.km(driven)} driven${included ? h` of ${App.fmt.km(included)} included${driven > included ? h` · <strong>${App.fmt.km(driven - included)} extra ≈ ${money((driven - included) * b.pricing.extraKmFee)}</strong>` : ''}` : ' (unlimited)'}` : 'enter the odometer reading'}
      </div>` : ''}
      <h2>Damage marks</h2>
      ${r.damages.length ? h`<ul class="plain damage-list">${r.damages.map((d, i) => h`<li>${d.src ? h`<img src="${d.src}" alt="Damage: ${d.area}">` : ''}<div><strong>${d.area}</strong><p>${d.note}</p><span class="small muted">${d.by === 'owner' ? 'Owner' : 'Traveller'} · ${App.fmtDateTime(d.at)}</span></div>${readOnly ? '' : h`<button type="button" class="icon-btn" data-del-dmg="${i}" aria-label="Remove damage note">${App.icon('x')}</button>`}</li>`)}</ul>` : h`<p class="muted small">${phase === 'pickup' ? 'Note any existing scratches or dents so you aren’t charged for them.' : 'None noted.'}</p>`}
      ${readOnly ? '' : h`<form id="dmg-form" class="card dmg-form"><h3>Add a damage mark</h3>
        <div class="grid-2"><label class="field"><span>Where</span><select name="area">${App.INSPECTION.areas.map(a => h`<option>${a}</option>`)}</select></label>
        <label class="field"><span>Photo</span><input type="file" name="photo" accept="image/*" capture="environment"></label></div>
        <label class="field"><span>What’s there</span><input name="note" required maxlength="200" placeholder="e.g. 5 cm scratch above the rear wheel"></label>
        <button class="btn btn-sm">Add</button></form>`}
      ${phase === 'return' && pick ? h`<h2>Pickup vs return</h2><div class="compare-grid">${App.INSPECTION.angles.map(([k, l]) => h`<figure><figcaption>${l}</figcaption><div>${pick.photos[k] ? h`<img src="${pick.photos[k].src}" alt="${l} at pickup">` : ''}${r.photos[k] ? h`<img src="${r.photos[k].src}" alt="${l} at return">` : h`<span class="small muted">No return photo yet</span>`}</div></figure>`)}</div>` : ''}
      ${readOnly ? '' : h`<div class="card sign-card">
        <label class="check"><input type="checkbox" id="agree"> I confirm these photos, readings and damage marks are an accurate record of the van at ${PHASE[phase].toLowerCase()}.</label>
        <button type="button" class="btn btn-primary" id="sign" ${done ? '' : 'disabled'}>${App.icon('check')} Sign as ${role === 'owner' ? 'owner' : 'traveller'}</button>
        ${done ? '' : h`<p class="small muted">Add all 10 photos, the fuel level and odometer reading to sign.</p>`}
      </div>`}
      ${locked(r) && phase === 'return' && role === 'owner' && !App.db.disputes.some(d => d.bookingId === b.id && d.status === 'open') ? h`<div class="card"><h3>Something wrong?</h3><p class="small muted">You can claim from the deposit within 48 hours of return. The claim includes both inspections as evidence.</p><button type="button" class="btn btn-ghost" id="claim">Claim from the deposit</button></div>` : ''}
    </div>`);
    bind();
  };

  const save = () => { App.save(); };
  const bind = () => {
    el.querySelectorAll('[data-shot]').forEach(inp => inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      try {
        r.photos[inp.dataset.shot] = { src: await App.readPhoto(file, 480), at: new Date().toISOString(), by: role };
        r.signed = {}; save(); draw();
      } catch (err) { App.toast(err.message, 'bad'); }
    });
    const fuel = el.querySelector('#fuel'), odo = el.querySelector('#odo');
    if (fuel) fuel.onchange = () => { r.fuel = fuel.value; r.signed = {}; save(); draw(); };
    if (odo) odo.onchange = () => { r.odometer = odo.value; r.signed = {}; save(); draw(); };
    el.querySelectorAll('[data-del-dmg]').forEach(x => x.onclick = () => { r.damages.splice(+x.dataset.delDmg, 1); r.signed = {}; save(); draw(); });
    const df = el.querySelector('#dmg-form');
    if (df) df.onsubmit = async (e) => {
      e.preventDefault();
      if (!df.checkValidity()) return df.reportValidity();
      const file = df.photo.files[0];
      let src = null;
      try { if (file) src = await App.readPhoto(file, 480); } catch (err) { return App.toast(err.message, 'bad'); }
      r.damages.push({ area: df.area.value, note: df.note.value.trim(), src, at: new Date().toISOString(), by: role });
      r.signed = {}; save(); draw();
    };
    const sign = el.querySelector('#sign');
    if (sign) sign.onclick = () => {
      if (!el.querySelector('#agree').checked) return App.toast('Please confirm the record is accurate.', 'bad');
      r.signed[role] = new Date().toISOString();
      const other = role === 'owner' ? b.customerId : b.ownerId;
      App.notify(other, locked(r) ? `${PHASE[phase]} inspection for ${b.id} is signed by both of you.` : `${me.name} signed the ${phase} inspection for ${b.id}. Please review and sign.`, `#/trip/${b.id}/inspection/${phase}`);
      App.audit('inspection.sign', `${b.id} ${phase} by ${role}`);
      save(); draw();
      App.toast(locked(r) ? 'Inspection complete — signed by both of you.' : 'Signed. Waiting for the other party.', 'good');
    };
    const claim = el.querySelector('#claim');
    if (claim) claim.onclick = async () => {
      const res = await App.modal({
        title: 'Claim from the deposit',
        body: h`<label class="field"><span>Amount (up to ${money(b.pricing.deposit)})</span><input type="number" id="c-amt" min="1" max="${b.pricing.deposit}" value="${Math.min(b.pricing.deposit, 2000)}"></label>
          <label class="field"><span>What happened</span><textarea id="c-note" rows="3" placeholder="Refer to the damage marks and photos"></textarea></label>`,
        actions: [{ label: 'Cancel', value: null }, { label: 'Submit claim', primary: true, validate: (m) => (+m.querySelector('#c-amt').value > 0 && m.querySelector('#c-note').value.trim()) || (App.toast('Add an amount and a description.', 'bad'), false), value: (m) => ({ amount: Math.min(+m.querySelector('#c-amt').value, b.pricing.deposit), note: m.querySelector('#c-note').value.trim() }) }]
      });
      if (!res) return;
      App.api.openDispute(b.id, 'owner', res.note, res.amount);
      App.toast('Claim submitted. The deposit is held until our team decides.', 'good');
      draw();
    };
  };
  draw();
};
})();
