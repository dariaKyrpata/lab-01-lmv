const cacheName = "dogfight-offline-v1";
self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.add("/offline.html")));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith("dogfight-offline-") && key !== cacheName).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.mode !== "navigate" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline.html")) ?? Response.error()));
});
