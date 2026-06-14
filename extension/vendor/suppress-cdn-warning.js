// Suppress Tailwind Play CDN's hardcoded "cdn.tailwindcss.com should not be
// used in production" console.warn — we've already vendored the file locally.
(function () {
  var _warn = console.warn.bind(console);
  console.warn = function () {
    var msg = arguments[0];
    if (typeof msg === 'string' && msg.indexOf('cdn.tailwindcss.com') !== -1) return;
    _warn.apply(console, arguments);
  };
})();
