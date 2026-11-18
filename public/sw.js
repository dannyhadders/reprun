// Offline shell for the home-screen app. Hashed build assets: cache first (they never change).
// Pages and other files: network first, cached copy when there's no signal. /api is never cached.
// One cache per build (the app registers /sw.js?v=<build sha>), so old builds' files get deleted instead of piling up.
const CACHE = `reprun-${new URL(location).searchParams.get('v') ?? 'dev'}`

// Fill the new cache while still online: the page shell and the files it loads. If the old cache were deleted with
// nothing in the new one, opening the app with no signal right after an update would show nothing.
// Fails (and the browser retries on a later visit) when the shell can't be had, e.g. Access wants a sign-in.
// ponytail: only the files index.html names; import-only chunks (spreadsheet, Strava CSV) cache on first use.
self.addEventListener('install', e => e.waitUntil((async () => {
  const res = await fetch('/', { cache: 'no-store' })
  if (!res.ok || res.redirected) throw new Error('App shell unavailable')
  const files = [...(await res.clone().text()).matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(m => m[1])
  const c = await caches.open(CACHE)
  await c.addAll(files)
  await c.put('/', res)
})()))

// A new version waits until the app says go (the "New version" banner), so it never swaps files under an open page.
// The very first install has nothing to wait for and takes over straight away.
self.addEventListener('message', e => e.data === 'update' && self.skipWaiting())

// Taking over: delete every other build's cache. Workouts and settings are in localStorage, which this never touches.
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

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

// Rest alerts (src/lib/push.tsx): the push arrives empty, so the words are written here. Tapping it opens the workout.
self.addEventListener('push', e => e.waitUntil(self.registration.showNotification('Rest over', {
  body: 'Time for your next set.', tag: 'rest', icon: '/icon-512.png',
})))
self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then(open => open[0]
    ? open[0].focus().then(c => c.navigate?.('/log'))
    : self.clients.openWindow('/log')))
})
