/*
 * Sign in / sign up / contact verification, the "list your van" landing page
 * and help & policy pages.
 */
(() => {
const { h, photo } = App;

const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//')) ? '#' + next : null;

App.pages.login = (el, _p, q) => {
  if (App.me()) { location.replace(safeNext(q.next) || '#/'); return; }
  const demo = [['Traveller', 'traveller@vanyatra.in'], ['Van owner', 'owner@vanyatra.in'], ['New owner (KYC pending)', 'karan@vanyatra.in'], ['Admin', 'admin@vanyatra.in']];
  el.innerHTML = String(h`
  <div class="auth-wrap">
    <div class="auth-art"><img src="${photo('photo-1649851706700-56d3751fa9b1', 1000)}" alt=""><div class="auth-quote">“Best trip we have ever done.”<span>— Neha & Vikram, Pune</span></div></div>
    <div class="auth-card">
      <h1>Welcome back</h1>
      <p class="muted">Sign in to book vans, message owners and manage your trips.</p>
      <form id="login-form" novalidate>
        <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
        <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required minlength="8"></label>
        <p class="error" id="login-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Sign in</button>
      </form>
      <p class="center small">New to VanYatra? <a href="#/signup${q.next ? '?next=' + encodeURIComponent(q.next) : ''}">Create an account</a></p>
      <div class="demo-box">
        <strong>Demo accounts</strong> <span class="small muted">(password: demo1234)</span>
        <div class="demo-btns">${demo.map(([l, e]) => h`<button type="button" class="btn btn-sm btn-ghost" data-demo="${e}">${l}</button>`)}</div>
      </div>
    </div>
  </div>`);
  const f = el.querySelector('#login-form');
  const err = el.querySelector('#login-err');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.checkValidity()) { f.reportValidity(); return; }
    try {
      const u = await App.api.login(f.email.value, f.password.value);
      App.toast(`Welcome back, ${u.name.split(' ')[0]}!`, 'good');
      App.go(safeNext(q.next) || (u.role === 'owner' ? '#/owner' : u.role === 'admin' ? '#/admin' : '#/'));
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
  el.querySelectorAll('[data-demo]').forEach(b => b.onclick = () => { f.email.value = b.dataset.demo; f.password.value = 'demo1234'; f.requestSubmit(); });
};

App.pages.signup = (el, _p, q) => {
  const role = q.role === 'owner' ? 'owner' : 'customer';
  el.innerHTML = String(h`
  <div class="auth-wrap">
    <div class="auth-art"><img src="${photo('photo-1530541930197-ff16ac917b0e', 1000)}" alt=""><div class="auth-quote">Join 10,000+ travellers exploring India by van.</div></div>
    <div class="auth-card">
      <h1>Create your account</h1>
      <form id="signup-form" novalidate>
        <fieldset class="role-pick"><legend>I want to</legend>
          <label class="pay-opt ${role === 'customer' ? 'on' : ''}"><input type="radio" name="role" value="customer" ${role === 'customer' ? 'checked' : ''}><span><strong>🧭 Rent a van</strong><span class="small muted">Book trips as a traveller</span></span></label>
          <label class="pay-opt ${role === 'owner' ? 'on' : ''}"><input type="radio" name="role" value="owner" ${role === 'owner' ? 'checked' : ''}><span><strong>🚐 List my van</strong><span class="small muted">Earn as a van owner</span></span></label>
        </fieldset>
        <label class="field"><span>Full name</span><input name="name" autocomplete="name" required minlength="2"></label>
        <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" required></label>
        <label class="field"><span>Mobile number</span><input type="tel" name="phone" autocomplete="tel" placeholder="${App.C.phonePrefix} 98xxx xxxxx" required pattern="[+0-9 ]{10,16}"></label>
        <label class="field"><span>Password</span><input type="password" name="password" autocomplete="new-password" required minlength="8" aria-describedby="pw-hint"><small id="pw-hint" class="muted">At least 8 characters with a letter and a number.</small></label>
        <label class="check"><input type="checkbox" name="terms" required> I agree to the <a href="#/help/terms" target="_blank">Terms</a> and <a href="#/help/privacy" target="_blank">Privacy Policy</a>.</label>
        <label class="check"><input type="checkbox" name="marketing"> Send me trip ideas and offers (optional).</label>
        <p class="error" id="su-err" role="alert" hidden></p>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Create account</button>
      </form>
      <p class="center small">Already have an account? <a href="#/login">Sign in</a></p>
    </div>
  </div>`);
  const f = el.querySelector('#signup-form');
  f.querySelectorAll('[name=role]').forEach(r => r.onchange = () => f.querySelectorAll('.role-pick .pay-opt').forEach(l => l.classList.toggle('on', l.contains(f.querySelector('[name=role]:checked')))));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.checkValidity()) { f.reportValidity(); return; }
    try {
      const d = App.formData(f);
      const u = await App.api.signup({ name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(), password: d.password, role: d.role });
      App.toast('Account created!', 'good');
      App.go(u.role === 'owner' ? '#/owner/onboarding' : '#/verify?next=' + encodeURIComponent(q.next || '/'));
    } catch (ex) { const err = el.querySelector('#su-err'); err.textContent = ex.message; err.hidden = false; }
  });
};

/* Email + phone OTP verification (codes are shown in a toast in this demo) */
App.otpWidget = (container, me, onDone) => {
  const codes = {};
  const draw = () => {
    container.innerHTML = String(h`<div class="otp-list">
      ${[['email', 'Email', me.email, me.emailVerified], ['phone', 'Mobile', me.phone, me.phoneVerified]].map(([k, l, v, ok]) => h`
        <div class="otp-row">
          <div><strong>${l}</strong><div class="small muted">${v}</div></div>
          ${ok ? App.statusBadge('verified') : codes[k] ? h`<form class="row gap" data-otp="${k}"><input name="code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" placeholder="6-digit code" aria-label="${l} verification code" required><button class="btn btn-sm btn-primary">Verify</button></form>`
            : h`<button class="btn btn-sm" data-send="${k}">Send code</button>`}
        </div>`)}
    </div>`);
    container.querySelectorAll('[data-send]').forEach(b => b.onclick = () => {
      const k = b.dataset.send;
      codes[k] = String(Math.floor(100000 + Math.random() * 900000));
      App.toast(`Demo: your ${k} code is ${codes[k]}`, 'info');
      draw();
    });
    container.querySelectorAll('[data-otp]').forEach(f => f.onsubmit = (e) => {
      e.preventDefault();
      const k = f.dataset.otp;
      if (f.code.value.trim() !== codes[k]) return App.toast('That code is incorrect.', 'bad');
      me[k + 'Verified'] = true;
      App.save();
      App.toast(`${k === 'email' ? 'Email' : 'Mobile'} verified`, 'good');
      draw();
      if (me.emailVerified && me.phoneVerified) onDone && onDone();
    });
  };
  draw();
};

App.pages.verifyContact = (el, _p, q) => {
  const me = App.me();
  el.innerHTML = String(h`<div class="container narrow section">
    <h1>Verify your contact details</h1>
    <p class="muted">We verify email and mobile to protect your account and send booking updates.</p>
    <div class="card" id="otp"></div>
    <div class="form-actions"><a class="btn btn-ghost" href="${safeNext(q.next) || '#/'}">Skip for now</a><a class="btn btn-primary" href="${safeNext(q.next) || '#/'}">Continue</a></div>
  </div>`);
  App.otpWidget(el.querySelector('#otp'), me, () => App.go(safeNext(q.next) || '#/'));
};

/* ================= LIST YOUR VAN ================= */
App.pages.ownerLanding = (el) => {
  const me = App.me();
  const avg = 6200, nights = 12;
  el.innerHTML = String(h`
  <section class="hero hero-owner">
    <img class="hero-img" src="${photo('photo-1591091221408-63351f26777a', 1800)}" alt="">
    <div class="hero-shade"></div>
    <div class="container hero-inner">
      <p class="eyebrow light">For camper van owners</p>
      <h1>Turn your van into a travel business</h1>
      <p class="hero-sub">List for free. You set the price, calendar and rules — we bring verified travellers, secure payments and insurance support.</p>
      <a class="btn btn-accent btn-lg" href="${me ? (me.role === 'owner' ? '#/owner/onboarding' : '#/signup?role=owner') : '#/signup?role=owner'}">Start your listing</a>
    </div>
  </section>
  <section class="container section">
    <div class="earn-calc card">
      <div><h2>How much could you earn?</h2>
        <label class="field"><span>Nightly price: <strong id="ec-p">${App.money(avg)}</strong></span><input type="range" id="ec-price" min="2500" max="15000" step="100" value="${avg}"></label>
        <label class="field"><span>Nights booked per month: <strong id="ec-n">${nights}</strong></span><input type="range" id="ec-nights" min="2" max="28" value="${nights}"></label>
      </div>
      <div class="earn-out"><span class="muted">Estimated monthly payout</span><strong id="ec-out"></strong><span class="small muted">After ${Math.round(App.C.ownerCommissionRate * 100)}% platform commission. Excludes cleaning fees you keep.</span></div>
    </div>
  </section>
  <section class="container section">
    <h2>Get verified and live in 12 simple steps</h2>
    <p class="muted">Most owners finish in under an hour. Our team reviews documents within 2 business days.</p>
    <ol class="onboard-overview">${App.ONBOARDING_STEPS.map((s, i) => h`<li><span class="step-n">${i + 1}</span><div><strong>${s.title}</strong><span class="small muted">${s.blurb}</span></div></li>`)}</ol>
  </section>
  <section class="container section">
    <h2>What you’ll need (${App.C.name})</h2>
    <div class="grid-3">
      <div class="card"><h3>🪪 Identity</h3><ul class="ticks small">${App.C.kyc.documents.map(d => h`<li>${d.label}</li>`)}</ul></div>
      <div class="card"><h3>📄 Vehicle papers</h3><ul class="ticks small">${App.C.registrationDocs.map(d => h`<li>${d.label}${d.required ? '' : ' (if applicable)'}</li>`)}${App.C.insuranceDocs.map(d => h`<li>${d.label}</li>`)}</ul></div>
      <div class="card"><h3>🔧 Safety</h3><ul class="ticks small">${App.C.inspectionChecklist.slice(0, 6).map(c => h`<li>${c}</li>`)}<li>…and more</li></ul></div>
    </div>
    <p class="small muted">Requirements are configured per country. <a href="#/help/owners">See full owner requirements</a>.</p>
  </section>`);
  const upd = () => {
    const p = +el.querySelector('#ec-price').value, n = +el.querySelector('#ec-nights').value;
    el.querySelector('#ec-p').textContent = App.money(p);
    el.querySelector('#ec-n').textContent = n;
    el.querySelector('#ec-out').textContent = App.money(p * n * (1 - App.C.ownerCommissionRate));
  };
  el.querySelector('#ec-price').oninput = upd;
  el.querySelector('#ec-nights').oninput = upd;
  upd();
};

/* ================= HELP & POLICIES ================= */
const FAQ = [
  ['Booking', [
    ['What licence do I need?', 'A valid Indian driving licence (LMV) held for at least 2 years, or an International Driving Permit with your home licence. Larger motorhomes may require a transport licence — this is shown on each van page.'],
    ['What is included in the price?', 'The van, basic insurance, 24×7 roadside assistance and the amenities listed. The total you see before paying includes the cleaning fee, service fee and GST. The security deposit is held, not charged.'],
    ['What is instant book?', 'Instant-book vans are confirmed immediately. Other vans are “request to book”: your payment is authorised and only charged if the owner accepts within 24 hours.'],
    ['Can I take the van to another state?', 'Yes, if the van has an All India Tourist Permit. Check the listing or ask the owner before booking. State entry taxes are payable by the traveller.']
  ]],
  ['Payments & deposits', [
    ['When am I charged?', 'Instant bookings are charged at booking. Requests are charged when the owner accepts.'],
    ['How does the security deposit work?', `The deposit is authorised on your card at pickup and released within ${App.C.depositReleaseDays} days of return if there is no damage, missing fuel or extra kilometres.`],
    ['Is my payment safe?', 'Payments are handled by a PCI-DSS compliant gateway. Owners never see your card details and are paid only after your trip starts. Never pay an owner outside VanYatra.']
  ]],
  ['On the road', [
    ['What if the van breaks down?', `Call our 24×7 roadside line on ${App.C.supportPhone}. We will arrange a mechanic, towing or a replacement van where possible.`],
    ['Where can I park overnight?', 'Use the van-friendly campsites listed on each destination page, or ask your owner. Avoid parking on highway shoulders overnight.'],
    ['Can I bring my pet?', 'Only in vans marked pet friendly. Filter by “Pet friendly” when searching.']
  ]]
];

const POLICY = {
  safety: ['Trust & safety', h`
    <p>Your safety is our first priority. Here’s how we protect every trip:</p>
    <div class="grid-2">
      <div class="card"><h3>🪪 Verified owners</h3><p>Government ID (KYC), vehicle ownership, registration, permits and bank accounts are checked by our team before a van goes live. Documents with expiry dates are tracked and listings are paused automatically if they lapse.</p></div>
      <div class="card"><h3>🛡️ Insurance</h3><p>Every van must hold commercial insurance covering self-drive rental. Add Damage Cover at checkout to reduce your deposit liability by 80%.</p></div>
      <div class="card"><h3>🔧 Safety inspection</h3><p>A 10-point roadworthiness and habitation check: tyres, brakes, lights, seat belts, LPG, fire extinguisher, first-aid kit, electrics and more.</p></div>
      <div class="card"><h3>💬 On-platform messaging</h3><p>Phone numbers and emails are hidden in messages until a booking is confirmed to stop off-platform payment scams.</p></div>
      <div class="card"><h3>🔍 Fraud checks</h3><p>Bookings are risk-scored automatically (new accounts, unusual value, rapid repeat bookings) and reviewed by our team when needed.</p></div>
      <div class="card"><h3>📞 24×7 help</h3><p>Roadside assistance: ${App.C.supportPhone}. In an emergency call ${App.C.emergencyNumber} first.</p></div>
    </div>
    <h2>Safety tips for travellers</h2>
    <ul class="ticks"><li>Do a walk-around with the owner and photograph the van at pickup and return.</li><li>Check the LPG valve is closed while driving.</li><li>Plan mountain drives in daylight and allow acclimatisation days above 3,000 m.</li><li>Share your itinerary with someone at home.</li></ul>`],
  cancellation: ['Cancellation & refund policy', h`
    <p>Each owner chooses one of three policies, shown on the van page and at checkout. All policies include a <strong>24-hour grace period</strong>: cancel within 24 hours of booking for a full refund if pickup is at least 7 days away.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Policy</th><th>Full refund</th><th>50% refund</th><th>No refund</th></tr></thead><tbody>
      <tr><th>Flexible</th><td>Up to 2 days before pickup</td><td>Within 2 days</td><td>—</td></tr>
      <tr><th>Moderate</th><td>Up to 7 days before</td><td>2–7 days before</td><td>Within 2 days</td></tr>
      <tr><th>Strict</th><td>Up to 14 days before</td><td>7–14 days before</td><td>Within 7 days</td></tr>
    </tbody></table></div>
    <h2>How refunds work</h2>
    <ul class="ticks"><li>Partial refunds apply to the rental and extras; the cleaning and service fees are refunded only with a full refund. ${App.C.taxLabel} is refunded proportionally.</li><li>Refunds reach your original payment method in 5–7 business days.</li><li>If the owner cancels, you always get a full refund and we help you find another van.</li><li>Unused days after pickup are not refundable unless the van is unsafe or not as described — contact support and we will investigate.</li></ul>
    <h2>Disputes</h2><p>Damage or refund disagreements can be raised from your trip page within 48 hours of return. Our team reviews photos, messages and inspection reports and aims to resolve within 5 business days.</p>`],
  terms: ['Terms of service', h`
    <p class="muted">Summary for the demo. The production terms must be drafted by legal counsel for the operating country.</p>
    <ol><li><strong>Marketplace.</strong> VanYatra connects travellers with independent van owners. The rental contract is between traveller and owner; VanYatra processes payments and provides support.</li>
    <li><strong>Eligibility.</strong> Drivers must be ${App.C.minDriverAge}+ with a valid licence held for 2+ years.</li>
    <li><strong>Payments.</strong> All payments must be made through VanYatra. Off-platform payments are not protected and may lead to account suspension.</li>
    <li><strong>Owner obligations.</strong> Owners must keep registration, permits, PUC, fitness and insurance valid, and the van roadworthy and as described.</li>
    <li><strong>Traveller obligations.</strong> Use the van lawfully, follow house rules, return it on time, clean and with the agreed fuel level.</li>
    <li><strong>Damage.</strong> Damage beyond normal wear is covered by the deposit and, where applicable, insurance excess.</li>
    <li><strong>Reviews.</strong> Reviews must be honest, relate to a real trip and not contain contact details or abuse.</li></ol>`],
  privacy: ['Privacy policy', h`
    <p class="muted">Designed around India’s Digital Personal Data Protection Act, 2023 principles: purpose limitation, data minimisation and user rights.</p>
    <ul class="ticks">
      <li><strong>What we collect:</strong> account details, booking details, driver licence (last 4 characters only in our systems), and for owners KYC and vehicle documents.</li>
      <li><strong>Minimisation:</strong> we store only the last 4 digits of Aadhaar and never full card numbers. Exact pickup addresses are shown only after booking.</li>
      <li><strong>Security:</strong> documents are encrypted at rest; access is limited by role and every admin action is audit-logged.</li>
      <li><strong>Your rights:</strong> download your data or request deletion anytime from Profile & privacy.</li>
      <li><strong>Retention:</strong> booking and tax records are kept as long as required by law; KYC documents are deleted 90 days after an owner closes their account unless needed for an open dispute.</li>
      <li><strong>Cookies:</strong> only essential cookies by default; analytics cookies only with consent.</li>
    </ul>`],
  owners: ['Owner requirements', h`
    <p>Requirements for listing a van in <strong>${App.C.name}</strong>. Rules vary by state — our team confirms during review.</p>
    <h2>Identity (KYC)</h2><ul class="ticks">${App.C.kyc.documents.map(d => h`<li>${d.label}</li>`)}</ul>
    <h2>Vehicle documents</h2><ul class="ticks">${App.C.registrationDocs.map(d => h`<li>${d.label}${d.required ? '' : ' — if applicable'}${d.expires ? ' (expiry tracked)' : ''}</li>`)}</ul>
    <h2>Insurance</h2><ul class="ticks">${App.C.insuranceDocs.map(d => h`<li>${d.label}</li>`)}</ul>
    <h2>Safety inspection checklist</h2><ul class="ticks">${App.C.inspectionChecklist.map(c => h`<li>${c}</li>`)}</ul>
    <h2>Payouts</h2><p>Bank account with ${App.C.payout.routingLabel}, verified by a ₹1 penny-drop. Payouts are sent 24 hours after the trip starts.</p>`]
};

App.pages.help = (el, { topic }, q) => {
  if (topic === 'faq' || !topic) {
    el.innerHTML = String(h`<div class="container narrow section">
      <p class="eyebrow">Help centre</p><h1>${topic ? 'Frequently asked questions' : 'How can we help?'}</h1>
      ${!topic ? h`<div class="help-tiles">${[['safety', '🛡️', 'Trust & safety'], ['faq', '❓', 'FAQs'], ['support', '💬', 'Contact support'], ['cancellation', '↩️', 'Cancellations & refunds'], ['owners', '🚐', 'Owner requirements'], ['terms', '📄', 'Terms'], ['privacy', '🔒', 'Privacy']].map(([id, ic, l]) => h`<a class="card help-tile" href="#/help/${id}"><span aria-hidden="true">${ic}</span>${l}</a>`)}</div>` : ''}
      <label class="field"><span class="sr-only">Search FAQs</span><input type="search" id="faq-q" placeholder="Search questions…"></label>
      <div id="faq-list">${FAQ.map(([sec, items]) => h`<h2>${sec}</h2>${items.map(([qq, a]) => h`<details class="faq"><summary>${qq}</summary><p>${a}</p></details>`)}`)}</div>
    </div>`);
    el.querySelector('#faq-q').oninput = (e) => {
      const t = e.target.value.toLowerCase();
      el.querySelectorAll('.faq').forEach(d => { const m = d.textContent.toLowerCase().includes(t); d.hidden = !m; if (t && m) d.open = true; });
    };
    return;
  }
  if (topic === 'support') {
    const me = App.me();
    el.innerHTML = String(h`<div class="container narrow section">
      <p class="eyebrow">Help centre</p><h1>Contact support</h1>
      <div class="grid-3">
        <div class="card"><h3>📞 24×7 roadside</h3><p><a href="tel:${App.C.supportPhone}">${App.C.supportPhone}</a></p></div>
        <div class="card"><h3>🚨 Emergency</h3><p>Call ${App.C.emergencyNumber}, then let us know.</p></div>
        <div class="card"><h3>✉️ Email</h3><p>support@vanyatra.in<br><span class="small muted">Replies within 4 hours</span></p></div>
      </div>
      <form class="card" id="support-form">
        <h2>Send us a message</h2>
        <div class="grid-2">
          <label class="field"><span>Your email</span><input type="email" name="email" value="${me ? me.email : ''}" required></label>
          <label class="field"><span>Topic</span><select name="topic">${['Booking help', 'Payment or refund', 'Damage or dispute', 'Report a listing', 'Safety concern', 'Owner onboarding', 'Other'].map(t => h`<option ${q.topic === 'listing' && t === 'Report a listing' ? 'selected' : ''}>${t}</option>`)}</select></label>
        </div>
        <label class="field"><span>Booking reference (optional)</span><input name="ref" placeholder="VY1234"></label>
        <label class="field"><span>How can we help?</span><textarea name="msg" rows="5" required minlength="10">${q.van ? 'Listing ' + q.van + ': ' : ''}</textarea></label>
        <button class="btn btn-primary">Send message</button>
      </form></div>`);
    el.querySelector('#support-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.checkValidity()) return f.reportValidity();
      if (!(await App.confirm('Send this message?', 'Our support team will reply to ' + f.email.value + '.', 'Send'))) return;
      const d = App.formData(f);
      App.db.users.filter(u => u.role === 'admin').forEach(a => App.notify(a.id, `Support ticket (${d.topic}) from ${d.email}: ${d.msg.slice(0, 80)}`, '#/admin/notifications', false));
      App.save();
      f.reset();
      App.toast('Message sent — ticket created. We’ll reply by email.', 'good');
    };
    return;
  }
  const p = POLICY[topic];
  if (!p) return App.pages.notFound(el);
  el.innerHTML = String(h`<div class="container narrow section prose"><nav class="crumbs"><a href="#/help">Help centre</a> / <span>${p[0]}</span></nav><h1>${p[0]}</h1>${p[1]}</div>`);
};
})();
