/* Service Worker — Picos 2026 Roadbook
   Estratégia: app shell + CDNs + tiles do mapa em cache (cache-first),
   meteorologia em rede-primeiro com fallback para cache.
   Objetivo: a app funciona na montanha, sem rede. */

const VERSION = 'picos-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './d1_cover.png', './d2_cover.png', './d3_cover.png',
  './d4_cover.png', './d5_cover.png', './d6_cover.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isWeather = (url) => url.hostname === 'api.open-meteo.com';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Pedidos de navegação → devolve o app shell quando offline
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./index.html')));
    return;
  }

  // Meteorologia → rede primeiro (fresca), cai para a última resposta em cache
  if (isWeather(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Tudo o resto (shell, Tailwind/FontAwesome, fontes, Leaflet, tiles)
  // → cache primeiro, atualiza em segundo plano
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
