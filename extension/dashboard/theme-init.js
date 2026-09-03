// Prototype dark-mode toggle - applied before paint to avoid a light-mode
// flash. Persisted locally only; not yet a real setting.
//
// Must be an external file, not an inline <script> - MV3 extension pages
// enforce script-src 'self' unconditionally, with no way to allow inline
// script execution (not even via manifest.json). An inline version of this
// silently never ran in the real extension, only when tested outside it.
(function () {
  try {
    const saved = localStorage.getItem("planwise-theme");
    if (saved) document.documentElement.dataset.theme = saved;
  } catch (_) {}
})();
