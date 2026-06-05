/**
 * MixStudio Service Worker
 *
 * Stratégie : Network-first pour les pages, Cache-first pour les assets statiques.
 * Le but principal est de rendre l'app installable (PWA) et de permettre
 * un démarrage rapide même avec une connexion lente.
 *
 * Note : Les fichiers audio sont gérés par IndexedDB (audioCache.ts), pas par ce SW.
 */

// Bump à chaque besoin de purge complète du shell.
// L'activate supprime tous les caches != CACHE_NAME → l'ancien JV figé disparaît.
const CACHE_NAME = 'mixstudio-shell-v3'

// On ne précache PAS /projects ni /studio : routes auth-gated, addAll y cacherait
// une redirection/HTML de login. La navigation est network-first de toute façon.
const PRECACHE_URLS = [
  '/',
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
    // Stale-while-revalidate : on sert le cache vite, mais on refetch en fond
    // et on met le cache à jour. Le prochain chargement reçoit le code frais.
    // Évite qu'un chunk bugué reste servi indéfiniment (cache-first le faisait).
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const network = fetch(request).then(response => {
            if (response.ok) cache.put(request, response.clone())
            return response
          }).catch(() => cached)
          return cached || network
        })
      )
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
