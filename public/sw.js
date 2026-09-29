// RETIRED (CLAUDE.md §43.1 Q3): the website is no longer an installable web
// app. A browser that installed the old one still asks for this file; this
// version deletes what the old one cached and removes itself.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
  );
});
