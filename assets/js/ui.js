/*
 * UI helpers: safe HTML templating, formatting, and shared widgets
 * (toast, modal, calendar, charts, maps, cards).
 */
window.App = window.App || {};
App.pages = App.pages || {};

/* ---------- Safe templating ----------
 * App.h`<p>${value}</p>` escapes every interpolated value. Nested App.h results
 * and arrays of them are inserted as-is. Use App.raw() only for trusted markup.
 */
class SafeHTML { constructor(s) { this.__html = s; } toString() { return this.__html; } }
App.SafeHTML = SafeHTML;
App.esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
App.raw = (s) => new SafeHTML(s);
const renderVal = (v) => {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHTML) return v.__html;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return App.esc(v);
};
App.h = (strings, ...vals) => new SafeHTML(strings.reduce((acc, s, i) => acc + s + (i < vals.length ? renderVal(vals[i]) : ''), ''));

/* ---------- Formatting ---------- */
// All formatting lives in assets/js/core/format.js (App.fmt); these are shorthands
App.money = App.fmt.money;
App.fmtDate = (s) => App.fmt.date(s);
App.fmtShort = (s) => App.fmt.date(s, { year: false });
App.fmtDateTime = App.fmt.dateTime;
App.timeAgo = (s) => {
  const m = Math.round((Date.now() - new Date(s)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + ' min ago';
  if (m < 1440) return Math.round(m / 60) + ' h ago';
  return Math.round(m / 1440) + ' d ago';
};
App.plural = (n, w) => App.fmt.plural(n, w);
/* Responsive, lazy images. Sample photos come from Unsplash's image CDN, which serves
 * WebP/AVIF automatically (auto=format); a tiny blurred copy shows while the real
 * one loads. Owner uploads are already-resized JPEGs and are used as they are. */
const unsplash = (src, w, extra = '') => `https://images.unsplash.com/${src}?auto=format&fit=crop&w=${w}&q=70${extra}`;
App.img = (src, { w = 640, sizes = '(min-width: 900px) 33vw, 100vw', alt = '', cls = '', eager = false, width, height } = {}) => {
  if (!src) return '';
  const dims = width ? App.h` width="${width}" height="${height}"` : '';
  if (!src.startsWith('photo-')) return App.h`<img class="${cls}" src="${src}" alt="${alt}"${dims} ${eager ? '' : App.h`loading="lazy"`} decoding="async">`;
  const widths = [320, 480, 640, 800, 960, 1280, 1600].filter(x => x <= w * 2);
  const srcset = widths.map(x => `${unsplash(src, x)} ${x}w`).join(', ');
  return App.h`<img class="blur-up ${cls}" src="${unsplash(src, w)}" srcset="${srcset}" sizes="${sizes}" alt="${alt}"${dims} ${eager ? App.h`fetchpriority="high"` : App.h`loading="lazy" fetchpriority="low"`} decoding="async" style="background-image:url('${unsplash(src, 24, '&q=20&blur=30')}')">`;
};
// Demo listings use sample photos; owner uploads are data URLs until object storage is connected
App.samplePhotos = (van) => (van.photos || []).every(p => p.startsWith('photo-'));
App.realPhotosBadge = (van) => van.photosVerifiedAt ? App.h`<span class="real-photos" title="Our team checked these photos show this van">${App.icon('camera')} Real photos verified</span>` : '';

App.photo = (src, w = 800) => !src ? '' : src.startsWith('photo-') ? `https://images.unsplash.com/${src}?auto=format&fit=crop&w=${w}&q=70` : src;
App.initials = (name) => App.fmt.initial(name);

/* ---------- Small components ---------- */
// Profile photo when there is one, otherwise the first initial on a coloured disc
App.avatar = (u, size = 36) => u
  ? (u.photo ? App.h`<img class="avatar" src="${u.photo}" alt="" width="${size}" height="${size}" loading="lazy">`
    : App.h`<span class="avatar" style="--hue:${u.avatarHue || 200};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.45)}px" aria-hidden="true">${App.initials(u.name)}</span>`)
  : App.h`<span class="avatar" style="width:${size}px;height:${size}px">?</span>`;

App.statusBadge = (status) => {
  const s = App.VERIFICATION_STATUS[status] || { label: status, tone: 'muted', icon: '' };
  return App.h`<span class="badge badge-${s.tone}">${App.hasIcon(s.icon) ? App.icon(s.icon) : App.h`<span aria-hidden="true">${s.icon}</span>`} ${s.label}</span>`;
};
const BOOKING_TONES = { confirmed: 'good', completed: 'muted', requested: 'warn', declined: 'bad', cancelled: 'bad', published: 'good', in_review: 'warn', draft: 'muted', suspended: 'bad', open: 'warn', resolved: 'good', rejected: 'bad', flagged: 'serious', removed: 'bad', active: 'good' };
App.pill = (status) => App.h`<span class="badge badge-${BOOKING_TONES[status] || 'muted'}">${String(status).replace(/_/g, ' ')}</span>`;

App.stars = (avg, count) => avg
  ? App.h`<span class="stars" aria-label="Rated ${avg.toFixed(1)} out of 5"><span class="star-icon" aria-hidden="true">★</span> ${avg.toFixed(1)}${count !== undefined ? App.h` <span class="muted">(${count})</span>` : ''}</span>`
  : App.h`<span class="stars muted">New</span>`;

// A van's rating only counts once there are enough reviews; before that show it's new,
// plus the host's rating across all their vans when they have one
App.vanRating = (van, { long = false } = {}) => {
  const r = App.get.rating(van.id), min = App.C.minReviewsForRating;
  if (r.count >= min) return App.h`<span class="stars" aria-label="Rated ${r.avg.toFixed(1)} out of 5 from ${r.count} reviews"><span class="star-icon" aria-hidden="true">★</span> ${r.avg.toFixed(1)} <span class="muted">(${r.count})</span></span>`;
  const host = App.get.hostRating(van.ownerId);
  const hostTxt = host.count >= min ? App.h` <span class="muted" title="Average across all of this host’s vans">· Host ★ ${host.avg.toFixed(1)}${long ? App.h` from ${App.plural(host.count, 'review')}` : ''}</span>` : '';
  return App.h`<span class="stars new-badge"><span class="badge badge-new">New on VanYatra</span>${hostTxt}${long && r.count ? App.h` <span class="muted">· ${App.plural(r.count, 'review')} so far</span>` : ''}</span>`;
};

App.verifiedBadge = (ownerId) => App.get.ownerVerified(ownerId)
  ? App.h`<span class="verified" title="Identity, documents and insurance verified by VanYatra"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 2.1 3.2-.4.9 3.1 2.8 1.6-1 3 1 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.1-3.2.4-.9-3.1L2.7 15.6l1-3-1-3 2.8-1.6.9-3.1 3.2.4z"/><path fill="#fff" d="M10.6 15.6l-3.2-3.2 1.4-1.4 1.8 1.8 4.6-4.6 1.4 1.4z"/></svg>Verified owner</span>`
  : '';

App.amenityChips = (ids, limit = 99) => App.h`${ids.slice(0, limit).map(id => { const a = App.AMENITIES.find(x => x.id === id); return a ? App.h`<span class="chip">${App.icon(a.icon)} ${a.label}</span>` : ''; })}${ids.length > limit ? App.h`<span class="chip">+${ids.length - limit}</span>` : ''}`;

App.vanCard = (van, opts = {}) => {
  const me = App.me();
  const dest = App.get.dest(van.destinationId);
  const saved = me && me.savedVans.includes(van.id);
  const q = opts.start && opts.end ? App.quote(van, opts.start, opts.end) : null;
  const available = opts.start && opts.end ? App.isAvailable(van.id, opts.start, opts.end) : true;
  const link = `#/vans/${van.id}${opts.start && opts.end ? `?start=${opts.start}&end=${opts.end}` : ''}`;
  return App.h`
  <article class="van-card" data-van="${van.id}">
    <a href="${link}" class="van-card-media">
      ${App.img(van.photos[0], { w: 640, alt: `${van.name} — ${van.type}`, width: 640, height: 440, sizes: '(min-width: 1100px) 360px, (min-width: 700px) 50vw, 100vw' })}
      ${van.instantBook ? App.h`<span class="tag tag-instant">${App.icon('zap')} Instant book</span>` : ''}
      ${van.familyFriendly ? App.h`<span class="tag tag-family">Family friendly</span>` : ''}
    </a>
    <button class="save-btn ${saved ? 'is-saved' : ''}" data-save="${van.id}" aria-pressed="${saved ? 'true' : 'false'}" aria-label="${saved ? 'Remove from saved' : 'Save'} ${van.name}">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 5 6.6 5c2 0 3.4 1.1 4.4 2.5C12 6.1 13.4 5 15.4 5 18.8 5 21 8.3 19.5 11.8 17.5 16.4 12 21 12 21z"/></svg>
    </button>
    <div class="van-card-body">
      <div class="row-between"><span class="eyebrow">${van.type} · ${van.pickup.city}</span>${App.vanRating(van)}</div>
      <h3><a href="${link}">${van.name}</a></h3>
      <p class="meta">Sleeps ${van.sleeps} · ${van.seats} seats · ${van.transmission} · ${dest ? dest.name : ''}</p>
      <div class="card-badges">${App.verifiedBadge(van.ownerId)}${App.realPhotosBadge(van)}</div>
      <div class="van-card-price">
        ${(() => { const d = App.dealBadge ? App.dealBadge(van, opts.start, opts.end) : ''; return d ? App.h`<span class="badge badge-deal">${App.icon('sparkles')} ${d}</span>` : ''; })()}
        ${q ? App.h`<span><strong>${App.money(q.total)}</strong> total</span><span class="muted">${App.fmt.nights(q.nights)} · incl. fees &amp; GST</span><button type="button" class="link small price-link" data-price-van="${van.id}" data-start="${opts.start}" data-end="${opts.end}">Price details</button>`
            : App.h`<span><strong>${App.money(van.pricePerNight)}</strong> <span class="muted">/ night</span></span>`}
        ${!available ? App.h`<span class="badge badge-bad">Unavailable for your dates</span>` : ''}
      </div>
    </div>
  </article>`;
};

/* ---------- Prices ----------
 * Every screen shows the same App.quote result, so the card, van page, checkout
 * and receipts always agree. Bookings saved before the weekday/weekend split
 * only have an average nightly rate, which is shown instead.
 */
App.priceLines = (p, { deposit = true, detail = false } = {}) => {
  const { money, nights } = App.fmt;
  const split = p.weekdayNights !== undefined;
  const nightLines = !split ? App.h`<div><dt>${money(p.avgNight)} × ${nights(p.nights)}</dt><dd>${money(p.base)}</dd></div>`
    : App.h`${p.weekdayNights ? App.h`<div><dt>${money(p.weekdayRate)} × ${App.fmt.plural(p.weekdayNights, 'weeknight')}</dt><dd>${money(p.weekdayRate * p.weekdayNights)}</dd></div>` : ''}
      ${p.weekendNights ? App.h`<div><dt>${money(p.weekendRate)} × ${App.fmt.plural(p.weekendNights, 'weekend night')} <span class="muted small">(Fri, Sat)</span></dt><dd>${money(p.weekendRate * p.weekendNights)}</dd></div>` : ''}`;
  return App.h`<dl class="price-lines">
    ${nightLines}
    ${p.season ? App.h`<div><dt>${p.season.label}</dt><dd>${p.season.amount < 0 ? '−' : '+'}${money(Math.abs(p.season.amount))}</dd></div>` : ''}
    ${p.discount ? App.h`<div class="good"><dt>${p.discountPct}% ${p.discountLabel || (p.nights >= 28 ? 'monthly discount' : 'weekly discount')}</dt><dd>−${money(p.discount)}</dd></div>` : ''}
    ${p.protection?.amount ? App.h`<div><dt>${p.protection.label} protection</dt><dd>${money(p.protection.amount)}</dd></div>` : ''}
    ${detail && p.addOnLines?.length ? p.addOnLines.map(a => App.h`<div><dt>${a.label} <span class="muted small">(${a.detail})</span></dt><dd>${money(a.amount)}</dd></div>`)
      : p.addOns ? App.h`<div><dt>Extras${p.addOnLines?.length ? ` (${p.addOnLines.length})` : ''}</dt><dd>${money(p.addOns)}</dd></div>` : ''}
    ${p.km?.amount ? App.h`<div><dt>${p.km.label}</dt><dd>${money(p.km.amount)}</dd></div>` : ''}
    ${p.driver ? App.h`<div><dt>Driver, ${App.fmt.plural(p.driver.days, 'day')}${detail ? App.h` <span class="muted small">(fee ${money(p.driver.fee)}, bata ${money(p.driver.bata)}${p.driver.stay ? `, stay ${money(p.driver.stay)}` : ''})</span>` : ''}</dt><dd>${money(p.driver.amount)}</dd></div>` : ''}
    ${p.delivery ? App.h`<div><dt>Delivery & collection: ${p.delivery.label}</dt><dd>${money(p.delivery.amount)}</dd></div>` : ''}
    ${p.oneWay ? App.h`<div><dt>One-way drop-off: ${p.oneWay.label}</dt><dd>${money(p.oneWay.amount)}</dd></div>` : ''}
    <div><dt>Cleaning fee</dt><dd>${money(p.cleaning)}</dd></div>
    <div><dt>Service fee</dt><dd>${money(p.service)}</dd></div>
    ${p.zeroDepositFee ? App.h`<div><dt>Zero-deposit fee <span class="muted small">(non-refundable)</span></dt><dd>${money(p.zeroDepositFee)}</dd></div>` : ''}
    <div><dt>${App.C.taxLabel} (${Math.round(App.C.taxRate * 100)}%)</dt><dd>${money(p.tax)}</dd></div>
    <div class="total"><dt>Total</dt><dd>${money(p.total)}</dd></div>
    ${deposit ? (p.depositWaived ? App.h`<div class="muted"><dt>Security deposit</dt><dd>${money(0)} <span class="small">(waived)</span></dd></div>`
      : App.h`<div class="muted"><dt>Refundable security deposit <span class="small">(not part of the total)</span></dt><dd>${money(p.deposit)}</dd></div>`) : ''}
    ${detail ? App.h`<div class="muted"><dt>Distance included</dt><dd>${p.kmIncluded ? App.fmt.km(p.kmIncluded) : p.km?.id === 'unlimited' ? 'Unlimited' : '—'}</dd></div>` : ''}
  </dl>`;
};

// Full breakdown with what each line means, from any card or page
// options: the trip options passed to App.quote (extras, protection, km, driver, delivery…)
App.priceDrawer = (van, start, end, options = {}) => {
  const q = App.quote(van, start, end, options);
  const plan = App.PROTECTION.find(p => p.id === q.protection.id);
  const { money } = App.fmt;
  return App.modal({
    title: 'Price breakdown',
    body: App.h`<p class="muted small">${van.name} · ${App.fmt.dateRange(start, end)} · ${App.fmt.nights(q.nights)}</p>
      ${App.priceLines(q, { detail: true })}
      <ul class="plain price-notes small">
        <li><strong>Nightly rates.</strong> ${money(q.weekdayRate)} Sunday–Thursday${q.weekendRate !== q.weekdayRate ? `, ${money(q.weekendRate)} on Friday and Saturday nights` : ''}.${q.season ? ` Includes ${q.season.label} pricing set by the owner.` : ''}${q.discountPct ? ` ${q.discountPct}% ${q.discountLabel}.` : ''}</li>
        <li><strong>Cleaning fee.</strong> Set by the owner, charged once per trip.</li>
        <li><strong>Service fee.</strong> ${Math.round(App.C.serviceFeeRate * 100)}% of the rental and extras. Covers 24×7 roadside and trip support, secure payments and verification.</li>
        <li><strong>${App.C.taxLabel}.</strong> ${Math.round(App.C.taxRate * 100)}% on the rental, extras and fees, shown on your tax invoice.</li>
        <li><strong>Distance.</strong> ${q.kmIncluded ? `${App.fmt.km(q.kmIncluded)} included (${App.fmt.km(q.kmPerDay)} a day). Extra kilometres are ${money(q.extraKmFee)}/km, settled at return.` : 'Unlimited kilometres.'}</li>
        ${q.driver ? App.h`<li><strong>Driver.</strong> A verified driver for ${App.fmt.plural(q.driver.days, 'day')}: daily fee, bata (food allowance) and a night-stay allowance, paid through VanYatra.</li>` : ''}
        <li><strong>Security deposit.</strong> ${q.depositWaived ? `Waived with the zero-deposit option (a non-refundable ${money(q.zeroDepositFee)}).` : `${money(q.deposit)}, refundable. It isn’t part of the total, and is released within ${App.C.depositReleaseDays} days of return if there’s no damage.`}</li>
        <li><strong>Protection: ${plan.label}.</strong> ${plan.blurb} Your damage liability is capped at ${money(plan.liability)}.</li>
      </ul>
      <p class="small muted">No other charges are added at checkout.</p>`
  });
};

// Delegated handler for "price details" buttons anywhere on the page
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-price-van]');
  if (!b) return;
  e.preventDefault();
  const van = App.get.van(b.dataset.priceVan);
  let options = {};
  try { options = JSON.parse(b.dataset.options || '{}'); } catch (err) { /* ignore */ }
  if (van && b.dataset.start && b.dataset.end) App.priceDrawer(van, b.dataset.start, b.dataset.end, options);
});

// Delegated handler for save (heart) buttons anywhere on the page
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-save]');
  if (!btn) return;
  e.preventDefault();
  if (!App.me()) { App.toast('Sign in to save vans to your wishlist.'); location.hash = '#/login?next=' + encodeURIComponent(location.hash.slice(1)); return; }
  const saved = App.api.toggleSave(btn.dataset.save);
  btn.classList.toggle('is-saved', saved);
  btn.setAttribute('aria-pressed', saved);
  App.toast(saved ? 'Saved to your wishlist' : 'Removed from wishlist', 'good');
});

// Replace broken remote images with a branded placeholder
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && !img.dataset.failed) {
    img.dataset.failed = '1';
    img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 440"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6c28b"/><stop offset="1" stop-color="#e98a4f"/></linearGradient></defs><rect width="640" height="440" fill="url(#g)"/><circle cx="470" cy="150" r="46" fill="#fff3d6"/><path d="M0 330 L140 200 L250 290 L360 170 L520 320 L640 250 L640 440 L0 440Z" fill="#2f6b55"/><path d="M0 380 L200 300 L380 370 L640 320 L640 440 L0 440Z" fill="#1f4c3d"/></svg>');
  }
}, true);

/* ---------- Toast ---------- */
App.toast = (msg, tone = 'info') => {
  let wrap = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast toast-' + tone;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4300);
};

/* ---------- Modal ---------- */
App.modal = ({ title, body, actions = [{ label: 'Close', value: null }], wide = false, onMount }) => new Promise((resolve) => {
  const lastFocus = document.activeElement;
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = App.h`
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-actions">${actions.map((a, i) => App.h`<button class="btn ${a.primary ? 'btn-primary' : a.danger ? 'btn-danger' : 'btn-ghost'}" data-i="${i}">${a.label}</button>`)}</div>
    </div>`;
  document.body.appendChild(back);
  document.body.classList.add('no-scroll');
  const close = (v) => { back.remove(); document.body.classList.remove('no-scroll'); document.removeEventListener('keydown', onKey); lastFocus && lastFocus.focus(); resolve(v); };
  const onKey = (e) => {
    if (e.key === 'Escape') close(null);
    if (e.key === 'Tab') { // focus trap
      const f = [...back.querySelectorAll('button, [href], input, select, textarea')].filter(x => !x.disabled);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) return close(null);
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const a = actions[+b.dataset.i];
    if (a.validate) { const r = a.validate(back); if (r === false) return; }
    close(typeof a.value === 'function' ? a.value(back) : a.value);
  });
  onMount && onMount(back);
  (back.querySelector('input, textarea, select') || back.querySelector('[data-i]')).focus();
});
App.confirm = (title, text, label = 'Confirm', danger = false) =>
  App.modal({ title, body: App.h`<p>${text}</p>`, actions: [{ label: 'Cancel', value: false }, { label, value: true, primary: !danger, danger }] });
App.prompt = (title, label, placeholder = '', required = true) =>
  App.modal({
    title, body: App.h`<label class="field"><span>${label}</span><textarea id="prompt-val" rows="3" placeholder="${placeholder}"></textarea></label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Submit', primary: true, value: (m) => m.querySelector('#prompt-val').value.trim(), validate: (m) => !required || !!m.querySelector('#prompt-val').value.trim() || (App.toast('Please add a note.', 'bad'), false) }]
  });

/* ---------- Forms ---------- */
App.formData = (form) => {
  const o = {};
  new FormData(form).forEach((v, k) => { if (k in o) o[k] = [].concat(o[k], v); else o[k] = v; });
  return o;
};

/* ---------- Availability calendar ----------
 * mode 'select': pick a start and end date.  mode 'block': owner toggles blocked days.
 */
App.calendar = (el, { vanId, start, end, months = 2, mode = 'select', onChange, ignoreBookingId }) => {
  const state = { start, end, offset: 0 };
  const monthStart = new Date(); monthStart.setDate(1);
  const draw = () => {
    const un = App.unavailableDates(vanId, ignoreBookingId);
    const van = App.get.van(vanId);
    const blocked = new Set();
    (van.blocked || []).forEach(r => { for (let d = r.start; d <= r.end; d = App.addDays(d, 1)) blocked.add(d); });
    const today = App.today();
    let out = '';
    for (let m = 0; m < months; m++) {
      const first = new Date(monthStart.getFullYear(), monthStart.getMonth() + state.offset + m, 1);
      const label = App.fmt.monthYear(first.getFullYear(), first.getMonth() + 1);
      const pad = (first.getDay() + 6) % 7; // Monday first
      const daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      let cells = '<span></span>'.repeat(pad);
      for (let day = 1; day <= daysIn; day++) {
        const iso = App.iso(new Date(first.getFullYear(), first.getMonth(), day));
        const past = iso < today;
        const isUn = un.has(iso);
        const inRange = state.start && state.end && iso > state.start && iso < state.end;
        const cls = ['cal-day', past && 'past', isUn && 'unavail', blocked.has(iso) && 'blocked', iso === state.start && 'sel-start', iso === state.end && 'sel-end', inRange && 'in-range', iso === today && 'today'].filter(Boolean).join(' ');
        const disabled = past || (mode === 'select' && isUn && !(state.start && !state.end && iso > state.start));
        cells += `<button type="button" class="${cls}" data-d="${iso}" ${disabled ? 'disabled' : ''} aria-label="${App.fmtDate(iso)}${isUn ? ', unavailable' : ''}" aria-pressed="${iso === state.start || iso === state.end}">${day}</button>`;
      }
      out += `<div class="cal-month"><div class="cal-title">${App.esc(label)}</div><div class="cal-grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(x => `<span class="cal-dow">${x}</span>`).join('')}${cells}</div></div>`;
    }
    el.innerHTML = `<div class="cal">
      <div class="cal-nav"><button type="button" class="icon-btn" data-nav="-1" aria-label="Previous month" ${state.offset <= 0 ? 'disabled' : ''}>‹</button><button type="button" class="icon-btn" data-nav="1" aria-label="Next month">›</button></div>
      <div class="cal-months">${out}</div>
      <div class="cal-legend"><span><i class="lg lg-sel"></i>Selected</span><span><i class="lg lg-un"></i>Booked</span>${mode === 'block' ? '<span><i class="lg lg-block"></i>Blocked by you</span>' : ''}</div>
    </div>`;
  };
  el.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { state.offset = Math.max(0, state.offset + +nav.dataset.nav); draw(); return; }
    const b = e.target.closest('[data-d]');
    if (!b || b.disabled) return;
    const d = b.dataset.d;
    if (mode === 'block') { onChange && onChange(d); draw(); return; }
    if (!state.start || (state.start && state.end) || d <= state.start) { state.start = d; state.end = null; }
    else {
      if (!App.isAvailable(vanId, state.start, d)) { App.toast('Those dates include booked nights. Pick a shorter range.', 'bad'); return; }
      state.end = d;
    }
    draw();
    onChange && onChange(state.start, state.end);
  });
  draw();
  return { set: (s, e) => { state.start = s; state.end = e; draw(); }, redraw: draw };
};

/* ---------- Bar chart (single series, SVG, with hover tooltip) ---------- */
App.barChart = (data, { format = (v) => v, height = 220, label = '' } = {}) => {
  const w = 640, h = height, padL = 56, padB = 28, padT = 12;
  const max = Math.max(1, ...data.map(d => d.value));
  const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return Math.ceil(max / p) * p; })();
  const bw = (w - padL - 8) / data.length;
  const barW = Math.max(6, Math.min(40, bw - 8));
  const y = (v) => h - padB - (v / nice) * (h - padB - padT);
  const ticks = [0, 0.5, 1].map(t => t * nice);
  const bars = data.map((d, i) => {
    const x = padL + i * bw + (bw - barW) / 2, top = y(d.value), bh = h - padB - top;
    const r = Math.min(4, bh);
    const path = bh > 0 ? `M${x},${h - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${h - padB} Z` : '';
    return `<g class="bar" tabindex="0" data-tip="${App.esc(d.label)}: ${App.esc(format(d.value))}">
      <rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${h - padB - padT}" fill="transparent"/>
      <path d="${path}" class="bar-fill"/>
      <text x="${x + barW / 2}" y="${h - 8}" text-anchor="middle" class="axis-label">${App.esc(d.label)}</text></g>`;
  }).join('');
  const grid = ticks.map(t => `<line x1="${padL}" x2="${w}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL - 8}" y="${y(t) + 4}" text-anchor="end" class="axis-label">${App.esc(format(t))}</text>`).join('');
  return App.raw(`<figure class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${App.esc(label)}">${grid}${bars}</svg><div class="chart-tip" hidden></div>
    <details class="chart-table"><summary>View as table</summary><table class="table"><tbody>${data.map(d => `<tr><td>${App.esc(d.label)}</td><td class="num">${App.esc(format(d.value))}</td></tr>`).join('')}</tbody></table></details></figure>`);
};
document.addEventListener('pointermove', (e) => {
  const bar = e.target.closest && e.target.closest('.chart .bar');
  document.querySelectorAll('.chart-tip').forEach(t => { if (!bar || !t.parentElement.contains(bar)) t.hidden = true; });
  if (!bar) return;
  const fig = bar.closest('.chart'), tip = fig.querySelector('.chart-tip'), r = fig.getBoundingClientRect();
  tip.textContent = bar.dataset.tip; tip.hidden = false;
  tip.style.left = Math.min(r.width - 140, e.clientX - r.left + 12) + 'px';
  tip.style.top = (e.clientY - r.top - 36) + 'px';
});

/* ---------- Maps (Leaflet, loaded lazily from CDN) ---------- */
App.loadLeaflet = () => {
  if (window.L) return Promise.resolve(window.L);
  if (App._leafletP) return App._leafletP;
  App._leafletP = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; css.crossOrigin = '';
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.crossOrigin = '';
    s.onload = () => {
      // Marker clustering plugin; the map still works (unclustered) if it fails to load
      const base = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/';
      for (const f of ['MarkerCluster.css', 'MarkerCluster.Default.css']) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = base + f; document.head.appendChild(l); }
      const mc = document.createElement('script');
      mc.src = base + 'leaflet.markercluster.js'; mc.crossOrigin = '';
      mc.onload = mc.onerror = () => resolve(window.L);
      document.head.appendChild(mc);
    };
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return App._leafletP;
};

/* Preview cards shown when a map marker is clicked */
App.mapCard = {
  van: (v, opts = {}) => {
    const q = opts.start && opts.end ? App.quote(v, opts.start, opts.end) : null;
    return App.h`<div class="map-card">
      <img src="${App.photo(v.photos[0], 360)}" alt="" loading="lazy">
      <div class="mc-body">
        <div class="mc-row"><span class="eyebrow">${v.type} · ${v.pickup.city}</span>${App.vanRating(v)}</div>
        <strong>${v.name}</strong>
        <span class="small muted">Sleeps ${v.sleeps} · ${v.transmission}${v.instantBook ? App.h` · ${App.icon('zap')} Instant book` : ''}</span>
        <div class="mc-row"><span>${q ? App.h`<strong>${App.money(q.total)}</strong> <span class="small muted">total · ${App.fmt.nights(q.nights)}</span>` : App.h`<strong>${App.money(v.pricePerNight)}</strong> <span class="small muted">/ night</span>`}</span><a class="btn btn-sm btn-primary" href="#/vans/${v.id}${q ? `?start=${opts.start}&end=${opts.end}` : ''}">View van</a></div>
      </div></div>`;
  },
  dest: (d) => {
    const count = App.db.vans.filter(v => v.destinationId === d.id && v.status === 'published').length;
    return App.h`<div class="map-card">
      <img src="${App.photo(d.hero, 360)}" alt="" loading="lazy">
      <div class="mc-body">
        <span class="eyebrow">${d.region}</span>
        <strong>${d.name}</strong>
        <span class="small muted">${d.tagline}</span>
        <span class="small">${App.icon('calendar-days')} ${d.bestTime} · ${App.icon('caravan')} ${App.plural(count, 'van')}${d.familyScore >= 5 ? App.h` · ${App.icon('users')} Family pick` : ''}</span>
        <div class="mc-row"><a class="btn btn-sm btn-ghost" href="#/search?dest=${d.id}">See vans</a><a class="btn btn-sm btn-primary" href="#/destinations/${d.id}">Explore</a></div>
      </div></div>`;
  },
  spot: (s, d) => App.h`<div class="map-card map-card-text"><div class="mc-body">
    <span class="eyebrow">${App.icon(App.SPOT_TYPES[s.type][1])} ${App.SPOT_TYPES[s.type][0].replace(/s$/, '').replace(/es with/, ' with')}${d ? ' · ' + d.name : ''}</span>
    <strong>${s.name}</strong>
    ${s.note ? App.h`<span class="small muted">${s.note}</span>` : ''}
  </div></div>`,
  camp: (c, d) => App.h`<div class="map-card map-card-text"><div class="mc-body">
    <span class="eyebrow">${App.icon('tent')} ${c.type}${d ? ' · near ' + d.name : ''}</span>
    <strong>${c.name}</strong>
    <span class="small muted">${c.facilities.join(' · ')}</span>
    ${d ? App.h`<a class="btn btn-sm btn-ghost" href="#/destinations/${d.id}">About ${d.name}</a>` : ''}
  </div></div>`
};
// India's official boundary (DataMeet "India composite", CC BY 4.0), loaded once
App.loadIndiaBoundary = () => App._indiaP || (App._indiaP = fetch('assets/data/india-boundary.geojson').then(r => (r.ok ? r.json() : null)).catch(() => null));
// Resolves once el is within a screen's height of the viewport (maps and other heavy widgets)
App.nearView = (el) => new Promise(resolve => {
  if (!('IntersectionObserver' in window)) return resolve();
  const io = new IntersectionObserver((entries) => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); resolve(); } }, { rootMargin: '600px 0px' });
  io.observe(el);
});
/* markers: [{lat, lng, html, label, kind:'van'|'dest'|'camp', price}]  */
App.mountMap = async (el, markers, { zoom = 5, center, circle, cluster = true } = {}) => {
  if (!el) return null;
  if (!el.firstChild) el.innerHTML = '<div class="map-loading" role="status"><span class="spinner" aria-hidden="true"></span> Loading map…</div>';
  try {
    await App.nearView(el);
    const L = await App.loadLeaflet();
    if (!el.isConnected) return null;
    el.innerHTML = '';
    // On touch screens one finger scrolls the page; two fingers pan/zoom the map
    const touch = L.Browser.mobile || matchMedia('(pointer: coarse)').matches;
    const map = L.map(el, { scrollWheelZoom: false, dragging: !touch, tap: false }).setView(center || [22.5, 79], zoom);
    // Base map with no political boundaries; India's official boundary is drawn on top
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics · <a href="https://github.com/datameet/maps" target="_blank" rel="noopener">India boundary: DataMeet</a> (CC BY 4.0)'
    }).addTo(map);
    App.loadIndiaBoundary().then(geo => {
      if (!geo || !map.getContainer().isConnected) return;
      L.geoJSON(geo, { interactive: false, style: { color: '#ffd28a', weight: 2, opacity: 0.95, fillColor: '#ffffff', fillOpacity: 0.06 } }).addTo(map).bringToBack();
    });
    // Nearby markers group into numbered clusters that split as you zoom in
    const group = cluster && L.markerClusterGroup && markers.length > 3
      ? L.markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 48, spiderfyOnMaxZoom: true,
        iconCreateFunction: (c) => L.divIcon({ className: 'map-cluster-wrap', html: `<span class="map-cluster">${c.getChildCount()}</span>`, iconSize: null })
      })
      : L.featureGroup();
    markers.forEach(m => {
      const icon = L.divIcon({ className: 'map-pin-wrap', html: `<span class="map-pin map-pin-${m.kind || 'dest'}">${App.hasIcon(m.label) ? App.icon(m.label) : App.esc(m.label || '')}</span>`, iconSize: null });
      const mk = L.marker([m.lat, m.lng], { icon, title: m.title || m.label || '', alt: m.title || m.label || '', riseOnHover: true });
      if (m.html) mk.bindPopup(String(m.html), { maxWidth: 280, minWidth: 220, className: 'map-popup' });
      group.addLayer(mk);
    });
    group.addTo(map);
    if (circle) L.circle([circle.lat, circle.lng], { radius: circle.radius || 1500, color: '#1f6f54', fillOpacity: 0.15 }).addTo(map);
    if (!center && markers.length > 1) map.fitBounds(group.getBounds().pad(0.15));
    else if (!center && markers.length === 1) map.setView([markers[0].lat, markers[0].lng], 9);
    return map;
  } catch (e) {
    el.innerHTML = `<div class="map-fallback" role="status">${App.icon('map')} The map couldn’t load (check your connection). All locations are listed below.</div>`;
    return null;
  }
};

/* ---------- Photo upload (downscaled to keep storage small) ---------- */
App.readPhoto = (file, maxW = 960) => new Promise((resolve, reject) => {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Please upload a JPG, PNG or WebP image.'));
  if (file.size > 10 * 1024 * 1024) return reject(new Error('Images must be under 10 MB.'));
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, maxW / img.width);
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    resolve(c.toDataURL('image/jpeg', 0.72));
  };
  img.onerror = () => reject(new Error('Could not read that image.'));
  img.src = url;
});

/* ---------- Inline form validation ----------
 * Native constraints (required, pattern, min…) stay the source of truth; this adds
 * a readable message under the field, marks it for screen readers and clears it
 * as soon as the value changes.
 */
const fieldMessage = (el) => {
  const v = el.validity;
  if (v.valueMissing) return el.type === 'checkbox' ? 'Please tick this box to continue.' : el.type === 'file' ? 'Please attach a file.' : el.tagName === 'SELECT' ? 'Please choose an option.' : 'This field is required.';
  if (v.typeMismatch) return el.type === 'email' ? 'Enter a valid email address, like name@example.com.' : 'Please check the format.';
  if (v.patternMismatch) return el.title || (el.placeholder ? `Please match the format, e.g. ${el.placeholder}.` : 'Please check the format.');
  if (v.tooShort) return `Use at least ${el.minLength} characters.`;
  if (v.tooLong) return `Use at most ${el.maxLength} characters.`;
  if (v.rangeUnderflow) return el.type === 'date' ? `Pick a date on or after ${App.fmtDate(el.min)}.` : `Enter ${el.min} or more.`;
  if (v.rangeOverflow) return el.type === 'date' ? `Pick a date on or before ${App.fmtDate(el.max)}.` : `Enter ${el.max} or less.`;
  if (v.stepMismatch) return 'Please enter a valid value.';
  return el.validationMessage;
};
let fieldErrN = 0;
document.addEventListener('invalid', (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement) || !el.closest('form')) return;
  el.setAttribute('aria-invalid', 'true');
  const wrap = el.closest('.field, .check, .doc-field') || el.parentElement;
  let msg = wrap.querySelector(':scope > .field-error');
  if (!msg) {
    msg = document.createElement('small');
    msg.className = 'field-error';
    msg.id = 'fe-' + (++fieldErrN);
    wrap.appendChild(msg);
  }
  el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), msg.id].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' '));
  msg.textContent = fieldMessage(el);
}, true);
const clearFieldError = (e) => {
  const el = e.target;
  if (!(el instanceof HTMLElement) || el.getAttribute('aria-invalid') !== 'true' || !el.checkValidity || !el.checkValidity()) return;
  el.removeAttribute('aria-invalid');
  const msg = (el.closest('.field, .check, .doc-field') || el.parentElement).querySelector(':scope > .field-error');
  if (msg) msg.remove();
};
document.addEventListener('input', clearFieldError, true);
document.addEventListener('change', clearFieldError, true);

/* ---------- Connection and unexpected errors ---------- */
window.addEventListener('offline', () => App.toast('You’re offline. Browsing still works, but changes can’t be saved until you reconnect.', 'bad'));
window.addEventListener('online', () => App.toast('Back online.', 'good'));
window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  App.toast(e.reason?.expose || e.reason?.status ? e.reason.message : 'Something went wrong. Please try again.', 'bad');
});

App.emptyState = (icon, title, text, cta) => App.h`<div class="empty"><div class="empty-icon" aria-hidden="true">${App.hasIcon(icon) ? App.icon(icon) : icon}</div><h3>${title}</h3><p class="muted">${text}</p>${cta || ''}</div>`;
