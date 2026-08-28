const CACHE_NAME = "judo-performance-offline-v3";
const SHELL = ["/", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys(); const replaced = names.some((name) => name.startsWith("judo-performance-offline-") && name !== CACHE_NAME);
    await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))); await self.clients.claim();
    if (replaced) { const windows = await self.clients.matchAll({ type: "window" }); await Promise.all(windows.map((client) => client.navigate(client.url))); }
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)); return response; }).catch(() => caches.match("/")));
    return;
  }
  event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
});
