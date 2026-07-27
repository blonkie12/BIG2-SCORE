const CACHE = "big2-v6";
const ASSETS = ["./", "index.html", "styles.css", "app.js", "config.js", "icon.svg", "manifest.webmanifest"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS))));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))));
self.addEventListener("fetch", (event) => {
  // Alleen eigen bestanden. Een antwoord van een ander domein is ondoorzichtig en kan niet
  // in de cache worden gezet; cache.put liep daar op stuk bij elke aanroep van het CDN.
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
    return response;
  }).catch(() => caches.match(event.request)));
});
