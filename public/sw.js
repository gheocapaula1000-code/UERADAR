const CACHE = "ueradar-shell-v7";
const OFFLINE_FALLBACKS = ["/", "/auth"];
const SHELL = [
  "/",
  "/auth",
  "/prezzi",
  "/privacy",
  "/termini",
  "/cookie",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon-180.png",
  "/brand/ueradar-logo-horizontal.png",
];

self.addEventListener("install", (event) => {
  // Nessun addAll: un singolo URL non disponibile farebbe fallire l'intera
  // install e lascerebbe la PWA senza shell offline.
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.allSettled(SHELL.map((url) => cache.add(url)));
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(request, { ignoreSearch: true });
          if (exact) return exact;
          for (const path of OFFLINE_FALLBACKS) {
            const shell = await caches.match(path);
            if (shell) return shell;
          }
          // Fallback finale: mai una risposta di rete fallita non gestita.
          return new Response(
            "<!doctype html><html lang=\"it\"><head><meta charset=\"utf-8\"><title>UEradar offline</title></head><body><h1>UEradar &egrave; offline</h1><p>Connessione assente: riprova quando torni online.</p></body></html>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }),
    );
    return;
  }

  if (/\.(?:js|css|png|jpg|jpeg|svg|ico|woff2?)$/i.test(url.pathname)) {
    // JS/CSS in network-first: la PWA iOS non deve restare su codice vecchio.
    if (/\.(?:js|css)$/i.test(url.pathname)) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            if (response.ok)
              caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
            return response;
          })
          .then(
            (response) => response,
            async () => (await caches.match(request)) || Response.error(),
          ),
      );
      return;
    }
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok)
              caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
            return response;
          }),
      ),
    );
  }
});
