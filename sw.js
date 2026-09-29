/*
 * VanYatra service worker: works offline for the app itself and the traveller's
 * own trip data (bookings, pre-check-in, itinerary and trip plans are stored on
 * the device, so they open without a connection in the mountains).
 *
 *  - Pages: network first, falling back to the cached app shell.
 *  - Scripts, styles, icons, map data: served from cache, refreshed in the background.
 *  - Van photos: cached as they're viewed (up to 150).
 *  - /api/* and anything else: always from the network.
 *
 * The files to cache are read from index.html, so there is no list to maintain.
 * Change VERSION on a release to prompt open tabs to refresh.
 */
const VERSION = '2026-09-29.13';
const SHELL = 'vanyatra-shell-' + VERSION;
const IMAGES = 'vanyatra-images';
const IMAGE_LIMIT = 150;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    const res = await fetch('./index.html', { cache: 'no-cache' });
    const html = await res.clone().text();
    const files = [...html.matchAll(/(?:src|href)="(assets\/[^"#?]+)"/g)].map(m => './' + m[1]);
    await cache.put('./index.html', res);
    // Bypass the browser's HTTP cache, or a new version could be installed with old files
    await cache.addAll([...new Set([...files, './assets/data/india-boundary.geojson'])].map(f => new Request(f, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('vanyatra-shell-') && key !== SHELL) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page asks the waiting worker to take over after the traveller says "Refresh"
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const trim = async (name, max) => {
  const cache = await caches.open(name), keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const scope = new URL(self.registration.scope);
  if (url.origin === scope.origin && url.pathname.includes('/api/')) return;

  // Pages: try the network, fall back to the cached shell (the router handles the #/route)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // Only the app shell is kept; pre-rendered pages (/vans/…) boot the same app
        const shell = url.pathname === scope.pathname || url.pathname === scope.pathname + 'index.html';
        if (shell && res.ok) (await caches.open(SHELL)).put('./index.html', res.clone());
        return res;
      } catch {
        // Offline on a clean link: open the cached app on the matching screen
        const rest = url.pathname.slice(scope.pathname.length).replace(/(index\.html)?$/, '').replace(/\/$/, '');
        if (rest && url.pathname.startsWith(scope.pathname)) return Response.redirect(scope.href + '#/' + rest, 302);
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  // App files: cache first, refreshed in the background
  if (url.origin === scope.origin && url.pathname.startsWith(scope.pathname + 'assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req, { ignoreSearch: true });
      const refresh = fetch(req, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await refresh) || Response.error();
    })());
    return;
  }

  // Van and destination photos: cache as viewed
  if (url.hostname === 'images.unsplash.com') {
    event.respondWith((async () => {
      const cache = await caches.open(IMAGES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') { cache.put(req, res.clone()); trim(IMAGES, IMAGE_LIMIT); }
        return res;
      } catch { return Response.error(); }
    })());
  }
});

// Trip alerts shown as device notifications; tapping one opens the right page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '#/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = all.find(c => c.url.startsWith(self.registration.scope));
    if (tab) { await tab.focus(); return tab.navigate(self.registration.scope + link); }
    return self.clients.openWindow(self.registration.scope + link);
  })());
});
