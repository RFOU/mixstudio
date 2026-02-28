/**
 * MixStudio Service Worker
 * - Caches the app shell (JS/CSS/HTML) for offline support
 * - Audio files are cached separately via the Cache API in audioCache.ts
 *   (the SW does NOT intercept Supabase signed URLs to avoid auth issues)
 */

const APP_SHELL_CACHE = 'mixstudio-shell-v1'

// App shell resources to pre-cache on SW install
const APP_SHELL_URLS = [
  '/',
]

// Install: cache the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS))
  )
  self.skipWaiting()
})

// Activate: clean up old shell caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('mixstudio-shell-') && k !== APP_SHELL_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch: serve from cache with network fallback (stale-while-revalidate for shell)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET, cross-origin requests, Supabase API/Storage, and _next/data
  if (
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.startsWith('/_next/data/')
  ) {
    return
  }

  // For Next.js static assets (_next/static/**): cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
      })
    )
    return
  }

  // For HTML navigation (pages): network-first, fallback to cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(APP_SHELL_CACHE).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/')))
    )
    return
  }
})
