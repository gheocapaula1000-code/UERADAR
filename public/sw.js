const CACHE = "ueradar-shell-v11";
const OFFLINE_FALLBACKS = ["/", "/auth"];
// Pagine pubbliche consultabili offline dopo la prima visita.
const PUBLIC_PAGES = ["/", "/auth", "/prezzi", "/contatti", "/privacy", "/termini", "/cookie"];
const SHELL = [
  ...PUBLIC_PAGES,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/favicon-32.png",
  "/icons/icon-192.png",
  "/icons/apple-touch-icon-180.png",
  "/brand/ueradar-logo-horizontal.png",
];

function offlineNoticePage(path) {
  // Pagina di cortesia in italiano: mai schermata bianca o errore generico.
  const body =
    '<!doctype html><html lang="it"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>UEradar &egrave; offline</title><style>" +
    "body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;" +
    "background:#0b1220;color:#e8eefc;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px}" +
    ".box{max-width:520px;text-align:center}h1{font-size:22px;margin:0 0 12px}" +
    "p{margin:0 0 10px;line-height:1.5;color:#b9c6e4}a{color:#f5c451;font-weight:600}" +
    "</style></head><body><div class=\"box\"><h1>Sei offline</h1>" +
    "<p>Questa pagina (" +
    path +
    ") non &egrave; ancora disponibile in consultazione offline: si carica automaticamente appena torni online.</p>" +
    '<p><a href="/">Torna alla home UEradar</a></p>' +
    "<p>Le pagine gi&agrave; visitate restano consultabili anche senza connessione.</p>" +
    "</div></body></html>";
  return new Response(body, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function warmShell() {
  const cache = await caches.open(CACHE);
  const assets = new Set();
  // Nessun addAll: un singolo URL non disponibile farebbe fallire l'intera
  // install e lascerebbe la PWA senza shell offline.
  await Promise.allSettled(
    SHELL.map(async (url) => {
      const response = await fetch(url, { cache: "reload", credentials: "same-origin" });
      if (!response || !response.ok) return;
      await cache.put(url, response.clone());
      const type = response.headers.get("content-type") || "";
      if (!type.includes("text/html")) return;
      // Anche gli asset referenziati dalla pagina, altrimenti offline resta il
      // solo HTML senza stile né interattività.
      const html = await response.clone().text();
      const re = /(?:src|href)="(\/[^"]+\.(?:js|css|woff2?|png|svg|ico))"/g;
      let m;
      while ((m = re.exec(html)) !== null) assets.add(m[1]);
    }),
  );
  await Promise.allSettled(
    [...assets].map(async (url) => {
      if (await cache.match(url)) return;
      const response = await fetch(url, { credentials: "same-origin" });
      if (response && response.ok) await cache.put(url, response.clone());
    }),
  );
}


self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await warmShell();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
      // Riscalda dopo ogni deploy: l'HTML in cache torna allineato all'ultima build.
      await warmShell();
    })(),
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
          const byPath = await caches.match(url.pathname, { ignoreSearch: true });
          if (byPath) return byPath;
          // Solo la home resta un ripiego accettabile: per ogni altro percorso
          // servire l'HTML di un'altra pagina darebbe una schermata sbagliata.
          if (url.pathname === "/" || url.pathname === "") {
            for (const path of OFFLINE_FALLBACKS) {
              const shell = await caches.match(path);
              if (shell) return shell;
            }
          }
          return offlineNoticePage(url.pathname);
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
