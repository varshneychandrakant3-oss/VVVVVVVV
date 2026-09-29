/*
 * Deals (#/deals and #/deals/:campaign): last-minute, early-bird and long-stay
 * offers set by owners, seasonal campaigns, and referral credits.
 */
(() => {
const { h } = App;

// Seasonal campaigns. Festival dates are listed per year; others follow months.
App.CAMPAIGNS = [
  { id: 'diwali', title: 'Diwali road trips', icon: 'sparkles', blurb: 'Take the long weekend on the road: lights in Jaipur and Udaipur, quiet Goa beaches, or the Kerala hills.',
    dests: ['rajasthan', 'goa', 'kerala', 'coorg'], windows: { 2026: ['2026-11-06', '2026-11-11'], 2027: ['2027-10-27', '2027-11-01'] } },
  { id: 'winter-rajasthan', title: 'Winter in Rajasthan', icon: 'sun', blurb: 'Cool, clear days from November to February: forts, stepwells and desert camps under the stars.',
    dests: ['rajasthan'], months: [11, 12, 1, 2] },
  { id: 'summer-himalaya', title: 'Summer in the Himalaya', icon: 'mountain', blurb: 'The high roads to Ladakh and Spiti open from June: lakes, monasteries and passes above 5,000 m.',
    dests: ['ladakh', 'spiti', 'himachal'], months: [6, 7, 8, 9] },
  { id: 'monsoon-kerala', title: 'Monsoon magic in Kerala & Coorg', icon: 'droplets', blurb: 'Green, misty and quiet — waterfalls at full flow, and lower prices on many vans.',
    dests: ['kerala', 'coorg', 'meghalaya'], months: [7, 8, 9] }
];

// The next dates a campaign applies to, as a sample trip
const campaignDates = (c) => {
  const today = App.today(), y = +today.slice(0, 4);
  if (c.windows) {
    const w = Object.values(c.windows).find(([, e]) => e >= today);
    return w ? { start: w[0] < today ? App.addDays(today, 1) : w[0], end: w[1] } : null;
  }
  for (let add = 0; add < 24; add++) {
    const d = new Date(y, +today.slice(5, 7) - 1 + add, 10);
    if (!c.months.includes(d.getMonth() + 1)) continue;
    // Late in the month already: start a few days from now, if that's still in season
    const s = App.iso(d) >= today ? App.iso(d) : App.addDays(today, 5);
    if (c.months.includes(+s.slice(5, 7))) return { start: s, end: App.addDays(s, 5) };
  }
  return null;
};
App.campaignDates = campaignDates;

// A sample trip for a van that gets its deal: the first free dates that qualify
const sampleTrip = (v, kind) => {
  const nights = Math.max(v.minNights, kind === 'long' ? 7 : 3);
  const from = kind === 'last' ? 1 : kind === 'early' ? v.earlyBird.days + 7 : 20;
  const to = kind === 'last' ? v.lastMinute.days : from + 60;
  for (let o = from; o <= to; o++) {
    const s = App.addDays(App.today(), o), e = App.addDays(s, nights);
    if (App.isAvailable(v.id, s, e)) return { start: s, end: e };
  }
  return null;
};

// Badge text for a van's best offer (for given dates, or in general)
App.dealBadge = (v, start, end) => {
  if (start && end) { const q = App.quote(v, start, end); return q.discountPct ? `−${q.discountPct}% ${q.discountKind === 'lastMinute' ? 'last-minute' : q.discountKind === 'earlyBird' ? 'early-bird' : 'long stay'}` : ''; }
  if (v.lastMinute) return `Last-minute −${v.lastMinute.pct}%`;
  if (v.earlyBird) return `Early-bird −${v.earlyBird.pct}%`;
  return '';
};

App.pages.deals = (el, { id }) => {
  const pub = App.db.vans.filter(v => v.status === 'published');
  const card = (v, t) => t ? App.vanCard(v, t) : '';
  const c = id && App.CAMPAIGNS.find(x => x.id === id);
  if (id && !c) return App.pages.notFound(el);
  if (c) {
    const dates = campaignDates(c);
    const vans = pub.filter(v => c.dests.includes(v.destinationId) && (!dates || App.isAvailable(v.id, dates.start, dates.end)));
    el.innerHTML = String(h`<div class="container section">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/deals">Deals</a> / <span>${c.title}</span></nav>
      <p class="eyebrow">${App.icon(c.icon)} Seasonal pick</p><h1>${c.title}</h1><p class="lead muted">${c.blurb}</p>
      ${dates ? h`<p><strong>Next dates:</strong> ${App.fmt.dateRange(dates.start, dates.end)} · <a href="#/search?start=${dates.start}&end=${dates.end}">search all vans for these dates</a></p>` : ''}
      <div class="chip-row">${c.dests.map(d => h`<a class="chip" href="#/destinations/${d}">${App.get.dest(d)?.name}</a>`)}</div>
      ${vans.length ? h`<div class="van-grid">${vans.map(v => card(v, dates || {}))}</div>` : App.emptyState('🔎', 'Nothing free for those dates yet', 'Try the search with nearby dates.', h`<a class="btn" href="#/search">Search vans</a>`)}
    </div>`);
    return;
  }
  const last = pub.filter(v => v.lastMinute).map(v => [v, sampleTrip(v, 'last')]).filter(([, t]) => t).slice(0, 6);
  const early = pub.filter(v => v.earlyBird).map(v => [v, sampleTrip(v, 'early')]).filter(([, t]) => t).slice(0, 6);
  const long = pub.filter(v => (v.discounts?.weekly || 0) >= 10).map(v => [v, sampleTrip(v, 'long')]).filter(([, t]) => t).slice(0, 3);
  const me = App.me();
  el.innerHTML = String(h`<div class="container section">
    <p class="eyebrow">Deals</p><h1>Road-trip deals</h1><p class="lead muted">Offers set by owners, shown with the full trip price — the discount is already included.</p>
    <div class="campaigns">${App.CAMPAIGNS.map(x => { const d = campaignDates(x); return h`<a class="campaign card" href="#/deals/${x.id}">${App.icon(x.icon, { size: 28 })}<strong>${x.title}</strong><span class="small muted">${d ? App.fmt.dateRange(d.start, d.end) : ''}</span></a>`; })}</div>
    <section class="block"><h2>${App.icon('zap')} Last-minute</h2><p class="small muted">Leaving within the next week or so.</p>
      ${last.length ? h`<div class="van-grid">${last.map(([v, t]) => card(v, t))}</div>` : h`<p class="muted">No last-minute deals right now.</p>`}</section>
    <section class="block"><h2>${App.icon('calendar-days')} Book early, save</h2><p class="small muted">For trips booked well ahead.</p>
      ${early.length ? h`<div class="van-grid">${early.map(([v, t]) => card(v, t))}</div>` : h`<p class="muted">No early-bird deals right now.</p>`}</section>
    <section class="block"><h2>${App.icon('route')} Long stays</h2><p class="small muted">7 nights or more — weekly and monthly discounts.</p>
      ${long.length ? h`<div class="van-grid">${long.map(([v, t]) => card(v, t))}</div>` : ''}</section>
    <section class="card refer-promo"><h2>${App.icon('users')} Give ${App.money(App.C.referralCredit)}, get ${App.money(App.C.referralCredit)}</h2>
      <p>Invite a friend: they get ${App.money(App.C.referralCredit)} off their first trip, and you get ${App.money(App.C.referralCredit)} credit when they book.</p>
      <a class="btn btn-primary" href="${me ? '#/account/payments' : '#/login?next=%2Faccount%2Fpayments'}">Get your invite link</a></section>
  </div>`);
};
})();
