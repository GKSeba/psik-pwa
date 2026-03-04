const CACHE_NAME = "pollen-pwa-v15";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))),
      );
      self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;

  // App shell: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        return cached || fetch(event.request);
      })(),
    );
    return;
  }

  // Open‑Meteo Air Quality: network-first
  if (url.hostname === "air-quality-api.open-meteo.com") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const fresh = await fetch(event.request);
          cache.put(event.request, fresh.clone());
          return fresh;
        } catch {
          const cached = await cache.match(event.request);
          return (
            cached ||
            new Response(JSON.stringify({ error: "offline" }), {
              headers: { "Content-Type": "application/json" },
            })
          );
        }
      })(),
    );
  }
});
