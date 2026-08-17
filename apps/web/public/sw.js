/* Network-first HTML so public entry and app shells are not stuck on an old bundle.
   Static icons stay cache-first. Offline fallback uses the last navigation snapshot. */
const CACHE = "croniu-static-v4";
const NAV_CACHE = "croniu-nav-v4";
const ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192-v3.png",
  "/icons/icon-512-v3.png",
  "/icons/icon-512-maskable-v3.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE && key !== NAV_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;
  // Public bearer-token routes and APIs may contain per-person state. They
  // must never be persisted or replayed by the shared PWA cache.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/entrar/") ||
    url.pathname.startsWith("/c/")
  ) {
    event.respondWith(fetch(request));
    return;
  }

  const isNavigate =
    request.mode === "navigate" ||
    request.destination === "document" ||
    (request.headers.get("accept") || "").includes("text/html");

  if (isNavigate) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(NAV_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/")),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).catch(() => caches.match("/") || cached),
    ),
  );
});
