/*
 * Trip planner (#/plan) and the first-timer's guide (#/guide).
 * The planner turns a destination and dates into routes that fit, vans that suit
 * them (a heater and 4x4 for high passes, family-friendly vans for kids) and a
 * packing checklist; plans can be saved to the account and shared on WhatsApp.
 */
(() => {
const { h } = App;
const MONSOON = [6, 7, 8, 9];

// Packing list for a destination, month and group
const packingList = (d, start, kids) => {
  const month = start ? +start.slice(5, 7) : null;
  const high = App.HIMALAYAN.includes(d.id) && d.id !== 'rishikesh';
  const hot = ['rajasthan'].includes(d.id) && month && month >= 3 && month <= 6;
  const groups = [
    ['Documents', ['Original driving licence (and an International Driving Permit if from abroad)', 'Photo ID for everyone', 'Booking confirmation on your phone', ...(d.id === 'ladakh' ? ['Printed Inner Line Permits'] : [])]],
    ['In the van', ['Torch or headlamp', 'Power bank and car charger', 'Offline maps downloaded', 'Basic first-aid kit and your medicines', 'Reusable water bottles', 'Rubbish bags — leave no trace']],
    high ? ['For the mountains', ['Warm layers, gloves and a woollen cap', 'Sleeping bags rated below 0 °C', 'Sunscreen, lip balm and sunglasses (strong sun at altitude)', 'Ask your doctor about altitude sickness medicine', 'Spare fuel can']] : null,
    ['Beach & coast', ['Swimwear and quick-dry towels', 'Mosquito repellent', 'Hat and sunscreen']],
    (month && MONSOON.includes(month)) ? ['Monsoon', ['Rain jackets and a big umbrella', 'Waterproof bags for phones and documents', 'Sandals that grip on wet ground']] : null,
    hot ? ['Heat', ['Loose cotton clothes', 'ORS sachets', 'Cool box for drinks']] : null,
    kids ? ['For the kids', ['Snacks and a favourite blanket', 'Games and downloaded shows for long drives', 'Children’s medicines', 'Child car seat (add it as an extra if you don’t have one)']] : null
  ].filter(Boolean);
  // Coast list only for coastal places
  return groups.filter(([name]) => name !== 'Beach & coast' || ['goa', 'kerala'].includes(d.id));
};

// Vans ranked for a route: available, big enough, heater/4x4 for high passes, family-friendly with kids
const vansFor = (d, start, end, guests, kids, high) => App.db.vans
  .filter(v => v.status === 'published' && v.destinationId === d.id && v.sleeps >= guests && (!start || !end || App.isAvailable(v.id, start, end)))
  .map(v => ({ v, score: (high && v.amenities.includes('heater') ? 3 : 0) + (high && v.type === '4x4 Overlander' ? 2 : 0) + (high && v.type === 'Motorhome' ? -3 : 0) + (kids && v.familyFriendly ? 2 : 0) + App.get.ratingScore(v.id) }))
  .sort((a, b) => b.score - a.score).map(x => x.v);

App.pages.planner = (el, _p, q) => {
  const me = App.me();
  const s = { dest: q.dest || '', start: q.start || '', end: q.end || '', guests: +q.guests || 2, kids: q.kids === '1' };
  const draw = () => {
    const d = App.get.dest(s.dest);
    const nights = s.start && s.end ? App.nightsBetween(s.start, s.end) : 0;
    const routes = d ? d.routes.filter(r => !nights || r.days <= nights + 1) : [];
    const plans = d ? App.TRIP_GUIDES[d.id]?.plans || {} : {};
    const high = routes.some(r => Math.max(0, ...(plans[r.name] || []).map(x => x.alt || 0)) >= 3500);
    const vans = d ? vansFor(d, s.start, s.end, s.guests, s.kids, high) : [];
    const list = d ? packingList(d, s.start, s.kids) : [];
    const shareText = d ? `Our VanYatra trip: ${d.name}${nights ? `, ${App.fmt.dateRange(s.start, s.end)}` : ''}. ${routes[0] ? 'Route: ' + routes[0].name + '. ' : ''}${location.href}` : '';
    el.innerHTML = String(h`<div class="container section">
      <p class="eyebrow">Trip planner</p><h1>Plan your road trip</h1>
      <form class="card planner-form" id="plan-form">
        <label class="field"><span>Where to?</span><select name="dest" required><option value="">Choose a destination</option>${App.db.destinations.map(x => h`<option value="${x.id}" ${s.dest === x.id ? 'selected' : ''}>${x.name}</option>`)}</select></label>
        <div class="field"><span id="pl-dates-l">Dates</span><div id="pl-dates" role="group" aria-labelledby="pl-dates-l"></div></div>
        <label class="field"><span>Travellers</span><input type="number" name="guests" min="1" max="8" value="${s.guests}"></label>
        <label class="check"><input type="checkbox" name="kids" ${s.kids ? 'checked' : ''}> Travelling with children</label>
      </form>
      ${!d ? h`<p class="muted">Choose a destination to see routes that fit your dates, vans that suit them and what to pack.</p>` : h`
        ${d.bestMonths && s.start && !d.bestMonths.includes(+s.start.slice(5, 7)) ? h`<div class="alert alert-warn">${App.icon('info')} ${d.name} is best ${d.bestTime}. ${App.HIMALAYAN.includes(d.id) ? 'High roads may be closed outside the season.' : 'Expect heat or heavy rain outside the season.'}</div>` : ''}
        <section class="block"><h2>Routes that fit${nights ? ` ${App.fmt.nights(nights)}` : ''}</h2>
          ${routes.length ? h`<div class="route-grid">${routes.map(r => App.routeCard(d, r))}</div>` : h`<p class="muted">The suggested routes need more days. <a href="#/destinations/${d.id}">See all routes for ${d.name}</a>.</p>`}</section>
        <section class="block"><h2>Vans that suit this trip</h2>
          ${high ? h`<p class="small">${App.icon('mountain')} High passes: vans with a heater come first; 4x4s cope best with rough stretches; big motorhomes are ranked last.</p>` : ''}
          ${vans.length ? h`<div class="van-grid">${vans.slice(0, 6).map(v => App.vanCard(v, nights ? { start: s.start, end: s.end } : {}))}</div>` : h`<p class="muted">No vans free for those dates. Try other dates or <a href="#/search?dest=${d.id}">see all vans</a>.</p>`}</section>
        <section class="block"><h2>Packing checklist</h2>
          <div class="pack-grid">${list.map(([name, items]) => h`<fieldset class="card pack"><legend>${name}</legend>${items.map(i => h`<label class="check"><input type="checkbox" data-pack="${i}" ${(s.packed || []).includes(i) ? 'checked' : ''}> ${i}</label>`)}</fieldset>`)}</div></section>
        <div class="row gap wrap">
          <button type="button" class="btn btn-primary" id="save-plan">${App.icon('heart')} Save to my account</button>
          <a class="btn btn-ghost" id="share-plan" href="https://wa.me/?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener">${App.icon('share')} Share on WhatsApp</a>
          <a class="link" href="#/guide">New to van life? Read the first-timer’s guide</a>
        </div>`}
    </div>`);
    bind();
  };
  const sync = () => {
    const p = new URLSearchParams(Object.entries({ dest: s.dest, start: s.start, end: s.end, guests: s.guests, kids: s.kids ? '1' : '' }).filter(([, v]) => v));
    history.replaceState(null, '', '#/plan?' + p);
  };
  const bind = () => {
    const f = el.querySelector('#plan-form');
    App.dateRangeField(el.querySelector('#pl-dates'), { start: s.start, end: s.end });
    f.addEventListener('change', () => { const d = App.formData(f); Object.assign(s, { dest: d.dest, start: d.start, end: d.end, guests: +d.guests || 1, kids: !!d.kids }); sync(); draw(); });
    el.querySelectorAll('[data-pack]').forEach(c => c.onchange = () => { s.packed = el.querySelectorAll('[data-pack]:checked').length ? [...el.querySelectorAll('[data-pack]:checked')].map(x => x.dataset.pack) : []; });
    const save = el.querySelector('#save-plan');
    if (save) save.onclick = () => {
      if (!me) return App.go('#/login?next=' + encodeURIComponent(location.hash.slice(1)));
      App.db.plans = App.db.plans || [];
      const d = App.get.dest(s.dest);
      App.db.plans.unshift({ id: App.uid('pl'), userId: me.id, dest: s.dest, start: s.start, end: s.end, guests: s.guests, kids: s.kids, packed: s.packed || [], label: `${d.name}${s.start ? ' · ' + App.fmt.dateRange(s.start, s.end) : ''}`, url: location.hash, createdAt: new Date().toISOString() });
      App.save();
      App.toast('Trip plan saved to your account.', 'good');
    };
  };
  draw();
};

/* ---------- First-timer's guide ---------- */
const GUIDE = [
  ['legal', 'Is van life legal in India?', h`<p>Yes — renting a camper and touring in it is legal. VanYatra vans are registered for self-drive rental (and caravans with state tourism departments where required), insured, and checked against the government VAHAN registry. You drive most campervans with an ordinary car (LMV) licence; each van page says which licence it needs.</p>
    <p>What isn’t settled everywhere is <strong>where you may sleep</strong>. There is no single national rule for overnight parking, so use campsites and caravan parks, dhabas and homestays that say yes, and follow local signs. The Ministry of Tourism has published guidelines for caravans and caravan parks, and more states are opening parks each year.</p>`],
  ['parking', 'Where to park overnight', h`<ul><li><strong>Campsites and caravan parks</strong> — toilets, water, often power. Best for families.</li>
    <li><strong>Dhabas</strong> on highways — ask the owner first; buying dinner usually does it.</li>
    <li><strong>Homestays and guesthouses</strong> with a courtyard — many let you park and use a bathroom for a small fee.</li>
    <li><strong>Avoid</strong> beaches (not allowed in Goa), forest reserves, lonely lay-bys and the edge of mountain roads. If in doubt, ask the local police station — they’re usually helpful.</li></ul>
    <p>Our destination pages list campsites and van-friendly spots, also on the <a href="#/map">map</a>.</p>`],
  ['toilets', 'Toilets and showers', h`<p>Some vans have a toilet and shower; others can add a <strong>portable toilet</strong> at checkout. On the road, highway fuel stations, dhabas, campsites and homestays have toilets. Empty waste tanks only at proper waste points — never in rivers or fields.</p>`],
  ['cooking', 'Cooking on the road', h`<p>Most vans have a gas stove, fridge and cookware (see “What’s included” on the van page). Add an <strong>extra gas cylinder</strong> for long mountain trips. Cook with a window or door open — never run the stove or a heater in a sealed van while sleeping. Local markets and dhabas make it easy to eat well without much cooking.</p>`],
  ['safety', 'Safety for families and solo women', h`<ul><li>Share your live location with someone at home, and your route with the owner.</li>
    <li>Prefer campsites, homestays and busy dhabas for the night; lock the doors and keep the keys by the bed.</li>
    <li>Save <strong>112</strong> (India’s emergency number) and VanYatra’s 24×7 line, <a href="tel:${App.C.supportPhone}">${App.C.supportPhone}</a>.</li>
    <li>Every renter and owner on VanYatra is identity-verified, and messages stay on the platform until a booking is confirmed.</li></ul>`],
  ['driving', 'Driving a camper for the first time', h`<ul><li><strong>It’s bigger than a car:</strong> leave more room when braking and turning, and check the height before bridges and car-park barriers (shown on every van page).</li>
    <li><strong>In the hills</strong> use a low gear going downhill instead of riding the brakes, honk before blind bends, and give way to vehicles coming uphill.</li>
    <li><strong>Drive in daylight</strong> on mountain and rural roads, and plan shorter days than you would by car.</li>
    <li>Not keen on driving? Many vans can be booked <strong>with a driver</strong>.</li></ul>
    <div class="video-placeholder">${App.icon('camera', { size: 28 })}<div><strong>Video: your first camper drive</strong><span class="small muted">A short walkthrough of controls, reversing and hill driving is being filmed with our owners. Until then, your owner walks you through the van at pickup.</span></div></div>`]
];
App.pages.guide = (el) => {
  el.innerHTML = String(h`<div class="container narrow section prose guide">
    <p class="eyebrow">First-timer’s guide</p><h1>Van life in India, simply explained</h1>
    <p class="lead">Everything families and first-timers ask before their first camper trip.</p>
    <nav class="toc" aria-label="On this page"><ul>${GUIDE.map(([id, t]) => h`<li><a href="#/guide?s=${id}" data-jump="${id}">${t}</a></li>`)}</ul></nav>
    ${GUIDE.map(([id, t, body]) => h`<section class="block" id="g-${id}"><h2>${t}</h2>${body}</section>`)}
    <div class="callout"><strong>Ready?</strong> <a href="#/plan">Plan a trip</a> or <a href="#/search">find a van</a>.</div>
  </div>`);
  el.querySelectorAll('[data-jump]').forEach(a => a.onclick = (e) => { e.preventDefault(); el.querySelector('#g-' + a.dataset.jump).scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  const q = App.parseHash().query;
  if (q.s) setTimeout(() => el.querySelector('#g-' + q.s)?.scrollIntoView({ block: 'start' }), 50);
};
})();
