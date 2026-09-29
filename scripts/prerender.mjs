#!/usr/bin/env node
// Pre-renders pages search engines can read (the app itself uses #/ routes, which
// aren't indexed). Each page is a copy of index.html with its own title, description,
// canonical and Open Graph tags, JSON-LD, and readable content in <main>; when the
// app starts it shows the same screen (the route is on <html data-route>).
//
//   node scripts/prerender.mjs            writes vans/, destinations/, help/, guide/, deals/,
//                                        sitemap.xml, robots.txt and 404.html
//   SITE_URL=https://example.com/ node scripts/prerender.mjs
//
// Content comes from the same scripts the app runs (loaded with small stand-ins for
// browser objects), so it matches what visitors see.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SITE = (process.env.SITE_URL || pkg.homepage || 'http://localhost:8080/').replace(/\/?$/, '/');
const OUT_DIRS = ['vans', 'destinations', 'help', 'guide', 'deals'];

/* ---------- Load the app's data and content in a sandbox ---------- */
const noop = () => {};
const el = () => ({ addEventListener: noop, append: noop, appendChild: noop, remove: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [] });
const store = new Map();
const ctx = {
  console, setTimeout, clearTimeout, URL, URLSearchParams, Intl, Date, Math, JSON,
  document: { ...el(), documentElement: el(), body: el(), head: el(), getElementById: () => null, createElement: el, hidden: true },
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), key: () => null, get length() { return 0; } },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  location: { hash: '', href: SITE, protocol: 'https:', origin: new URL(SITE).origin, pathname: new URL(SITE).pathname },
  navigator: { onLine: true, userAgent: 'prerender' }, history: { replaceState: noop, scrollRestoration: 'auto' },
  matchMedia: () => ({ matches: false, addEventListener: noop }), addEventListener: noop, fetch: () => Promise.reject(new Error('offline'))
};
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="(assets\/js\/[^"]+)"(?: defer)?><\/script>/g)].map(m => m[1]).filter(s => !/\/(app|pwa|boot)\.js$/.test(s));
for (const f of scripts) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const App = ctx.App;
App.db = App.buildSeed();
App.me = () => null;

/* ---------- Helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const img = (id, w = 1200) => (!id ? '' : id.startsWith('photo-') ? `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=70` : '');
const money = (n) => App.fmt.money(n);
const pages = [];
const page = ({ url, route, title, description, image, jsonld = [], body, crumbs = [] }) => pages.push({ url, route, title, description, image, jsonld, body, crumbs });
const breadcrumbs = (items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map(([name, u], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + u })) });
const published = App.db.vans.filter(v => v.status === 'published');

/* ---------- Pages ---------- */
// Destinations
page({
  url: 'destinations/', route: '#/destinations', title: 'Camper van road trips across India',
  description: 'Ladakh, Spiti, Goa, Kerala, Rajasthan and more: best seasons, suggested routes, campsites and verified camper vans for each region.',
  image: img(App.db.destinations[0].hero),
  body: `<h1>Camper van road trips across India</h1><ul>${App.db.destinations.map(d => `<li><a href="destinations/${d.id}/">${esc(d.name)}</a> — ${esc(d.tagline)} (best ${esc(d.bestTime)})</li>`).join('')}</ul>`,
  jsonld: [breadcrumbs([['Home', ''], ['Destinations', 'destinations/']])]
});
for (const d of App.db.destinations) {
  const g = App.TRIP_GUIDES[d.id], vans = published.filter(v => v.destinationId === d.id);
  page({
    url: `destinations/${d.id}/`, route: `#/destinations/${d.id}`, title: `${d.name} by camper van — routes, best time & vans`,
    description: `${d.tagline}. Best time: ${d.bestTime}. ${vans.length} verified camper vans, suggested routes with day-by-day plans, permits and campsites.`,
    image: img(d.hero),
    body: `<nav aria-label="Breadcrumb"><a href="destinations/">Destinations</a> / ${esc(d.name)}</nav><h1>${esc(d.name)}</h1><p>${esc(d.tagline)}</p>
      <p><strong>Best time:</strong> ${esc(d.bestTime)}. ${esc(d.familyNotes)}</p>
      <h2>Highlights</h2><ul>${d.highlights.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <h2>Suggested road trips</h2>${d.routes.map(r => `<h3>${esc(r.name)}</h3><p>${r.days} days · about ${App.fmt.km(r.km)}. ${esc(r.desc)}</p>${(g?.plans?.[r.name] || []).length ? `<ol>${g.plans[r.name].map(x => `<li>${esc(x.from === x.to ? x.from : `${x.from} → ${x.to}`)}${x.km ? ` (${App.fmt.km(x.km)}, about ${x.hours} h)` : ''}${x.note ? ': ' + esc(x.note) : ''}</li>`).join('')}</ol>` : ''}`).join('')}
      ${g ? `<h2>Before you go</h2><p>${esc(g.practical.altitude)}</p><p>${esc(g.practical.fuel)}</p><p>${esc(g.practical.roads)}</p>` : ''}
      <h2>Camper vans for ${esc(d.name)}</h2><ul>${vans.map(v => `<li><a href="vans/${v.id}/">${esc(v.name)}</a> — ${esc(v.type)}, sleeps ${v.sleeps}, from ${money(v.pricePerNight)}/night</li>`).join('')}</ul>`,
    jsonld: [{ '@context': 'https://schema.org', '@type': 'TouristDestination', name: d.name, description: d.tagline, url: SITE + `destinations/${d.id}/`, image: img(d.hero), geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng }, touristType: ['Families', 'Road trippers'] },
      breadcrumbs([['Home', ''], ['Destinations', 'destinations/'], [d.name, `destinations/${d.id}/`]])]
  });
}
// Vans
for (const v of published) {
  const d = App.get.dest(v.destinationId), r = App.get.rating(v.id), owner = App.get.user(v.ownerId);
  const amen = App.AMENITIES.filter(a => v.amenities.includes(a.id)).map(a => a.label);
  const product = {
    '@context': 'https://schema.org', '@type': 'Product', name: v.name, description: v.description, image: v.photos.map(p => img(p)).filter(Boolean),
    category: 'Camper van rental', brand: { '@type': 'Brand', name: 'VanYatra' },
    offers: { '@type': 'Offer', url: SITE + `vans/${v.id}/`, priceCurrency: 'INR', price: v.pricePerNight, availability: 'https://schema.org/InStock',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: v.pricePerNight, priceCurrency: 'INR', unitText: 'night' } }
  };
  if (r.count >= App.C.minReviewsForRating) product.aggregateRating = { '@type': 'AggregateRating', ratingValue: +r.avg.toFixed(1), reviewCount: r.count, bestRating: 5 };
  page({
    url: `vans/${v.id}/`, route: `#/vans/${v.id}`, title: `${v.name} — ${v.type} for hire in ${v.pickup.city}`,
    description: `${v.type} in ${v.pickup.city}${d ? ', ' + d.name : ''}: sleeps ${v.sleeps}, ${v.transmission.toLowerCase()}, ${v.fuel.toLowerCase()}. From ${money(v.pricePerNight)} a night with verified owner, insurance and 24×7 roadside help.`,
    image: img(v.photos[0]),
    body: `<nav aria-label="Breadcrumb"><a href="destinations/${d?.id}/">${esc(d?.name)}</a> / ${esc(v.name)}</nav>
      <h1>${esc(v.name)}</h1><p>${esc(v.type)} · ${esc(v.pickup.city)} · hosted by ${esc(owner?.name)}${r.count >= App.C.minReviewsForRating ? ` · ★ ${r.avg.toFixed(1)} from ${r.count} reviews` : ''}</p>
      <p>${esc(v.description)}</p>
      <ul><li>Sleeps ${v.sleeps} (${esc(v.beds)}), ${v.seats} seats</li><li>${esc(v.transmission)}, ${esc(v.fuel)}${v.mileage ? ', about ' + esc(v.mileage) : ''}</li><li>Length ${esc(v.length)}${v.height ? ', height ' + esc(v.height) : ''}</li><li>From ${money(v.pricePerNight)} a night (${money(v.weekendPrice)} Fri–Sat), ${App.fmt.km(v.kmPerDay)} a day included</li><li>Minimum ${App.fmt.nights(v.minNights)}; refundable deposit ${money(v.deposit)}</li></ul>
      <h2>What’s included</h2><p>${amen.map(esc).join(', ')}</p>
      <p><a href="#/vans/${v.id}">Check availability and book</a></p>`,
    jsonld: [product, breadcrumbs([['Home', ''], [d?.name || 'Vans', `destinations/${d?.id}/`], [v.name, `vans/${v.id}/`]])]
  });
}
// Help, policies, FAQ, guide, deals
page({ url: 'help/', route: '#/help', title: 'Help centre', description: 'Answers about booking a camper van in India: licences, prices, deposits, cancellations, safety and permits.',
  body: `<h1>Help centre</h1><ul><li><a href="help/faq/">Frequently asked questions</a></li>${Object.entries(App.POLICY).map(([id, [t]]) => `<li><a href="help/${id}/">${esc(t)}</a></li>`).join('')}<li><a href="guide/">First-timer’s guide</a></li></ul>` });
page({ url: 'help/faq/', route: '#/help/faq', title: 'Frequently asked questions', description: 'Licences, what’s included in the price, instant book, deposits, cancellations, pets and more.',
  body: `<h1>Frequently asked questions</h1>${App.FAQ.map(([sec, items]) => `<h2>${esc(sec)}</h2>${items.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}`).join('')}`,
  jsonld: [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: App.FAQ.flatMap(([, items]) => items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } }))) }] });
for (const [id, [t, body]] of Object.entries(App.POLICY)) {
  const text = String(body).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  page({ url: `help/${id}/`, route: `#/help/${id}`, title: t, description: text.slice(0, 155), body: `<h1>${esc(t)}</h1>${String(body)}` });
}
page({ url: 'guide/', route: '#/guide', title: 'Van life in India: a first-timer’s guide', description: 'Is van life legal in India, where to park overnight, toilets and showers, cooking, safety for families and solo women, and driving a camper.',
  body: `<h1>Van life in India, simply explained</h1>${App.GUIDE.map(([, t, b]) => `<h2>${esc(t)}</h2>${String(b)}`).join('')}` });
page({ url: 'deals/', route: '#/deals', title: 'Camper van deals: last-minute, early-bird and long stays', description: 'Last-minute and early-bird camper van offers across India, long-stay discounts and seasonal picks like winter in Rajasthan.',
  body: `<h1>Road-trip deals</h1><ul>${App.CAMPAIGNS.map(c => `<li>${esc(c.title)} — ${esc(c.blurb)}</li>`).join('')}</ul>` });

/* ---------- Write ---------- */
for (const d of OUT_DIRS) fs.rmSync(path.join(ROOT, d), { recursive: true, force: true });
const baseTemplate = html.replace(/<main id="main"[^>]*>[\s\S]*?<\/main>/, '<main id="main" tabindex="-1">%MAIN%</main>');
const siteName = 'VanYatra — Camper van rentals in India';
for (const p of pages) {
  const depth = p.url.split('/').filter(Boolean).length;
  const base = '../'.repeat(depth);
  const canonical = SITE + p.url;
  const head = [
    `<base href="${base}">`,
    `<link rel="canonical" href="${canonical}">`,
    `<meta property="og:type" content="website">`, `<meta property="og:site_name" content="VanYatra">`,
    `<meta property="og:title" content="${esc(p.title)}">`, `<meta property="og:description" content="${esc(p.description)}">`, `<meta property="og:url" content="${canonical}">`,
    p.image ? `<meta property="og:image" content="${esc(p.image)}">` : '', `<meta name="twitter:card" content="summary_large_image">`,
    ...p.jsonld.map(j => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`)
  ].filter(Boolean).join('\n  ');
  const out = baseTemplate
    .replace('<html lang="en-IN">', `<html lang="en-IN" data-route="${esc(p.route)}">`)
    .replace('<meta charset="utf-8">', `<meta charset="utf-8">\n  <!-- Generated by scripts/prerender.mjs from the app's data; don't edit by hand. -->\n  ${head}`)
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)} · ${esc(siteName)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(p.description)}">`)
    .replace('%MAIN%', `<div class="container section prerendered">${p.body}</div>`);
  const file = path.join(ROOT, p.url, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
}
// Sitemap, robots and a 404 that sends clean links (e.g. /vans/v1) into the app
const urls = ['', ...pages.map(p => p.url)];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${SITE}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: ${new URL(SITE).pathname}#/account\nSitemap: ${SITE}sitemap.xml\n`);
fs.writeFileSync(path.join(ROOT, '404.html'), `<!doctype html>
<html lang="en-IN"><head><meta charset="utf-8"><title>VanYatra</title><meta name="robots" content="noindex">
<!-- Generated by scripts/prerender.mjs. GitHub Pages serves this for unknown paths: send them to the app's route. -->
<script src="${new URL(SITE).pathname}assets/js/redirect.js"></script></head>
<body><p>Taking you to VanYatra… <a href="${new URL(SITE).pathname}">Continue</a></p></body></html>
`);
console.log(`Pre-rendered ${pages.length} pages for ${SITE} (+ sitemap.xml, robots.txt, 404.html)`);
