/* sw.js — Service Worker: アプリシェルをキャッシュしてオフラインでも起動できるようにする
 * データ(localStorage)には一切触れない。外部への通信もしない。 */
"use strict";

const CACHE_NAME = "kakeibo-shell-v1";

const SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/store.js",
  "./js/charts.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先+裏でネットワークから更新(stale-while-revalidate)
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // クイック入力URL(クエリ付き)もアプリシェルとして返す
      const cacheKey = url.pathname.endsWith("/index.html") || url.pathname.endsWith("/")
        ? "./index.html"
        : event.request;
      const cached = await cache.match(cacheKey);
      const fetched = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(cacheKey, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
