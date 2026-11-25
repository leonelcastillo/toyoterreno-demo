// Service Worker ligero para que la app sea instalable en el teléfono (PWA).
// Estrategia network-first: siempre busca la versión nueva y usa caché solo si no hay red.
const CACHE = 'toyoterreno-v1';

self.addEventListener('install', ev => {
  self.skipWaiting();
  ev.waitUntil(
    caches.open(CACHE).then(c => c.addAll(['./', './index.html', './estilo.css', './app.js', './logo.png', './icono-192.png', './icono-512.png', './manifest.webmanifest']).catch(() => {}))
  );
});

self.addEventListener('activate', ev => {
  ev.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  ev.respondWith(
    fetch(req).then(res => {
      if (res && res.ok) {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});
