// ぴえんで候 service worker
// 方針: ハッシュ付き静的アセットはキャッシュ優先、ページ遷移はネットワーク優先
// （オフライン時のみトップページのキャッシュを返す）。データ取得やサーバー関数は
// 一切キャッシュしない。
const CACHE = "pien-v1";
const PRECACHE = ["/", "/manifest.webmanifest", "/favicon.ico", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const STATIC_RE = /\.(?:js|css|png|ico|svg|webp|woff2?|webmanifest)$/;

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 静的アセット: キャッシュ優先（ファイル名にハッシュが付くため安全）
  if (url.pathname.startsWith("/assets/") || STATIC_RE.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // ページ遷移: ネットワーク優先、オフライン時はトップのキャッシュ
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
  }
});
