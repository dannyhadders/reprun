// Offline shell for the home-screen app. Hashed build assets: cache first (they never change).
// Pages and other files: network first, cached copy when there's no signal. /api is never cached.
// ponytail: the cache is never pruned; old hashed assets pile up slowly. Prune on activate if it ever matters.
const CACHE = 'reprun-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return

  // Every page is the same SPA shell, so all navigations share one cache entry.
  const key = e.request.mode === 'navigate' ? '/' : e.request
  const save = res => {
    // A redirect means Cloudflare Access wants a sign-in; don't cache its login page as the app.
    if (res.ok && !res.redirected) caches.open(CACHE).then(c => c.put(key, res.clone()))
    return res
  }
  e.respondWith(url.pathname.startsWith('/assets/')
    ? caches.match(key).then(hit => hit ?? fetch(e.request).then(save))
    : fetch(e.request).then(save).catch(() => caches.match(key).then(hit => hit ?? Response.error())))
})
