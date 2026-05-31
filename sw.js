/* Service Worker — Picos 2026 Roadbook
   Estratégia: app shell + CDNs + tiles do mapa em cache (cache-first),
   meteorologia em rede-primeiro com fallback para cache.
   Objetivo: a app funciona na montanha, sem rede. */

const VERSION = 'picos-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './d1_cover.png', './d2_cover.png', './d3_cover.png',
  './d4_cover.png', './d5_cover.png', './d6_cover.png'
];

// Recursos críticos de CDN — necessários para a app arrancar offline
// numa instalação fresca (Leaflet + Font Awesome).
const CDN_ASSETS = [
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) =>
        // Shell local: tudo-ou-nada. CDNs: tolerante (allSettled), modo no-cors
        // para obter respostas opacas cacheáveis; um falhar não aborta a instalação.
        cache.addAll(SHELL).then(() =>
          Promise.allSettled(
            CDN_ASSETS.map((u) =>
              fetch(new Request(u, { mode: 'no-cors' }))
                .then((res) => {
                  if (res && (res.ok || res.type === 'opaque')) {
                    return cache.put(u, res);
                  }
                })
                .catch(() => {})
            )
          )
        )
      )
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
