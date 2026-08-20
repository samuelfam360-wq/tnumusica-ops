// Deliberately does no caching — this app is all live data (schedules,
// invoices, stock counts), and caching API responses would risk showing
// stale numbers. This just satisfies the browser's "installable" checklist
// so "Add to Home Screen" works properly on Android and iOS.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
