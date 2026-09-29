/*
 * App shell: header, footer, notifications and hash router with role guards.
 */
window.App = window.App || {};
App.pages = App.pages || {};

const ROUTES = [
  ['/', 'home'],
  ['/destinations', 'destinations'],
  ['/destinations/:id', 'destination'],
  ['/search', 'search'],
  ['/map', 'map'],
  ['/vans/:id', 'van'],
  // Guests can price a trip; checkout asks them to sign in at the driver step
  ['/book/:id', 'book'],
  ['/booking/:id/confirmed', 'bookingConfirmed', ['customer', 'owner', 'admin']],
  ['/login', 'login'],
  ['/signup', 'signup'],
  ['/verify', 'verifyContact', ['customer', 'owner', 'admin']],
  ['/account', 'account', ['customer', 'owner', 'admin']],
  ['/account/:tab', 'account', ['customer', 'owner', 'admin']],
  ['/account/:tab/:id', 'account', ['customer', 'owner', 'admin']],
  ['/list-your-van', 'ownerLanding'],
  ['/owner/onboarding', 'onboarding', ['owner']],
  ['/digilocker-demo', 'digilockerDemo', ['customer', 'owner', 'admin']],
  ['/owner', 'owner', ['owner']],
  ['/owner/:tab', 'owner', ['owner']],
  ['/owner/:tab/:id', 'owner', ['owner']],
  ['/admin', 'admin', ['admin']],
  ['/admin/:tab', 'admin', ['admin']],
  ['/admin/:tab/:id', 'admin', ['admin']],
  ['/trip/:id/checkin', 'checkin', ['customer', 'owner', 'admin']],
  ['/trip/:id/memories', 'memories', ['customer', 'owner', 'admin']],
  ['/trip/:id/inspection/:phase', 'inspection', ['customer', 'owner', 'admin']],
  ['/plan', 'planner'],
  ['/deals', 'deals'],
  ['/deals/:id', 'deals'],
  ['/guide', 'guide'],
  ['/help', 'help'],
  ['/help/:topic', 'help']
];

App.parseHash = () => {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const parts = path.split('/').filter(Boolean);
  for (const [pattern, page, roles] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    if (pp.every((p, i) => p.startsWith(':') ? (params[p.slice(1)] = decodeURIComponent(parts[i]), true) : p === parts[i])) {
      return { page, params, query, roles, path: raw };
    }
  }
  return { page: 'notFound', params: {}, query, path: raw };
};

App.go = (hash) => { if (location.hash === hash) App.render(); else location.hash = hash; };

App.render = () => {
  const route = App.parseHash();
  const me = App.me();
  const main = document.getElementById('main');
  if (route.roles) {
    if (!me) { location.replace('#/login?next=' + encodeURIComponent(route.path)); return; }
    if (!route.roles.includes(me.role)) {
      App.renderHeader();
      main.innerHTML = String(App.emptyState('🔒', 'You don’t have access to this page', `This area is for ${route.roles.join(' / ')} accounts. You are signed in as a ${me.role}.`, App.h`<a class="btn btn-primary" href="#/">Go home</a>`));
      return;
    }
  }
  App.renderHeader();
  main.innerHTML = '';
  main.className = 'page page-' + route.page;
  const fn = App.pages[route.page] || App.pages.notFound;
  App.track('page_view', { page: route.page });
  try { fn(main, route.params, route.query); }
  catch (e) { console.error(e); main.innerHTML = String(App.emptyState('⚠️', 'Something went wrong', e.message, App.h`<a class="btn" href="#/">Go home</a>`)); }
  if (!App._keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
  App._keepScroll = false;
  App.closeMenu && App.closeMenu();
  App.renderTabbar(route);
  App.renderTripBar();
  // Keep the current dashboard section visible in the swipeable pill row
  const dnav = main.querySelector('.dash-nav nav'), act = dnav && dnav.querySelector('a.active');
  if (act) dnav.scrollLeft = act.offsetLeft - dnav.clientWidth / 2 + act.clientWidth / 2;
  const h1 = main.querySelector('h1');
  document.title = (h1 ? h1.innerText.replace(/\s+/g, ' ').trim() + ' · ' : '') + 'VanYatra — Camper van rentals in India';
  App.setMeta(route, main);
};

// Description, canonical and share tags for the current screen (pre-rendered pages
// start with the same values, so crawlers and link previews agree with visitors)
const PRE = { van: (p) => `vans/${p.id}/`, destination: (p) => `destinations/${p.id}/`, destinations: () => 'destinations/', help: (p) => (p.topic ? `help/${p.topic}/` : 'help/'), guide: () => 'guide/', deals: (p) => (p.id ? '' : 'deals/'), home: () => '' };
App.setMeta = (route, main) => {
  const set = (sel, attr, val, make) => { let e = document.head.querySelector(sel); if (!e && make) { e = document.createElement(make[0]); Object.entries(make[1]).forEach(([k, v]) => e.setAttribute(k, v)); document.head.append(e); } if (e) e.setAttribute(attr, val); };
  const van = route.page === 'van' && App.get.van(route.params.id), dest = route.page === 'destination' && App.get.dest(route.params.id);
  const desc = van ? `${van.type} in ${van.pickup.city}: sleeps ${van.sleeps}, from ${App.fmt.money(van.pricePerNight)} a night. ${van.description.slice(0, 90)}…`
    : dest ? `${dest.tagline}. Best time: ${dest.bestTime}.`
    : (main.querySelector('p.lead, .hero-sub, main p')?.innerText || 'Discover destinations, find verified camper vans and book your road trip across India with transparent pricing.').slice(0, 160);
  set('meta[name="description"]', 'content', desc);
  set('meta[property="og:title"]', 'content', document.title, ['meta', { property: 'og:title' }]);
  set('meta[property="og:description"]', 'content', desc, ['meta', { property: 'og:description' }]);
  const pic = van ? van.photos[0] : dest ? dest.hero : null;
  if (pic) set('meta[property="og:image"]', 'content', App.photo(pic, 1200), ['meta', { property: 'og:image' }]);
  const clean = PRE[route.page] && PRE[route.page](route.params);
  const siteRoot = new URL(document.querySelector('base')?.href || '.', location.href);
  if (clean !== undefined && clean !== null) set('link[rel="canonical"]', 'href', new URL(clean, siteRoot).href, ['link', { rel: 'canonical' }]);
};

App.renderHeader = () => {
  const me = App.me();
  const unread = me ? App.db.notifications.filter(n => n.userId === me.id && !n.read).length : 0;
  const route = location.hash.replace(/^#/, '').split('?')[0] || '/';
  const nav = [
    ['#/destinations', 'Destinations'],
    ['#/search', 'Find a van'],
    ['#/map', 'Map'],
    ['#/plan', 'Plan a trip'],
    ['#/deals', 'Deals'],
    ['#/list-your-van', 'List your van'],
    ['#/help', 'Help']
  ];
  document.getElementById('site-header').innerHTML = String(App.h`
    <div class="container header-inner">
      <a href="#/" class="logo" aria-label="VanYatra home">
        <svg viewBox="0 0 40 28" width="38" height="27" aria-hidden="true"><rect x="1" y="4" width="30" height="17" rx="5" fill="#1f6f54"/><path d="M31 9h3.5a3 3 0 0 1 2.6 1.5l2 3.5V21h-8z" fill="#2c8a69"/><rect x="5" y="8" width="7" height="5" rx="1.5" fill="#fff4dc"/><rect x="14" y="8" width="7" height="5" rx="1.5" fill="#fff4dc"/><rect x="1" y="14" width="30" height="2.5" fill="#f28c38"/><circle cx="9" cy="22" r="3.6" fill="#1b1b1b"/><circle cx="29" cy="22" r="3.6" fill="#1b1b1b"/><circle cx="9" cy="22" r="1.4" fill="#ddd"/><circle cx="29" cy="22" r="1.4" fill="#ddd"/></svg>
        <span>Van<b>Yatra</b></span>
      </a>
      <nav id="site-nav" aria-label="Main">
        ${nav.map(([href, label]) => App.h`<a href="${href}" class="${route.startsWith(href.slice(1)) ? 'active' : ''}">${label}</a>`)}
      </nav>
        <div class="nav-auth">
        ${me ? App.h`
          ${me.role === 'owner' ? App.h`<a class="btn btn-sm btn-ghost" href="#/owner">Owner dashboard</a>` : ''}
          ${me.role === 'admin' ? App.h`<a class="btn btn-sm btn-ghost" href="#/admin">Admin</a>` : ''}
          <div class="dropdown">
            <button class="icon-btn bell" id="bell" aria-label="Notifications, ${unread} unread" aria-haspopup="true">${App.icon('bell')}${unread ? App.h`<span class="dot">${unread}</span>` : ''}</button>
            <div class="dropdown-menu notif-menu" id="notif-menu" hidden></div>
          </div>
          <div class="dropdown">
            <button class="user-btn" id="user-btn" aria-haspopup="true" aria-expanded="false">${App.avatar(me, 32)}<span class="hide-sm">${me.name.split(' ')[0]}</span></button>
            <div class="dropdown-menu" id="user-menu" hidden>
              <div class="menu-head"><strong>${me.name}</strong><span class="muted">${me.email}</span><span class="badge badge-muted">${me.role}</span></div>
              <a href="#/account/bookings">My trips</a>
              <a href="#/account/saved">Saved vans</a>
              <a href="#/account/messages">Messages</a>
              ${me.role === 'owner' ? App.h`<a href="#/owner">Owner dashboard</a><a href="#/owner/onboarding">Verification</a>` : ''}
              ${me.role === 'admin' ? App.h`<a href="#/admin">Admin console</a>` : ''}
              <a href="#/account/profile">Profile & privacy</a>
              <button id="logout">Sign out</button>
            </div>
          </div>`
        : App.h`<a class="btn btn-sm btn-ghost" href="#/login">Sign in</a><a class="btn btn-sm btn-primary hide-xs" href="#/signup">Sign up</a>`}
        </div>
      <button class="icon-btn nav-toggle" aria-label="Menu" aria-controls="site-nav" aria-expanded="false" id="nav-toggle">☰</button>
    </div>`);
  const $ = (id) => document.getElementById(id);
  const setMenu = (open) => {
    $('site-nav').classList.toggle('open', open);
    $('menu-scrim').classList.toggle('show', open);
    $('nav-toggle').textContent = open ? '✕' : '☰';
    $('nav-toggle').setAttribute('aria-expanded', open);
    $('nav-toggle').setAttribute('aria-label', open ? 'Close menu' : 'Menu');
  };
  App.closeMenu = () => setMenu(false);
  $('nav-toggle').onclick = (e) => { e.stopPropagation(); setMenu(!$('site-nav').classList.contains('open')); };
  $('menu-scrim').onclick = () => setMenu(false);
  if (!me) return;
  const toggle = (btn, menu, fill) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      document.querySelectorAll('.dropdown-menu').forEach(m => m.hidden = true);
      if (open) { fill && fill(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    };
  };
  toggle($('user-btn'), $('user-menu'));
  toggle($('bell'), $('notif-menu'), () => {
    const list = App.db.notifications.filter(n => n.userId === me.id).slice(0, 8);
    $('notif-menu').innerHTML = String(App.h`<div class="menu-head row-between"><strong>Notifications</strong><button class="link" id="mark-read">Mark all read</button></div>
      ${list.length ? list.map(n => App.h`<a href="${n.link || '#'}" class="notif ${n.read ? '' : 'unread'}" data-n="${n.id}"><span>${n.text}</span><small class="muted">${App.timeAgo(n.at)}</small></a>`) : App.h`<p class="muted pad">You’re all caught up.</p>`}`);
    $('mark-read').onclick = (e) => {
      e.stopPropagation();
      App.db.notifications.forEach(n => { if (n.userId === me.id) n.read = true; });
      if (App.serverOnline) App.server('POST', '/api/notifications/read', {}).catch(() => {});
      App.save(); App.renderHeader();
    };
    $('notif-menu').querySelectorAll('[data-n]').forEach(a => a.onclick = () => { const n = App.db.notifications.find(x => x.id === a.dataset.n); n.read = true; App.save(); });
  });
  $('logout').onclick = async () => { await App.api.logout(); App.toast('Signed out'); App.go('#/'); };
};
document.addEventListener('click', () => document.querySelectorAll('.dropdown-menu').forEach(m => m.hidden = true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') App.closeMenu && App.closeMenu(); });

/* Bottom tab bar (phones only; hidden by CSS on larger screens) */
const ICONS = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  trips: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
};
App.renderTabbar = (route) => {
  const bar = document.getElementById('tabbar');
  if (!bar) return;
  const me = App.me();
  const upcoming = me ? App.db.bookings.filter(b => b.customerId === me.id && ['confirmed', 'requested'].includes(b.status)).length : 0;
  const unreadOwner = me ? App.db.threads.filter(t => t.ownerId === me.id && t.messages.length && t.messages.at(-1).from !== me.id).length : 0;
  const queue = me?.role === 'admin' ? App.db.documents.filter(d => d.status === 'pending').length : 0;
  const tabs = !me ? [['#/', 'Home', 'home'], ['#/destinations', 'Explore', 'explore'], ['#/search', 'Search', 'search'], ['#/map', 'Map', 'map'], ['#/login', 'Sign in', 'user']]
    : me.role === 'owner' ? [['#/', 'Home', 'home'], ['#/search', 'Search', 'search'], ['#/owner', 'Dashboard', 'dash'], ['#/owner/messages', 'Messages', 'chat', unreadOwner], ['#/account/profile', 'Account', 'user']]
    : me.role === 'admin' ? [['#/', 'Home', 'home'], ['#/search', 'Search', 'search'], ['#/admin', 'Admin', 'dash'], ['#/admin/verifications', 'Queue', 'shield', queue], ['#/account/profile', 'Account', 'user']]
    : [['#/', 'Home', 'home'], ['#/destinations', 'Explore', 'explore'], ['#/search', 'Search', 'search'], ['#/account/bookings', 'Trips', 'trips', upcoming], ['#/account/profile', 'Account', 'user']];
  // The most specific tab that matches the current page is highlighted
  const path = '#' + (route.path.split('?')[0] || '/');
  const active = tabs.map(t => t[0]).filter(h => h === '#/' ? path === '#/' : path.startsWith(h)).sort((a, b) => b.length - a.length)[0]
    || (route.page === 'account' ? tabs.find(t => t[0].startsWith('#/account'))?.[0] : null);
  bar.innerHTML = tabs.map(([href, label, icon, count]) => `<a href="${href}" class="${href === active ? 'active' : ''}" ${href === active ? 'aria-current="page"' : ''}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[icon]}</svg>${App.esc(label)}${count ? `<span class="tb-dot">${count}</span>` : ''}</a>`).join('');
  // Pages with their own bottom action bar or chat box hide the tab bar
  const own = ['van', 'book'].includes(route.page) || (['account', 'owner'].includes(route.page) && route.params.tab === 'messages' && route.params.id);
  document.body.classList.toggle('no-tabbar', !!own);
};

/* On phones tables become cards; each cell is labelled with its column heading */
const labelTables = (root) => root.querySelectorAll('table.table').forEach(t => {
  const heads = [...t.querySelectorAll('thead th')].map(th => th.textContent.trim());
  if (!heads.length) return;
  t.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((cell, i) => { if (!cell.hasAttribute('data-label')) cell.setAttribute('data-label', heads[i] || ''); }));
});
new MutationObserver(() => labelTables(document.getElementById('main'))).observe(document.documentElement, { childList: true, subtree: true });

App.renderFooter = () => {
  document.getElementById('site-footer').innerHTML = String(App.h`
    <div class="container footer-grid">
      <div>
        <div class="logo logo-light"><span>Van<b>Yatra</b></span></div>
        <p>India’s camper van marketplace. Every owner is ID-verified, every van is insured and safety-inspected.</p>
        <p class="small">24×7 roadside help: <a href="tel:${App.C.supportPhone}">${App.C.supportPhone}</a> · Emergency: ${App.C.emergencyNumber}</p>
      </div>
      <div><h4>Explore</h4><a href="#/destinations">Destinations</a><a href="#/search">All vans</a><a href="#/map">Map</a><a href="#/plan">Trip planner</a><a href="#/guide">First-timer’s guide</a><a href="#/search?family=1">Family trips</a></div>
      <div><h4>Owners</h4><a href="#/list-your-van">List your van</a><a href="#/owner">Owner dashboard</a><a href="#/help/owners">Owner requirements</a></div>
      <div><h4>Support</h4><a href="#/help/safety">Trust & safety</a><a href="#/help/faq">FAQs</a><a href="#/help/support">Contact support</a><a href="#/help/cancellation">Cancellation & refunds</a><a href="#/help/terms">Terms</a><a href="#/help/privacy">Privacy</a></div>
    </div>
    <div class="container footer-bottom"><span>© ${new Date().getFullYear()} VanYatra (demo prototype). Prices in ${App.C.currency}, incl. ${App.C.taxLabel} where shown.
      ${App.backend === 'demo' ? App.h` · Demo mode: accounts, bookings and document checks (test mode) are saved in this browser only` : App.serverOnline ? App.h` · Document checks: ${App.verifyConfig.provider}` : ''}</span><button class="link" id="reset-demo">Reset demo data</button></div>`);
  document.getElementById('reset-demo').onclick = async () => {
    if (await App.confirm('Reset demo data?', 'This restores all vans, bookings and accounts to their original state and signs you out.', 'Reset')) {
      await App.api.logout(); App.resetDemo(); await App.syncMarket().catch(() => {}); App.runExpiryChecks(); App.toast('Demo data reset', 'good'); App.go('#/');
    }
  };
};

/* Dashboard layout shared by account / owner / admin areas */
App.dashLayout = (el, { title, subtitle, nav, active, base }) => {
  el.innerHTML = String(App.h`
    <div class="container dash">
      <aside class="dash-nav" aria-label="${title} navigation">
        <div class="dash-title"><strong>${title}</strong>${subtitle ? App.h`<span class="muted small">${subtitle}</span>` : ''}</div>
        <nav>${nav.map(n => App.h`<a href="${base}${n.id ? '/' + n.id : ''}" class="${n.id === active ? 'active' : ''}">${App.icon(n.icon)} ${n.label}${n.count ? App.h`<span class="count">${n.count}</span>` : ''}</a>`)}</nav>
      </aside>
      <section class="dash-main" id="dash-main"></section>
    </div>`);
  return el.querySelector('#dash-main');
};

// Unknown links: offer a search and the most useful places to go next
App.pages.notFound = (el) => {
  const popular = [...App.db.destinations].sort((a, b) => App.db.vans.filter(v => v.destinationId === b.id && v.status === 'published').length - App.db.vans.filter(v => v.destinationId === a.id && v.status === 'published').length).slice(0, 6);
  const broken = location.hash.slice(0, 200);
  el.innerHTML = String(App.h`<div class="container narrow section not-found">
    <div class="empty"><div class="empty-icon" aria-hidden="true">${App.icon('compass')}</div><h1>We couldn’t find that page</h1><p class="muted">The link may be broken, or the page may have moved. Try one of these instead.</p></div>
    <form class="nf-search" role="search" action="#/search"><label class="field grow"><span class="sr-only">Where do you want to go?</span><input name="q" id="nf-q" placeholder="Search a destination, e.g. Goa"></label><button class="btn btn-primary">Search vans</button></form>
    <h2 class="section-sub">Popular road trips</h2>
    <div class="chips">${popular.map(d => App.h`<a class="chip" href="#/destinations/${d.id}">${d.name}</a>`)}</div>
    <h2 class="section-sub">Or go to</h2>
    <ul class="plain nf-links">
      <li><a href="#/">Home</a></li><li><a href="#/search">All vans</a></li><li><a href="#/destinations">All destinations</a></li>
      <li><a href="#/map">Map</a></li><li><a href="#/help">Help centre</a></li><li><a href="#/list-your-van">List your van</a></li>
    </ul>
    <p class="small muted">Followed a link from somewhere? <a href="#/help/support?topic=broken-link&amp;url=${encodeURIComponent(broken)}">Tell us it’s broken</a>.</p>
  </div>`);
  el.querySelector('.nf-search').onsubmit = (e) => {
    e.preventDefault();
    const q = el.querySelector('#nf-q').value.trim().toLowerCase();
    const d = q && App.db.destinations.find(x => x.name.toLowerCase().includes(q) || x.id.includes(q) || (x.region || '').toLowerCase().includes(q));
    App.go(d ? '#/search?dest=' + d.id : '#/search');
  };
};

window.addEventListener('hashchange', App.render);
document.addEventListener('DOMContentLoaded', async () => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  // Pre-rendered pages (scripts/prerender.mjs) say which screen they are
  const pre = document.documentElement.dataset.route;
  if (pre && !location.hash) history.replaceState(null, '', pre);
  App.load();
  await App.syncSession();
  App.runExpiryChecks();
  App.renderFooter();
  App.render();
  App.renderConsent();
  // In-page anchors would clash with the hash router, so the skip link focuses <main> directly
  document.querySelector('.skip-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main').focus(); });
});
