/*
 * Traveller verification (My account → Verification): email and mobile, identity
 * and driving licence. Indian residents use DigiLocker (Aadhaar) and SARATHI;
 * visitors from abroad upload a passport, visa and International Driving Permit
 * for a person to review. Statuses are decided by the shared rules on the backend.
 */
(() => {
const { h } = App;

const DIGILOCKER_MSGS = {
  verified: ['Aadhaar verified with DigiLocker', 'good'], review: ['Aadhaar received — we’ll review the name match', 'info'],
  failed: ['Aadhaar check failed — see details', 'bad'], denied: ['DigiLocker consent was cancelled', 'bad'], error: ['DigiLocker error', 'bad']
};
const NO_VISA = ['OCI card', 'Nepal / Bhutan citizen'];

App.travellerVerificationView = (m, me) => {
  const q = App.parseHash().query;
  if (q.digilocker) {
    const [msg, tone] = DIGILOCKER_MSGS[q.digilocker] || ['DigiLocker finished', 'info'];
    App.toast(q.msg || msg, tone);
    history.replaceState(null, '', location.hash.replace(/[?&]digilocker=[^&]*/, '').replace(/[?&]msg=[^&]*/, ''));
  }
  const next = q.next && q.next.startsWith('#/') ? q.next : '';
  const t = App.travellerRecord(me);
  const id = t.identity, lic = t.licence;
  const level = App.core.travellerLevel(t);
  const phone = (me.phone || '').replace(/\s/g, '');
  let residency = App._residency || t.residency || (phone.startsWith('+') && !phone.startsWith('+91') ? 'foreign' : 'india');
  const test = App.verifyConfig?.testMode;
  const minDob = App.addDays(App.today(), -365 * 18);
  const tomorrow = App.addDays(App.today(), 1);

  const files = (f) => Object.values(f || {}).map(n => h`<span class="small muted">📎 ${n}</span> `);
  const note = (x) => x.note ? h`<p class="small ${x.status === 'verified' ? 'muted' : 'error'}">${x.note}</p>` : '';
  const source = (x) => x.check ? h`<span class="source-tag">✓ ${x.check.source} · ${App.timeAgo(x.check.checkedAt)}</span>`
    : x.reviewedAt ? h`<span class="source-tag">✓ Reviewed by VanYatra · ${App.timeAgo(x.reviewedAt)}</span>` : '';
  // Only flag dates that need attention; "valid until" is already printed next to it
  const expiryBadge = (date) => { const e = date && App.docExpiryState({ expiry: date }); return e && e.tone !== 'muted' ? h`<span class="badge badge-${e.tone}">${e.label}</span>` : ''; };
  const expiringSoon = (date) => date && App.docExpiryState({ expiry: date }).tone !== 'muted';
  // Show the form again when there's nothing usable on file or it's about to lapse
  const needsForm = (x, date) => ['not_started', 'action_required', 'rejected'].includes(x.status) || (x.status === 'verified' && expiringSoon(date));

  const identityBody = () => {
    if (!needsForm(id, id.expiry) && id.method) return h`
      <p>${id.method === 'aadhaar' ? h`Aadhaar XXXX-XXXX-${id.data?.aadhaarLast4 || '????'} · <strong>${id.data?.name || ''}</strong>` : h`Passport ${id.data?.passportMasked} · ${id.data?.nationality} · ${id.data?.visaType}`}</p>
      ${id.method === 'passport' ? h`<p class="small">Passport valid until ${App.fmtDate(id.data.passportExpiry)}${id.data.visaExpiry ? h` · visa valid until ${App.fmtDate(id.data.visaExpiry)}` : ''} ${expiryBadge(id.expiry)}</p><p>${files(id.files)}</p>` : ''}
      ${id.status === 'pending' ? h`<p class="small muted">Our team usually reviews documents within a few hours. You can already send booking requests.</p>` : ''}
      ${note(id)}${source(id)}`;
    return h`${note(id)}
      <div class="tabs" role="tablist" aria-label="Where do you live?">
        <button type="button" role="tab" data-res="india" aria-selected="${residency === 'india'}" class="${residency === 'india' ? 'on' : ''}">🇮🇳 I live in India</button>
        <button type="button" role="tab" data-res="foreign" aria-selected="${residency === 'foreign'}" class="${residency === 'foreign' ? 'on' : ''}">✈️ I’m visiting from abroad</button>
      </div>
      ${residency === 'india' ? h`
        <p class="small muted">Sign in to DigiLocker and approve sharing your eAadhaar. We keep only your name, date of birth and the last 4 digits — never your Aadhaar number, password or OTP.</p>
        ${test ? h`<p class="test-hint">🧪 <strong>Test mode</strong> — DigiLocker shows a test consent screen where you can type any name.</p>` : ''}
        <label class="check consent"><input type="checkbox" id="id-consent"> I consent to VanYatra verifying my identity with UIDAI via DigiLocker, only to confirm who is renting.</label>
        <div><button type="button" class="btn btn-primary" id="dl-btn"><span aria-hidden="true">🔐</span> Verify with DigiLocker</button></div>`
      : h`<form id="pp-form" class="stack" novalidate>
        <p class="small muted">Upload your passport photo page and Indian visa. A member of our team checks them, usually within a few hours.</p>
        <div class="grid-2">
          <label class="field"><span>Nationality</span><input name="nationality" required autocomplete="country-name" placeholder="e.g. United Kingdom"></label>
          <label class="field"><span>Date of birth</span><input type="date" name="dob" required max="${minDob}"></label>
          <label class="field"><span>Passport number</span><input name="passportNumber" required autocomplete="off" pattern="[A-Za-z0-9 \\-]{6,14}" title="Your passport number as printed"></label>
          <label class="field"><span>Passport valid until</span><input type="date" name="passportExpiry" required min="${tomorrow}"></label>
          <label class="field"><span>Visa</span><select name="visaType" required><option value="">Choose…</option>${App.core.TRAVELLER_VISAS.map(v => h`<option>${v}</option>`)}</select></label>
          <label class="field" id="visa-exp"><span>Visa valid until</span><input type="date" name="visaExpiry" min="${tomorrow}"></label>
          <label class="field"><span>Passport photo page</span><input type="file" name="passportFile" accept="image/*,application/pdf" required></label>
          <label class="field" id="visa-file"><span>Visa (or e-Visa PDF)</span><input type="file" name="visaFile" accept="image/*,application/pdf"></label>
        </div>
        <label class="check consent"><input type="checkbox" name="consent" required> I consent to VanYatra checking these documents to confirm who is renting.</label>
        <div><button class="btn btn-primary">Submit for review</button></div>
      </form>`}`;
  };

  const licenceBody = () => {
    const foreign = id.method === 'passport' || (id.method !== 'aadhaar' && residency === 'foreign');
    if (!needsForm(lic, lic.validUpto)) return h`
      <p>${lic.kind === 'idp' ? h`${lic.data?.homeCountry} licence ${lic.data?.licenceMasked} + International Driving Permit` : h`Licence ${lic.data?.dlMasked}${lic.data?.classes?.length ? ' · ' + lic.data.classes.join(', ') : ''}`}</p>
      <p class="small">Valid until ${App.fmtDate(lic.validUpto)} ${expiryBadge(lic.validUpto)}</p>
      ${lic.kind === 'idp' ? h`<p>${files(lic.files)}</p>` : ''}${note(lic)}${source(lic)}
      <p class="small muted">You won’t need to enter it again when you book, as long as it’s valid for the whole trip.</p>`;
    if (!['verified', 'pending'].includes(id.status)) return h`<p class="muted">Verify your identity first — we match the name on your licence to it.</p>`;
    return h`${note(lic)}${lic.status === 'verified' ? h`<p class="small">Your licence expires on ${App.fmtDate(lic.validUpto)} ${expiryBadge(lic.validUpto)}. Renewed it? Check it again below.</p>` : ''}
      ${foreign ? h`<form id="idp-form" class="stack" novalidate>
        <p class="small muted">Foreign licences are valid in India together with an International Driving Permit (IDP). Bring both to pickup.</p>
        <div class="grid-2">
          <label class="field"><span>Licence issued in</span><input name="homeCountry" required placeholder="e.g. United Kingdom" value="${id.data?.nationality || ''}"></label>
          <label class="field"><span>Licence number</span><input name="licenceNumber" required autocomplete="off" minlength="5" maxlength="30"></label>
          <label class="field"><span>IDP valid until</span><input type="date" name="idpExpiry" required min="${tomorrow}"></label>
          <span></span>
          <label class="field"><span>Home driving licence</span><input type="file" name="licenceFile" accept="image/*,application/pdf" required></label>
          <label class="field"><span>International Driving Permit</span><input type="file" name="idpFile" accept="image/*,application/pdf" required></label>
        </div>
        <label class="check consent"><input type="checkbox" name="consent" required> I consent to VanYatra checking these documents.</label>
        <div><button class="btn btn-primary">Submit for review</button></div>
      </form>` : h`<form id="dlp-form" class="stack" novalidate>
        <p class="small muted">We check it once with the government SARATHI registry, in the name on your Aadhaar. Only the last 4 characters are stored.</p>
        <div class="grid-2">
          <label class="field"><span>Driving licence number</span><input name="dlNumber" required autocomplete="off" placeholder="e.g. DL-0420110012345" pattern="[A-Za-z0-9 \\-]{8,20}" title="Your licence number as printed, e.g. DL-0420110012345"></label>
          <label class="field"><span>Date of birth</span><input type="date" name="dob" required max="${minDob}" value="${id.data?.dob || ''}"></label>
        </div>
        ${test ? h`<p class="test-hint">🧪 <strong>Test mode</strong> — licences ending 0000 are “not found”, ending 1111 are expired.</p>` : ''}
        <label class="check consent"><input type="checkbox" name="consent" required> I consent to VanYatra verifying this licence with the SARATHI registry.</label>
        <div id="dlp-result"></div>
        <div><button class="btn btn-primary">Verify licence</button></div>
      </form>`}`;
  };

  const draw = () => {
    m.innerHTML = String(h`<h1>Traveller verification</h1>
      <div class="callout verify-hero verify-${level}">
        <div><strong>${level === 'verified' ? '✓ You’re a verified traveller' : level === 'partial' ? 'Almost there — add your driving licence' : 'Get verified before your first trip'}</strong>
        <p class="small">${level === 'verified' ? 'Owners see your verified badge, instant book is open to you, and you won’t re-enter your licence when booking.' : 'Owners hand over a home on wheels, so every renter confirms who they are and that they can drive. It takes about 2 minutes and is done once.'}</p></div>
        ${next && ['verified', 'pending'].includes(id.status) ? h`<a class="btn btn-primary btn-sm" href="${next}">Continue booking →</a>` : ''}
      </div>
      <section class="card verify-card"><div class="row-between"><h2>1. Email & mobile</h2>${me.emailVerified && me.phoneVerified ? App.statusBadge('verified') : ''}</div><div id="otp"></div></section>
      <section class="card verify-card"><div class="row-between"><h2>2. Identity</h2>${App.statusBadge(id.status)}</div>${identityBody()}</section>
      <section class="card verify-card"><div class="row-between"><h2>3. Driving licence</h2>${App.statusBadge(lic.status)}</div>${licenceBody()}</section>
      <p class="small muted">🔒 Why we ask: rental rules in India require us to know who is driving. We store masked numbers only. Owners never see your documents — only your verified badge. You can ask us to delete them any time from Profile &amp; privacy.</p>`);

    App.otpWidget(m.querySelector('#otp'), me, draw);
    m.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { residency = App._residency = b.dataset.res; draw(); });

    const dlBtn = m.querySelector('#dl-btn');
    if (dlBtn) dlBtn.onclick = async () => {
      if (!m.querySelector('#id-consent').checked) return App.toast('Please tick the consent box first.', 'bad');
      dlBtn.disabled = true;
      try { location.href = await App.verify.startDigiLocker('/#/account/verification' + (next ? '?next=' + encodeURIComponent(next) : '')); }
      catch (e) { dlBtn.disabled = false; App.toast(e.message, 'bad'); }
    };

    // Uploads: only file names are sent until encrypted document storage is connected
    const submitDocs = (form, part, fields) => form.onsubmit = async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      const body = { part };
      for (const k of fields) body[k] = form[k]?.type === 'file' ? (form[k].files[0]?.name || '') : (form[k]?.value || '');
      const btn = form.querySelector('button:not([type=button])');
      btn.disabled = true; btn.textContent = 'Submitting…';
      try { await App.market('POST', '/api/traveller/documents', body); App.toast('Submitted — we’ll review it shortly', 'good'); App._keepScroll = true; App.render(); }
      catch (err) { btn.disabled = false; btn.textContent = 'Submit for review'; App.toast(err.message, 'bad'); }
    };
    const pp = m.querySelector('#pp-form');
    if (pp) {
      const sync = () => {
        const noVisa = NO_VISA.includes(pp.visaType.value);
        pp.querySelector('#visa-exp').hidden = pp.querySelector('#visa-file').hidden = noVisa;
        pp.visaExpiry.required = pp.visaFile.required = !noVisa;
      };
      pp.visaType.onchange = sync; sync();
      submitDocs(pp, 'identity', ['nationality', 'dob', 'passportNumber', 'passportExpiry', 'visaType', 'visaExpiry', 'passportFile', 'visaFile']);
    }
    const idp = m.querySelector('#idp-form');
    if (idp) submitDocs(idp, 'licence', ['homeCountry', 'licenceNumber', 'idpExpiry', 'licenceFile', 'idpFile']);

    const dlp = m.querySelector('#dlp-form');
    if (dlp) dlp.onsubmit = async (e) => {
      e.preventDefault();
      if (!dlp.checkValidity()) return dlp.reportValidity();
      const btn = dlp.querySelector('button');
      btn.disabled = true; btn.textContent = 'Checking with SARATHI…';
      try {
        const r = await App.verify.run('dl', { dlNumber: dlp.dlNumber.value, dob: dlp.dob.value, purpose: 'profile' });
        await App.syncMarket();
        if (r.status === 'failed') {
          btn.disabled = false; btn.textContent = 'Verify licence';
          m.querySelector('#dlp-result').innerHTML = String(App.checkResultBox(r));
          return App.toast('We couldn’t verify this licence — see details.', 'bad');
        }
        App.toast(r.status === 'verified' ? 'Driving licence verified' : 'Licence received — our team will review it', r.status === 'verified' ? 'good' : 'info');
        App._keepScroll = true; App.render();
      } catch (err) { btn.disabled = false; btn.textContent = 'Verify licence'; App.toast(err.message, 'bad'); }
    };
  };
  draw();
};
})();
