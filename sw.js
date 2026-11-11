// Stale-while-revalidate: serve from cache straight away (works offline), and refresh each file in the
// background so the next open has the latest. Bump VERSION and ASSET_V together on every change; they
// are checked against index.html and app.js by tests/version.test.mjs.
const VERSION = "sudoku-v4";
const ASSET_V = "4";
const FILES = ["./", "index.html", `style.css?v=${ASSET_V}`, `app.js?v=${ASSET_V}`, "sudoku.js",
  `history.js?v=${ASSET_V}`, "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's HTTP cache, which would otherwise hand back files from the previous deploy.
  e.waitUntil(caches.open(VERSION)
    .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(e.request);
    const refresh = fetch(e.request, { cache: "no-cache" }).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    e.waitUntil(refresh);
    return hit || refresh;
  })());
});
