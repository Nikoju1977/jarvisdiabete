/* J.A.R.V.I.S. Diabète v7 — service worker
   Pages : réseau d'abord (code médical toujours à jour), cache en secours hors ligne.
   Polices Google : cache d'abord. Tout autre domaine (IA, Nightscout) n'est jamais intercepté. */
const CACHE = 'jarvis-dt1-v7.1';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon.svg', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (FONT_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res;
    })));
    return;
  }
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true })
      .then(m => m || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
