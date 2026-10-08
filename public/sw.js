const CACHE_PREFIX = 'rodoslovnaya-app-';
const CACHE_NAME = '__APP_CACHE_NAME__';
const PRECACHE_URLS = [];
const SCOPE_URL = new URL(self.registration.scope);

function isAppRequest(requestUrl) {
  return requestUrl.origin === SCOPE_URL.origin && requestUrl.pathname.startsWith(SCOPE_URL.pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || !isAppRequest(event.request.url)) return;
  const isNavigation = event.request.mode === 'navigate';

  // Keep the current app shell available for offline reloads. A newly installed
  // worker has its own versioned cache, so existing clients remain consistent.
  if (isNavigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = (await cache.match(event.request))
        || (await cache.match(new URL('index.html', SCOPE_URL).toString()));
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type !== 'opaque') await cache.put(event.request, response.clone());
    return response;
  })());
});
