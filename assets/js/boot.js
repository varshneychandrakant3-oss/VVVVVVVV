// Runs first, before the app's (deferred) scripts: starts the slow downloads early
// without holding up the first paint.
(function () {
  // The home page hero photo (public.js shows it)
  var HERO = window.VY_HERO = 'photo-1534540378968-85a7b8fde19f';
  var add = function (attrs) { var l = document.createElement('link'); for (var k in attrs) l.setAttribute(k, attrs[k]); document.head.appendChild(l); };
  // Web font: added from script so it doesn't block rendering (text shows in the fallback font first)
  add({ rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap' });
  // Home page hero: fetch it now rather than after the app has started (same URLs as App.img)
  var route = document.documentElement.getAttribute('data-route') || location.hash;
  if (!route || route === '#/' || route === '#') {
    var u = function (w) { return 'https://images.unsplash.com/' + HERO + '?auto=format&fit=crop&w=' + w + '&q=70'; };
    add({ rel: 'preload', as: 'image', fetchpriority: 'high', href: u(1600), imagesizes: '100vw', imagesrcset: [320, 480, 640, 800, 960, 1280, 1600].map(function (w) { return u(w) + ' ' + w + 'w'; }).join(', ') });
  }
})();
