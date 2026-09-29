/*
 * Public pages: home, destinations, destination detail, search, map, van detail.
 */
(() => {
const { h, money, photo, fmtDate } = App;

// What a van photo shows, from the owner's tags (photo guide)
const photoCaption = (van, i) => App.PHOTO_GUIDE.find(g => g.id === van.photoLabels?.[i])?.label || `Photo ${i + 1}`;

const publishedVans = () => App.db.vans.filter(v => v.status === 'published');

/* Shared search form used on home and destination pages */
const searchForm = (q = {}, compact = false) => h`
  <form class="search-form ${compact ? 'compact' : ''}" id="search-form" role="search" aria-label="Find a camper van">
    <label class="sf-field sf-dest"><span>Where to?</span>
      <select name="dest">
        <option value="">Anywhere in India</option>
        ${App.db.destinations.map(d => h`<option value="${d.id}" ${q.dest === d.id ? 'selected' : ''}>${d.name}</option>`)}
      </select></label>
    <div class="sf-field sf-dates" data-start="${q.start || ''}" data-end="${q.end || ''}"></div>
    <label class="sf-field sf-small"><span>Travellers</span>
      <select name="guests">${[1, 2, 3, 4, 5, 6].map(n => h`<option value="${n}" ${+q.guests === n || (!q.guests && n === 2) ? 'selected' : ''}>${n}${n === 6 ? '+' : ''}</option>`)}</select></label>
    <label class="sf-field"><span>Van type</span>
      <select name="type"><option value="">Any type</option>${App.VAN_TYPES.map(t => h`<option ${q.type === t ? 'selected' : ''}>${t}</option>`)}</select></label>
    <button class="btn btn-accent btn-lg" type="submit"><span aria-hidden="true">${App.icon('search')}</span> Search vans</button>
  </form>`;

const bindSearchForm = (el) => {
  const f = el.querySelector('#search-form');
  if (!f) return;
  const dates = f.querySelector('.sf-dates');
  App.dateRangeField(dates, { start: dates.dataset.start, end: dates.dataset.end });
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = App.formData(f);
    if (q.start && q.end && q.end <= q.start) { App.toast('Return date must be after pickup.', 'bad'); return; }
    const params = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
    App.go('#/search?' + params.toString());
  });
};

const destCard = (d, big = false) => {
  const count = publishedVans().filter(v => v.destinationId === d.id).length;
  return h`<a class="dest-card ${big ? 'big' : ''}" href="#/destinations/${d.id}">
    <img src="${photo(d.hero, big ? 1200 : 700)}" alt="${d.name}" loading="lazy">
    <div class="dest-card-overlay">
      <span class="eyebrow">${d.region}</span>
      <h3>${d.name}</h3>
      <p>${d.tagline}</p>
      <div class="dest-meta"><span>${App.icon('calendar-days')} ${d.bestTime}</span><span>${App.icon('caravan')} ${App.plural(count, 'van')}</span>${d.familyScore >= 5 ? h`<span>${App.icon('users')} Great for families</span>` : ''}</div>
    </div></a>`;
};

/* ================= HOME ================= */
App.pages.home = (el) => {
  const vans = publishedVans();
  const featured = [...vans].sort((a, b) => App.get.ratingScore(b.id) - App.get.ratingScore(a.id)).slice(0, 6);
  const month = new Date().getMonth() + 1;
  const inSeason = App.db.destinations.filter(d => d.bestMonths.includes(month));
  const dests = [...inSeason, ...App.db.destinations.filter(d => !inSeason.includes(d))];
  el.innerHTML = String(h`
  <section class="hero">
    <img class="hero-img" src="${photo('photo-1534540378968-85a7b8fde19f', 1800)}" alt="" fetchpriority="high">
    <div class="hero-shade"></div>
    <div class="container hero-inner">
      <p class="eyebrow light">Camper van rentals across India</p>
      <h1>Your home on wheels<br>for the <em>road trip</em> of a lifetime</h1>
      <p class="hero-sub">Discover Himalayan passes, Goan beaches and Kerala backwaters. Book a verified, insured camper van in minutes — with transparent prices and no surprises.</p>
      ${searchForm({})}
      <ul class="hero-trust">
        <li>✓ ${App.plural(vans.length, 'verified van')}</li><li>✓ Insurance included</li><li>✓ 24×7 roadside help</li><li>✓ Free cancellation on many vans</li>
      </ul>
    </div>
  </section>

  <section class="section container">
    <div class="section-head"><div><p class="eyebrow">How it works</p><h2>From dream to driveway in three steps</h2></div></div>
    <ol class="steps-3">
      <li><span class="step-n">1</span><h3>Pick a destination</h3><p>Browse routes, best seasons, campsites and family tips for every region.</p></li>
      <li><span class="step-n">2</span><h3>Choose your van</h3><p>Compare real photos, beds, amenities and live availability. Every owner is verified.</p></li>
      <li><span class="step-n">3</span><h3>Book & hit the road</h3><p>Pay securely, see every rupee up front, and get your trip plan and pickup details instantly.</p></li>
    </ol>
    <p class="center"><a class="btn btn-primary" href="#/plan">${App.icon('route')} Plan a trip</a> <a class="btn btn-ghost" href="#/guide">New to van life? Start here</a> <a class="btn btn-ghost" href="#/deals">${App.icon('sparkles')} Deals</a></p>
  </section>

  <section class="section container">
    <div class="section-head"><div><p class="eyebrow">In season now</p><h2>Where will the road take you?</h2></div><a class="link-arrow" href="#/destinations">All destinations →</a></div>
    <div class="dest-grid">${dests.slice(0, 5).map((d, i) => destCard(d, i === 0))}</div>
  </section>

  <section class="section container">
    <div class="section-head"><div><p class="eyebrow">Top rated</p><h2>Loved by travellers</h2></div><a class="link-arrow" href="#/search">See all vans →</a></div>
    <div class="van-grid">${featured.map(v => App.vanCard(v))}</div>
  </section>

  <section class="section band">
    <div class="container split">
      <div>
        <p class="eyebrow">Road trips for families</p>
        <h2>Room for the kids, the snacks and the memories</h2>
        <p>Filter for child-seat anchors, bunk beds, bathrooms and short driving days. Every destination has a family suitability score and kid-friendly highlights.</p>
        <div class="chip-row">${App.db.destinations.filter(d => d.familyScore >= 5).map(d => h`<a class="chip chip-link" href="#/destinations/${d.id}">${d.name}</a>`)}</div>
        <a class="btn btn-primary" href="#/search?family=1">Browse family-friendly vans</a>
      </div>
      <img class="rounded-img" src="${photo('photo-1477512076069-d31eb021716f', 900)}" alt="Family relaxing at a lakeside campsite" loading="lazy">
    </div>
  </section>

  <section class="section container">
    <div class="trust-grid">
      <div><span class="trust-ic">${App.icon('id-card')}</span><h3>Verified owners</h3><p>Government ID, vehicle ownership and legal permits checked by our team.</p></div>
      <div><span class="trust-ic">${App.icon('shield-check')}</span><h3>Insured & inspected</h3><p>Commercial insurance and a 10-point safety inspection before any van goes live.</p></div>
      <div><span class="trust-ic">${App.icon('credit-card')}</span><h3>Secure payments</h3><p>Pay on VanYatra only. Owners are paid after pickup; deposits are held, not spent.</p></div>
      <div><span class="trust-ic">${App.icon('phone')}</span><h3>24×7 support</h3><p>Roadside assistance and a real human on the phone, day or night.</p></div>
    </div>
  </section>

  <section class="section container">
    <div class="section-head"><div><p class="eyebrow">Explore by map</p><h2>Vans and campsites near your route</h2></div><a class="link-arrow" href="#/map">Open full map →</a></div>
    <div class="map map-md" id="home-map" aria-label="Map of destinations"></div>
  </section>

  <section class="section container">
    <div class="owner-cta">
      <div><p class="eyebrow light">For van owners</p><h2>Earn from your camper van</h2><p>List for free, set your own prices and rules, and get paid securely. Our step-by-step onboarding gets you verified and live.</p></div>
      <a class="btn btn-accent btn-lg" href="#/list-your-van">Start listing</a>
    </div>
  </section>`);
  bindSearchForm(el);
  App.mountMap(el.querySelector('#home-map'), App.db.destinations.map(d => ({ lat: d.lat, lng: d.lng, label: d.name, kind: 'dest', title: d.name, html: App.mapCard.dest(d) })));
};

/* ================= DESTINATIONS ================= */
App.pages.destinations = (el, _p, q) => {
  const months = ['Any month', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  el.innerHTML = String(h`
    <section class="page-hero small">
      <div class="container"><p class="eyebrow">Destinations</p><h1>Find your perfect road trip</h1>
      <p class="lead">Every destination comes with highlights, routes, the best time to visit, family tips and van-friendly campsites.</p>
      <div class="filter-row" role="group" aria-label="Filter destinations">
        <label class="field inline"><span>Travel month</span><select id="f-month">${months.map((m, i) => h`<option value="${i}" ${+q.month === i ? 'selected' : ''}>${m}</option>`)}</select></label>
        <label class="check"><input type="checkbox" id="f-family" ${q.family ? 'checked' : ''}> Great for families</label>
      </div></div>
    </section>
    <section class="container section-tight"><div class="dest-grid" id="dest-list"></div></section>`);
  const draw = () => {
    const m = +el.querySelector('#f-month').value, fam = el.querySelector('#f-family').checked;
    const list = App.db.destinations.filter(d => (!m || d.bestMonths.includes(m)) && (!fam || d.familyScore >= 4));
    el.querySelector('#dest-list').innerHTML = String(list.length ? h`${list.map(d => destCard(d))}` : App.emptyState('🗺️', 'No destinations match', 'Try a different month.'));
  };
  el.querySelector('#f-month').onchange = draw;
  el.querySelector('#f-family').onchange = draw;
  draw();
};

// A suggested route with its day-by-day plan and a search for vans that suit it
const routeCard = App.routeCard = (d, r) => {
  const plan = App.TRIP_GUIDES[d.id]?.plans?.[r.name] || [];
  const hours = plan.reduce((s, x) => s + (x.hours || 0), 0);
  const top = Math.max(0, ...plan.map(x => x.alt || 0));
  const high = top >= 3500;
  const q = `#/search?dest=${d.id}${high ? '&amen=heater' : ''}`;
  return h`<article class="route"><h3>${r.name}</h3>
    <div class="route-meta"><span>${App.icon('calendar-days')} ${r.days} days</span><span>${App.icon('route')} ${App.fmt.km(r.km)}</span>${hours ? h`<span>${App.icon('clock')} ~${Math.round(hours)} h driving</span>` : ''}${top ? h`<span title="Highest overnight stop; passes on the way are higher">${App.icon('mountain')} nights up to ${App.fmt.number(top)} m</span>` : ''}</div>
    <p>${r.desc}</p>
    ${plan.length ? h`<details class="day-plan"><summary>Day-by-day plan</summary><ol>${plan.map(x => h`<li><strong>${x.from === x.to ? x.from : `${x.from} → ${x.to}`}</strong> <span class="small muted">${x.km ? `${App.fmt.km(x.km)} · ~${x.hours} h` : 'No driving'}${x.alt ? ` · ${App.fmt.number(x.alt)} m` : ''}</span>${x.note ? h`<div class="small">${x.note}</div>` : ''}</li>`)}</ol></details>` : ''}
    ${high ? h`<p class="small">${App.icon('info')} High passes: pick a van with a heater (4x4 is a bonus on rough stretches), and read the altitude notes for this region.</p>` : ''}
    <a class="btn btn-sm" href="${q}">${App.icon('caravan')} Vans for this route</a></article>`;
};
// Practical notes: altitude, permits (official links), fuel, network, roads
const beforeYouGo = (d) => {
  const p = App.TRIP_GUIDES[d.id]?.practical;
  if (!p) return '';
  return h`<section class="block"><h2>Before you go</h2>
    <dl class="gtk-dl">
      <div><dt>${App.icon('mountain')} Altitude & health</dt><dd>${p.altitude}</dd></div>
      <div><dt>${App.icon('id-card')} Permits</dt><dd>${p.permits.map(x => h`<p><strong>${x.name}.</strong> ${x.need || ''} ${x.link ? h`<a href="${x.link}" target="_blank" rel="noopener">${x.source} ↗</a>` : ''}</p>`)}</dd></div>
      <div><dt>${App.icon('fuel')} Fuel</dt><dd>${p.fuel}</dd></div>
      <div><dt>${App.icon('wifi')} Mobile network</dt><dd>${p.network}</dd></div>
      <div><dt>${App.icon('route')} Roads</dt><dd>${p.roads}</dd></div>
    </dl>
    <p class="small muted">Rules and road conditions change. Check official sources before you travel; distances and times are approximate.</p>
  </section>`;
};

App.pages.destination = (el, { id }) => {
  const d = App.get.dest(id);
  if (!d) return App.pages.notFound(el);
  const vans = publishedVans().filter(v => v.destinationId === d.id);
  const monthNames = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  el.innerHTML = String(h`
  <section class="hero hero-dest">
    <img class="hero-img" src="${photo(d.hero, 1800)}" alt="${d.name}">
    <div class="hero-shade"></div>
    <div class="container hero-inner">
      <nav class="crumbs light" aria-label="Breadcrumb"><a href="#/destinations">Destinations</a> / <span>${d.name}</span></nav>
      <p class="eyebrow light">${d.region}</p>
      <h1>${d.name}</h1>
      <p class="hero-sub">${d.tagline}</p>
      <a class="btn btn-accent btn-lg" href="#/search?dest=${d.id}">See ${App.plural(vans.length, 'van')} for ${d.name}</a>
    </div>
  </section>
  <div class="container dest-layout">
    <div>
      <section class="facts">
        <div class="fact"><span class="muted small">Best time to visit</span><strong>${d.bestTime}</strong>
          <div class="months" aria-label="Best months">${monthNames.map((m, i) => h`<span class="${d.bestMonths.includes(i + 1) ? 'on' : ''}" title="${App.fmt.MONTHS_LONG[i]}">${m}</span>`)}</div></div>
        <div class="fact"><span class="muted small">Family suitability</span><strong>${'★'.repeat(d.familyScore)}${'☆'.repeat(5 - d.familyScore)} <span class="sr-only">${d.familyScore} of 5</span></strong><p class="small">${d.familyNotes}</p></div>
      </section>
      <section class="block"><h2>Highlights</h2><ul class="ticks">${d.highlights.map(x => h`<li>${x}</li>`)}</ul></section>
      <section class="block"><h2>Suggested road trips</h2>
        <div class="route-grid">${d.routes.map(r => routeCard(d, r))}</div>
      </section>
      ${beforeYouGo(d)}
      <section class="block"><h2>Top attractions</h2><div class="chip-row">${d.attractions.map(a => h`<span class="chip">${App.icon('map-pin')} ${a}</span>`)}</div></section>
      <section class="block"><h2>Things to do</h2><div class="chip-row">${d.activities.map(a => h`<span class="chip">${a}</span>`)}</div></section>
      <section class="block"><h2>Photos</h2><div class="photo-strip">${d.gallery.map(g => h`<img src="${photo(g, 600)}" alt="${d.name} scenery" loading="lazy">`)}</div></section>
      <section class="block"><h2>Campsites & van-friendly spots</h2>
        <div class="map map-md" id="dest-map"></div>
        <ul class="camp-list">${d.campsites.map(c => h`<li>${App.icon('tent')} <strong>${c.name}</strong> <span class="badge badge-muted">${c.type}</span><div class="small muted">${c.facilities.join(' · ')}</div></li>`)}${(App.TRIP_GUIDES[d.id]?.spots || []).map(s => h`<li>${App.icon(App.SPOT_TYPES[s.type][1])} <strong>${s.name}</strong> <span class="badge badge-muted">${App.SPOT_TYPES[s.type][0]}</span>${s.note ? h`<div class="small muted">${s.note}</div>` : ''}</li>`)}</ul>
        <p class="small muted">Spots are examples to plan with — always check they’re open, and park only where it’s allowed. <a href="#/guide">First-timer’s guide to van life in India</a></p>
      </section>
    </div>
    <aside class="dest-aside">
      <div class="card sticky">
        <h3>Plan your ${d.name} trip</h3>
        ${searchForm({ dest: d.id }, true)}
      </div>
    </aside>
  </div>
  <section class="container section"><div class="section-head"><h2>Vans available for ${d.name}</h2></div>
    ${vans.length ? h`<div class="van-grid">${vans.map(v => App.vanCard(v))}</div>` : App.emptyState('🚐', 'No vans here yet', 'Vans from nearby cities can often be driven here — try searching anywhere.', h`<a class="btn" href="#/search">Search all vans</a>`)}
  </section>`);
  bindSearchForm(el);
  App.mountMap(el.querySelector('#dest-map'), [
    ...d.campsites.map(c => ({ lat: c.lat, lng: c.lng, label: '⛺', kind: 'camp', title: c.name, html: App.mapCard.camp(c, d) })),
    ...(App.TRIP_GUIDES[d.id]?.spots || []).map(s => ({ lat: s.lat, lng: s.lng, label: App.SPOT_TYPES[s.type][1], kind: 'camp', title: s.name, html: App.mapCard.spot(s, d) })),
    ...vans.map(v => ({ lat: v.pickup.lat, lng: v.pickup.lng, label: money(v.pricePerNight), kind: 'van', title: v.name, html: App.mapCard.van(v) }))
  ]);
};

/* ================= SEARCH ================= */
App.pages.search = (el, _p, q) => {
  const prices = publishedVans().map(v => v.pricePerNight);
  const maxP = Math.ceil(Math.max(...prices) / 1000) * 1000;
  const state = {
    dest: q.dest || '', start: q.start || '', end: q.end || '', guests: +q.guests || 1,
    types: q.type ? q.type.split(',') : [], min: +q.min || 0, max: +q.max || maxP,
    amen: q.amen ? q.amen.split(',') : [], family: !!q.family, pets: !!q.pets, instant: !!q.instant, auto: !!q.auto,
    fuel: q.fuel || '', driver: !!q.driver, delivery: !!q.delivery, pickup: q.pickup || '',
    sort: q.sort || 'recommended', view: q.view || 'list'
  };
  // Pickup places: owners' bases and the airports, stations and hotels they deliver to
  const places = new Map();
  for (const v of publishedVans()) {
    places.set('city:' + v.pickup.city, { id: 'city:' + v.pickup.city, name: v.pickup.city, type: 'city' });
    for (const p of v.delivery?.points || []) places.set(p.id, { id: p.id, name: p.name, type: p.type });
  }
  const placeList = [...places.values()].sort((a, b) => (a.type === 'city') - (b.type === 'city') || a.name.localeCompare(b.name));
  // Quick filters shown as chips above the results
  const CHIPS = [
    ['instant', 'Instant book', 'zap', () => state.instant, (on) => { state.instant = on; }],
    ['driver', 'Driver available', 'user', () => state.driver, (on) => { state.driver = on; }],
    ['delivery', 'Delivery', 'route', () => state.delivery, (on) => { state.delivery = on; }],
    ['sleeps4', 'Sleeps 4+', 'bed-double', () => state.guests >= 4, (on) => { state.guests = on ? 4 : 1; }],
    ['budget', 'Under ₹5,000', 'wallet', () => state.max <= 5000, (on) => { state.max = on ? 5000 : maxP; }],
    ['auto', 'Automatic', 'cog', () => state.auto, (on) => { state.auto = on; }],
    ['toilet', 'Toilet', 'toilet', () => state.amen.includes('toilet'), (on) => toggleAmen('toilet', on)],
    ['ac', 'AC', 'snowflake', () => state.amen.includes('ac'), (on) => toggleAmen('ac', on)],
    ['heater', 'Heater', 'flame', () => state.amen.includes('heater'), (on) => toggleAmen('heater', on)],
    ['4x4', '4x4', 'mountain', () => state.types.includes('4x4 Overlander'), (on) => { state.types = on ? [...new Set([...state.types, '4x4 Overlander'])] : state.types.filter(t => t !== '4x4 Overlander'); }],
    ['pets', 'Pet friendly', 'paw-print', () => state.pets, (on) => { state.pets = on; }],
    ['childseat', 'Child seat anchors', 'baby', () => state.amen.includes('childseat'), (on) => toggleAmen('childseat', on)],
    ['family', 'Family friendly', 'users', () => state.family, (on) => { state.family = on; }]
  ];
  const toggleAmen = (id, on) => { state.amen = on ? [...new Set([...state.amen, id])] : state.amen.filter(a => a !== id); };
  el.innerHTML = String(h`
  <div class="container search-top">
    <h1>${state.dest ? h`Camper vans for ${App.get.dest(state.dest)?.name || 'your trip'}` : 'Find your camper van'}</h1>
    <p class="muted" id="result-count"></p>
  </div>
  <div class="container search-layout">
    <aside class="filters" id="filters" aria-label="Filters">
      <div class="sheet-head only-mobile"><strong>Filters</strong><button type="button" class="icon-btn" id="filters-close" aria-label="Close filters">✕</button></div>
      <form id="filter-form">
        <label class="field"><span>Destination</span><select name="dest"><option value="">Anywhere</option>${App.db.destinations.map(d => h`<option value="${d.id}" ${state.dest === d.id ? 'selected' : ''}>${d.name}</option>`)}</select></label>
        <div class="field"><span id="f-dates-l">Dates</span><div id="f-dates" role="group" aria-labelledby="f-dates-l"></div></div>
        <label class="field"><span>Travellers</span><input type="number" name="guests" min="1" max="8" value="${state.guests}"></label>
        <label class="field"><span>Pickup location</span><select name="pickup"><option value="">Anywhere</option>
          ${['city', 'airport', 'station', 'hotel'].map(t => placeList.some(p => p.type === t) ? h`<optgroup label="${{ city: 'Owner’s base', airport: 'Airports (delivery)', station: 'Stations (delivery)', hotel: 'Hotels (delivery)' }[t]}">${placeList.filter(p => p.type === t).map(p => h`<option value="${p.id}" ${state.pickup === p.id ? 'selected' : ''}>${p.name}</option>`)}</optgroup>` : '')}</select></label>
        <fieldset class="field"><legend>Price per night</legend>
          <div class="grid-2"><label class="small">Min<input type="number" name="min" step="500" min="0" value="${state.min}"></label><label class="small">Max<input type="number" name="max" step="500" min="0" value="${state.max}"></label></div>
          <input type="range" name="maxRange" min="2000" max="${maxP}" step="500" value="${state.max}" aria-label="Maximum price per night">
        </fieldset>
        <fieldset class="field"><legend>Van type</legend>${App.VAN_TYPES.map(t => h`<label class="check"><input type="checkbox" name="types" value="${t}" ${state.types.includes(t) ? 'checked' : ''}> ${t}</label>`)}</fieldset>
        <fieldset class="field"><legend>Good to know</legend>
          <label class="check"><input type="checkbox" name="family" ${state.family ? 'checked' : ''}> ${App.icon('users')} Family friendly</label>
          <label class="check"><input type="checkbox" name="pets" ${state.pets ? 'checked' : ''}> ${App.icon('paw-print')} Pet friendly</label>
          <label class="check"><input type="checkbox" name="instant" ${state.instant ? 'checked' : ''}> ${App.icon('zap')} Instant book</label>
          <label class="check"><input type="checkbox" name="auto" ${state.auto ? 'checked' : ''}> Automatic transmission</label>
          <label class="check"><input type="checkbox" name="driver" ${state.driver ? 'checked' : ''}> ${App.icon('user')} Driver available</label>
          <label class="check"><input type="checkbox" name="delivery" ${state.delivery ? 'checked' : ''}> ${App.icon('route')} Delivery to airport, station or hotel</label>
        </fieldset>
        <label class="field"><span>Fuel</span><select name="fuel"><option value="">Any</option>${['Diesel', 'Petrol', 'CNG', 'Electric'].map(f => h`<option ${state.fuel === f ? 'selected' : ''}>${f}</option>`)}</select></label>
        <fieldset class="field"><legend>Amenities</legend><div class="amen-grid">${App.AMENITIES.filter(a => a.id !== 'pets').map(a => h`<label class="check"><input type="checkbox" name="amen" value="${a.id}" ${state.amen.includes(a.id) ? 'checked' : ''}> ${a.label}</label>`)}</div></fieldset>
        <button type="button" class="btn btn-ghost btn-block" id="clear-filters">Clear all filters</button>
      </form>
      <div class="sheet-foot only-mobile"><button type="button" class="btn btn-ghost" id="clear-filters-2">Clear</button><button type="button" class="btn btn-primary" id="filters-apply">Show vans</button></div>
    </aside>
    <section class="results">
      <div class="results-bar">
        <button class="btn btn-sm filters-toggle" id="filters-toggle" aria-expanded="false" aria-controls="filters">${App.icon('cog')} Filters<span class="count" id="filter-count" hidden></span></button>
        <div class="seg" role="group" aria-label="View">
          <button class="${state.view === 'list' ? 'on' : ''}" data-view="list" aria-pressed="${state.view === 'list'}">☰ List</button>
          <button class="${state.view === 'map' ? 'on' : ''}" data-view="map" aria-pressed="${state.view === 'map'}">${App.icon('map')} Map</button>
        </div>
        <label class="field inline"><span class="sr-only">Sort by</span><select id="sort">
          ${[['recommended', 'Recommended'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['sleeps', 'Sleeps most']].map(([v, l]) => h`<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`)}
        </select></label>
      </div>
      <div class="chip-bar" role="group" aria-label="Quick filters"><div class="chip-scroll" id="chips"></div></div>
      <div class="results-meta"><span id="active-count" class="small muted"></span><button type="button" class="link small" id="chips-clear" hidden>Clear all</button><button type="button" class="btn btn-sm btn-ghost" id="save-search">${App.icon('bell')} Save search</button></div>
      <div class="map map-lg" id="search-map" ${state.view === 'map' ? '' : 'hidden'}></div>
      <div id="results"></div>
    </section>
  </div>`);

  const form = el.querySelector('#filter-form');
  const read = () => {
    const f = App.formData(form);
    Object.assign(state, {
      dest: f.dest, start: f.start, end: f.end, guests: +f.guests || 1, min: +f.min || 0, max: +f.max || maxP,
      types: [].concat(f.types || []), amen: [].concat(f.amen || []), family: !!f.family, pets: !!f.pets, instant: !!f.instant, auto: !!f.auto,
      fuel: f.fuel || '', driver: !!f.driver, delivery: !!f.delivery, pickup: f.pickup || ''
    });
  };
  let map = null, lastSearch = '';
  const draw = () => {
    const validDates = state.start && state.end && state.end > state.start;
    let list = publishedVans().filter(v => App.searchMatches(v, state));
    const sig = JSON.stringify([state.dest, state.start, state.end, state.guests]);
    if (sig !== lastSearch) { lastSearch = sig; App.track('search', { dest: state.dest || 'anywhere', dates: !!validDates, guests: state.guests }); }
    const avail = validDates ? list.filter(v => App.isAvailable(v.id, state.start, state.end)) : list;
    const sorters = {
      recommended: (a, b) => (App.get.ratingScore(b.id) * 10 + (b.instantBook ? 5 : 0)) - (App.get.ratingScore(a.id) * 10 + (a.instantBook ? 5 : 0)),
      price_asc: (a, b) => a.pricePerNight - b.pricePerNight, price_desc: (a, b) => b.pricePerNight - a.pricePerNight,
      rating: (a, b) => App.get.ratingScore(b.id) - App.get.ratingScore(a.id), sleeps: (a, b) => b.sleeps - a.sleeps
    };
    avail.sort(sorters[state.sort]);
    const unavailable = list.filter(v => !avail.includes(v));
    el.querySelector('#result-count').textContent = `${App.plural(avail.length, 'van')} available${validDates ? ` · ${App.fmt.dateRange(state.start, state.end)}` : ''}`;
    el.querySelector('#filters-apply').textContent = `Show ${App.plural(avail.length, 'van')}`;
    const active = [state.dest, validDates, state.guests > 1, state.min > 0, state.max < maxP, state.types.length, state.amen.length, state.family, state.pets, state.instant, state.auto, state.fuel, state.driver, state.delivery, state.pickup].filter(Boolean).length;
    drawChips(active);
    const fc = el.querySelector('#filter-count'); fc.hidden = !active; fc.textContent = active;
    const opts = validDates ? { start: state.start, end: state.end } : {};
    el.querySelector('#results').innerHTML = String(avail.length
      ? h`<div class="van-grid">${avail.map(v => App.vanCard(v, opts))}</div>
          ${unavailable.length ? h`<h3 class="section-sub">Booked for your dates</h3><div class="van-grid dim">${unavailable.map(v => App.vanCard(v, opts))}</div>` : ''}`
      : noResults(list, validDates));
    const c2 = el.querySelector('#clear2'); if (c2) c2.onclick = clear;
    // Keep filters in the URL (shareable) without re-rendering the page
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ dest: state.dest, start: state.start, end: state.end, guests: state.guests > 1 ? state.guests : '', type: state.types.join(','), min: state.min || '', max: state.max < maxP ? state.max : '', amen: state.amen.join(','), family: state.family ? 1 : '', pets: state.pets ? 1 : '', instant: state.instant ? 1 : '', auto: state.auto ? 1 : '', fuel: state.fuel, driver: state.driver ? 1 : '', delivery: state.delivery ? 1 : '', pickup: state.pickup, sort: state.sort !== 'recommended' ? state.sort : '', view: state.view !== 'list' ? state.view : '' })) if (v) params.set(k, v);
    history.replaceState(null, '', '#/search' + (params.toString() ? '?' + params : ''));
    if (state.view === 'map') {
      const mapEl = el.querySelector('#search-map');
      if (map) { map.remove(); map = null; }
      mapEl.innerHTML = '';
      App.mountMap(mapEl, avail.map(v => ({ lat: v.pickup.lat, lng: v.pickup.lng, label: validDates ? App.fmt.moneyCompact(App.quote(v, state.start, state.end).total) : money(v.pricePerNight), kind: 'van', title: v.name, html: App.mapCard.van(v, opts) }))).then(m => map = m);
    }
  };
  const clear = () => { App.go('#/search'); };
  // Keep the filter panel's inputs in step with chips
  const syncForm = () => {
    const set = (name, on) => { const x = form.querySelector(`[name="${name}"]`); if (x) x.checked = on; };
    ['instant', 'driver', 'delivery', 'auto', 'pets', 'family'].forEach(k => set(k, state[k]));
    form.querySelectorAll('[name=amen]').forEach(x => { x.checked = state.amen.includes(x.value); });
    form.querySelectorAll('[name=types]').forEach(x => { x.checked = state.types.includes(x.value); });
    form.guests.value = state.guests; form.max.value = state.max; form.maxRange.value = state.max;
  };
  const drawChips = (active) => {
    el.querySelector('#chips').innerHTML = String(h`${CHIPS.map(([id, label, icon, isOn]) => h`<button type="button" class="fchip ${isOn() ? 'on' : ''}" data-chip="${id}" aria-pressed="${isOn()}">${App.icon(icon)} ${label}</button>`)}`);
    el.querySelectorAll('[data-chip]').forEach(b => b.onclick = () => { const c = CHIPS.find(x => x[0] === b.dataset.chip); c[4](!c[3]()); App.track('filter_use', { filter: c[0], on: c[3]() }); syncForm(); draw(); });
    el.querySelector('#active-count').textContent = active ? `${App.plural(active, 'filter')} on` : '';
    el.querySelector('#chips-clear').hidden = !active;
  };
  // Nothing found: suggest nearby dates and other regions that have vans
  const noResults = (list, validDates) => {
    const tips = [];
    if (validDates && list.length) {
      const n = App.nightsBetween(state.start, state.end);
      for (const shift of [7, -7, 14, 21]) {
        const s = App.addDays(state.start, shift);
        if (s < App.today()) continue;
        const c = list.filter(v => App.isAvailable(v.id, s, App.addDays(s, n))).length;
        if (c) tips.push(h`<button type="button" class="btn btn-sm" data-shift="${shift}">${App.fmt.dateRange(s, App.addDays(s, n))} · ${App.plural(c, 'van')}</button>`);
        if (tips.length >= 3) break;
      }
    }
    // Same filters, other regions
    const regions = state.dest ? App.db.destinations.filter(d => d.id !== state.dest).map(d => [d, publishedVans().filter(v => App.searchMatches(v, { ...state, dest: d.id }) && (!validDates || App.isAvailable(v.id, state.start, state.end))).length]).filter(([, c]) => c).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
    return h`<div class="empty"><div class="empty-icon" aria-hidden="true">${App.icon('search')}</div><h3>No vans match that search</h3>
      <p class="muted">${list.length && validDates ? 'Every matching van is booked on those dates.' : 'Try removing a filter or two.'}</p>
      ${tips.length ? h`<p class="small"><strong>Free on nearby dates:</strong></p><div class="row gap wrap center-row">${tips}</div>` : ''}
      ${regions.length ? h`<p class="small"><strong>Or try another region:</strong></p><div class="row gap wrap center-row">${regions.map(([d, c]) => h`<button type="button" class="btn btn-sm btn-ghost" data-region="${d.id}">${d.name} · ${App.plural(c, 'van')}</button>`)}</div>` : ''}
      <p><button class="btn" id="clear2">Clear filters</button> <button type="button" class="btn btn-ghost" data-save-empty>${App.icon('bell')} Alert me when one frees up</button></p></div>`;
  };
  el.querySelector('#results').addEventListener('click', (e) => {
    const sh = e.target.closest('[data-shift]'), rg = e.target.closest('[data-region]');
    if (sh) { const n = App.nightsBetween(state.start, state.end); state.start = App.addDays(state.start, +sh.dataset.shift); state.end = App.addDays(state.start, n); dates.set(state.start, state.end, { silent: true }); draw(); }
    if (rg) { state.dest = rg.dataset.region; form.dest.value = state.dest; draw(); }
    if (e.target.closest('[data-save-empty]')) saveSearch();
  });
  const saveSearch = () => {
    const me = App.me();
    if (!me) return App.go('#/login?next=' + encodeURIComponent(location.hash.slice(1)));
    const params = location.hash.split('?')[1] || '';
    const s = App.api.saveSearch(params, state);
    App.toast(s.existing ? 'You already saved this search.' : 'Search saved. We’ll let you know when a matching van is free.', 'good');
  };
  el.querySelector('#save-search').onclick = saveSearch;
  el.querySelector('#chips-clear').onclick = clear;
  form.addEventListener('change', (e) => { if (e.target.name && !['start', 'end'].includes(e.target.name)) App.track('filter_use', { filter: e.target.name }); });
  form.addEventListener('input', (e) => {
    if (e.target.name === 'maxRange') form.max.value = e.target.value;
    if (e.target.name === 'max') form.maxRange.value = e.target.value;
    read(); draw();
  });
  const dates = App.dateRangeField(el.querySelector('#f-dates'), { start: state.start, end: state.end });
  el.querySelector('#clear-filters').onclick = clear;
  el.querySelector('#sort').onchange = (e) => { state.sort = e.target.value; draw(); };
  el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    state.view = b.dataset.view;
    el.querySelectorAll('[data-view]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    el.querySelector('#search-map').hidden = state.view !== 'map';
    draw();
  });
  const ft = el.querySelector('#filters-toggle');
  const panel = el.querySelector('#filters');
  const setFilters = (open) => {
    panel.classList.toggle('open', open); ft.setAttribute('aria-expanded', open);
    // On phones the panel is a full-screen sheet, so the page behind shouldn't scroll
    document.body.classList.toggle('no-scroll', open && window.innerWidth < 768);
    if (!open) ft.focus();
  };
  ft.onclick = () => setFilters(!panel.classList.contains('open'));
  el.querySelector('#filters-close').onclick = () => setFilters(false);
  el.querySelector('#filters-apply').onclick = () => { setFilters(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
  el.querySelector('#clear-filters-2').onclick = clear;
  window.addEventListener('hashchange', () => document.body.classList.remove('no-scroll'), { once: true });
  draw();
};

/* ================= MAP ================= */
App.pages.map = (el, _p, q) => {
  const show = { vans: q.layer !== 'dest', dests: q.layer !== 'vans', camps: true, dhaba: true, homestay: true, water: true };
  el.innerHTML = String(h`
    <div class="container search-top"><h1>Explore on the map</h1><p class="muted">Destinations, van pickup points and van-friendly campsites across India.</p>
      <div class="filter-row" role="group" aria-label="Map layers">
        <label class="check"><input type="checkbox" data-layer="dests" checked> <span class="map-pin map-pin-dest mini">Destinations</span></label>
        <label class="check"><input type="checkbox" data-layer="vans" checked> <span class="map-pin map-pin-van mini">Vans</span></label>
        <label class="check"><input type="checkbox" data-layer="camps" checked> <span class="map-pin map-pin-camp mini">${App.icon('tent')} Campsites</span></label>
        ${['dhaba', 'homestay', 'water'].map(t => h`<label class="check"><input type="checkbox" data-layer="${t}" checked> <span class="map-pin map-pin-camp mini">${App.icon(App.SPOT_TYPES[t][1])} ${App.SPOT_TYPES[t][0]}</span></label>`)}
      </div></div>
    <div class="container"><div class="map map-xl" id="full-map"></div></div>
    <div class="container section-tight"><h2 class="section-sub">All locations</h2><div class="loc-cols" id="loc-list"></div></div>`);
  let map;
  const draw = async () => {
    const markers = [];
    if (show.dests) App.db.destinations.forEach(d => markers.push({ lat: d.lat, lng: d.lng, label: d.name, kind: 'dest', title: d.name, html: App.mapCard.dest(d) }));
    if (show.vans) publishedVans().forEach(v => markers.push({ lat: v.pickup.lat, lng: v.pickup.lng, label: money(v.pricePerNight), kind: 'van', title: v.name, html: App.mapCard.van(v) }));
    if (show.camps) App.db.destinations.forEach(d => d.campsites.forEach(c => markers.push({ lat: c.lat, lng: c.lng, label: '⛺', kind: 'camp', title: c.name, html: App.mapCard.camp(c, d) })));
    App.db.destinations.forEach(d => (App.TRIP_GUIDES[d.id]?.spots || []).filter(s => show[s.type]).forEach(s => markers.push({ lat: s.lat, lng: s.lng, label: App.SPOT_TYPES[s.type][1], kind: 'camp', title: s.name, html: App.mapCard.spot(s, d) })));
    if (map) map.remove();
    const mEl = el.querySelector('#full-map'); mEl.innerHTML = '';
    map = await App.mountMap(mEl, markers);
    el.querySelector('#loc-list').innerHTML = String(h`${App.db.destinations.map(d => h`<div><h3><a href="#/destinations/${d.id}">${d.name}</a></h3><ul class="small">${publishedVans().filter(v => v.destinationId === d.id).map(v => h`<li>${App.icon('caravan')} <a href="#/vans/${v.id}">${v.name}</a> — ${v.pickup.city}</li>`)}${d.campsites.map(c => h`<li>${App.icon('tent')} ${c.name}</li>`)}</ul></div>`)}`);
  };
  el.querySelectorAll('[data-layer]').forEach(c => c.onchange = () => { show[c.dataset.layer] = c.checked; draw(); });
  draw();
};

/* ================= VAN DETAIL ================= */
App.pages.van = (el, { id }, q) => {
  const van = App.get.van(id);
  if (van) App.track('van_view', { van: id, dest: van.destinationId });
  const me = App.me();
  const isOwnerOrAdmin = me && (me.id === van?.ownerId || me.role === 'admin');
  if (!van || (van.status !== 'published' && !isOwnerOrAdmin)) return App.pages.notFound(el);
  van.views = (van.views || 0) + 1; App.save();
  const owner = App.get.user(van.ownerId);
  const dest = App.get.dest(van.destinationId);
  const reviews = App.get.reviewsFor(van.id);
  const r = App.get.rating(van.id);
  const cats = ['cleanliness', 'accuracy', 'communication', 'value'].map(k => [k, reviews.length ? reviews.reduce((s, x) => s + (x.categories?.[k] || x.rating), 0) / reviews.length : 0]);
  const policy = App.CANCELLATION_POLICIES[van.cancellation];
  const similar = publishedVans().filter(v => v.id !== van.id && (v.destinationId === van.destinationId || v.type === van.type)).slice(0, 3);
  const state = { start: q.start || '', end: q.end || '', adults: Math.min(2, van.sleeps), children: 0 };
  const ownerVans = App.db.vans.filter(v => v.ownerId === owner.id && v.status === 'published').length;

  el.innerHTML = String(h`
  <div class="container van-page">
    ${van.status !== 'published' ? h`<div class="alert alert-warn">Preview — this listing is <strong>${van.status.replace('_', ' ')}</strong> and not visible to travellers.</div>` : ''}
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/search">Vans</a> / ${dest ? h`<a href="#/destinations/${dest.id}">${dest.name}</a> / ` : ''}<span>${van.name}</span></nav>
    <div class="van-head">
      <div>
        <h1>${van.name}</h1>
        <div class="van-sub">${App.vanRating(van, { long: true })} · <span>${App.icon('map-pin')} ${van.pickup.city}${dest ? ', ' + dest.region : ''}</span> · ${App.verifiedBadge(van.ownerId)}</div>
      </div>
      <div class="row gap">
        <button class="btn btn-ghost" id="share">${App.icon('share')} Share</button>
        <button class="btn btn-ghost ${me && me.savedVans.includes(van.id) ? 'is-saved' : ''}" data-save="${van.id}" aria-pressed="${!!(me && me.savedVans.includes(van.id))}">♡ Save</button>
      </div>
    </div>
    <div class="gallery-wrap">
      <div class="gallery" id="gallery">
        ${van.photos.map((p, i) => h`<button class="g-item g-${i} ${i > 4 ? 'g-extra' : ''}" data-photo="${i}" aria-label="Open photo ${i + 1} of ${van.photos.length}: ${photoCaption(van, i)}">${App.img(p, { w: i === 0 ? 1200 : 700, alt: `${van.name}: ${photoCaption(van, i)}`, eager: i === 0, sizes: i === 0 ? '(min-width: 900px) 50vw, 100vw' : '(min-width: 900px) 25vw, 100vw' })}</button>`)}
      </div>
      <span class="g-count only-mobile" id="g-count" aria-hidden="true">1 / ${van.photos.length}</span>
      ${App.samplePhotos(van) ? h`<span class="g-note">Sample photos · demo listing</span>` : App.realPhotosBadge(van) ? h`<span class="g-note ok">${App.icon('camera')} Real photos verified</span>` : ''}
      <button class="btn btn-sm g-all" data-photo="0">▦ Show all ${van.photos.length} photos</button>
    </div>

    <div class="van-layout">
      <div class="van-main">
        <section class="block key-specs">
          <div><span class="ks-ic">${App.icon('bed-double')}</span><strong>Sleeps ${van.sleeps}</strong><span class="muted small">${van.beds}</span></div>
          <div><span class="ks-ic">${App.icon('armchair')}</span><strong>${van.seats} seats</strong><span class="muted small">with seat belts</span></div>
          <div><span class="ks-ic">${App.icon('cog')}</span><strong>${van.transmission}</strong><span class="muted small">${van.fuel} · ${van.mileage}</span></div>
          <div><span class="ks-ic">${App.icon('caravan')}</span><strong>${van.type}</strong><span class="muted small">${van.year} ${van.make}</span></div>
        </section>
        <section class="block owner-strip">
          ${App.avatar(owner, 52)}
          <div><strong>Hosted by ${owner.name}</strong><div class="muted small">${owner.business || ''} · ${App.plural(ownerVans, 'van')} · joined ${new Date(owner.createdAt).getFullYear()}</div>${responseLine(van.ownerId)}</div>
          <button class="btn btn-ghost" id="msg-owner">${App.icon('message-circle')} Message owner</button>
        </section>
        ${van.instantBook ? h`<div class="callout">${App.icon('zap')} <strong>Instant book</strong> — your booking is confirmed straight away, no waiting.</div>` : h`<div class="callout">${App.icon('clock')} <strong>Request to book</strong> — the owner responds within 24 hours. You're only charged if they accept.</div>`}
        ${trustPanel(van)}
        ${App.MOUNTAIN_REGIONS.includes(van.destinationId) ? h`<div class="callout promise-callout"><strong>${App.icon('mountain')} Mountain Promise included</strong> — if an official closure (landslide, pass closure, snow) blocks your route, change dates for free or take full credit. <a href="#/help/mountain-promise">How it works</a></div>` : ''}
        <section class="block"><h2>About this van</h2><p>${van.description}</p>${van.video ? h`<button type="button" class="btn btn-ghost" id="video-btn">${App.icon('camera')} Watch the video walkthrough</button>` : ''}</section>
        ${goodToKnow(van)}
        ${tripOptions(van)}
        <section class="block"><h2>Sleeping arrangements</h2>
          <div class="sleep-grid"><div class="sleep-card">${App.icon('bed-double')}<strong>Beds</strong><span>${van.beds}</span></div><div class="sleep-card">${App.icon('users')}<strong>Up to ${van.sleeps} people</strong><span>${van.familyFriendly ? 'Family friendly' : 'Best for adults'}</span></div>${van.amenities.includes('childseat') ? h`<div class="sleep-card">${App.icon('baby')}<strong>Child seats</strong><span>ISOFIX anchors fitted</span></div>` : ''}</div></section>
        <section class="block"><h2>What’s included</h2>
          <ul class="amen-list">${App.AMENITIES.map(a => h`<li class="${van.amenities.includes(a.id) ? '' : 'missing'}">${App.icon(a.icon)} ${van.amenities.includes(a.id) ? a.label : h`<s>${a.label}</s><span class="sr-only"> (not included)</span>`}</li>`)}</ul></section>
        <section class="block"><h2>Vehicle specifications</h2>
          <table class="spec-table"><tbody>
            ${[['Make & model', `${van.make} ${van.model}`], ['Year', van.year], ['Type', van.type], ['Length', van.length], ['Height', van.height || '—'], ['Fuel', `${van.fuel} (${van.mileage})`], ['Transmission', van.transmission], ['Licence needed', van.licence], ['Included distance', `${van.kmPerDay} km/day, then ${money(van.extraKmFee)}/km`], ['Minimum rental', App.plural(van.minNights, 'night')]].map(([k, v]) => h`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}
          </tbody></table></section>
        <section class="block" id="availability"><h2>Availability</h2><p class="muted small">Select your pickup and return dates.</p><div id="van-cal"></div></section>
        <section class="block"><h2>Pickup & return</h2>
          <p><strong>${van.pickup.city}</strong> · pickup from ${van.pickup.time}, return by ${van.pickup.returnTime}. <span class="muted">Exact address is shared after booking.</span></p>
          <div class="map map-sm" id="van-map"></div></section>
        <section class="block"><h2>House rules</h2><ul class="ticks">${van.rules.map(x => h`<li>${x}</li>`)}</ul></section>
        <section class="block"><h2>Cancellation policy: ${policy.label}</h2><p>${policy.summary}</p><p class="small muted">Plus a 24-hour grace period after booking for a full refund when your trip is at least 7 days away. <a href="#/help/cancellation">Full policy</a></p></section>
        <section class="block"><h2>Security deposit</h2><p>${money(van.deposit)} refundable with Basic protection — less with Standard (${money(App.quote(van, App.today(), App.addDays(App.today(), 1), { protection: 'standard' }).deposit)}) or Premium (${money(App.quote(van, App.today(), App.addDays(App.today(), 1), { protection: 'premium' }).deposit)}). Pay it by UPI and get it back automatically within ${App.C.depositReleaseDays} days of return, hold it on a credit card at pickup, or choose zero-deposit at checkout.</p></section>
        <section class="block" id="reviews"><h2>${r.count >= App.C.minReviewsForRating ? h`★ ${r.avg.toFixed(1)} · ${App.plural(r.count, 'review')}` : r.count ? `Reviews (${r.count})` : 'Reviews'}</h2>
          ${r.count && r.count < App.C.minReviewsForRating ? h`<p class="small muted">This van is new on VanYatra, so we don’t show an average yet. ${App.get.hostRating(van.ownerId).count >= App.C.minReviewsForRating ? h`Its host is rated ★ ${App.get.hostRating(van.ownerId).avg.toFixed(1)} across ${App.plural(App.get.hostRating(van.ownerId).count, 'review')} of their vans.` : ''}</p>` : ''}
          ${r.count ? h`${r.count >= App.C.minReviewsForRating ? h`<div class="rating-bars">${cats.map(([k, v]) => h`<div><span>${k[0].toUpperCase() + k.slice(1)}</span><span class="bar-track"><span style="width:${v / 5 * 100}%"></span></span><span>${v.toFixed(1)}</span></div>`)}</div>` : ''}
            <div class="review-list">${reviews.slice(0, 6).map(rv => { const a = App.get.user(rv.authorId); return h`<article class="review">${App.avatar(a, 40)}<div><strong>${a?.name || 'Traveller'}</strong><div class="muted small">${fmtDate(rv.createdAt)} · <span aria-label="${rv.rating} out of 5">${'★'.repeat(rv.rating)}</span>${App.get.verifiedStay(rv) ? h` · <span class="verified-stay" title="Written after a completed VanYatra booking">✓ Verified stay</span>` : ''}</div><p>${rv.text}</p>${rv.ownerReply ? h`<div class="reply"><strong>Response from ${owner.name}</strong><p>${rv.ownerReply}</p></div>` : ''}</div></article>`; })}</div>`
          : h`<p class="muted">No reviews yet — be the first to take this van on the road.</p>`}
        </section>
      </div>

      <aside class="van-aside">
        <div class="card booking-card" id="booking-card"></div>
        <p class="small muted center">${App.icon('shield-check')} Report this listing? <a href="#/help/support?topic=listing&van=${van.id}">Contact trust & safety</a></p>
      </aside>
    </div>

    ${similar.length ? h`<section class="section"><h2>Similar vans</h2><div class="van-grid">${similar.map(v => App.vanCard(v, state.start && state.end ? { start: state.start, end: state.end } : {}))}</div></section>` : ''}
  </div>
  <div class="mobile-book-bar" id="mobile-bar"></div>`);

  const card = el.querySelector('#booking-card');
  const drawCard = () => {
    const valid = state.start && state.end && state.end > state.start;
    const nights = valid ? App.nightsBetween(state.start, state.end) : 0;
    const qte = valid ? App.quote(van, state.start, state.end) : null;
    const ok = valid && App.isAvailable(van.id, state.start, state.end);
    const tooShort = valid && nights < van.minNights;
    const guests = state.adults + state.children;
    const refocus = document.activeElement?.closest?.('#bc-dates');
    card.innerHTML = String(h`
      <div class="bc-price"><strong>${money(van.pricePerNight)}</strong> <span class="muted">/ night</span>${van.weekendPrice > van.pricePerNight ? h`<span class="small muted"> · ${money(van.weekendPrice)} Fri–Sat</span>` : ''}</div>
      <div class="bc-range" id="bc-dates"></div>
      ${van.minNights > 1 ? h`<p class="small muted bc-min">Minimum stay ${App.fmt.nights(van.minNights)}</p>` : ''}
      <div class="bc-guests">
        <label><span>Adults</span><input type="number" id="bc-adults" min="1" max="${van.sleeps}" value="${state.adults}"></label>
        <label><span>Children</span><input type="number" id="bc-children" min="0" max="${van.sleeps - 1}" value="${state.children}"></label>
      </div>
      ${guests > van.sleeps ? h`<p class="error">This van sleeps up to ${van.sleeps}.</p>` : ''}
      ${valid && !ok ? h`<p class="error">Some of those nights are booked. See the calendar for open dates.</p>` : ''}
      ${tooShort ? h`<p class="error">Minimum rental is ${App.plural(van.minNights, 'night')}.</p>` : ''}
      <button class="btn btn-accent btn-block btn-lg" id="book-btn" ${!valid || !ok || tooShort || guests > van.sleeps || van.status !== 'published' ? 'disabled' : ''}>${van.instantBook ? h`${App.icon('zap')} Book now` : 'Request to book'}</button>
      <p class="center small muted">${valid ? 'You won’t be charged yet' : 'Select dates to see the total price'}</p>
      ${qte ? h`${App.priceLines(qte)}<button type="button" class="link small" data-price-van="${van.id}" data-start="${state.start}" data-end="${state.end}">See full price breakdown</button>` : ''}`);
    el.querySelector('#mobile-bar').innerHTML = String(h`<div><strong>${qte ? money(qte.total) : money(van.pricePerNight) + ' / night'}</strong><div class="small muted">${valid ? `${App.fmt.dateRange(state.start, state.end)}` : 'Add dates'}</div></div><a class="btn btn-accent" href="#booking-card" id="mb-go">${valid && ok && !tooShort ? 'Reserve · ' + money(qte.total) : 'Check dates'}</a>`);
    const range = App.dateRangeField(card.querySelector('#bc-dates'), { start: state.start, end: state.end, vanId: van.id, minNights: van.minNights, onChange: (s, e) => { state.start = s; state.end = e; cal.set(s, e); drawCard(); } });
    if (refocus) card.querySelector('#bc-dates .drf-btn').focus();
    // Phone bar: pick dates first, then go straight to checkout
    el.querySelector('#mb-go').onclick = (e) => { e.preventDefault(); if (valid && ok && !tooShort) card.querySelector('#book-btn').click(); else { card.scrollIntoView({ behavior: 'instant', block: 'center' }); range.open(); } };
    card.querySelector('#bc-adults').onchange = (e) => { state.adults = Math.max(1, +e.target.value); drawCard(); };
    card.querySelector('#bc-children').onchange = (e) => { state.children = Math.max(0, +e.target.value); drawCard(); };
    card.querySelector('#book-btn').onclick = () => App.go(`#/book/${van.id}?start=${state.start}&end=${state.end}&adults=${state.adults}&children=${state.children}`);
  };
  const cal = App.calendar(el.querySelector('#van-cal'), { vanId: van.id, start: state.start, end: state.end, onChange: (s, e) => { state.start = s; state.end = e || ''; drawCard(); } });
  drawCard();

  el.querySelectorAll('[data-photo]').forEach(b => b.onclick = () => openLightbox(van, +b.dataset.photo));
  // Photo counter for the swipeable carousel on phones
  const gal = el.querySelector('#gallery'), gc = el.querySelector('#g-count');
  gal.addEventListener('scroll', () => {
    const item = gal.querySelector('.g-item');
    if (item) gc.textContent = `${Math.min(van.photos.length, Math.round(gal.scrollLeft / (item.clientWidth + 8)) + 1)} / ${van.photos.length}`;
  }, { passive: true });
  el.querySelector('#share').onclick = async () => {
    const url = location.href;
    try { if (navigator.share) await navigator.share({ title: van.name, url }); else { await navigator.clipboard.writeText(url); App.toast('Link copied', 'good'); } } catch (e) { /* user cancelled */ }
  };
  const vb = el.querySelector('#video-btn');
  // The player is only loaded when asked for (no third-party requests on page load)
  if (vb) vb.onclick = () => App.modal({ title: `${van.name} · video walkthrough`, wide: true, body: h`<div class="video-frame"><iframe src="${van.video}" title="Video walkthrough of ${van.name}" allow="fullscreen; picture-in-picture" loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>` });
  el.querySelector('#msg-owner').onclick = () => {
    if (!App.me()) return App.go('#/login?next=' + encodeURIComponent('/vans/' + van.id));
    if (App.me().id === van.ownerId) return App.toast('This is your own listing.');
    const t = App.api.startThread(van.id);
    App.go('#/account/messages/' + t.id);
  };
  App.mountMap(el.querySelector('#van-map'), [], { center: [van.pickup.lat, van.pickup.lng], zoom: 12, circle: { lat: van.pickup.lat, lng: van.pickup.lng, radius: 1500 } });
};

// How quickly the host replies, from their message history
const responseLine = (ownerId) => {
  const r = App.get.ownerResponse(ownerId);
  if (!r) return h`<div class="small muted">Hosts reply to booking requests within 24 hours</div>`;
  const m = r.minutes, time = m == null ? '' : m < 60 ? 'within an hour' : m < 180 ? 'within a few hours' : m < 1440 ? 'within a day' : 'in a day or more';
  return h`<div class="small">${App.icon('message-circle')} Usually responds ${time} · ${r.rate}% response rate</div>`;
};
// Practical facts for nervous drivers and route planning
const goodToKnow = (van) => {
  const fit = App.vanFit(van);
  const dests = fit.good.map(id => App.get.dest(id)).filter(Boolean);
  return h`<section class="block"><h2>Good to know</h2>
    <ul class="gtk">
      <li>${App.icon('car')}<div><strong>Size: ${van.length || '—'} long${van.height ? ', ' + van.height + ' high' : ''}</strong><span class="small muted">Watch for low bridges, height barriers at car parks and narrow old-town lanes.</span></div></li>
      <li>${App.icon('fuel')}<div><strong>${van.fuel}${van.mileage ? ' · about ' + van.mileage : ''}</strong><span class="small muted">${van.fuel === 'Diesel' ? 'Fuel up in towns before remote stretches: fuel stations can be 100+ km apart in the mountains.' : 'Plan refuelling in towns before remote stretches.'}</span></div></li>
      <li>${App.icon('shield-check')}<div><strong>${van.licence}</strong><span class="small muted">The main driver must be ${App.C.minDriverAge}+ and bring the original licence to pickup.${App.driverFor(van) ? ' Or book it with a driver.' : ''}</span></div></li>
      ${fit.notes.map(n => h`<li>${App.icon('info')}<div><span>${n}</span></div></li>`)}
    </ul>
    <p class="small"><strong>Best for:</strong> ${dests.map((d, i) => h`${i ? ', ' : ''}<a href="#/destinations/${d.id}">${d.name}</a>`)}</p>
  </section>`;
};
// What can be added to a trip with this van (chosen at checkout)
const tripOptions = (van) => {
  const drv = App.driverFor(van), addOns = App.addOnsFor(van), pk = App.kmPackagesFor(van);
  return h`<section class="block"><h2>Trip options</h2>
    <div class="opt-cards">
      ${drv ? h`<div class="opt-card">${App.icon('user')}<strong>With a driver</strong><span class="small muted">${money(drv.feePerDay + drv.bataPerDay)}/day incl. bata · verified licence${drv.languages?.length ? ' · ' + drv.languages.join(', ') : ''}</span></div>` : ''}
      ${van.delivery?.points?.length ? h`<div class="opt-card">${App.icon('plane')}<strong>Delivery</strong><span class="small muted">${van.delivery.points.map(p => p.name).join(' · ')}</span></div>` : ''}
      ${van.delivery?.oneWay?.length ? h`<div class="opt-card">${App.icon('route')}<strong>One-way</strong><span class="small muted">Drop off in ${van.delivery.oneWay.map(o => `${o.name} (${money(o.fee)})`).join(', ')}</span></div>` : ''}
      <div class="opt-card">${App.icon('gauge')}<strong>Distance</strong><span class="small muted">${pk.map(p => p.perNight ? `${p.label} +${money(p.perNight)}/night` : `${p.label} included`).join(' · ')}</span></div>
      <div class="opt-card">${App.icon('shield-check')}<strong>Protection</strong><span class="small muted">${App.PROTECTION.map(p => `${p.label} ${p.perNight ? '+' + money(p.perNight) + '/night' : 'included'}`).join(' · ')}</span></div>
    </div>
    ${addOns.length ? h`<p class="small"><strong>Extras:</strong> ${addOns.map(a => `${a.label} ${money(a.price)}${a.perNight ? '/night' : ''}`).join(' · ')}</p>` : ''}
  </section>`;
};

// What VanYatra has verified for this van (summary computed by the backend rules)
const trustPanel = (van) => {
  const t = van.trust;
  if (!t) return '';
  const until = (x) => (x?.validUntil ? `valid until ${fmtDate(x.validUntil)}` : 'verified');
  const src = (x) => (x?.source ? h` <span class="source-tag">${x.source}</span>` : '');
  const items = [
    [t.ownerVerified, 'Host identity verified', 'Aadhaar via DigiLocker and PAN, plus bank account'],
    [!!t.ownership, 'Vehicle ownership checked', t.ownership && t.ownership !== 'Checked by VanYatra' ? t.ownership : 'Registration certificate matched to the host'],
    [!!t.rc, 'Registration (RC)', t.rc && until(t.rc), t.rc],
    [!!t.insurance, 'Commercial insurance', t.insurance && until(t.insurance), t.insurance],
    [!!t.puc, 'Pollution certificate (PUC)', t.puc && until(t.puc), t.puc],
    [!!t.inspection, 'Safety inspection passed', t.inspection && until(t.inspection), t.inspection],
    ...(t.permit ? [[true, 'All India Tourist Permit', until(t.permit), t.permit]] : [])
  ];
  return h`<section class="block trust-panel" aria-labelledby="trust-h">
    <h2 id="trust-h">${App.icon('shield-check')} Verified by VanYatra</h2>
    <ul class="trust-list">${items.map(([ok, label, detail, x]) => h`<li class="${ok ? 'ok' : 'wait'}"><span class="ti" aria-hidden="true">${ok ? '✓' : '…'}</span><div><strong>${label}</strong><span class="small muted">${ok ? detail : 'Being checked'}</span>${ok && x ? src(x) : ''}</div></li>`)}</ul>
    ${t.lastChecked ? h`<p class="small muted">Last checked ${fmtDate(t.lastChecked)}. Listings pause automatically if a document expires.</p>` : h`<p class="small muted">Listings pause automatically if a document expires.</p>`}
  </section>`;
};

const openLightbox = (van, start) => {
  let i = start;
  App.modal({
    title: `${van.name} · photos`, wide: true,
    body: h`<div class="lightbox"><img id="lb-img" src="${photo(van.photos[i], 1400)}" alt=""><div class="lb-nav"><button class="btn" id="lb-prev" aria-label="Previous photo">‹ Prev</button><span id="lb-count"></span><button class="btn" id="lb-next" aria-label="Next photo">Next ›</button></div></div>`,
    onMount: (m) => {
      const show = () => { m.querySelector('#lb-img').src = photo(van.photos[i], 1400); m.querySelector('#lb-img').alt = `${van.name}: ${photoCaption(van, i)}`; m.querySelector('#lb-count').textContent = `${i + 1} / ${van.photos.length} · ${photoCaption(van, i)}`; };
      m.querySelector('#lb-prev').onclick = () => { i = (i - 1 + van.photos.length) % van.photos.length; show(); };
      m.querySelector('#lb-next').onclick = () => { i = (i + 1) % van.photos.length; show(); };
      m.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') m.querySelector('#lb-prev').click(); if (e.key === 'ArrowRight') m.querySelector('#lb-next').click(); });
      show();
    }
  });
};
})();
