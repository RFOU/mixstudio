/**
 * MixStudio Service Worker
 *
 * Stratégie : Network-first pour les pages, Cache-first pour les assets statiques.
 * Le but principal est de rendre l'app installable (PWA) et de permettre
 * un démarrage rapide même avec une connexion lente.
 *
 * Note : Les fichiers audio sont gérés par IndexedDB (audioCache.ts), pas par ce SW.
 */

const CACHE_NAME = 'mixstudio-shell-v2'

const PRECACHE_URLS = [
  '/',
  '/projects',
  '/studio',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (!url.protocol.startsWith('http')) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return

  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached
        return fetch(request).then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
      })
    )
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request) || caches.match('/'))
    )
  }
})
