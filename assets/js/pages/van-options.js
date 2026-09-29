/*
 * Owner settings for what a van offers beyond the nightly rate:
 * extras, distance packages, a driver, delivery and one-way drop-offs,
 * seasonal prices and early-bird / last-minute deals.
 *
 *   const editor = App.vanOptionsEditor(container, van);
 *   const patch = editor.collect();   // throws Error with a message for the owner
 *
 * The backend validates everything again (assets/js/core/market-rules.js).
 */
(() => {
const { h } = App;
const MONTHS = App.fmt.MONTHS;

const mdSelect = (name, value) => {
  const [m, d] = (value || '').split('-').map(Number);
  return h`<span class="md-pick"><select name="${name}-m" aria-label="Month">${MONTHS.map((x, i) => h`<option value="${String(i + 1).padStart(2, '0')}" ${m === i + 1 ? 'selected' : ''}>${x}</option>`)}</select><select name="${name}-d" aria-label="Day">${Array.from({ length: 31 }, (_, i) => h`<option value="${String(i + 1).padStart(2, '0')}" ${d === i + 1 ? 'selected' : ''}>${i + 1}</option>`)}</select></span>`;
};

App.vanOptionsEditor = (el, van) => {
  // Working copies; saved together with the rest of the listing
  const st = {
    addOns: van.addOns ? van.addOns.map(a => ({ ...a })) : App.addOnsFor(van).map(a => ({ id: a.id, price: a.price })),
    km: { plus: van.kmPackages?.plus ?? 450, unlimited: van.kmPackages?.unlimited ?? 900, offerPlus: van.kmPackages?.plus !== null, offerUnlimited: van.kmPackages?.unlimited !== null },
    driver: { available: false, feePerDay: 1800, bataPerDay: 400, stayPerNight: 600, languages: ['Hindi', 'English'], ...(van.driver || {}) },
    delivery: { perKm: van.delivery?.perKm ?? 20, points: (van.delivery?.points || []).map(p => ({ ...p })), oneWay: (van.delivery?.oneWay || []).map(o => ({ ...o })) },
    seasons: (van.seasons || []).map(x => ({ ...x })),
    earlyBird: van.earlyBird || { days: 60, pct: 0 },
    lastMinute: van.lastMinute || { days: 7, pct: 0 }
  };
  const catalog = App.ADD_ON_CATALOG.filter(a => !a.when || a.when(van));
  const driverVerified = () => van.driver?.check?.status === 'verified' || van.driver?.verified;

  const draw = () => {
    el.innerHTML = String(h`
      <h3>Extras & services</h3>
      <p class="small muted">Travellers choose these at checkout. You set the prices; VanYatra adds nothing on top except the service fee and GST shown to them.</p>
      <details class="opt-block" open><summary>Extras you rent out <span class="muted small">(${st.addOns.length} on)</span></summary>
        <div class="opt-rows">${catalog.map(a => { const on = st.addOns.find(x => x.id === a.id); return h`<div class="opt-row">
          <label class="check"><input type="checkbox" data-addon="${a.id}" ${on ? 'checked' : ''}> ${App.icon(a.icon)} ${a.label}</label>
          <label class="opt-price"><span class="sr-only">${a.label} price</span>₹<input type="number" min="0" max="20000" step="50" data-addon-price="${a.id}" value="${on?.price ?? a.price}" ${on ? '' : 'disabled'}><span class="small muted">${a.perNight ? '/night' : '/trip'}</span></label>
        </div>`; })}</div>
      </details>
      <details class="opt-block"><summary>Distance packages</summary>
        <p class="small muted">Your nightly rate includes ${App.fmt.km(van.kmPerDay || 250)} a day (set above). Offer more for travellers doing long routes.</p>
        <div class="opt-row"><label class="check"><input type="checkbox" id="km-plus-on" ${st.km.offerPlus ? 'checked' : ''}> 400 km a day</label><label class="opt-price">+₹<input type="number" id="km-plus" min="0" max="5000" step="50" value="${st.km.plus}" ${st.km.offerPlus ? '' : 'disabled'} aria-label="Price per night for 400 km a day"><span class="small muted">/night</span></label></div>
        <div class="opt-row"><label class="check"><input type="checkbox" id="km-unl-on" ${st.km.offerUnlimited ? 'checked' : ''}> Unlimited km</label><label class="opt-price">+₹<input type="number" id="km-unl" min="0" max="10000" step="50" value="${st.km.unlimited}" ${st.km.offerUnlimited ? '' : 'disabled'} aria-label="Price per night for unlimited km"><span class="small muted">/night</span></label></div>
      </details>
      <details class="opt-block" ${st.driver.available ? 'open' : ''}><summary>Driver (chauffeur) ${st.driver.available ? h`${driverVerified() ? App.statusBadge('verified') : App.statusBadge('action_required')}` : ''}</summary>
        <p class="small muted">Many families won’t drive a motorhome on mountain roads. A driver is shown to travellers only once their licence is verified.</p>
        <label class="check"><input type="checkbox" id="drv-on" ${st.driver.available ? 'checked' : ''}> Offer a driver with this van</label>
        <div class="grid-3">
          <label class="field"><span>Fee per day</span><input type="number" id="drv-fee" min="300" max="10000" step="100" value="${st.driver.feePerDay}"></label>
          <label class="field"><span>Bata (food) per day</span><input type="number" id="drv-bata" min="0" max="3000" step="50" value="${st.driver.bataPerDay}"></label>
          <label class="field"><span>Night stay allowance</span><input type="number" id="drv-stay" min="0" max="5000" step="50" value="${st.driver.stayPerNight}"></label>
        </div>
        <label class="field"><span>Languages the driver speaks</span><input id="drv-lang" value="${(st.driver.languages || []).join(', ')}" placeholder="Hindi, English"></label>
        <div class="drv-check">
          <strong>Driver’s licence</strong> ${driverVerified() ? h`<span class="small">${App.icon('check')} ${van.driver.name || 'Driver'} · licence ••••${van.driver.licenceLast4 || ''} verified${van.driver.check?.validUpto ? ' until ' + App.fmtDate(van.driver.check.validUpto) : ''}</span>` : h`<span class="small muted">Not checked yet</span>`}
          <div class="grid-3">
            <label class="field"><span>Name (as on licence)</span><input id="drv-name" value="${van.driver?.name || ''}" autocomplete="off"></label>
            <label class="field"><span>Licence number</span><input id="drv-dl" autocomplete="off" pattern="[A-Za-z0-9 \\-]{8,20}" placeholder="e.g. HP-6620190012345"></label>
            <label class="field"><span>Date of birth</span><input type="date" id="drv-dob" max="${App.addDays(App.today(), -365 * 21)}"></label>
          </div>
          ${App.verifyConfig?.testMode ? h`<p class="test-hint">${App.icon('flask-conical')} <strong>Test mode</strong> — licences ending 0000 are “not found”, ending 1111 are expired.</p>` : ''}
          <label class="check consent"><input type="checkbox" id="drv-consent"> The driver agreed to VanYatra checking their licence with the SARATHI registry.</label>
          <button type="button" class="btn btn-sm" id="drv-verify">${App.icon('shield-check')} Verify driver’s licence</button>
        </div>
      </details>
      <details class="opt-block" ${st.delivery.points.length || st.delivery.oneWay.length ? 'open' : ''}><summary>Delivery & one-way trips</summary>
        <label class="opt-row"><span>Delivery fee per km</span><span class="opt-price">₹<input type="number" id="dl-perkm" min="0" max="200" step="1" value="${st.delivery.perKm}"></span></label>
        <p class="small muted">Travellers pay the distance both ways (you drop the van off and collect it).</p>
        <div class="opt-list">${st.delivery.points.map((p, i) => h`<div class="opt-line">
          <input data-pt="${i}" data-k="name" value="${p.name}" placeholder="e.g. Bhuntar airport" aria-label="Delivery point name">
          <select data-pt="${i}" data-k="type" aria-label="Type">${['airport', 'station', 'hotel'].map(t => h`<option value="${t}" ${p.type === t ? 'selected' : ''}>${t === 'station' ? 'Railway/bus station' : t[0].toUpperCase() + t.slice(1)}</option>`)}</select>
          <label class="opt-price"><input type="number" data-pt="${i}" data-k="km" min="0" max="500" value="${p.km}" aria-label="Kilometres one way"><span class="small muted">km</span></label>
          <button type="button" class="icon-btn" data-del-pt="${i}" aria-label="Remove ${p.name || 'delivery point'}">${App.icon('x')}</button></div>`)}</div>
        <button type="button" class="btn btn-sm btn-ghost" id="add-pt">${App.icon('plus')} Add a delivery point</button>
        <h4>One-way drop-offs</h4>
        <div class="opt-list">${st.delivery.oneWay.map((o, i) => h`<div class="opt-line">
          <input data-ow="${i}" data-k="name" value="${o.name}" placeholder="e.g. Delhi" aria-label="Drop-off city">
          <label class="opt-price">₹<input type="number" data-ow="${i}" data-k="fee" min="0" max="100000" step="500" value="${o.fee}" aria-label="One-way fee"></label>
          <button type="button" class="icon-btn" data-del-ow="${i}" aria-label="Remove ${o.name || 'drop-off city'}">${App.icon('x')}</button></div>`)}</div>
        <button type="button" class="btn btn-sm btn-ghost" id="add-ow">${App.icon('plus')} Add a drop-off city</button>
      </details>

      <h3>Seasons & deals</h3>
      <details class="opt-block" ${st.seasons.length ? 'open' : ''}><summary>Seasonal prices</summary>
        <p class="small muted">Raise or lower your nightly rate for date ranges each year, e.g. +25% for Christmas week or −15% in the monsoon.</p>
        <div class="opt-list">${st.seasons.map((x, i) => h`<div class="opt-line season-line">
          <input data-se="${i}" data-k="name" value="${x.name}" placeholder="e.g. Christmas & New Year" aria-label="Season name">
          ${mdSelect('se' + i + '-from', x.from)} <span aria-hidden="true">→</span> ${mdSelect('se' + i + '-to', x.to)}
          <label class="opt-price"><input type="number" data-se="${i}" data-k="pct" min="-50" max="100" value="${x.pct}" aria-label="Change in percent"><span class="small muted">%</span></label>
          <button type="button" class="icon-btn" data-del-se="${i}" aria-label="Remove season">${App.icon('x')}</button></div>`)}</div>
        <button type="button" class="btn btn-sm btn-ghost" id="add-se">${App.icon('plus')} Add a season</button>
      </details>
      <details class="opt-block" ${st.earlyBird.pct || st.lastMinute.pct ? 'open' : ''}><summary>Early-bird & last-minute</summary>
        <div class="opt-row"><span>Early-bird: <input type="number" id="eb-pct" min="0" max="40" value="${st.earlyBird.pct || 0}" aria-label="Early-bird discount percent">% off when booked at least <input type="number" id="eb-days" min="14" max="365" value="${st.earlyBird.days}" aria-label="Days ahead"> days ahead</span></div>
        <div class="opt-row"><span>Last-minute: <input type="number" id="lm-pct" min="0" max="50" value="${st.lastMinute.pct || 0}" aria-label="Last-minute discount percent">% off within <input type="number" id="lm-days" min="1" max="30" value="${st.lastMinute.days}" aria-label="Days before pickup"> days of pickup</span></div>
        <p class="small muted">Set 0 to switch a deal off. Discounts don’t stack with weekly or monthly ones: travellers get the best single discount.</p>
      </details>`);
    bind();
  };

  // Read the current inputs into st (so redraws keep what was typed)
  const read = () => {
    const q = (s) => el.querySelector(s);
    st.addOns = catalog.filter(a => q(`[data-addon="${a.id}"]`)?.checked).map(a => ({ id: a.id, price: +q(`[data-addon-price="${a.id}"]`).value || 0 }));
    st.km = { plus: +q('#km-plus').value || 0, unlimited: +q('#km-unl').value || 0, offerPlus: q('#km-plus-on').checked, offerUnlimited: q('#km-unl-on').checked };
    Object.assign(st.driver, { available: q('#drv-on').checked, feePerDay: +q('#drv-fee').value, bataPerDay: +q('#drv-bata').value, stayPerNight: +q('#drv-stay').value, languages: q('#drv-lang').value.split(',').map(x => x.trim()).filter(Boolean) });
    st.delivery.perKm = +q('#dl-perkm').value || 0;
    el.querySelectorAll('[data-pt]').forEach(i => { st.delivery.points[+i.dataset.pt][i.dataset.k] = i.dataset.k === 'km' ? +i.value : i.value; });
    el.querySelectorAll('[data-ow]').forEach(i => { st.delivery.oneWay[+i.dataset.ow][i.dataset.k] = i.dataset.k === 'fee' ? +i.value : i.value; });
    el.querySelectorAll('[data-se]').forEach(i => { st.seasons[+i.dataset.se][i.dataset.k] = i.dataset.k === 'pct' ? +i.value : i.value; });
    st.seasons.forEach((x, i) => { x.from = `${q(`[name="se${i}-from-m"]`).value}-${q(`[name="se${i}-from-d"]`).value}`; x.to = `${q(`[name="se${i}-to-m"]`).value}-${q(`[name="se${i}-to-d"]`).value}`; });
    st.earlyBird = { pct: +q('#eb-pct').value || 0, days: +q('#eb-days').value || 60 };
    st.lastMinute = { pct: +q('#lm-pct').value || 0, days: +q('#lm-days').value || 7 };
  };
  const redraw = () => { const open = [...el.querySelectorAll('details')].map(d => d.open); draw(); el.querySelectorAll('details').forEach((d, i) => { d.open = open[i] ?? d.open; }); };

  const bind = () => {
    el.querySelectorAll('[data-addon]').forEach(c => c.onchange = () => { el.querySelector(`[data-addon-price="${c.dataset.addon}"]`).disabled = !c.checked; });
    el.querySelector('#km-plus-on').onchange = (e) => { el.querySelector('#km-plus').disabled = !e.target.checked; };
    el.querySelector('#km-unl-on').onchange = (e) => { el.querySelector('#km-unl').disabled = !e.target.checked; };
    el.querySelector('#add-pt').onclick = () => { read(); st.delivery.points.push({ name: '', type: 'airport', km: 20 }); redraw(); };
    el.querySelector('#add-ow').onclick = () => { read(); st.delivery.oneWay.push({ name: '', fee: 8000 }); redraw(); };
    el.querySelector('#add-se').onclick = () => { read(); st.seasons.push({ name: '', from: '12-20', to: '01-05', pct: 20 }); redraw(); };
    el.querySelectorAll('[data-del-pt]').forEach(b => b.onclick = () => { read(); st.delivery.points.splice(+b.dataset.delPt, 1); redraw(); });
    el.querySelectorAll('[data-del-ow]').forEach(b => b.onclick = () => { read(); st.delivery.oneWay.splice(+b.dataset.delOw, 1); redraw(); });
    el.querySelectorAll('[data-del-se]').forEach(b => b.onclick = () => { read(); st.seasons.splice(+b.dataset.delSe, 1); redraw(); });
    el.querySelector('#drv-verify').onclick = async (e) => {
      const name = el.querySelector('#drv-name').value.trim(), dl = el.querySelector('#drv-dl').value.trim(), dob = el.querySelector('#drv-dob').value;
      if (!name || !dl || !dob) return App.toast('Enter the driver’s name, licence number and date of birth.', 'bad');
      if (!el.querySelector('#drv-consent').checked) return App.toast('Please confirm the driver agreed to the check.', 'bad');
      const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Checking with SARATHI…';
      try {
        read();
        const r = await App.verify.run('dl', { dlNumber: dl, dob, name, purpose: 'driver', vanId: van.id });
        await App.syncMarket();
        Object.assign(van, App.get.van(van.id) || {});
        App.toast(r.status === 'verified' ? 'Driver’s licence verified' : r.status === 'review' ? 'Licence received — our team will review it' : 'We couldn’t verify this licence', r.status === 'failed' ? 'bad' : r.status === 'verified' ? 'good' : 'info');
        redraw();
      } catch (err) { btn.disabled = false; btn.textContent = 'Verify driver’s licence'; App.toast(err.message, 'bad'); }
    };
  };

  draw();
  return {
    collect() {
      read();
      if (st.delivery.points.some(p => !p.name.trim())) throw new Error('Give every delivery point a name, or remove it.');
      if (st.delivery.oneWay.some(o => !o.name.trim())) throw new Error('Give every drop-off city a name, or remove it.');
      if (st.seasons.some(x => !x.pct)) throw new Error('Each season needs a percentage change (e.g. 20 or −15).');
      if (st.driver.available && !driverVerified()) App.toast('Saved. Travellers will see the driver option once the driver’s licence is verified.', 'info');
      return {
        addOns: st.addOns,
        kmPackages: { plus: st.km.offerPlus ? st.km.plus : null, unlimited: st.km.offerUnlimited ? st.km.unlimited : null },
        driver: { available: st.driver.available, feePerDay: st.driver.feePerDay, bataPerDay: st.driver.bataPerDay, stayPerNight: st.driver.stayPerNight, languages: st.driver.languages },
        delivery: st.delivery.points.length || st.delivery.oneWay.length ? { perKm: st.delivery.perKm, points: st.delivery.points, oneWay: st.delivery.oneWay } : null,
        seasons: st.seasons.map(x => ({ ...x, name: x.name.trim() || 'Season' })),
        earlyBird: st.earlyBird.pct ? st.earlyBird : null,
        lastMinute: st.lastMinute.pct ? st.lastMinute : null
      };
    }
  };
};
})();
