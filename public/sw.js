// VENDIDO — service worker: permite instalar la app y abrirla sin internet
// (el juego en línea sí necesita conexión). Estrategia: primero red, si falla, caché.
const CACHE = 'vendido-v2';
const CORE = [
  './', './index.html', './css/app.css', './manifest.webmanifest',
  './js/main.js', './js/board3d.js', './js/boardTexture.js', './js/geometry.js', './js/game-ui.js', './js/net.js', './js/sfx.js', './js/util.js',
  './shared/engine.js', './shared/maps.js', './shared/room.js', './shared/bot.js', './shared/premium.js', './shared/codigos.js',
  './vendor/three.module.min.js', './vendor/addons/controls/MapControls.js', './vendor/addons/controls/OrbitControls.js',
  './vendor/addons/geometries/RoundedBoxGeometry.js', './vendor/peerjs.min.js', './vendor/socket.io.min.js',
  './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.pathname.includes('/socket.io/') || url.pathname.includes('/api/')) return;
  if (url.origin !== location.origin && !url.hostname.includes('fonts.g')) return;
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok && (url.origin === location.origin || res.type === 'cors')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))),
  );
});
