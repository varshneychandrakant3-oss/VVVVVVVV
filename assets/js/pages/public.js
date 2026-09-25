/*
 * Public pages: home, destinations, destination detail, search, map, van detail.
 */
(() => {
const { h, money, photo, fmtDate } = App;

const publishedVans = () => App.db.vans.filter(v => v.status === 'published');

/* Shared search form used on home and destination pages */
const searchForm = (q = {}, compact = false) => h`
  <form class="search-form ${compact ? 'compact' : ''}" id="search-form" role="search" aria-label="Find a camper van">
    <label class="sf-field sf-dest"><span>Where to?</span>
      <select name="dest">
        <option value="">Anywhere in India</option>
        ${App.db.destinations.map(d => h`<option value="${d.id}" ${q.dest === d.id ? 'selected' : ''}>${d.name}</option>`)}
      </select></label>
    <label class="sf-field"><span>Pickup</span><input type="date" name="start" min="${App.today()}" value="${q.start || ''}"></label>
    <label class="sf-field"><span>Return</span><input type="date" name="end" min="${App.today()}" value="${q.end || ''}"></label>
    <label class="sf-field sf-small"><span>Travellers</span>
      <select name="guests">${[1, 2, 3, 4, 5, 6].map(n => h`<option value="${n}" ${+q.guests === n || (!q.guests && n === 2) ? 'selected' : ''}>${n}${n === 6 ? '+' : ''}</option>`)}</select></label>
    <label class="sf-field"><span>Van type</span>
      <select name="type"><option value="">Any type</option>${App.VAN_TYPES.map(t => h`<option ${q.type === t ? 'selected' : ''}>${t}</option>`)}</select></label>
    <button class="btn btn-accent btn-lg" type="submit"><span aria-hidden="true">🔍</span> Search vans</button>
  </form>`;

const bindSearchForm = (el) => {
  const f = el.querySelector('#search-form');
  if (!f) return;
  f.start.addEventListener('change', () => { f.end.min = f.start.value ? App.addDays(f.start.value, 1) : App.today(); if (f.end.value && f.end.value <= f.start.value) f.end.value = App.addDays(f.start.value, 3); });
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
      <div class="dest-meta"><span>🗓 ${d.bestTime}</span><span>🚐 ${App.plural(count, 'van')}</span>${d.familyScore >= 5 ? h`<span>👨‍👩‍👧 Great for families</span>` : ''}</div>
    </div></a>`;
};

/* ================= HOME ================= */
App.pages.home = (el) => {
  const vans = publishedVans();
  const featured = [...vans].sort((a, b) => App.get.rating(b.id).avg - App.get.rating(a.id).avg).slice(0, 6);
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
      <div><span class="trust-ic">🪪</span><h3>Verified owners</h3><p>Government ID, vehicle ownership and legal permits checked by our team.</p></div>
      <div><span class="trust-ic">🛡️</span><h3>Insured & inspected</h3><p>Commercial insurance and a 10-point safety inspection before any van goes live.</p></div>
      <div><span class="trust-ic">💳</span><h3>Secure payments</h3><p>Pay on VanYatra only. Owners are paid after pickup; deposits are held, not spent.</p></div>
      <div><span class="trust-ic">📞</span><h3>24×7 support</h3><p>Roadside assistance and a real human on the phone, day or night.</p></div>
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
  App.mountMap(el.querySelector('#home-map'), App.db.destinations.map(d => ({ lat: d.lat, lng: d.lng, label: d.name, kind: 'dest', html: h`<strong>${d.name}</strong><br>${d.tagline}<br><a href="#/destinations/${d.id}">Explore →</a>` })));
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
          <div class="months" aria-label="Best months">${monthNames.map((m, i) => h`<span class="${d.bestMonths.includes(i + 1) ? 'on' : ''}" title="${new Date(2000, i).toLocaleString('en', { month: 'long' })}">${m}</span>`)}</div></div>
        <div class="fact"><span class="muted small">Family suitability</span><strong>${'★'.repeat(d.familyScore)}${'☆'.repeat(5 - d.familyScore)} <span class="sr-only">${d.familyScore} of 5</span></strong><p class="small">${d.familyNotes}</p></div>
      </section>
      <section class="block"><h2>Highlights</h2><ul class="ticks">${d.highlights.map(x => h`<li>${x}</li>`)}</ul></section>
      <section class="block"><h2>Suggested road trips</h2>
        <div class="route-grid">${d.routes.map(r => h`<article class="route"><h3>${r.name}</h3><div class="route-meta"><span>🗓 ${r.days} days</span><span>🛣 ${r.km} km</span></div><p>${r.desc}</p><a class="link-arrow" href="#/search?dest=${d.id}">Find a van for this route →</a></article>`)}</div>
      </section>
      <section class="block"><h2>Top attractions</h2><div class="chip-row">${d.attractions.map(a => h`<span class="chip">📍 ${a}</span>`)}</div></section>
      <section class="block"><h2>Things to do</h2><div class="chip-row">${d.activities.map(a => h`<span class="chip">${a}</span>`)}</div></section>
      <section class="block"><h2>Photos</h2><div class="photo-strip">${d.gallery.map(g => h`<img src="${photo(g, 600)}" alt="${d.name} scenery" loading="lazy">`)}</div></section>
      <section class="block"><h2>Nearby campsites</h2>
        <div class="map map-md" id="dest-map"></div>
        <ul class="camp-list">${d.campsites.map(c => h`<li><strong>${c.name}</strong> <span class="badge badge-muted">${c.type}</span><div class="small muted">${c.facilities.join(' · ')}</div></li>`)}</ul>
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
    ...d.campsites.map(c => ({ lat: c.lat, lng: c.lng, label: '⛺', kind: 'camp', title: c.name, html: h`<strong>${c.name}</strong><br>${c.type}<br><small>${c.facilities.join(', ')}</small>` })),
    ...vans.map(v => ({ lat: v.pickup.lat, lng: v.pickup.lng, label: money(v.pricePerNight), kind: 'van', html: h`<strong>${v.name}</strong><br>${v.type}<br><a href="#/vans/${v.id}">View van →</a>` }))
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
    sort: q.sort || 'recommended', view: q.view || 'list'
  };
  el.innerHTML = String(h`
  <div class="container search-top">
    <h1>${state.dest ? h`Camper vans for ${App.get.dest(state.dest)?.name || 'your trip'}` : 'Find your camper van'}</h1>
    <p class="muted" id="result-count"></p>
  </div>
  <div class="container search-layout">
    <button class="btn btn-ghost filters-toggle" id="filters-toggle" aria-expanded="false" aria-controls="filters">⚙ Filters</button>
    <aside class="filters" id="filters" aria-label="Filters">
      <form id="filter-form">
        <label class="field"><span>Destination</span><select name="dest"><option value="">Anywhere</option>${App.db.destinations.map(d => h`<option value="${d.id}" ${state.dest === d.id ? 'selected' : ''}>${d.name}</option>`)}</select></label>
        <div class="grid-2">
          <label class="field"><span>Pickup</span><input type="date" name="start" min="${App.today()}" value="${state.start}"></label>
          <label class="field"><span>Return</span><input type="date" name="end" min="${App.today()}" value="${state.end}"></label>
        </div>
        <label class="field"><span>Travellers</span><input type="number" name="guests" min="1" max="8" value="${state.guests}"></label>
        <fieldset class="field"><legend>Price per night</legend>
          <div class="grid-2"><label class="small">Min<input type="number" name="min" step="500" min="0" value="${state.min}"></label><label class="small">Max<input type="number" name="max" step="500" min="0" value="${state.max}"></label></div>
          <input type="range" name="maxRange" min="2000" max="${maxP}" step="500" value="${state.max}" aria-label="Maximum price per night">
        </fieldset>
        <fieldset class="field"><legend>Van type</legend>${App.VAN_TYPES.map(t => h`<label class="check"><input type="checkbox" name="types" value="${t}" ${state.types.includes(t) ? 'checked' : ''}> ${t}</label>`)}</fieldset>
        <fieldset class="field"><legend>Good to know</legend>
          <label class="check"><input type="checkbox" name="family" ${state.family ? 'checked' : ''}> 👨‍👩‍👧 Family friendly</label>
          <label class="check"><input type="checkbox" name="pets" ${state.pets ? 'checked' : ''}> 🐾 Pet friendly</label>
          <label class="check"><input type="checkbox" name="instant" ${state.instant ? 'checked' : ''}> ⚡ Instant book</label>
          <label class="check"><input type="checkbox" name="auto" ${state.auto ? 'checked' : ''}> Automatic transmission</label>
        </fieldset>
        <fieldset class="field"><legend>Amenities</legend><div class="amen-grid">${App.AMENITIES.filter(a => a.id !== 'pets').map(a => h`<label class="check"><input type="checkbox" name="amen" value="${a.id}" ${state.amen.includes(a.id) ? 'checked' : ''}> ${a.label}</label>`)}</div></fieldset>
        <button type="button" class="btn btn-ghost btn-block" id="clear-filters">Clear all filters</button>
      </form>
    </aside>
    <section class="results">
      <div class="results-bar">
        <div class="seg" role="group" aria-label="View">
          <button class="${state.view === 'list' ? 'on' : ''}" data-view="list" aria-pressed="${state.view === 'list'}">☰ List</button>
          <button class="${state.view === 'map' ? 'on' : ''}" data-view="map" aria-pressed="${state.view === 'map'}">🗺 Map</button>
        </div>
        <label class="field inline"><span class="sr-only">Sort by</span><select id="sort">
          ${[['recommended', 'Recommended'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['rating', 'Top rated'], ['sleeps', 'Sleeps most']].map(([v, l]) => h`<option value="${v}" ${state.sort === v ? 'selected' : ''}>${l}</option>`)}
        </select></label>
      </div>
      <div class="map map-lg" id="search-map" ${state.view === 'map' ? '' : 'hidden'}></div>
      <div id="results"></div>
    </section>
  </div>`);

  const form = el.querySelector('#filter-form');
  const read = () => {
    const f = App.formData(form);
    Object.assign(state, {
      dest: f.dest, start: f.start, end: f.end, guests: +f.guests || 1, min: +f.min || 0, max: +f.max || maxP,
      types: [].concat(f.types || []), amen: [].concat(f.amen || []), family: !!f.family, pets: !!f.pets, instant: !!f.instant, auto: !!f.auto
    });
  };
  let map = null;
  const draw = () => {
    const validDates = state.start && state.end && state.end > state.start;
    let list = publishedVans().filter(v =>
      (!state.dest || v.destinationId === state.dest) && v.sleeps >= state.guests &&
      v.pricePerNight >= state.min && v.pricePerNight <= state.max &&
      (!state.types.length || state.types.includes(v.type)) &&
      state.amen.every(a => v.amenities.includes(a)) &&
      (!state.family || v.familyFriendly) && (!state.pets || v.petFriendly) && (!state.instant || v.instantBook) && (!state.auto || v.transmission === 'Automatic'));
    const avail = validDates ? list.filter(v => App.isAvailable(v.id, state.start, state.end)) : list;
    const sorters = {
      recommended: (a, b) => (App.get.rating(b.id).avg * 10 + (b.instantBook ? 5 : 0)) - (App.get.rating(a.id).avg * 10 + (a.instantBook ? 5 : 0)),
      price_asc: (a, b) => a.pricePerNight - b.pricePerNight, price_desc: (a, b) => b.pricePerNight - a.pricePerNight,
      rating: (a, b) => App.get.rating(b.id).avg - App.get.rating(a.id).avg, sleeps: (a, b) => b.sleeps - a.sleeps
    };
    avail.sort(sorters[state.sort]);
    const unavailable = list.filter(v => !avail.includes(v));
    el.querySelector('#result-count').textContent = `${App.plural(avail.length, 'van')} available${validDates ? ` · ${fmtDate(state.start)} – ${fmtDate(state.end)}` : ''}`;
    const opts = validDates ? { start: state.start, end: state.end } : {};
    el.querySelector('#results').innerHTML = String(avail.length
      ? h`<div class="van-grid">${avail.map(v => App.vanCard(v, opts))}</div>
          ${unavailable.length ? h`<h3 class="section-sub">Booked for your dates</h3><div class="van-grid dim">${unavailable.map(v => App.vanCard(v, opts))}</div>` : ''}`
      : App.emptyState('🔎', 'No vans match those filters', 'Try widening your price range, changing dates or removing some amenities.', h`<button class="btn" id="clear2">Clear filters</button>`));
    const c2 = el.querySelector('#clear2'); if (c2) c2.onclick = clear;
    // Keep filters in the URL (shareable) without re-rendering the page
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ dest: state.dest, start: state.start, end: state.end, guests: state.guests > 1 ? state.guests : '', type: state.types.join(','), min: state.min || '', max: state.max < maxP ? state.max : '', amen: state.amen.join(','), family: state.family ? 1 : '', pets: state.pets ? 1 : '', instant: state.instant ? 1 : '', auto: state.auto ? 1 : '', sort: state.sort !== 'recommended' ? state.sort : '', view: state.view !== 'list' ? state.view : '' })) if (v) params.set(k, v);
    history.replaceState(null, '', '#/search' + (params.toString() ? '?' + params : ''));
    if (state.view === 'map') {
      const mapEl = el.querySelector('#search-map');
      if (map) { map.remove(); map = null; }
      mapEl.innerHTML = '';
      App.mountMap(mapEl, avail.map(v => ({ lat: v.pickup.lat, lng: v.pickup.lng, label: money(v.pricePerNight), kind: 'van', title: v.name, html: h`<img src="${photo(v.photos[0], 300)}" alt="" class="popup-img"><strong>${v.name}</strong><br>${v.type} · sleeps ${v.sleeps}<br><a href="#/vans/${v.id}">View van →</a>` }))).then(m => map = m);
    }
  };
  const clear = () => { App.go('#/search'); };
  form.addEventListener('input', (e) => {
    if (e.target.name === 'maxRange') form.max.value = e.target.value;
    if (e.target.name === 'max') form.maxRange.value = e.target.value;
    if (e.target.name === 'start' && form.start.value) { form.end.min = App.addDays(form.start.value, 1); if (form.end.value && form.end.value <= form.start.value) form.end.value = ''; }
    read(); draw();
  });
  el.querySelector('#clear-filters').onclick = clear;
  el.querySelector('#sort').onchange = (e) => { state.sort = e.target.value; draw(); };
  el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => {
    state.view = b.dataset.view;
    el.querySelectorAll('[data-view]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    el.querySelector('#search-map').hidden = state.view !== 'map';
    draw();
  });
  const ft = el.querySelector('#filters-toggle');
  ft.onclick = () => { const open = el.querySelector('#filters').classList.toggle('open'); ft.setAttribute('aria-expanded', open); };
  draw();
};

/* ================= MAP ================= */
App.pages.map = (el, _p, q) => {
  const show = { vans: q.layer !== 'dest', dests: q.layer !== 'vans', camps: true };
  el.innerHTML = String(h`
    <div class="container search-top"><h1>Explore on the map</h1><p class="muted">Destinations, van pickup points and van-friendly campsites across India.</p>
      <div class="filter-row" role="group" aria-label="Map layers">
        <label class="check"><input type="checkbox" data-layer="dests" checked> <span class="map-pin map-pin-dest mini">Destinations</span></label>
        <label class="check"><input type="checkbox" data-layer="vans" checked> <span class="map-pin map-pin-van mini">Vans</span></label>
        <label class="check"><input type="checkbox" data-layer="camps" checked> <span class="map-pin map-pin-camp mini">⛺ Campsites</span></label>
      </div></div>
    <div class="container"><div class="map map-xl" id="full-map"></div></div>
    <div class="container section-tight"><h2 class="section-sub">All locations</h2><div class="loc-cols" id="loc-list"></div></div>`);
  let map;
  const draw = async () => {
    const markers = [];
    if (show.dests) App.db.destinations.forEach(d => markers.push({ lat: d.lat, lng: d.lng, label: d.name, kind: 'dest', html: h`<img src="${photo(d.hero, 300)}" alt="" class="popup-img"><strong>${d.name}</strong><br>Best: ${d.bestTime}<br><a href="#/destinations/${d.id}">Explore →</a>` }));
    if (show.vans) publishedVans().forEach(v => markers.push({ lat: v.pickup.lat, lng: v.pickup.lng, label: money(v.pricePerNight), kind: 'van', html: h`<img src="${photo(v.photos[0], 300)}" alt="" class="popup-img"><strong>${v.name}</strong><br>${v.type} · sleeps ${v.sleeps}<br><a href="#/vans/${v.id}">View van →</a>` }));
    if (show.camps) App.db.destinations.forEach(d => d.campsites.forEach(c => markers.push({ lat: c.lat, lng: c.lng, label: '⛺', kind: 'camp', title: c.name, html: h`<strong>${c.name}</strong><br>${c.type} near ${d.name}<br><small>${c.facilities.join(', ')}</small>` })));
    if (map) map.remove();
    const mEl = el.querySelector('#full-map'); mEl.innerHTML = '';
    map = await App.mountMap(mEl, markers);
    el.querySelector('#loc-list').innerHTML = String(h`${App.db.destinations.map(d => h`<div><h3><a href="#/destinations/${d.id}">${d.name}</a></h3><ul class="small">${publishedVans().filter(v => v.destinationId === d.id).map(v => h`<li>🚐 <a href="#/vans/${v.id}">${v.name}</a> — ${v.pickup.city}</li>`)}${d.campsites.map(c => h`<li>⛺ ${c.name}</li>`)}</ul></div>`)}`);
  };
  el.querySelectorAll('[data-layer]').forEach(c => c.onchange = () => { show[c.dataset.layer] = c.checked; draw(); });
  draw();
};

/* ================= VAN DETAIL ================= */
App.pages.van = (el, { id }, q) => {
  const van = App.get.van(id);
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
        <div class="van-sub">${App.stars(r.avg, r.count)} · <span>📍 ${van.pickup.city}${dest ? ', ' + dest.region : ''}</span> · ${App.verifiedBadge(van.ownerId)}</div>
      </div>
      <div class="row gap">
        <button class="btn btn-ghost" id="share">↗ Share</button>
        <button class="btn btn-ghost ${me && me.savedVans.includes(van.id) ? 'is-saved' : ''}" data-save="${van.id}" aria-pressed="${!!(me && me.savedVans.includes(van.id))}">♡ Save</button>
      </div>
    </div>
    <div class="gallery" id="gallery">
      ${van.photos.slice(0, 5).map((p, i) => h`<button class="g-item g-${i}" data-photo="${i}" aria-label="Open photo ${i + 1} of ${van.photos.length}"><img src="${photo(p, i === 0 ? 1200 : 600)}" alt="${van.name} photo ${i + 1}" ${i ? h`loading="lazy"` : ''}></button>`)}
      <button class="btn btn-sm g-all" data-photo="0">▦ Show all ${van.photos.length} photos</button>
    </div>

    <div class="van-layout">
      <div class="van-main">
        <section class="block key-specs">
          <div><span class="ks-ic">🛏</span><strong>Sleeps ${van.sleeps}</strong><span class="muted small">${van.beds}</span></div>
          <div><span class="ks-ic">💺</span><strong>${van.seats} seats</strong><span class="muted small">with seat belts</span></div>
          <div><span class="ks-ic">⚙️</span><strong>${van.transmission}</strong><span class="muted small">${van.fuel} · ${van.mileage}</span></div>
          <div><span class="ks-ic">🚐</span><strong>${van.type}</strong><span class="muted small">${van.year} ${van.make}</span></div>
        </section>
        <section class="block owner-strip">
          ${App.avatar(owner, 52)}
          <div><strong>Hosted by ${owner.name}</strong><div class="muted small">${owner.business || ''} · ${App.plural(ownerVans, 'van')} · joined ${new Date(owner.createdAt).getFullYear()}</div></div>
          <button class="btn btn-ghost" id="msg-owner">💬 Message owner</button>
        </section>
        ${van.instantBook ? h`<div class="callout">⚡ <strong>Instant book</strong> — your booking is confirmed straight away, no waiting.</div>` : h`<div class="callout">🕑 <strong>Request to book</strong> — the owner responds within 24 hours. You're only charged if they accept.</div>`}
        <section class="block"><h2>About this van</h2><p>${van.description}</p></section>
        <section class="block"><h2>Sleeping arrangements</h2>
          <div class="sleep-grid"><div class="sleep-card">🛏<strong>Beds</strong><span>${van.beds}</span></div><div class="sleep-card">👨‍👩‍👧<strong>Up to ${van.sleeps} people</strong><span>${van.familyFriendly ? 'Family friendly' : 'Best for adults'}</span></div>${van.amenities.includes('childseat') ? h`<div class="sleep-card">👶<strong>Child seats</strong><span>ISOFIX anchors fitted</span></div>` : ''}</div></section>
        <section class="block"><h2>What’s included</h2>
          <ul class="amen-list">${App.AMENITIES.map(a => h`<li class="${van.amenities.includes(a.id) ? '' : 'missing'}"><span aria-hidden="true">${a.icon}</span> ${van.amenities.includes(a.id) ? a.label : h`<s>${a.label}</s><span class="sr-only"> (not included)</span>`}</li>`)}</ul></section>
        <section class="block"><h2>Vehicle specifications</h2>
          <table class="spec-table"><tbody>
            ${[['Make & model', `${van.make} ${van.model}`], ['Year', van.year], ['Type', van.type], ['Length', van.length], ['Fuel', `${van.fuel} (${van.mileage})`], ['Transmission', van.transmission], ['Licence needed', van.licence], ['Included distance', `${van.kmPerDay} km/day, then ${money(van.extraKmFee)}/km`], ['Minimum rental', App.plural(van.minNights, 'night')]].map(([k, v]) => h`<tr><th scope="row">${k}</th><td>${v}</td></tr>`)}
          </tbody></table></section>
        <section class="block" id="availability"><h2>Availability</h2><p class="muted small">Select your pickup and return dates.</p><div id="van-cal"></div></section>
        <section class="block"><h2>Pickup & return</h2>
          <p><strong>${van.pickup.city}</strong> · pickup from ${van.pickup.time}, return by ${van.pickup.returnTime}. <span class="muted">Exact address is shared after booking.</span></p>
          <div class="map map-sm" id="van-map"></div></section>
        <section class="block"><h2>House rules</h2><ul class="ticks">${van.rules.map(x => h`<li>${x}</li>`)}</ul></section>
        <section class="block"><h2>Cancellation policy: ${policy.label}</h2><p>${policy.summary}</p><p class="small muted">Plus a 24-hour grace period after booking for a full refund when your trip is at least 7 days away. <a href="#/help/cancellation">Full policy</a></p></section>
        <section class="block"><h2>Security deposit</h2><p>${money(van.deposit)} is held on your card at pickup and released within ${App.C.depositReleaseDays} days of return if there's no damage. Add Damage Cover at checkout to reduce your liability.</p></section>
        <section class="block" id="reviews"><h2>${r.count ? h`★ ${r.avg.toFixed(1)} · ${App.plural(r.count, 'review')}` : 'Reviews'}</h2>
          ${r.count ? h`<div class="rating-bars">${cats.map(([k, v]) => h`<div><span>${k[0].toUpperCase() + k.slice(1)}</span><span class="bar-track"><span style="width:${v / 5 * 100}%"></span></span><span>${v.toFixed(1)}</span></div>`)}</div>
            <div class="review-list">${reviews.slice(0, 6).map(rv => { const a = App.get.user(rv.authorId); return h`<article class="review">${App.avatar(a, 40)}<div><strong>${a?.name || 'Traveller'}</strong><div class="muted small">${fmtDate(rv.createdAt)} · ${'★'.repeat(rv.rating)}</div><p>${rv.text}</p>${rv.ownerReply ? h`<div class="reply"><strong>Response from ${owner.name}</strong><p>${rv.ownerReply}</p></div>` : ''}</div></article>`; })}</div>`
          : h`<p class="muted">No reviews yet — be the first to take this van on the road.</p>`}
        </section>
      </div>

      <aside class="van-aside">
        <div class="card booking-card" id="booking-card"></div>
        <p class="small muted center">🛡️ Report this listing? <a href="#/help/support?topic=listing&van=${van.id}">Contact trust & safety</a></p>
      </aside>
    </div>

    ${similar.length ? h`<section class="section"><h2>Similar vans</h2><div class="van-grid">${similar.map(v => App.vanCard(v))}</div></section>` : ''}
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
    card.innerHTML = String(h`
      <div class="bc-price"><strong>${money(van.pricePerNight)}</strong> <span class="muted">/ night</span>${van.weekendPrice > van.pricePerNight ? h`<span class="small muted"> · ${money(van.weekendPrice)} Fri–Sat</span>` : ''}</div>
      <div class="bc-dates">
        <label><span>Pickup</span><input type="date" id="bc-start" min="${App.today()}" value="${state.start}"></label>
        <label><span>Return</span><input type="date" id="bc-end" min="${state.start ? App.addDays(state.start, 1) : App.today()}" value="${state.end}"></label>
      </div>
      <div class="bc-guests">
        <label><span>Adults</span><input type="number" id="bc-adults" min="1" max="${van.sleeps}" value="${state.adults}"></label>
        <label><span>Children</span><input type="number" id="bc-children" min="0" max="${van.sleeps - 1}" value="${state.children}"></label>
      </div>
      ${guests > van.sleeps ? h`<p class="error">This van sleeps up to ${van.sleeps}.</p>` : ''}
      ${valid && !ok ? h`<p class="error">Some of those nights are booked. See the calendar for open dates.</p>` : ''}
      ${tooShort ? h`<p class="error">Minimum rental is ${App.plural(van.minNights, 'night')}.</p>` : ''}
      <button class="btn btn-accent btn-block btn-lg" id="book-btn" ${!valid || !ok || tooShort || guests > van.sleeps || van.status !== 'published' ? 'disabled' : ''}>${van.instantBook ? '⚡ Book now' : 'Request to book'}</button>
      <p class="center small muted">${valid ? 'You won’t be charged yet' : 'Select dates to see the total price'}</p>
      ${qte ? h`<dl class="price-lines">
        <div><dt>${money(qte.avgNight)} × ${App.plural(nights, 'night')}</dt><dd>${money(qte.base)}</dd></div>
        ${qte.discount ? h`<div class="good"><dt>${qte.discountPct}% ${nights >= 28 ? 'monthly' : 'weekly'} discount</dt><dd>−${money(qte.discount)}</dd></div>` : ''}
        <div><dt>Cleaning fee</dt><dd>${money(qte.cleaning)}</dd></div>
        <div><dt>Service fee <button class="info-btn" type="button" title="Covers 24×7 support, secure payments and insurance administration" aria-label="About the service fee">ⓘ</button></dt><dd>${money(qte.service)}</dd></div>
        <div><dt>${App.C.taxLabel} (${Math.round(App.C.taxRate * 100)}%)</dt><dd>${money(qte.tax)}</dd></div>
        <div class="total"><dt>Total</dt><dd>${money(qte.total)}</dd></div>
        <div class="muted"><dt>Refundable security deposit (held)</dt><dd>${money(qte.deposit)}</dd></div>
      </dl>` : ''}`);
    el.querySelector('#mobile-bar').innerHTML = String(h`<div><strong>${qte ? money(qte.total) : money(van.pricePerNight) + ' / night'}</strong><div class="small muted">${valid ? `${fmtDate(state.start)} – ${fmtDate(state.end)}` : 'Add dates'}</div></div><a class="btn btn-accent" href="#booking-card" id="mb-go">${valid ? 'Reserve' : 'Check dates'}</a>`);
    el.querySelector('#mb-go').onclick = (e) => { e.preventDefault(); card.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    const sync = () => { state.start = card.querySelector('#bc-start').value; state.end = card.querySelector('#bc-end').value; if (state.end && state.end <= state.start) state.end = ''; cal.set(state.start, state.end); drawCard(); };
    card.querySelector('#bc-start').onchange = sync;
    card.querySelector('#bc-end').onchange = sync;
    card.querySelector('#bc-adults').onchange = (e) => { state.adults = Math.max(1, +e.target.value); drawCard(); };
    card.querySelector('#bc-children').onchange = (e) => { state.children = Math.max(0, +e.target.value); drawCard(); };
    card.querySelector('#book-btn').onclick = () => App.go(`#/book/${van.id}?start=${state.start}&end=${state.end}&adults=${state.adults}&children=${state.children}`);
  };
  const cal = App.calendar(el.querySelector('#van-cal'), { vanId: van.id, start: state.start, end: state.end, onChange: (s, e) => { state.start = s; state.end = e || ''; drawCard(); } });
  drawCard();

  el.querySelectorAll('[data-photo]').forEach(b => b.onclick = () => openLightbox(van, +b.dataset.photo));
  el.querySelector('#share').onclick = async () => {
    const url = location.href;
    try { if (navigator.share) await navigator.share({ title: van.name, url }); else { await navigator.clipboard.writeText(url); App.toast('Link copied', 'good'); } } catch (e) { /* user cancelled */ }
  };
  el.querySelector('#msg-owner').onclick = () => {
    if (!App.me()) return App.go('#/login?next=' + encodeURIComponent('/vans/' + van.id));
    if (App.me().id === van.ownerId) return App.toast('This is your own listing.');
    const t = App.api.startThread(van.id);
    App.go('#/account/messages/' + t.id);
  };
  App.mountMap(el.querySelector('#van-map'), [], { center: [van.pickup.lat, van.pickup.lng], zoom: 12, circle: { lat: van.pickup.lat, lng: van.pickup.lng, radius: 1500 } });
};

const openLightbox = (van, start) => {
  let i = start;
  App.modal({
    title: `${van.name} · photos`, wide: true,
    body: h`<div class="lightbox"><img id="lb-img" src="${photo(van.photos[i], 1400)}" alt=""><div class="lb-nav"><button class="btn" id="lb-prev" aria-label="Previous photo">‹ Prev</button><span id="lb-count"></span><button class="btn" id="lb-next" aria-label="Next photo">Next ›</button></div></div>`,
    onMount: (m) => {
      const show = () => { m.querySelector('#lb-img').src = photo(van.photos[i], 1400); m.querySelector('#lb-img').alt = `${van.name} photo ${i + 1}`; m.querySelector('#lb-count').textContent = `${i + 1} / ${van.photos.length}`; };
      m.querySelector('#lb-prev').onclick = () => { i = (i - 1 + van.photos.length) % van.photos.length; show(); };
      m.querySelector('#lb-next').onclick = () => { i = (i + 1) % van.photos.length; show(); };
      m.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') m.querySelector('#lb-prev').click(); if (e.key === 'ArrowRight') m.querySelector('#lb-next').click(); });
      show();
    }
  });
};
})();
