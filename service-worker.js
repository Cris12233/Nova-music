const CACHE_NAME = "nova-music-shell-v1";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./audio-metadata.js",
  "./nova-offline.js",
  "./config.js"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        await cache.addAll(SHELL);
        await cache.add("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm").catch(() => {});
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("nova-music-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok && (request.destination === "document" || /\.(?:js|css)$/.test(url.pathname))) {
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await cache.match(request, { ignoreSearch: true })) ||
          (await cache.match("./index.html")) ||
          new Response("NOVA MUSIC no está disponible sin conexión todavía.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return new Response("Módulo externo no disponible sin conexión.", { status: 503 });
      }
    })());
  }
});
