/*
 * Van owner onboarding wizard (12 steps).
 * Owner-level steps (account, KYC, business, payout) are done once.
 * Vehicle-level steps are done for every van (?van=<id> or ?van=new).
 */
(() => {
const { h, money, photo } = App;

App.ONBOARDING_STEPS = [
  { id: 'account', scope: 'owner', title: 'Account & contact verification', blurb: 'Verify your email and mobile number.' },
  { id: 'kyc', scope: 'owner', title: 'Identity verification (KYC)', blurb: 'Government ID and a live selfie.' },
  { id: 'business', scope: 'owner', title: 'Business & contact details', blurb: 'How travellers and our team reach you.' },
  { id: 'ownership', scope: 'van', title: 'Vehicle ownership', blurb: 'Prove the van is yours or that you’re authorised.' },
  { id: 'registration', scope: 'van', title: 'Registration & legal documents', blurb: 'RC, rental licence, PUC, fitness and permits.' },
  { id: 'insurance', scope: 'van', title: 'Insurance', blurb: 'Commercial cover for self-drive rental.' },
  { id: 'inspection', scope: 'van', title: 'Safety inspection', blurb: 'Roadworthiness and habitation checks.' },
  { id: 'photos', scope: 'van', title: 'Photos & specifications', blurb: 'Show travellers what they’re booking.' },
  { id: 'listing', scope: 'van', title: 'Amenities, pricing & rules', blurb: 'Prices, availability, deposit, cancellation.' },
  { id: 'payout', scope: 'owner', title: 'Payout setup', blurb: 'Where we send your earnings.' },
  { id: 'review', scope: 'van', title: 'Platform review', blurb: 'Our team checks everything (≈2 business days).' },
  { id: 'publish', scope: 'van', title: 'Publish listing', blurb: 'Go live and start taking bookings.' }
];

App.newVan = (ownerId) => ({
  id: App.uid('v'), ownerId, name: '', type: 'Campervan', destinationId: App.db.destinations[0].id, city: '', sleeps: 4, seats: 4,
  make: '', model: '', year: new Date().getFullYear(), fuel: 'Diesel', transmission: 'Manual', amenities: [], familyFriendly: false, petFriendly: false,
  instantBook: false, cancellation: 'moderate', pricePerNight: 5000, weekendPrice: 5500, cleaningFee: 1200, deposit: 15000, minNights: 2,
  discounts: { weekly: 10, monthly: 20 }, kmPerDay: 250, extraKmFee: 12, beds: '', length: '', licence: 'Standard LMV car licence', mileage: '',
  pickup: { city: '', address: '', lat: 0, lng: 0, time: '11:00', returnTime: '10:00' }, rules: ['No smoking inside the van', 'Return with the same fuel level'],
  description: '', photos: [], blocked: [], status: 'draft',
  verification: { ownership: 'not_started', registration: 'not_started', insurance: 'not_started', inspection: 'not_started', photos: 'not_started', listing: 'not_started', review: 'not_started' },
  views: 0, createdAt: new Date().toISOString()
});

App.stepStatus = (step, ownerId, van) => {
  const o = App.db.owners[ownerId] || {};
  if (step.scope === 'owner') return o[step.id]?.status || 'not_started';
  if (!van) return 'not_started';
  if (step.id === 'publish') return van.status === 'published' ? 'verified' : van.status === 'suspended' ? 'action_required' : 'not_started';
  return van.verification[step.id] || 'not_started';
};

const fileField = (name, label, required = true) => h`<label class="field"><span>${label}${required ? '' : ' (optional)'}</span><input type="file" name="${name}" accept=".pdf,image/jpeg,image/png" ${required ? 'required' : ''}><small class="muted">PDF, JPG or PNG up to 10 MB. Stored encrypted; only our verification team can view it.</small></label>`;
const checkFile = (input) => {
  const f = input?.files?.[0];
  if (!f) return null;
  if (f.size > 10 * 1024 * 1024) throw new Error('Files must be under 10 MB.');
  if (!/(pdf|jpe?g|png)$/i.test(f.name)) throw new Error('Upload a PDF, JPG or PNG.');
  return f.name;
};

App.pages.onboarding = (el, _p, q) => {
  const me = App.me();
  App.db.owners[me.id] = App.db.owners[me.id] || { account: { status: 'action_required', note: 'Verify your email and mobile number.' } };
  const owner = App.db.owners[me.id];
  if (me.emailVerified && me.phoneVerified && owner.account?.status !== 'verified') { owner.account = { status: 'verified' }; App.save(); }
  const myVans = App.db.vans.filter(v => v.ownerId === me.id);
  let van = q.van && q.van !== 'new' ? App.get.van(q.van) : null;
  if (van && van.ownerId !== me.id) return App.pages.notFound(el);
  if (!van && q.van !== 'new') van = myVans.find(v => v.status !== 'published') || myVans[0] || null;
  const statuses = App.ONBOARDING_STEPS.map(s => App.stepStatus(s, me.id, van));
  const firstOpen = statuses.findIndex(s => s !== 'verified' && s !== 'pending');
  const stepIdx = Math.max(0, Math.min(11, q.step ? +q.step - 1 : firstOpen === -1 ? 11 : firstOpen));
  const step = App.ONBOARDING_STEPS[stepIdx];
  const done = statuses.filter(s => s === 'verified').length;
  const link = (i) => `#/owner/onboarding?${van ? 'van=' + van.id + '&' : q.van === 'new' ? 'van=new&' : ''}step=${i + 1}`;

  el.innerHTML = String(h`
  <div class="container onboard">
    <div class="onboard-head">
      <div><p class="eyebrow">Owner onboarding</p><h1>${van ? (van.name || 'New van') : 'Get verified & list your van'}</h1>
        <p class="muted">Complete each step — you can save and come back any time. Documents are reviewed within 2 business days.</p></div>
      ${myVans.length > 1 || (myVans.length && q.van === 'new') ? h`<label class="field inline"><span>Vehicle</span><select id="van-switch">${myVans.map(v => h`<option value="${v.id}" ${van && van.id === v.id ? 'selected' : ''}>${v.name || 'Untitled van'}</option>`)}<option value="new" ${!van ? 'selected' : ''}>+ Add a new van</option></select></label>` : ''}
    </div>
    <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="12" aria-valuenow="${done}" aria-label="Verified steps"><span style="width:${done / 12 * 100}%"></span></div>
    <p class="small muted">${done} of 12 steps verified</p>
    <div class="onboard-layout">
      <ol class="step-nav">${App.ONBOARDING_STEPS.map((s, i) => h`<li><a href="${link(i)}" class="${i === stepIdx ? 'current' : ''} st-${statuses[i]}" ${i === stepIdx ? h`aria-current="step"` : ''}>
        <span class="sn">${statuses[i] === 'verified' ? '✓' : i + 1}</span><span class="st"><strong>${s.title}</strong>${App.statusBadge(statuses[i])}</span></a></li>`)}</ol>
      <section class="card step-body" id="step-body">
        <p class="eyebrow">Step ${stepIdx + 1} of 12 · ${step.scope === 'owner' ? 'Your profile' : 'This vehicle'}</p>
        <h2>${step.title}</h2>
        ${statuses[stepIdx] !== 'not_started' ? h`<div class="step-status">${App.statusBadge(statuses[stepIdx])} ${statusNote(step, owner, van)}</div>` : ''}
        <div id="step-content"></div>
      </section>
    </div>
  </div>`);
  const sw = el.querySelector('#van-switch');
  if (sw) sw.onchange = () => App.go('#/owner/onboarding?van=' + sw.value);
  const next = () => App.go(link(Math.min(11, stepIdx + 1)));
  const ctx = { me, owner, van, next, statuses, el, link };
  STEPS[step.id](el.querySelector('#step-content'), ctx);
};

const statusNote = (step, owner, van) => {
  const note = step.scope === 'owner' ? owner[step.id]?.note : van?.verificationNotes?.[step.id];
  const docs = van ? App.get.docsFor({ vanId: van.id }).filter(d => d.note && ['action_required', 'rejected'].includes(d.status)) : [];
  const relevant = docs.filter(d => (step.id === 'insurance' && d.type === 'insurance') || (step.id === 'registration' && App.C.registrationDocs.some(r => r.type === d.type)) || (step.id === 'inspection' && d.type === 'inspection') || (step.id === 'ownership' && d.type.startsWith('ownership')));
  return h`${note ? h`<span class="small">${note}</span>` : ''}${relevant.map(d => h`<div class="small"><strong>${d.label}:</strong> ${d.note}</div>`)}`;
};

// Vehicle steps need a van; create a draft one the first time
const needVan = (c, ctx) => {
  if (ctx.van) return false;
  c.innerHTML = String(h`<p>Let’s start with your vehicle. Complete <a href="${ctx.link(3)}">Step 4 · Vehicle ownership</a> first to create your van.</p>`);
  return true;
};

const docStatusList = (docs) => docs.length ? h`<ul class="doc-status">${docs.map(d => { const ex = App.docExpiryState(d); return h`<li><span>${d.label}${d.fileName ? h` <span class="small muted">· ${d.fileName}</span>` : ''}</span>${ex ? h`<span class="badge badge-${ex.tone}">${ex.label}</span>` : ''}${App.statusBadge(d.status)}</li>`; })}</ul>` : '';

const STEPS = {
  account(c, { me, owner, next }) {
    c.innerHTML = String(h`<p>We send booking alerts and payout updates to these. Both must be verified.</p><div id="otp"></div>
      <div class="form-actions"><button class="btn btn-primary" id="nx" ${owner.account?.status === 'verified' ? '' : 'disabled'}>Continue</button></div>`);
    App.otpWidget(c.querySelector('#otp'), me, () => { owner.account = { status: 'verified' }; App.save(); App.render(); });
    c.querySelector('#nx').onclick = next;
  },

  kyc(c, { me, owner, next }) {
    const docs = App.get.docsFor({ ownerId: me.id }).filter(d => !d.vanId && ['aadhaar', 'pan', 'selfie'].includes(d.type));
    const st = owner.kyc?.status;
    if (st === 'verified' || st === 'pending') {
      c.innerHTML = String(h`${docStatusList(docs)}<p class="muted small">${st === 'pending' ? 'Our team is reviewing your documents. You can continue with the next steps meanwhile.' : 'Your identity is verified.'}</p><div class="form-actions"><button class="btn btn-primary" id="nx">Continue</button></div>`);
      c.querySelector('#nx').onclick = next;
      return;
    }
    c.innerHTML = String(h`<p>${App.C.kyc.intro}</p>
      <form id="f" novalidate>
        <div class="grid-2">
          <label class="field"><span>Aadhaar number</span><input name="aadhaar" inputmode="numeric" pattern="[0-9]{12}" maxlength="12" required autocomplete="off"><small class="muted">We verify via DigiLocker and keep only the last 4 digits.</small></label>
          <label class="field"><span>PAN</span><input name="pan" pattern="${App.C.kyc.documents[1].pattern.slice(1, -1)}" maxlength="10" required style="text-transform:uppercase" autocomplete="off"></label>
        </div>
        ${fileField('aadhaarFile', 'Aadhaar (masked copy or DigiLocker PDF)')}
        ${fileField('panFile', 'PAN card')}
        <label class="field"><span>Live selfie</span><input type="file" name="selfie" accept="image/*" capture="user" required><small class="muted">Matched against your ID photo.</small></label>
        <label class="check"><input type="checkbox" name="consent" required> I consent to VanYatra verifying my identity with UIDAI/DigiLocker and NSDL for KYC purposes only.</label>
        <div class="form-actions"><button class="btn btn-primary">Submit for verification</button></div>
      </form>`);
    const f = c.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      f.pan.value = f.pan.value.toUpperCase();
      if (!f.checkValidity()) return f.reportValidity();
      try {
        const aFile = checkFile(f.aadhaarFile), pFile = checkFile(f.panFile), sFile = f.selfie.files[0]?.name;
        const last4 = f.aadhaar.value.slice(-4);
        App.api.uploadDocument({ ownerId: me.id, type: 'aadhaar', label: 'Aadhaar (masked)', number: 'XXXX-XXXX-' + last4, fileName: aFile });
        App.api.uploadDocument({ ownerId: me.id, type: 'pan', label: 'PAN card', number: 'XXXXX' + f.pan.value.slice(5), fileName: pFile });
        App.api.uploadDocument({ ownerId: me.id, type: 'selfie', label: 'Live selfie', fileName: sFile });
        owner.kyc = { status: 'pending', data: { aadhaarLast4: last4, panMasked: 'XXXXX' + f.pan.value.slice(5) } };
        App.save(); App.toast('KYC submitted for review', 'good'); next();
      } catch (err) { App.toast(err.message, 'bad'); }
    };
  },

  business(c, { me, owner, next }) {
    const d = owner.business?.data || {};
    c.innerHTML = String(h`<form id="f" novalidate>
      <fieldset class="field"><legend>You are listing as</legend>
        <label class="check"><input type="radio" name="kind" value="individual" ${d.kind !== 'company' ? 'checked' : ''}> An individual</label>
        <label class="check"><input type="radio" name="kind" value="company" ${d.kind === 'company' ? 'checked' : ''}> A registered business</label></fieldset>
      <div class="grid-2">
        <label class="field"><span>Display / business name</span><input name="business" value="${d.business || me.business || me.name}" required></label>
        <label class="field"><span>${App.C.business.taxIdLabel}</span><input name="gstin" value="${d.gstin || ''}" pattern="${App.C.business.taxIdPattern.slice(1, -1)}" style="text-transform:uppercase"></label>
        <label class="field"><span>Support phone for travellers</span><input type="tel" name="phone" value="${d.phone || me.phone}" required></label>
        <label class="field"><span>Emergency contact (name & phone)</span><input name="emergency" value="${d.emergency || ''}" required></label>
      </div>
      <label class="field"><span>Registered address</span><textarea name="address" rows="2" required>${d.address || ''}</textarea></label>
      <div class="grid-3"><label class="field"><span>City</span><input name="city" value="${d.city || me.city || ''}" required></label><label class="field"><span>State</span><input name="state" value="${d.state || ''}" required></label><label class="field"><span>PIN code</span><input name="pin" value="${d.pin || ''}" pattern="[0-9]{6}" inputmode="numeric" required></label></div>
      <div class="form-actions"><button class="btn btn-primary">Save & continue</button></div></form>`);
    const f = c.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      f.gstin.value = f.gstin.value.toUpperCase();
      if (!f.checkValidity()) return f.reportValidity();
      const data = App.formData(f);
      owner.business = { status: 'verified', data };
      me.business = data.business; me.city = data.city;
      App.save(); App.toast('Business details saved', 'good'); next();
    };
  },

  ownership(c, ctx) {
    const { me } = ctx;
    const van = ctx.van;
    const docs = van ? App.get.docsFor({ vanId: van.id }).filter(d => d.type.startsWith('ownership')) : [];
    c.innerHTML = String(h`${docStatusList(docs)}<form id="f" novalidate>
      <div class="grid-2">
        <label class="field"><span>Registration number</span><input name="reg" value="${van?.regNo || ''}" placeholder="e.g. HP 01 AB 1234" required pattern="[A-Za-z]{2}[ \\-]?[0-9]{1,2}[ \\-]?[A-Za-z]{0,3}[ \\-]?[0-9]{1,4}"></label>
        <label class="field"><span>Name on RC</span><input name="rcName" value="${van?.rcName || me.name}" required></label>
        <label class="field"><span>Make</span><input name="make" value="${van?.make || ''}" placeholder="Force, Tata, Mahindra…" required></label>
        <label class="field"><span>Model</span><input name="model" value="${van?.model || ''}" required></label>
        <label class="field"><span>Year</span><input type="number" name="year" min="2005" max="${new Date().getFullYear() + 1}" value="${van?.year || ''}" required></label>
        <label class="field"><span>Chassis number (last 5)</span><input name="chassis" maxlength="5" value="${van?.chassis || ''}" required></label>
      </div>
      <fieldset class="field"><legend>Your relationship to the vehicle</legend>
        ${App.C.ownership.options.map((o, i) => h`<label class="check"><input type="radio" name="relation" value="${o.value}" ${(van?.relation || 'owner') === o.value ? 'checked' : ''}> ${o.label}</label>`)}</fieldset>
      <div id="auth-docs"></div>
      ${fileField('rcFile', 'Registration Certificate (RC) front & back')}
      <div class="form-actions"><button class="btn btn-primary">Submit ownership proof</button></div></form>`);
    const f = c.querySelector('#f');
    const drawAuth = () => {
      const rel = f.relation.value;
      c.querySelector('#auth-docs').innerHTML = String(rel === 'authorised' ? h`${fileField('nocFile', 'NOC / authorisation letter from the registered owner')}${fileField('agreementFile', 'Lease / management agreement')}` : rel === 'company' ? fileField('boardFile', 'Company letter authorising you to list this vehicle') : '');
    };
    f.querySelectorAll('[name=relation]').forEach(r => r.onchange = drawAuth);
    drawAuth();
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      try {
        const d = App.formData(f);
        const v = van || App.newVan(me.id);
        Object.assign(v, { regNo: d.reg.toUpperCase(), rcName: d.rcName, make: d.make, model: d.model, year: +d.year, chassis: d.chassis, relation: d.relation });
        if (!v.name) v.name = `${d.make} ${d.model}`;
        App.api.saveVan(v);
        App.api.uploadDocument({ ownerId: me.id, vanId: v.id, type: 'ownership_rc', label: 'Ownership proof (RC in name of ' + d.rcName + ')', number: d.reg.toUpperCase(), fileName: checkFile(f.rcFile) });
        if (d.relation === 'authorised') App.api.uploadDocument({ ownerId: me.id, vanId: v.id, type: 'ownership_noc', label: 'Owner NOC & agreement', fileName: checkFile(f.nocFile) + ', ' + checkFile(f.agreementFile) });
        if (d.relation === 'company') App.api.uploadDocument({ ownerId: me.id, vanId: v.id, type: 'ownership_company', label: 'Company authorisation', fileName: checkFile(f.boardFile) });
        v.verification.ownership = 'pending';
        App.save(); App.toast('Ownership proof submitted', 'good');
        App.go(`#/owner/onboarding?van=${v.id}&step=5`);
      } catch (err) { App.toast(err.message, 'bad'); }
    };
  },

  registration(c, ctx) { docStep(c, ctx, App.C.registrationDocs, 'registration'); },
  insurance(c, ctx) { docStep(c, ctx, App.C.insuranceDocs, 'insurance', true); },

  inspection(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van, me, next } = ctx;
    const docs = App.get.docsFor({ vanId: van.id, type: 'inspection' });
    c.innerHTML = String(h`${docStatusList(docs)}
      <p>Every van needs a safety & habitation inspection before going live, then every 12 months.</p>
      <div class="seg" role="tablist"><button class="on" data-mode="book" role="tab" aria-selected="true">Book a VanYatra inspector</button><button data-mode="upload" role="tab" aria-selected="false">Upload a garage report</button></div>
      <form id="f" novalidate>
        <div id="mode-book"><div class="grid-2"><label class="field"><span>Preferred date</span><input type="date" name="date" min="${App.addDays(App.today(), 2)}"></label><label class="field"><span>Location</span><input name="loc" value="${van.pickup.city || me.city || ''}"></label></div><p class="small muted">Inspection fee ${money(1500)}, deducted from your first payout.</p></div>
        <div id="mode-upload" hidden>${fileField('report', 'Signed inspection report from an authorised workshop', false)}<label class="field"><span>Report expiry</span><input type="date" name="expiry" min="${App.today()}"></label></div>
        <fieldset class="field"><legend>Self-declaration checklist</legend>${App.C.inspectionChecklist.map((item, i) => h`<label class="check"><input type="checkbox" name="chk" value="${i}" required> ${item}</label>`)}</fieldset>
        <div class="form-actions"><button class="btn btn-primary">Submit inspection</button></div>
      </form>`);
    let mode = 'book';
    c.querySelectorAll('[data-mode]').forEach(b => b.onclick = (e) => { e.preventDefault(); mode = b.dataset.mode; c.querySelectorAll('[data-mode]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); c.querySelector('#mode-book').hidden = mode !== 'book'; c.querySelector('#mode-upload').hidden = mode !== 'upload'; });
    const f = c.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      try {
        if (mode === 'book') {
          if (!f.date.value) return App.toast('Pick an inspection date.', 'bad');
          App.api.uploadDocument({ ownerId: me.id, vanId: van.id, type: 'inspection', label: 'Safety & roadworthiness inspection report', fileName: `Inspection booked ${App.fmtDate(f.date.value)} at ${f.loc.value}`, expiry: App.addDays(f.date.value, 365) });
        } else {
          const file = checkFile(f.report);
          if (!file || !f.expiry.value) return App.toast('Upload the report and its expiry date.', 'bad');
          App.api.uploadDocument({ ownerId: me.id, vanId: van.id, type: 'inspection', label: 'Safety & roadworthiness inspection report', fileName: file, expiry: f.expiry.value });
        }
        van.verification.inspection = 'pending'; App.save(); App.toast('Inspection submitted', 'good'); next();
      } catch (err) { App.toast(err.message, 'bad'); }
    };
  },

  photos(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van, next } = ctx;
    const draw = () => {
      c.innerHTML = String(h`<p>Add at least 4 bright, horizontal photos: outside, bed, kitchen and a view from the driver’s seat. First photo is the cover.</p>
        <div class="photo-manager">${van.photos.map((p, i) => h`<figure><img src="${photo(p, 300)}" alt="Van photo ${i + 1}">${i === 0 ? h`<span class="tag tag-instant">Cover</span>` : ''}<div class="pm-actions">${i ? h`<button type="button" class="icon-btn" data-cover="${i}" aria-label="Make cover">★</button>` : ''}<button type="button" class="icon-btn" data-del="${i}" aria-label="Remove photo">✕</button></div></figure>`)}
          <label class="pm-add"><input type="file" accept="image/jpeg,image/png,image/webp" multiple id="ph-in" class="sr-only"><span>＋ Add photos</span></label></div>
        <button type="button" class="link small" id="sample">Use sample photos (demo)</button>
        <form id="f" novalidate><h3>Specifications</h3>
          <div class="grid-3">
            <label class="field"><span>Van type</span><select name="type">${App.VAN_TYPES.map(t => h`<option ${van.type === t ? 'selected' : ''}>${t}</option>`)}</select></label>
            <label class="field"><span>Sleeps</span><input type="number" name="sleeps" min="1" max="8" value="${van.sleeps}" required></label>
            <label class="field"><span>Seats with belts</span><input type="number" name="seats" min="1" max="9" value="${van.seats}" required></label>
            <label class="field"><span>Transmission</span><select name="transmission">${['Manual', 'Automatic'].map(t => h`<option ${van.transmission === t ? 'selected' : ''}>${t}</option>`)}</select></label>
            <label class="field"><span>Fuel</span><select name="fuel">${['Diesel', 'Petrol', 'CNG', 'Electric'].map(t => h`<option ${van.fuel === t ? 'selected' : ''}>${t}</option>`)}</select></label>
            <label class="field"><span>Fuel economy</span><input name="mileage" value="${van.mileage}" placeholder="11 km/l"></label>
            <label class="field"><span>Length</span><input name="length" value="${van.length}" placeholder="5.9 m"></label>
            <label class="field"><span>Licence required</span><input name="licence" value="${van.licence}"></label>
          </div>
          <label class="field"><span>Sleeping arrangement</span><input name="beds" value="${van.beds}" placeholder="1 double + 2 bunks" required></label>
          <div class="form-actions"><button class="btn btn-primary">Save & continue</button></div></form>`);
      c.querySelector('#ph-in').onchange = async (e) => {
        for (const file of e.target.files) {
          try { van.photos.push(await App.readPhoto(file)); } catch (err) { App.toast(err.message, 'bad'); }
        }
        App.save(); draw();
      };
      c.querySelector('#sample').onclick = () => { van.photos = ['photo-1584198775168-cd76729ac207', 'photo-1773123441753-e87f821ec76d', 'photo-1645099815537-cea03d831528', 'photo-1558724065-2f80d1ae6002']; App.save(); draw(); };
      c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { van.photos.splice(+b.dataset.del, 1); App.save(); draw(); });
      c.querySelectorAll('[data-cover]').forEach(b => b.onclick = () => { const [p] = van.photos.splice(+b.dataset.cover, 1); van.photos.unshift(p); App.save(); draw(); });
      const f = c.querySelector('#f');
      f.onsubmit = (e) => {
        e.preventDefault();
        if (!f.checkValidity()) return f.reportValidity();
        if (van.photos.length < 4) return App.toast('Please add at least 4 photos.', 'bad');
        const d = App.formData(f);
        Object.assign(van, { type: d.type, sleeps: +d.sleeps, seats: +d.seats, transmission: d.transmission, fuel: d.fuel, mileage: d.mileage, length: d.length, licence: d.licence, beds: d.beds });
        van.verification.photos = 'verified'; App.save(); App.toast('Photos & specs saved', 'good'); next();
      };
    };
    draw();
  },

  listing(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van, next } = ctx;
    c.innerHTML = String(h`<form id="f" novalidate>
      <h3>The basics</h3>
      <div class="grid-2">
        <label class="field"><span>Listing title</span><input name="name" value="${van.name}" maxlength="40" required></label>
        <label class="field"><span>Main destination</span><select name="destinationId">${App.db.destinations.map(d => h`<option value="${d.id}" ${van.destinationId === d.id ? 'selected' : ''}>${d.name}</option>`)}</select></label>
        <label class="field"><span>Pickup city</span><input name="city" value="${van.pickup.city}" required></label>
        <label class="field"><span>Pickup address (shared after booking)</span><input name="address" value="${van.pickup.address}" required></label>
        <label class="field"><span>Pickup from</span><input type="time" name="time" value="${van.pickup.time}"></label>
        <label class="field"><span>Return by</span><input type="time" name="returnTime" value="${van.pickup.returnTime}"></label>
      </div>
      <label class="field"><span>Description</span><textarea name="description" rows="4" minlength="60" required placeholder="What makes your van special? Who is it perfect for?">${van.description}</textarea></label>
      <h3>Amenities</h3>
      <div class="amen-grid">${App.AMENITIES.map(a => h`<label class="check"><input type="checkbox" name="amenities" value="${a.id}" ${van.amenities.includes(a.id) ? 'checked' : ''}> ${a.icon} ${a.label}</label>`)}</div>
      <label class="check"><input type="checkbox" name="familyFriendly" ${van.familyFriendly ? 'checked' : ''}> Suitable for families with children</label>
      <h3>Pricing (${App.C.currency})</h3>
      <div class="grid-3">
        <label class="field"><span>Nightly price</span><input type="number" name="pricePerNight" min="1000" step="100" value="${van.pricePerNight}" required></label>
        <label class="field"><span>Fri & Sat price</span><input type="number" name="weekendPrice" min="1000" step="100" value="${van.weekendPrice}"></label>
        <label class="field"><span>Cleaning fee</span><input type="number" name="cleaningFee" min="0" step="100" value="${van.cleaningFee}"></label>
        <label class="field"><span>Security deposit</span><input type="number" name="deposit" min="0" step="500" value="${van.deposit}" required></label>
        <label class="field"><span>Weekly discount %</span><input type="number" name="weekly" min="0" max="50" value="${van.discounts.weekly}"></label>
        <label class="field"><span>Monthly discount %</span><input type="number" name="monthly" min="0" max="60" value="${van.discounts.monthly}"></label>
        <label class="field"><span>Minimum nights</span><input type="number" name="minNights" min="1" max="14" value="${van.minNights}"></label>
        <label class="field"><span>Included km / day</span><input type="number" name="kmPerDay" min="50" step="50" value="${van.kmPerDay}"></label>
        <label class="field"><span>Extra km fee</span><input type="number" name="extraKmFee" min="0" value="${van.extraKmFee}"></label>
      </div>
      <h3>Booking & cancellation</h3>
      <label class="check"><input type="checkbox" name="instantBook" ${van.instantBook ? 'checked' : ''}> Allow instant book (recommended — instant-book vans get ~2× more bookings)</label>
      <fieldset class="field"><legend>Cancellation policy</legend>${Object.entries(App.CANCELLATION_POLICIES).map(([k, p]) => h`<label class="check"><input type="radio" name="cancellation" value="${k}" ${van.cancellation === k ? 'checked' : ''}> <strong>${p.label}</strong> — ${p.summary}</label>`)}</fieldset>
      <label class="field"><span>House rules (one per line)</span><textarea name="rules" rows="4">${van.rules.join('\n')}</textarea></label>
      <p class="small muted">You can block dates and adjust prices anytime from the calendar in your dashboard.</p>
      <div class="form-actions"><button class="btn btn-primary">Save & continue</button></div></form>`);
    const f = c.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      const d = App.formData(f);
      const dest = App.get.dest(d.destinationId);
      const amenities = [].concat(d.amenities || []);
      Object.assign(van, {
        name: d.name.trim(), destinationId: d.destinationId, description: d.description.trim(), amenities, familyFriendly: !!d.familyFriendly, petFriendly: amenities.includes('pets'),
        pricePerNight: +d.pricePerNight, weekendPrice: +d.weekendPrice || +d.pricePerNight, cleaningFee: +d.cleaningFee, deposit: +d.deposit,
        discounts: { weekly: +d.weekly, monthly: +d.monthly }, minNights: +d.minNights, kmPerDay: +d.kmPerDay, extraKmFee: +d.extraKmFee,
        instantBook: !!d.instantBook, cancellation: d.cancellation, rules: d.rules.split('\n').map(s => s.trim()).filter(Boolean), city: d.city
      });
      // Approximate pin near the destination until a geocoder is connected
      van.pickup = { ...van.pickup, city: d.city.trim(), address: d.address.trim(), time: d.time, returnTime: d.returnTime, lat: van.pickup.lat || dest.lat + 0.02, lng: van.pickup.lng || dest.lng + 0.02 };
      van.verification.listing = 'verified'; App.save(); App.toast('Listing details saved', 'good'); next();
    };
  },

  payout(c, { me, owner, next }) {
    const p = owner.payout;
    if (p?.status === 'verified' || p?.status === 'pending') {
      c.innerHTML = String(h`<div class="callout">🏦 ${p.data.bank} · account ending ${p.data.last4} · ${p.data.ifsc}${p.data.upi ? ' · UPI ' + p.data.upi : ''}</div>
        <p class="small muted">Payouts are sent 24 hours after each trip starts. ${p.status === 'pending' ? 'Bank verification in progress.' : ''}</p>
        <div class="form-actions"><button class="btn btn-ghost" id="chg">Change account</button><button class="btn btn-primary" id="nx">Continue</button></div>`);
      c.querySelector('#nx').onclick = next;
      c.querySelector('#chg').onclick = () => { owner.payout = { status: 'not_started' }; App.save(); App.render(); };
      return;
    }
    c.innerHTML = String(h`<form id="f" novalidate>
      <div class="grid-2">
        <label class="field"><span>Account holder name</span><input name="holder" value="${owner.business?.data?.business || me.name}" required></label>
        <label class="field"><span>${App.C.payout.routingLabel}</span><input name="ifsc" pattern="${App.C.payout.routingPattern.slice(1, -1)}" maxlength="11" required style="text-transform:uppercase" autocomplete="off"></label>
        <label class="field"><span>${App.C.payout.accountLabel}</span><input name="acct" inputmode="numeric" pattern="[0-9]{9,18}" required autocomplete="off"></label>
        <label class="field"><span>Confirm account number</span><input name="acct2" inputmode="numeric" required autocomplete="off"></label>
        <label class="field"><span>${App.C.payout.altLabel}</span><input name="upi" pattern="[\\w.\\-]+@\\w+" placeholder="name@bank"></label>
      </div>
      <p class="small muted">We’ll deposit ₹1 to confirm the account name matches (penny-drop). Only the last 4 digits are shown after saving.</p>
      <div class="form-actions"><button class="btn btn-primary">Verify & save</button></div></form>`);
    const f = c.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      f.ifsc.value = f.ifsc.value.toUpperCase();
      if (!f.checkValidity()) return f.reportValidity();
      if (f.acct.value !== f.acct2.value) return App.toast('Account numbers don’t match.', 'bad');
      const banks = { HDFC: 'HDFC Bank', ICIC: 'ICICI Bank', SBIN: 'State Bank of India', UTIB: 'Axis Bank', KKBK: 'Kotak Mahindra Bank' };
      owner.payout = { status: 'verified', data: { holder: f.holder.value, bank: banks[f.ifsc.value.slice(0, 4)] || 'Bank ' + f.ifsc.value.slice(0, 4), last4: f.acct.value.slice(-4), ifsc: f.ifsc.value, upi: f.upi.value } };
      App.audit('payout.verify', me.email); App.save(); App.toast('₹1 penny-drop successful — account verified', 'good'); next();
    };
  },

  review(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van, me, statuses, link } = ctx;
    const pre = App.ONBOARDING_STEPS.slice(0, 10);
    const blocking = pre.filter((s, i) => !['verified', 'pending'].includes(statuses[i]));
    const st = van.verification.review;
    c.innerHTML = String(h`<ul class="doc-status">${pre.map((s, i) => h`<li><a href="${link(i)}">${i + 1}. ${s.title}</a>${App.statusBadge(statuses[i])}</li>`)}</ul>
      ${st === 'pending' ? h`<div class="callout">⏳ Submitted for review. We’ll email you within 2 business days. Pending documents are checked as part of this review.</div>`
      : st === 'verified' ? h`<div class="callout good-bg">✓ Approved! Head to the final step to publish.</div><div class="form-actions"><a class="btn btn-primary" href="${link(11)}">Continue</a></div>`
      : blocking.length ? h`<p class="error">Finish these steps before submitting: ${blocking.map(s => s.title).join(', ')}.</p>`
      : h`<p>Everything’s in. Our team will check your documents, photos and pricing, and may call you to confirm details.</p>
          <label class="check"><input type="checkbox" id="decl"> I confirm the information is accurate and I will keep all documents valid while listed.</label>
          <div class="form-actions"><button class="btn btn-primary" id="submit">Submit for review</button></div>`}`);
    const sb = c.querySelector('#submit');
    if (sb) sb.onclick = () => {
      if (!c.querySelector('#decl').checked) return App.toast('Please confirm the declaration.', 'bad');
      van.verification.review = 'pending'; van.status = 'in_review'; van.submittedAt = new Date().toISOString();
      App.db.users.filter(u => u.role === 'admin').forEach(a => App.notify(a.id, `${me.name} submitted “${van.name}” for listing approval.`, '#/admin/listings', false));
      App.audit('listing.submit', `${van.id} ${van.name}`);
      App.save(); App.toast('Submitted for review!', 'good'); App.render();
    };
  },

  publish(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van } = ctx;
    const allVerified = App.ONBOARDING_STEPS.slice(0, 11).every(s => App.stepStatus(s, van.ownerId, van) === 'verified');
    c.innerHTML = String(h`
      ${van.status === 'published' ? h`<div class="callout good-bg">🎉 <strong>${van.name}</strong> is live! Travellers can find and book it now.</div><div class="form-actions"><a class="btn" href="#/vans/${van.id}">View listing</a><a class="btn btn-primary" href="#/owner">Go to dashboard</a></div>`
      : van.status === 'suspended' ? h`<div class="alert alert-bad">This listing is paused because a document needs attention. Update it in <a href="#/owner/documents">Documents</a>.</div>`
      : allVerified ? h`<p>All checks passed. Preview your listing, then publish it.</p><div class="form-actions"><a class="btn btn-ghost" href="#/vans/${van.id}">Preview</a><button class="btn btn-accent btn-lg" id="pub">🚀 Publish listing</button></div>`
      : h`<p>Your listing can be published once every step is <strong>Verified</strong>, including the platform review.</p><a class="btn btn-ghost" href="#/vans/${van.id}">Preview listing</a>`}`);
    const pb = c.querySelector('#pub');
    if (pb) pb.onclick = () => { van.status = 'published'; van.publishedAt = new Date().toISOString(); App.audit('listing.publish', `${van.id} ${van.name}`); App.save(); App.toast('Your van is live!', 'good'); App.render(); };
  }
};

// Shared step for document lists (registration & insurance)
const docStep = (c, ctx, defs, key, isInsurance = false) => {
  if (needVan(c, ctx)) return;
  const { van, me, next } = ctx;
  const existing = App.get.docsFor({ vanId: van.id });
  const byType = Object.fromEntries(existing.map(d => [d.type, d]));
  c.innerHTML = String(h`<form id="f" novalidate>
    ${defs.map(d => { const ex = byType[d.type]; const locked = ex && ['verified', 'pending'].includes(ex.status); return h`
      <fieldset class="doc-field"><legend>${d.label}${d.required ? '' : ' (if applicable)'}</legend>
        ${ex ? h`<div class="row gap wrap">${App.statusBadge(ex.status)}${App.docExpiryState(ex) ? h`<span class="badge badge-${App.docExpiryState(ex).tone}">${App.docExpiryState(ex).label}</span>` : ''}<span class="small muted">${ex.fileName || ''}</span>${ex.note ? h`<span class="small">${ex.note}</span>` : ''}</div>` : ''}
        ${locked ? h`<label class="check small"><input type="checkbox" name="replace-${d.type}"> Upload a new version</label>` : ''}
        <div class="grid-3 ${locked ? 'replace-only' : ''}" data-for="${d.type}" ${locked ? 'hidden' : ''}>
          ${isInsurance ? h`<label class="field"><span>Insurer</span><input name="insurer-${d.type}" value="${ex?.insurer || ''}"></label>` : ''}
          <label class="field"><span>Document / policy number</span><input name="num-${d.type}" value="${ex?.number || ''}"></label>
          ${d.expires ? h`<label class="field"><span>Valid until</span><input type="date" name="exp-${d.type}" min="${App.addDays(App.today(), 1)}" value="${ex && ex.expiry > App.today() ? ex.expiry : ''}"></label>` : ''}
          <label class="field"><span>File</span><input type="file" name="file-${d.type}" accept=".pdf,image/jpeg,image/png"></label>
        </div>
      </fieldset>`; })}
    ${isInsurance ? h`<label class="check"><input type="checkbox" name="covers" required> The policy covers commercial self-drive rental and names the vehicle’s registration number.</label>` : ''}
    <div class="form-actions"><button class="btn btn-primary">Submit documents</button></div></form>`);
  const f = c.querySelector('#f');
  f.querySelectorAll('[name^=replace-]').forEach(cb => cb.onchange = () => { f.querySelector(`[data-for="${cb.name.slice(8)}"]`).hidden = !cb.checked; });
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!f.checkValidity()) return f.reportValidity();
    try {
      let submitted = 0;
      for (const d of defs) {
        const box = f.querySelector(`[data-for="${d.type}"]`);
        if (box.hidden) continue;
        const file = checkFile(f['file-' + d.type]);
        const exp = f['exp-' + d.type]?.value;
        const has = byType[d.type];
        if (!file) { if (d.required && !has) throw new Error(`Please upload: ${d.label}`); continue; }
        if (d.expires && !exp) throw new Error(`Add the expiry date for: ${d.label}`);
        const doc = App.api.uploadDocument({ ownerId: me.id, vanId: van.id, type: d.type, label: d.label, number: f['num-' + d.type].value.trim(), expiry: exp || null, fileName: file });
        if (isInsurance) doc.insurer = f['insurer-' + d.type].value.trim();
        submitted++;
      }
      if (!submitted) return App.toast('Nothing new to submit.', 'info');
      App.recomputeVerification(me.id, van.id);
      if (van.verification[key] === 'not_started') van.verification[key] = 'pending';
      App.save(); App.toast('Documents submitted for review', 'good'); next();
    } catch (err) { App.toast(err.message, 'bad'); }
  };
};
})();
