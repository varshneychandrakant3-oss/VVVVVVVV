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
  ['/book/:id', 'book', ['customer', 'owner', 'admin']],
  ['/booking/:id/confirmed', 'bookingConfirmed', ['customer', 'owner', 'admin']],
  ['/login', 'login'],
  ['/signup', 'signup'],
  ['/verify', 'verifyContact', ['customer', 'owner', 'admin']],
  ['/account', 'account', ['customer', 'owner', 'admin']],
  ['/account/:tab', 'account', ['customer', 'owner', 'admin']],
  ['/account/:tab/:id', 'account', ['customer', 'owner', 'admin']],
  ['/list-your-van', 'ownerLanding'],
  ['/owner/onboarding', 'onboarding', ['owner']],
  ['/owner', 'owner', ['owner']],
  ['/owner/:tab', 'owner', ['owner']],
  ['/owner/:tab/:id', 'owner', ['owner']],
  ['/admin', 'admin', ['admin']],
  ['/admin/:tab', 'admin', ['admin']],
  ['/admin/:tab/:id', 'admin', ['admin']],
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
  try { fn(main, route.params, route.query); }
  catch (e) { console.error(e); main.innerHTML = String(App.emptyState('⚠️', 'Something went wrong', e.message, App.h`<a class="btn" href="#/">Go home</a>`)); }
  if (!App._keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
  App._keepScroll = false;
  document.getElementById('site-nav').classList.remove('open');
  const h1 = main.querySelector('h1');
  document.title = (h1 ? h1.innerText.replace(/\s+/g, ' ').trim() + ' · ' : '') +'VanYatra — Camper van rentals in India';
};

App.renderHeader = () => {
  const me = App.me();
  const unread = me ? App.db.notifications.filter(n => n.userId === me.id && !n.read).length : 0;
  const route = location.hash.replace(/^#/, '').split('?')[0] || '/';
  const nav = [
    ['#/destinations', 'Destinations'],
    ['#/search', 'Find a van'],
    ['#/map', 'Map'],
    ['#/list-your-van', 'List your van'],
    ['#/help', 'Help']
  ];
  document.getElementById('site-header').innerHTML = String(App.h`
    <div class="container header-inner">
      <a href="#/" class="logo" aria-label="VanYatra home">
        <svg viewBox="0 0 40 28" width="38" height="27" aria-hidden="true"><rect x="1" y="4" width="30" height="17" rx="5" fill="#1f6f54"/><path d="M31 9h3.5a3 3 0 0 1 2.6 1.5l2 3.5V21h-8z" fill="#2c8a69"/><rect x="5" y="8" width="7" height="5" rx="1.5" fill="#fff4dc"/><rect x="14" y="8" width="7" height="5" rx="1.5" fill="#fff4dc"/><rect x="1" y="14" width="30" height="2.5" fill="#f28c38"/><circle cx="9" cy="22" r="3.6" fill="#1b1b1b"/><circle cx="29" cy="22" r="3.6" fill="#1b1b1b"/><circle cx="9" cy="22" r="1.4" fill="#ddd"/><circle cx="29" cy="22" r="1.4" fill="#ddd"/></svg>
        <span>Van<b>Yatra</b></span>
      </a>
      <button class="icon-btn nav-toggle" aria-label="Menu" aria-controls="site-nav" id="nav-toggle">☰</button>
      <nav id="site-nav" aria-label="Main">
        ${nav.map(([href, label]) => App.h`<a href="${href}" class="${route.startsWith(href.slice(1)) ? 'active' : ''}">${label}</a>`)}
        <div class="nav-auth">
        ${me ? App.h`
          ${me.role === 'owner' ? App.h`<a class="btn btn-sm btn-ghost" href="#/owner">Owner dashboard</a>` : ''}
          ${me.role === 'admin' ? App.h`<a class="btn btn-sm btn-ghost" href="#/admin">Admin</a>` : ''}
          <div class="dropdown">
            <button class="icon-btn bell" id="bell" aria-label="Notifications, ${unread} unread" aria-haspopup="true">🔔${unread ? App.h`<span class="dot">${unread}</span>` : ''}</button>
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
        : App.h`<a class="btn btn-sm btn-ghost" href="#/login">Sign in</a><a class="btn btn-sm btn-primary" href="#/signup">Sign up</a>`}
        </div>
      </nav>
    </div>`);
  const $ = (id) => document.getElementById(id);
  $('nav-toggle').onclick = () => $('site-nav').classList.toggle('open');
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

App.renderFooter = () => {
  document.getElementById('site-footer').innerHTML = String(App.h`
    <div class="container footer-grid">
      <div>
        <div class="logo logo-light"><span>Van<b>Yatra</b></span></div>
        <p>India’s camper van marketplace. Every owner is ID-verified, every van is insured and safety-inspected.</p>
        <p class="small">24×7 roadside help: <a href="tel:${App.C.supportPhone}">${App.C.supportPhone}</a> · Emergency: ${App.C.emergencyNumber}</p>
      </div>
      <div><h4>Explore</h4><a href="#/destinations">Destinations</a><a href="#/search">All vans</a><a href="#/map">Map</a><a href="#/search?family=1">Family trips</a></div>
      <div><h4>Owners</h4><a href="#/list-your-van">List your van</a><a href="#/owner">Owner dashboard</a><a href="#/help/owners">Owner requirements</a></div>
      <div><h4>Support</h4><a href="#/help/safety">Trust & safety</a><a href="#/help/faq">FAQs</a><a href="#/help/support">Contact support</a><a href="#/help/cancellation">Cancellation & refunds</a><a href="#/help/terms">Terms</a><a href="#/help/privacy">Privacy</a></div>
    </div>
    <div class="container footer-bottom"><span>© ${new Date().getFullYear()} VanYatra (demo prototype). Prices in ${App.C.currency}, incl. ${App.C.taxLabel} where shown.
      ${App.serverOnline ? App.h` · Document checks: ${App.verifyConfig.provider}` : App.h` · Preview mode: sign-ins and bookings are demo data kept in this browser`}</span><button class="link" id="reset-demo">Reset demo data</button></div>`);
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
        <nav>${nav.map(n => App.h`<a href="${base}${n.id ? '/' + n.id : ''}" class="${n.id === active ? 'active' : ''}"><span aria-hidden="true">${n.icon}</span> ${n.label}${n.count ? App.h`<span class="count">${n.count}</span>` : ''}</a>`)}</nav>
      </aside>
      <section class="dash-main" id="dash-main"></section>
    </div>`);
  return el.querySelector('#dash-main');
};

App.pages.notFound = (el) => {
  el.innerHTML = String(App.emptyState('🧭', 'We couldn’t find that page', 'The link may be broken or the page may have moved.', App.h`<a class="btn btn-primary" href="#/">Back to home</a>`));
};

window.addEventListener('hashchange', App.render);
document.addEventListener('DOMContentLoaded', async () => {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  App.load();
  await App.syncSession();
  App.runExpiryChecks();
  App.renderFooter();
  App.render();
  // In-page anchors would clash with the hash router, so the skip link focuses <main> directly
  document.querySelector('.skip-link').addEventListener('click', (e) => { e.preventDefault(); document.getElementById('main').focus(); });
});
