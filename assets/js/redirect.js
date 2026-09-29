// Used by 404.html: a clean link such as /vans/v1 or /search?dest=goa opens the
// app's matching #/ route. The site's base path is worked out from this script's URL.
(function () {
  var src = document.currentScript && document.currentScript.src;
  var base = src ? new URL('../../', src).pathname : '/';
  var rest = location.pathname.indexOf(base) === 0 ? location.pathname.slice(base.length) : location.pathname.replace(/^\//, '');
  rest = rest.replace(/\/index\.html$/, '').replace(/\/$/, '');
  location.replace(base + (rest || location.search ? '#/' + rest + location.search : '') + location.hash);
})();
