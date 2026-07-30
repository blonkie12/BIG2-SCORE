const CACHE = "big2-v21-offline-chronology";
const APP_SHELL = [
  "./",
  "index.html",
  "styles.css?v=21",
  "app.js?v=21",
  "config.js?v=21",
  "manifest.webmanifest",
  "icon.svg",
  "big-two-handrangschikking.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(APP_SHELL.map((asset) => cache.add(asset)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

async function networkFirst(request, fallback = null) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await cache.match(request)) ||
      (fallback ? await cache.match(fallback) : null) ||
      Response.error()
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  if (cached) {
    fetch(request, { cache: "no-store" })
      .then((response) => {
        if (response && response.ok) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {});
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "index.html"));
    return;
  }

  if (url.pathname.endsWith("/config.js") || url.pathname.endsWith("config.js")) {
    event.respondWith(networkFirst(event.request, "config.js?v=21"));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});
