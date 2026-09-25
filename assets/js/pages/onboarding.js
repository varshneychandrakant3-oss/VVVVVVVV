/*
 * Van owner onboarding wizard (12 steps).
 * Owner-level steps (account, KYC, business, payout) are done once.
 * Vehicle-level steps are done for every van (?van=<id> or ?van=new).
 *
 * Every status shown here is decided by the server (server/market.js): this
 * page only collects details, runs government checks and asks for changes.
 */
(() => {
const { h, money, photo } = App;

App.ONBOARDING_STEPS = [
  { id: 'account', scope: 'owner', title: 'Account & contact verification', blurb: 'Verify your email and mobile number.' },
  { id: 'kyc', scope: 'owner', title: 'Identity verification (KYC)', blurb: 'Aadhaar via DigiLocker, PAN and a live selfie.' },
  { id: 'business', scope: 'owner', title: 'Business & contact details', blurb: 'How travellers and our team reach you.' },
  { id: 'ownership', scope: 'van', title: 'Vehicle ownership', blurb: 'Checked against the VAHAN registry.' },
  { id: 'registration', scope: 'van', title: 'Registration & legal documents', blurb: 'RC, rental licence, PUC, fitness and permits.' },
  { id: 'insurance', scope: 'van', title: 'Insurance', blurb: 'Commercial cover for self-drive rental.' },
  { id: 'inspection', scope: 'van', title: 'Safety inspection', blurb: 'Roadworthiness and habitation checks.' },
  { id: 'photos', scope: 'van', title: 'Photos & specifications', blurb: 'Show travellers what they’re booking.' },
  { id: 'listing', scope: 'van', title: 'Amenities, pricing & rules', blurb: 'Prices, availability, deposit, cancellation.' },
  { id: 'payout', scope: 'owner', title: 'Payout setup', blurb: 'Bank account checked with a ₹1 deposit.' },
  { id: 'review', scope: 'van', title: 'Platform review', blurb: 'Our team checks everything (≈2 business days).' },
  { id: 'publish', scope: 'van', title: 'Publish listing', blurb: 'Go live and start taking bookings.' }
];

App.stepStatus = (step, ownerId, van) => {
  const o = App.db.owners[ownerId] || {};
  if (step.scope === 'owner') return o[step.id]?.status || 'not_started';
  if (!van) return 'not_started';
  if (step.id === 'publish') return van.status === 'published' ? 'verified' : van.status === 'suspended' ? 'action_required' : 'not_started';
  return van.verification?.[step.id] || 'not_started';
};

/* ---------- Small helpers ---------- */
const fileField = (name, label, required = true) => h`<label class="field"><span>${label}${required ? '' : ' (optional)'}</span><input type="file" name="${name}" accept=".pdf,image/jpeg,image/png" ${required ? 'required' : ''}><small class="muted">PDF, JPG or PNG up to 10 MB. Only our verification team can view it.</small></label>`;
const checkFile = (input) => {
  const f = input?.files?.[0];
  if (!f) return null;
  if (f.size > 10 * 1024 * 1024) throw new Error('Files must be under 10 MB.');
  if (!/(pdf|jpe?g|png)$/i.test(f.name)) throw new Error('Upload a PDF, JPG or PNG.');
  return f.name;
};
const OUTCOME = { verified: ['good', '✓ Verified'], review: ['warn', '⏳ Needs review'], failed: ['bad', '✕ Failed'] };
App.checkResultBox = (r) => {
  if (!r) return '';
  const [tone, label] = OUTCOME[r.status] || ['muted', r.status];
  return h`<div class="check-result check-${tone}" role="status">
    <div class="row-between wrap"><strong>${label}</strong><span class="small muted">${r.source} · ${App.fmtDateTime(r.checkedAt)}</span></div>
    <ul>${(r.reasons || []).map(x => h`<li class="lvl-${x.level}">${x.level === 'ok' ? '✓' : x.level === 'review' ? '!' : '✕'} ${x.text}</li>`)}</ul>
  </div>`;
};
const testHint = (text) => App.verifyConfig?.testMode ? h`<p class="test-hint">🧪 <strong>Test mode</strong> — no real government check is made. ${text}</p>` : '';
// Run an async action with a busy button; server errors become toasts
const busy = async (btn, fn) => {
  const label = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Working…';
  try { return await fn(); }
  catch (e) { App.toast(e.status === 401 ? 'Your session expired — please sign in again.' : e.message, 'bad'); return null; }
  finally { if (btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
};
const consentBox = (id, text) => h`<label class="check consent"><input type="checkbox" id="${id}"> ${text}</label>`;
const needConsent = (c, id) => { if (c.querySelector('#' + id)?.checked) return true; App.toast('Please tick the consent box first.', 'bad'); return false; };
const docsOf = (vanId, types) => App.db.documents.filter(d => d.vanId === vanId && (!types || types.includes(d.type)));
const addDoc = (van, body) => App.market('POST', `/api/owner/vans/${van.id}/documents`, body);
const patchVan = (van, body) => App.market('PATCH', `/api/owner/vans/${van.id}`, body);

App.pages.onboarding = (el, _p, q) => {
  const me = App.me();
  if (!App.serverOnline) {
    el.innerHTML = String(App.emptyState('🔌', 'Owner onboarding isn’t available in this preview', 'Listing a van includes live government document checks (Aadhaar, PAN, vehicle registry), which need the full VanYatra server. Everything else — browsing, booking and the dashboards — works here.', App.h`<a class="btn btn-primary" href="#/owner">Back to dashboard</a>`));
    return;
  }
  const owner = App.db.owners[me.id] || {};
  // Contact verification is confirmed on this device (OTP demo) and recorded on the server
  if (me.emailVerified && me.phoneVerified && owner.account?.status !== 'verified') {
    App.market('POST', '/api/owner/profile', { accountVerified: true }).then(() => App.render()).catch(e => App.toast(e.message, 'bad'));
  }
  const myVans = App.db.vans.filter(v => v.ownerId === me.id && v.status !== 'hidden');
  let van = q.van && q.van !== 'new' ? App.get.van(q.van) : null;
  if (van && van.ownerId !== me.id) return App.pages.notFound(el);
  if (!van && q.van !== 'new') van = myVans.find(v => v.status !== 'published') || myVans[0] || null;
  const statuses = App.ONBOARDING_STEPS.map(s => App.stepStatus(s, me.id, van));
  const firstOpen = statuses.findIndex(s => s !== 'verified' && s !== 'pending');
  const stepIdx = Math.max(0, Math.min(11, q.step ? +q.step - 1 : firstOpen === -1 ? 11 : firstOpen));
  const step = App.ONBOARDING_STEPS[stepIdx];
  const done = statuses.filter(s => s === 'verified').length;
  const link = (i, v = van) => `#/owner/onboarding?${v ? 'van=' + v.id + '&' : q.van === 'new' ? 'van=new&' : ''}step=${i + 1}`;

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
        ${van?.status === 'in_review' && step.scope === 'van' && step.id !== 'review' ? h`<p class="callout">⏳ This listing is under review, so it can’t be edited until our team decides.</p>` : ''}
        <div id="step-content"></div>
      </section>
    </div>
  </div>`);
  const sw = el.querySelector('#van-switch');
  if (sw) sw.onchange = () => App.go('#/owner/onboarding?van=' + sw.value);
  const next = (v = van) => App.go(link(Math.min(11, stepIdx + 1), v));
  const ctx = { me, owner, van, next, statuses, el, link, q };
  STEPS[step.id](el.querySelector('#step-content'), ctx);
};

const statusNote = (step, owner, van) => {
  const note = step.scope === 'owner' ? owner[step.id]?.note : '';
  const types = { ownership: (t) => t.startsWith('ownership'), registration: (t) => App.C.registrationDocs.some(r => r.type === t), insurance: (t) => t === 'insurance', inspection: (t) => t === 'inspection' }[step.id];
  const relevant = van && types ? docsOf(van.id).filter(d => types(d.type) && d.note && ['action_required', 'rejected', 'pending'].includes(d.status)) : [];
  const kyc = step.id === 'kyc' ? App.db.documents.filter(d => !d.vanId && ['aadhaar', 'pan', 'selfie'].includes(d.type) && d.note) : [];
  return h`${note ? h`<span class="small">${note}</span>` : ''}${[...relevant, ...kyc].map(d => h`<div class="small"><strong>${d.label}:</strong> ${d.note}</div>`)}`;
};

// Vehicle steps need a van; it's created at the ownership step
const needVan = (c, ctx) => {
  if (ctx.van) return false;
  c.innerHTML = String(h`<p>Let’s start with your vehicle. Complete <a href="${ctx.link(3)}">Step 4 · Vehicle ownership</a> first to add your van.</p>`);
  return true;
};

const docStatusList = (docs) => docs.length ? h`<ul class="doc-status">${docs.map(d => { const ex = App.docExpiryState(d); return h`<li><span>${d.label}${d.fileName ? h` <span class="small muted">· ${d.fileName}</span>` : ''}${d.check ? h`<span class="source-tag">✓ ${d.check.source}</span>` : ''}</span>${ex ? h`<span class="badge badge-${ex.tone}">${ex.label}</span>` : ''}${App.statusBadge(d.status)}</li>`; })}</ul>` : '';

const registryTable = (r) => {
  const d = r.data || r, docs = d.docs || {};
  if (!d.owner) return '';
  return h`<table class="spec-table small registry"><tbody>
    <tr><th scope="row">Registered owner</th><td>${d.owner}</td></tr>
    <tr><th scope="row">Vehicle</th><td>${d.makeModel || '—'} · ${d.vehicleClass || ''} · ${d.fuel || ''}</td></tr>
    <tr><th scope="row">Registered</th><td>${App.fmtDate(d.regDate)} · ${d.regAuthority || ''} · ${d.isCommercial ? 'Commercial' : 'Private'}</td></tr>
    <tr><th scope="row">RC valid until</th><td>${App.fmtDate(docs.rc?.validUpto) || '—'}</td></tr>
    <tr><th scope="row">Insurance</th><td>${docs.insurance?.company || '—'} · ${docs.insurance?.validUpto ? 'until ' + App.fmtDate(docs.insurance.validUpto) : 'none on record'}</td></tr>
    <tr><th scope="row">PUC</th><td>${docs.puc?.validUpto ? 'until ' + App.fmtDate(docs.puc.validUpto) : 'none on record'}</td></tr>
    <tr><th scope="row">Permit</th><td>${docs.permit?.type || '—'}${docs.permit?.validUpto ? ' · until ' + App.fmtDate(docs.permit.validUpto) : ''}</td></tr>
  </tbody></table>`;
};

const STEPS = {
  account(c, { me, owner, next }) {
    c.innerHTML = String(h`<p>We send booking alerts and payout updates to these. Both must be verified.</p><div id="otp"></div>
      <div class="form-actions"><button class="btn btn-primary" id="nx" ${owner.account?.status === 'verified' ? '' : 'disabled'}>Continue</button></div>`);
    App.otpWidget(c.querySelector('#otp'), me, () => App.market('POST', '/api/owner/profile', { accountVerified: true }).then(() => App.render()).catch(e => App.toast(e.message, 'bad')));
    c.querySelector('#nx').onclick = () => next();
  },

  async kyc(c, { me, next, q }) {
    if (q.digilocker) {
      const msgs = { verified: ['Aadhaar verified with DigiLocker', 'good'], review: ['Aadhaar received — our team will review the name match', 'info'], failed: ['Aadhaar check failed — see details below', 'bad'], denied: [q.msg || 'DigiLocker consent was cancelled', 'bad'], error: [q.msg || 'DigiLocker error', 'bad'] };
      const [m, t] = msgs[q.digilocker] || ['DigiLocker finished', 'info'];
      App.toast(m, t);
      history.replaceState(null, '', location.hash.replace(/&?digilocker=[^&]*/, '').replace(/&?msg=[^&]*/, ''));
    }
    c.innerHTML = '<p class="muted">Loading your verification status…</p>';
    let mine;
    try { mine = await App.verify.mine(); } catch (e) { c.innerHTML = String(h`<p class="error">${e.message}</p>`); return; }
    const last = (t) => mine.records.filter(r => r.type === t).at(-1);
    const aad = last('aadhaar'), pan = last('pan');
    const selfie = App.db.documents.find(d => !d.vanId && d.type === 'selfie' && d.ownerId === me.id);
    c.innerHTML = String(h`
      <p>We check your identity directly with government sources. Only the last 4 digits of Aadhaar and a masked PAN are stored.</p>
      ${testHint('In DigiLocker you can type any name. PANs ending in X are “not found”; a Z as the 5th letter gives a name mismatch.')}
      ${consentBox('kyc-consent', 'I consent to VanYatra verifying my identity with UIDAI (via DigiLocker) and the Income Tax Department, only for KYC.')}
      <div class="kyc-block"><h3>1. Aadhaar via DigiLocker</h3>
        ${aad ? h`${App.checkResultBox(aad)}<p class="small">Name: <strong>${aad.data.name}</strong> · DOB ${App.fmtDate(aad.data.dob)} · Aadhaar XXXX-XXXX-${aad.data.aadhaarLast4 || '????'}</p>` : h`<p class="small muted">You’ll sign in to DigiLocker and approve sharing your eAadhaar. We never see your Aadhaar password or OTP.</p>`}
        <button type="button" class="btn ${aad ? 'btn-ghost' : 'btn-primary'}" id="dl-btn"><span aria-hidden="true">🔐</span> ${aad ? 'Verify again with DigiLocker' : 'Verify with DigiLocker'}</button>
      </div>
      <div class="kyc-block"><h3>2. PAN</h3>
        <form id="pan-form" class="grid-3" novalidate>
          <label class="field"><span>PAN</span><input name="pan" maxlength="10" required autocomplete="off" style="text-transform:uppercase" placeholder="ABCDE1234F" pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]"></label>
          <label class="field"><span>Date of birth</span><input type="date" name="dob" required value="${aad?.data?.dob || ''}" max="${App.today()}"></label>
          <label class="field"><span>Name (from Aadhaar)</span><input name="name" value="${mine.kycName}" readonly></label>
        </form>
        ${pan ? App.checkResultBox(pan) : ''}
        <button type="button" class="btn ${pan && pan.status !== 'failed' ? 'btn-ghost' : 'btn-primary'}" id="pan-btn">${pan ? 'Check PAN again' : 'Verify PAN'}</button>
      </div>
      <div class="kyc-block"><h3>3. Live selfie</h3>
        ${selfie ? h`<p class="small">${App.statusBadge(selfie.status)} ${selfie.fileName}${selfie.note ? ' — ' + selfie.note : ''}</p>` : ''}
        <label class="field"><span>${selfie ? 'Replace selfie (optional)' : 'Take a selfie'}</span><input type="file" id="selfie" accept="image/*" capture="user"><small class="muted">Our team matches it to your Aadhaar photo.</small></label>
      </div>
      <div class="form-actions"><button class="btn btn-primary" id="kyc-done">Save & continue</button></div>`);
    c.querySelector('#dl-btn').onclick = (e) => {
      if (!needConsent(c, 'kyc-consent')) return;
      busy(e.currentTarget, async () => { location.href = await App.verify.startDigiLocker('/#/owner/onboarding?step=2'); await new Promise(() => {}); });
    };
    c.querySelector('#pan-btn').onclick = (e) => {
      const f = c.querySelector('#pan-form');
      f.pan.value = f.pan.value.toUpperCase().trim();
      if (!needConsent(c, 'kyc-consent') || !f.reportValidity()) return;
      busy(e.currentTarget, async () => { await App.verify.run('pan', { pan: f.pan.value, dob: f.dob.value, name: f.name.value }); await App.syncMarket(); App._keepScroll = true; App.render(); });
    };
    c.querySelector('#kyc-done').onclick = (e) => {
      if (!aad || aad.status === 'failed') return App.toast('Complete Aadhaar verification with DigiLocker first.', 'bad');
      if (!pan || pan.status === 'failed') return App.toast('Verify your PAN first.', 'bad');
      const sf = c.querySelector('#selfie').files[0];
      if (!sf && !selfie) return App.toast('Please add a selfie.', 'bad');
      busy(e.currentTarget, async () => {
        if (sf) await App.market('POST', '/api/owner/selfie', { fileName: sf.name });
        App.toast('Identity details saved', 'good'); next();
      });
    };
  },

  business(c, { me, owner, next }) {
    const d = owner.business?.data || {};
    let gst = owner.gst || null;
    c.innerHTML = String(h`<form id="f" novalidate>
      <fieldset class="field"><legend>You are listing as</legend>
        <label class="check"><input type="radio" name="kind" value="individual" ${d.kind !== 'company' ? 'checked' : ''}> An individual</label>
        <label class="check"><input type="radio" name="kind" value="company" ${d.kind === 'company' ? 'checked' : ''}> A registered business</label></fieldset>
      <div class="grid-2">
        <label class="field"><span>Display / business name</span><input name="business" value="${d.business || me.business || me.name}" required></label>
        <label class="field"><span>${App.C.business.taxIdLabel}</span><span class="input-action"><input name="gstin" value="${d.gstin || ''}" pattern="${App.C.business.taxIdPattern.slice(1, -1)}" style="text-transform:uppercase" autocomplete="off"><button type="button" class="btn btn-sm" id="gst-btn">Verify</button></span></label>
        <label class="field"><span>Support phone for travellers</span><input type="tel" name="phone" value="${d.phone || me.phone}" required></label>
        <label class="field"><span>Emergency contact (name & phone)</span><input name="emergency" value="${d.emergency || ''}" required></label>
      </div>
      <label class="field"><span>Registered address</span><textarea name="address" rows="2" required>${d.address || ''}</textarea></label>
      <div class="grid-3"><label class="field"><span>City</span><input name="city" value="${d.city || me.city || ''}" required></label><label class="field"><span>State</span><input name="state" value="${d.state || ''}" required></label><label class="field"><span>PIN code</span><input name="pin" value="${d.pin || ''}" pattern="[0-9]{6}" inputmode="numeric" required></label></div>
      <div id="gst-result"></div>
      ${testHint('Any GSTIN with a correct check digit works; use “Fill test GSTIN” to make one. A 13th character of 9 simulates a cancelled registration.')}
      ${App.verifyConfig?.testMode ? h`<button type="button" class="link small" id="gst-test">Fill test GSTIN</button>` : ''}
      ${consentBox('gst-consent', 'I consent to VanYatra checking this GSTIN with the GST Network.')}
      <div class="form-actions"><button class="btn btn-primary" id="save-btn">Save & continue</button></div></form>`);
    const f = c.querySelector('#f');
    const gb = c.querySelector('#gst-btn');
    gb.onclick = () => {
      f.gstin.value = f.gstin.value.toUpperCase().trim();
      if (!f.gstin.value) return App.toast('Enter your GSTIN first.', 'bad');
      if (!needConsent(c, 'gst-consent')) return;
      busy(gb, async () => {
        const r = await App.verify.run('gstin', { gstin: f.gstin.value, businessName: f.business.value, kind: f.kind.value });
        gst = { gstin: r.ref, status: r.status };
        c.querySelector('#gst-result').innerHTML = String(App.checkResultBox(r));
        if (r.data.address && !f.address.value) f.address.value = r.data.address;
      });
    };
    const gt = c.querySelector('#gst-test');
    if (gt) gt.onclick = () => {
      // 27 = Maharashtra; builds a GSTIN with a valid check digit from a sample PAN
      const base = '27ABCDE1234F1Z', chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let sum = 0; for (let i = 0; i < 14; i++) { const v = chars.indexOf(base[i]) * (i % 2 ? 2 : 1); sum += Math.floor(v / 36) + v % 36; }
      f.gstin.value = base + chars[(36 - sum % 36) % 36];
    };
    f.onsubmit = (e) => {
      e.preventDefault();
      f.gstin.value = f.gstin.value.toUpperCase().trim();
      if (!f.checkValidity()) return f.reportValidity();
      const data = App.formData(f);
      if (data.gstin && (!gst || gst.gstin !== data.gstin)) return App.toast('Click “Verify” to check your GSTIN before saving.', 'bad');
      busy(c.querySelector('#save-btn'), async () => {
        await App.market('POST', '/api/owner/profile', { business: data });
        me.business = data.business; me.city = data.city; App.save();
        App.toast('Business details saved', 'good'); next();
      });
    };
  },

  ownership(c, ctx) {
    const { me, link } = ctx;
    const van = ctx.van;
    const locked = van?.status === 'in_review';
    const docs = van ? docsOf(van.id).filter(d => d.type.startsWith('ownership')) : [];
    const reg = van?.registry;
    c.innerHTML = String(h`${docStatusList(docs)}<form id="f" novalidate>
      <fieldset class="field"><legend>Your relationship to the vehicle</legend>
        ${App.C.ownership.options.map(o => h`<label class="check"><input type="radio" name="relation" value="${o.value}" ${(van?.relation || 'owner') === o.value ? 'checked' : ''}> ${o.label}</label>`)}</fieldset>
      <label class="field"><span>Registration number</span><span class="input-action"><input name="reg" value="${van?.regNo || ''}" placeholder="e.g. HP 01 AB 1234" required pattern="[A-Za-z]{2}[ \\-]?[0-9]{1,2}[ \\-]?[A-Za-z]{0,3}[ \\-]?[0-9]{1,4}" autocomplete="off"><button type="button" class="btn btn-sm" id="vahan-btn" ${locked ? 'disabled' : ''}>Check VAHAN</button></span></label>
      ${testHint('Registration numbers ending 0000 = not found, 1111 = insurance expired, 2222 = different owner, 3333 = blacklisted, 4444 = private vehicle, 5555 = PUC expired, 9999 = registry down.')}
      ${consentBox('rc-consent', 'I consent to VanYatra fetching this vehicle’s records (RC, insurance, PUC, permit) from the VAHAN registry.')}
      <div id="vahan-result">${reg ? h`${App.checkResultBox({ status: reg.status, reasons: reg.reasons, source: reg.source, checkedAt: reg.checkedAt })}${registryTable(reg)}` : ''}</div>
      ${reg?.owner ? h`
        <div class="grid-2">
          <label class="field"><span>Make</span><input name="make" value="${van.make || titleCase(reg.maker).replace(/\s+Motors?$/, '')}" required></label>
          <label class="field"><span>Model</span><input name="model" value="${van.model || titleCase(reg.model)}" required></label>
          <label class="field"><span>Year</span><input type="number" name="year" min="1990" max="${new Date().getFullYear() + 1}" value="${van.year && van.make ? van.year : (reg.regDate || '').slice(0, 4)}" required></label>
          <label class="field"><span>Chassis number (last 5)</span><input name="chassis" maxlength="5" value="${van.chassis || ''}" required></label>
        </div>
        <div id="auth-docs"></div>
        ${fileField('rcFile', 'RC copy (optional — VAHAN is the source of truth)', false)}
        <div class="form-actions"><button class="btn btn-primary" id="own-save" ${locked ? 'disabled' : ''}>Save & continue</button></div>` : ''}
      </form>`);
    const f = c.querySelector('#f');
    const drawAuth = () => {
      const box = c.querySelector('#auth-docs');
      if (!box) return;
      const rel = f.relation.value;
      box.innerHTML = String(rel === 'authorised' ? h`${fileField('nocFile', 'NOC / authorisation letter from the registered owner')}${fileField('agreementFile', 'Lease / management agreement')}` : rel === 'company' ? fileField('boardFile', 'Company letter authorising you to list this vehicle') : '');
    };
    f.querySelectorAll('[name=relation]').forEach(r => r.onchange = drawAuth);
    drawAuth();
    const vb = c.querySelector('#vahan-btn');
    vb.onclick = () => {
      if (!f.reg.reportValidity() || !needConsent(c, 'rc-consent')) return;
      busy(vb, async () => {
        const v = van || (await App.market('POST', '/api/owner/vans')).van;
        const r = await App.verify.run('vehicle', { regNo: f.reg.value, relation: f.relation.value, vanId: v.id });
        await App.syncMarket();
        if (!r.data.owner) App.toast('Vehicle not found in VAHAN — check the registration number.', 'bad');
        App._keepScroll = true;
        App.go(link(3, v));
        App.render();
      });
    };
    const save = c.querySelector('#own-save');
    if (save) f.onsubmit = (e) => {
      e.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      const d = App.formData(f);
      if (reg.regNo !== d.reg.toUpperCase().replace(/[\s-]/g, '')) return App.toast('Click “Check VAHAN” for this registration number first.', 'bad');
      if (reg.relation && reg.relation !== d.relation) return App.toast('You changed your relationship to the vehicle — click “Check VAHAN” again.', 'bad');
      if (reg.blacklisted || reg.rcStatus !== 'ACTIVE') return App.toast('This vehicle can’t be listed. See the VAHAN result.', 'bad');
      if (reg.ownerMatch === 'mismatch') return App.toast('The RC is in someone else’s name. Choose “authorised by the registered owner”, check VAHAN again and upload their NOC.', 'bad');
      let files;
      try {
        files = { rc: checkFile(f.rcFile), noc: d.relation === 'authorised' ? [checkFile(f.nocFile), checkFile(f.agreementFile)].join(', ') : null, board: d.relation === 'company' ? checkFile(f.boardFile) : null };
      } catch (err) { return App.toast(err.message, 'bad'); }
      busy(save, async () => {
        await patchVan(van, { make: d.make, model: d.model, year: +d.year, chassis: d.chassis, rcName: reg.owner, ...(van.name ? {} : { name: `${d.make} ${d.model}`.slice(0, 40) }) });
        if (files.rc) await addDoc(van, { type: 'ownership_rc', fileName: files.rc });
        if (files.noc) await addDoc(van, { type: 'ownership_noc', fileName: files.noc });
        if (files.board) await addDoc(van, { type: 'ownership_company', fileName: files.board });
        App.toast(App.get.van(van.id).verification.ownership === 'verified' ? 'Ownership verified with VAHAN' : 'Ownership details submitted for review', 'good');
        ctx.next();
      });
    };
  },

  registration(c, ctx) { docStep(c, ctx, App.C.registrationDocs); },
  insurance(c, ctx) { docStep(c, ctx, App.C.insuranceDocs, true); },

  inspection(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van, me, next } = ctx;
    c.innerHTML = String(h`${docStatusList(docsOf(van.id, ['inspection']))}
      <p>Every van needs a safety & habitation inspection before going live, then every 12 months.</p>
      <div class="seg" role="tablist"><button class="on" data-mode="book" role="tab" aria-selected="true">Book a VanYatra inspector</button><button data-mode="upload" role="tab" aria-selected="false">Upload a garage report</button></div>
      <form id="f" novalidate>
        <div id="mode-book"><div class="grid-2"><label class="field"><span>Preferred date</span><input type="date" name="date" min="${App.addDays(App.today(), 2)}"></label><label class="field"><span>Location</span><input name="loc" value="${van.pickup.city || me.city || ''}"></label></div><p class="small muted">Inspection fee ${money(1500)}, deducted from your first payout.</p></div>
        <div id="mode-upload" hidden>${fileField('report', 'Signed inspection report from an authorised workshop', false)}<label class="field"><span>Report expiry</span><input type="date" name="expiry" min="${App.addDays(App.today(), 1)}"></label></div>
        <fieldset class="field"><legend>Self-declaration checklist</legend>${App.C.inspectionChecklist.map((item, i) => h`<label class="check"><input type="checkbox" name="chk" value="${i}" required> ${item}</label>`)}</fieldset>
        <div class="form-actions"><button class="btn btn-primary" id="insp-btn">Submit inspection</button></div>
      </form>`);
    let mode = 'book';
    c.querySelectorAll('[data-mode]').forEach(b => b.onclick = (e) => { e.preventDefault(); mode = b.dataset.mode; c.querySelectorAll('[data-mode]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); c.querySelector('#mode-book').hidden = mode !== 'book'; c.querySelector('#mode-upload').hidden = mode !== 'upload'; });
    const f = c.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      let body;
      try {
        if (mode === 'book') {
          if (!f.date.value) return App.toast('Pick an inspection date.', 'bad');
          body = { type: 'inspection', fileName: `Inspection booked ${App.fmtDate(f.date.value)} at ${f.loc.value}`.slice(0, 200), expiry: App.addDays(f.date.value, 365) };
        } else {
          const file = checkFile(f.report);
          if (!file || !f.expiry.value) return App.toast('Upload the report and its expiry date.', 'bad');
          body = { type: 'inspection', fileName: file, expiry: f.expiry.value };
        }
      } catch (err) { return App.toast(err.message, 'bad'); }
      busy(c.querySelector('#insp-btn'), async () => { await addDoc(van, body); App.toast('Inspection submitted', 'good'); next(); });
    };
  },

  photos(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van, next } = ctx;
    const photos = [...van.photos];
    const draw = () => {
      c.innerHTML = String(h`<p>Add at least 4 bright, horizontal photos: outside, bed, kitchen and a view from the driver’s seat. First photo is the cover.</p>
        <div class="photo-manager">${photos.map((p, i) => h`<figure><img src="${photo(p, 300)}" alt="Van photo ${i + 1}">${i === 0 ? h`<span class="tag tag-instant">Cover</span>` : ''}<div class="pm-actions">${i ? h`<button type="button" class="icon-btn" data-cover="${i}" aria-label="Make cover">★</button>` : ''}<button type="button" class="icon-btn" data-del="${i}" aria-label="Remove photo">✕</button></div></figure>`)}
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
          <div class="form-actions"><button class="btn btn-primary" id="ph-save">Save & continue</button></div></form>`);
      c.querySelector('#ph-in').onchange = async (e) => {
        for (const file of e.target.files) {
          if (photos.length >= 12) { App.toast('Up to 12 photos.', 'bad'); break; }
          try { photos.push(await App.readPhoto(file)); } catch (err) { App.toast(err.message, 'bad'); }
        }
        draw();
      };
      c.querySelector('#sample').onclick = () => { photos.splice(0, photos.length, 'photo-1584198775168-cd76729ac207', 'photo-1773123441753-e87f821ec76d', 'photo-1645099815537-cea03d831528', 'photo-1558724065-2f80d1ae6002'); draw(); };
      c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { photos.splice(+b.dataset.del, 1); draw(); });
      c.querySelectorAll('[data-cover]').forEach(b => b.onclick = () => { const [p] = photos.splice(+b.dataset.cover, 1); photos.unshift(p); draw(); });
      const f = c.querySelector('#f');
      f.onsubmit = (e) => {
        e.preventDefault();
        if (!f.checkValidity()) return f.reportValidity();
        if (photos.length < 4) return App.toast('Please add at least 4 photos.', 'bad');
        const d = App.formData(f);
        busy(c.querySelector('#ph-save'), async () => {
          await patchVan(van, { photos, type: d.type, sleeps: +d.sleeps, seats: +d.seats, transmission: d.transmission, fuel: d.fuel, mileage: d.mileage, length: d.length, licence: d.licence, beds: d.beds });
          App.toast('Photos & specs saved', 'good'); next();
        });
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
      <div class="form-actions"><button class="btn btn-primary" id="ls-save">Save & continue</button></div></form>`);
    const f = c.querySelector('#f');
    f.onsubmit = (e) => {
      e.preventDefault();
      if (!f.checkValidity()) return f.reportValidity();
      const d = App.formData(f);
      const dest = App.get.dest(d.destinationId);
      busy(c.querySelector('#ls-save'), async () => {
        await patchVan(van, {
          name: d.name.trim(), destinationId: d.destinationId, description: d.description.trim(), amenities: [].concat(d.amenities || []), familyFriendly: !!d.familyFriendly,
          pricePerNight: +d.pricePerNight, weekendPrice: +d.weekendPrice || +d.pricePerNight, cleaningFee: +d.cleaningFee, deposit: +d.deposit,
          discounts: { weekly: +d.weekly, monthly: +d.monthly }, minNights: +d.minNights, kmPerDay: +d.kmPerDay, extraKmFee: +d.extraKmFee,
          instantBook: !!d.instantBook, cancellation: d.cancellation, rules: d.rules.split('\n').map(s => s.trim()).filter(Boolean), city: d.city.trim(),
          // Approximate pin near the destination until a geocoder is connected
          pickup: { city: d.city.trim(), address: d.address.trim(), time: d.time, returnTime: d.returnTime, lat: van.pickup.lat || dest.lat + 0.02, lng: van.pickup.lng || dest.lng + 0.02 }
        });
        App.toast('Listing details saved', 'good'); next();
      });
    };
  },

  payout(c, { owner, next }) {
    const p = owner.payout;
    const show = (changing) => {
      if (!changing && (p?.status === 'verified' || p?.status === 'pending') && p.data) {
        c.innerHTML = String(h`<div class="callout">🏦 ${p.data.bank} · account ending ${p.data.last4} · ${p.data.ifsc}${p.check ? h` <span class="source-tag">✓ ${p.check.source}</span>` : ''}</div>
          <p class="small muted">Payouts are sent 24 hours after each trip starts. ${p.status === 'pending' ? 'Our team is confirming the account name.' : ''}</p>
          <div class="form-actions"><button class="btn btn-ghost" id="chg">Change account</button><button class="btn btn-primary" id="nx">Continue</button></div>`);
        c.querySelector('#nx').onclick = () => next();
        c.querySelector('#chg').onclick = () => show(true);
        return;
      }
      c.innerHTML = String(h`<form id="f" novalidate>
        <div class="grid-2">
          <label class="field"><span>Account holder name</span><input name="holder" value="${owner.business?.data?.business || App.me().name}" required></label>
          <label class="field"><span>${App.C.payout.routingLabel}</span><input name="ifsc" pattern="${App.C.payout.routingPattern.slice(1, -1)}" maxlength="11" required style="text-transform:uppercase" autocomplete="off"></label>
          <label class="field"><span>${App.C.payout.accountLabel}</span><input name="acct" inputmode="numeric" pattern="[0-9]{9,18}" required autocomplete="off"></label>
          <label class="field"><span>Confirm account number</span><input name="acct2" inputmode="numeric" required autocomplete="off"></label>
        </div>
        <p class="small muted">We’ll deposit ₹1 to confirm the account exists and the name matches your verified identity (penny-drop). Only the last 4 digits are kept.</p>
        ${testHint('Accounts ending 0000 are invalid; ending 2222 give a name mismatch.')}${consentBox('bank-consent', 'I consent to a ₹1 verification deposit to this account.')}
        <div id="bank-result"></div>
        <div class="form-actions"><button class="btn btn-primary" id="bank-btn">Verify & save</button></div></form>`);
      const f = c.querySelector('#f');
      f.onsubmit = (e) => {
        e.preventDefault();
        f.ifsc.value = f.ifsc.value.toUpperCase();
        if (!f.checkValidity()) return f.reportValidity();
        if (f.acct.value !== f.acct2.value) return App.toast('Account numbers don’t match.', 'bad');
        if (!needConsent(c, 'bank-consent')) return;
        busy(c.querySelector('#bank-btn'), async () => {
          const r = await App.verify.run('bank', { account: f.acct.value, ifsc: f.ifsc.value, holder: f.holder.value });
          c.querySelector('#bank-result').innerHTML = String(App.checkResultBox(r));
          f.acct.value = f.acct2.value = ''; // account numbers never stay in the page
          if (r.status === 'failed') return App.toast('Bank verification failed — see details below.', 'bad');
          await App.syncMarket();
          App.toast(r.status === 'verified' ? '₹1 penny-drop successful — account verified' : 'Saved — our team will confirm the account name', 'good');
          next();
        });
      };
    };
    show(false);
  },

  review(c, ctx) {
    if (needVan(c, ctx)) return;
    const { van, statuses, link } = ctx;
    const pre = App.ONBOARDING_STEPS.slice(0, 10);
    const blocking = pre.filter((s, i) => !['verified', 'pending'].includes(statuses[i]));
    const st = van.verification.review;
    c.innerHTML = String(h`<ul class="doc-status">${pre.map((s, i) => h`<li><a href="${link(i)}">${i + 1}. ${s.title}</a>${App.statusBadge(statuses[i])}</li>`)}</ul>
      ${st === 'pending' ? h`<div class="callout">⏳ Submitted for review. We’ll email you within 2 business days. Pending documents are checked as part of this review.</div>`
      : st === 'verified' ? h`<div class="callout good-bg">✓ Approved! Head to the final step to publish.</div><div class="form-actions"><a class="btn btn-primary" href="${link(11)}">Continue</a></div>`
      : blocking.length ? h`<p class="error">Finish these steps before submitting: ${blocking.map(s => s.title).join(', ')}.</p>`
      : h`${st === 'rejected' ? h`<div class="alert alert-warn">Our team asked for changes — check your notifications, update the listing, then submit again.</div>` : ''}
          <p>Everything’s in. Our team will check your documents, photos and pricing, and may call you to confirm details.</p>
          <label class="check"><input type="checkbox" id="decl"> I confirm the information is accurate and I will keep all documents valid while listed.</label>
          <div class="form-actions"><button class="btn btn-primary" id="submit">Submit for review</button></div>`}`);
    const sb = c.querySelector('#submit');
    if (sb) sb.onclick = () => {
      if (!c.querySelector('#decl').checked) return App.toast('Please confirm the declaration.', 'bad');
      busy(sb, async () => { await App.market('POST', `/api/owner/vans/${van.id}/submit`, {}); App.toast('Submitted for review!', 'good'); App.render(); });
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
    if (pb) pb.onclick = () => busy(pb, async () => { await App.market('POST', `/api/owner/vans/${van.id}/status`, { status: 'published' }); App.toast('Your van is live!', 'good'); App.render(); });
  }
};

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b(ltd|limited|pvt|private|india)\b\.?/g, '').trim().replace(/\b\w/g, c => c.toUpperCase());

// Shared step for document lists (registration & insurance)
const docStep = (c, ctx, defs, isInsurance = false) => {
  if (needVan(c, ctx)) return;
  const { van, next } = ctx;
  const byType = Object.fromEntries(docsOf(van.id).map(d => [d.type, d]));
  const inReview = van.status === 'in_review';
  c.innerHTML = String(h`
    ${van.regNo ? h`<div class="callout row-between wrap"><span>${van.registry?.checkedAt ? h`VAHAN last checked ${App.fmtDateTime(van.registry.checkedAt)} for <strong>${van.regNo}</strong>.` : h`Fetch RC, PUC, permit and insurance details for <strong>${van.regNo}</strong> from VAHAN.`}</span><button type="button" class="btn btn-sm" id="recheck" ${inReview ? 'disabled' : ''}>↻ ${van.registry?.checkedAt ? 'Re-check' : 'Check'} with VAHAN</button></div>` : ''}
    <form id="f" novalidate>
    ${defs.map(d => {
      const ex = byType[d.type];
      // Registry-confirmed docs need no upload; a pending registry doc without a file still needs one
      const locked = ex && (ex.status === 'verified' || (ex.status === 'pending' && ex.fileName));
      return h`
      <fieldset class="doc-field"><legend>${d.label}${d.required ? '' : ' (if applicable)'}</legend>
        ${ex ? h`<div class="row gap wrap">${App.statusBadge(ex.status)}${App.docExpiryState(ex) ? h`<span class="badge badge-${App.docExpiryState(ex).tone}">${App.docExpiryState(ex).label}</span>` : ''}${ex.check ? h`<span class="source-tag">✓ ${ex.check.source}</span>` : ''}<span class="small muted">${ex.fileName || ''}</span>${ex.note ? h`<span class="small">${ex.note}</span>` : ''}</div>` : ''}
        ${locked ? h`<label class="check small"><input type="checkbox" name="replace-${d.type}"> Upload a new version</label>` : ''}
        <div class="grid-3" data-for="${d.type}" ${locked ? 'hidden' : ''}>
          ${ex?.check ? '' : h`
            ${isInsurance ? h`<label class="field"><span>Insurer</span><input name="insurer-${d.type}" value="${ex?.insurer || ''}"></label>` : ''}
            <label class="field"><span>Document / policy number</span><input name="num-${d.type}" value="${ex?.number || ''}"></label>
            ${d.expires ? h`<label class="field"><span>Valid until</span><input type="date" name="exp-${d.type}" min="${App.addDays(App.today(), 1)}" value="${ex && ex.expiry > App.today() ? ex.expiry : ''}"></label>` : ''}`}
          <label class="field"><span>${isInsurance && ex?.check ? 'Policy schedule (shows self-drive rental cover)' : 'File'}</span><input type="file" name="file-${d.type}" accept=".pdf,image/jpeg,image/png"></label>
        </div>
      </fieldset>`; })}
    ${isInsurance ? h`<label class="check"><input type="checkbox" name="covers" required> The policy covers commercial self-drive rental and names the vehicle’s registration number.</label>` : ''}
    <div class="form-actions"><button class="btn btn-primary" id="docs-save" ${inReview ? 'disabled' : ''}>Submit documents</button></div></form>`);
  const f = c.querySelector('#f');
  f.querySelectorAll('[name^=replace-]').forEach(cb => cb.onchange = () => { f.querySelector(`[data-for="${cb.name.slice(8)}"]`).hidden = !cb.checked; });
  const rb = c.querySelector('#recheck');
  if (rb) rb.onclick = () => busy(rb, async () => {
    const r = await App.verify.run('vehicle', { regNo: van.regNo, relation: van.relation || 'owner', vanId: van.id });
    await App.syncMarket();
    App.toast(r.data.docs ? 'Updated from VAHAN' : (App.verify.note(r) || 'Vehicle not found in VAHAN.'), r.data.docs ? 'good' : 'bad');
    App._keepScroll = true; App.render();
  });
  f.onsubmit = (e) => {
    e.preventDefault();
    if (!f.checkValidity()) return f.reportValidity();
    const uploads = [];
    try {
      for (const d of defs) {
        const box = f.querySelector(`[data-for="${d.type}"]`);
        if (box.hidden) continue;
        const file = checkFile(f['file-' + d.type]);
        const exp = f['exp-' + d.type]?.value;
        if (!file) { if (d.required && !byType[d.type]) throw new Error(`Please upload: ${d.label}`); continue; }
        if (d.expires && f['exp-' + d.type] && !exp) throw new Error(`Add the expiry date for: ${d.label}`);
        uploads.push({ type: d.type, fileName: file, number: f['num-' + d.type]?.value.trim(), expiry: exp || null, insurer: f['insurer-' + d.type]?.value.trim() });
      }
    } catch (err) { return App.toast(err.message, 'bad'); }
    if (!uploads.length) {
      const missing = defs.filter(d => d.required && !byType[d.type]);
      if (missing.length) return App.toast('Please upload: ' + missing.map(d => d.label).join(', '), 'bad');
      if (isInsurance && byType.insurance?.status === 'pending' && !byType.insurance.fileName) return App.toast('Upload the policy schedule so we can confirm rental cover.', 'bad');
      return next();
    }
    busy(c.querySelector('#docs-save'), async () => {
      for (const u of uploads) await addDoc(van, u);
      App.toast('Documents submitted for review', 'good'); next();
    });
  };
};
})();
