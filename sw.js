const PREFIX = 'mapping-sas:' + self.registration.scope + ':';
const CACHE = PREFIX + 'v8-1-report-serial';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './jszip.min.js', './sas-mapping.js', './est3-mapping.js', './est3-report.js', './sas-ui.js?v=8.1'];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.registration.scope)) return;
  event.respondWith(caches.match(event.request, { cacheName: CACHE }).then(cached => cached || fetch(event.request).catch(error => {
    if (event.request.mode === 'navigate') return caches.match('./index.html', { cacheName: CACHE });
    throw error;
  })));
});
