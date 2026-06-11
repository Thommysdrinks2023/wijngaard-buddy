// Service worker voor Wijngaard Buddy.
// Zorgt dat de app ook zonder internet opent in het veld:
// - pagina's: eerst netwerk, bij geen verbinding de gecachte versie
// - assets (js/css/afbeeldingen): eerst cache, anders netwerk
// Data-synchronisatie gebeurt apart via de sync-wachtrij in de app zelf.

const CACHE = "wijngaard-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Alleen eigen bestanden cachen; PocketBase- en weer-API's nooit
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    // Pagina's: netwerk eerst, cache als fallback
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
          return res;
        } catch {
          const cached = (await caches.match(req)) || (await caches.match("/"));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // Assets: cache eerst, netwerk als fallback
  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
