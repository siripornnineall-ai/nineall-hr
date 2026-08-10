// Nineall HR employee PWA — service worker.
// Scope is intentionally small: cache the app shell (icons, offline fallback) so the app
// installs and opens instantly, and fall back to an offline page on failed navigations.
// It does NOT cache API/Supabase responses — attendance/leave/payroll data must always be
// fresh, and stale cached data here would be actively dangerous (e.g. showing an old leave
// balance). A local IndexedDB queue for offline clock-in submissions is not implemented yet
// (tracked in KNOWN_LIMITATIONS.md) — this SW only makes the app *open* offline, not *submit*.

const CACHE_NAME = "nineall-hr-shell-v1";
const SHELL_ASSETS = ["/offline.html", "/icon-192.png", "/icon-512.png", "/logo-mark.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Only handle same-origin navigations; let everything else (Supabase API calls,
  // cross-origin requests) go straight to the network untouched.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html"))
    );
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
  }
});
