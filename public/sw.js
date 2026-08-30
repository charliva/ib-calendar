const CACHE = "syllabi-mobile-shell-v7";
const SHELL = ["/", "/manifest.webmanifest", "/favicon.svg", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      ),
  );
  self.clients.claim();
});

// Allowlist of same-origin paths whose GET responses are safe to cache for
// stale-while-revalidate. Anything outside this set (HTML pages, auth
// callbacks, AI routes, mutations, invite URLs) must not be cached.
const CACHEABLE_PATHS = new Set([
  "/manifest.webmanifest",
  "/favicon.svg",
  "/apple-touch-icon.png",
]);

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/")),
    );
    return;
  }

  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;
  const cacheable = sameOrigin && CACHEABLE_PATHS.has(url.pathname);

  if (!cacheable) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request)),
  );
});
