'use client'

/**
 * Audio Cache using the Cache API.
 *
 * Cache key strategy:
 *   audio-v1/{storagePath}/{fileSize}
 *
 * If the file is updated (new upload → different fileSize in DB),
 * the cache key changes → old entry is left but ignored, new one is fetched.
 *
 * Cleanup of stale entries for the same storagePath is done on put().
 */

const CACHE_NAME = 'mixstudio-audio-v1'

function cacheKey(storagePath: string, fileSize: number): string {
  // Use a fake URL format so the Cache API accepts it
  return `https://mixstudio-cache/audio/${encodeURIComponent(storagePath)}/${fileSize}`
}

function storagePathFromKey(url: string): string {
  // Extract storagePath from the fake URL
  try {
    const parts = new URL(url).pathname.split('/')
    // /audio/{encodedStoragePath}/{fileSize}
    return decodeURIComponent(parts[2])
  } catch {
    return ''
  }
}

/** Returns true if a cached ArrayBuffer exists for this track version */
export async function hasCachedAudio(
  storagePath: string,
  fileSize: number
): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const match = await cache.match(cacheKey(storagePath, fileSize))
    return !!match
  } catch {
    return false
  }
}

/**
 * Get cached ArrayBuffer for a track, or null if not cached.
 * Returns null if the Cache API is unavailable (private browsing, etc.)
 */
export async function getCachedAudio(
  storagePath: string,
  fileSize: number
): Promise<ArrayBuffer | null> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const response = await cache.match(cacheKey(storagePath, fileSize))
    if (!response) return null
    return await response.arrayBuffer()
  } catch {
    return null
  }
}

/**
 * Store an ArrayBuffer in the cache for a track.
 * Also removes stale entries for the same storagePath (different fileSize).
 */
export async function putCachedAudio(
  storagePath: string,
  fileSize: number,
  data: ArrayBuffer
): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME)

    // Remove stale entries for the same storagePath
    const keys = await cache.keys()
    for (const request of keys) {
      if (storagePathFromKey(request.url) === storagePath) {
        // Check if it's a different fileSize (stale)
        const existingFileSize = parseInt(new URL(request.url).pathname.split('/').pop() ?? '0')
        if (existingFileSize !== fileSize) {
          await cache.delete(request)
        }
      }
    }

    // Store new entry
    const response = new Response(data, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(data.byteLength),
        'X-Storage-Path': storagePath,
        'X-File-Size': String(fileSize),
        'X-Cached-At': new Date().toISOString(),
      },
    })
    await cache.put(cacheKey(storagePath, fileSize), response)
  } catch (err) {
    // Cache write failure is non-fatal — fall back to network
    console.warn('[audioCache] putCachedAudio failed:', err)
  }
}

/** Returns all cache entries metadata (for debugging / storage info) */
export async function getCacheStats(): Promise<{
  count: number
  totalBytes: number
  entries: { storagePath: string; fileSize: number; cachedAt: string }[]
}> {
  try {
    const cache = await caches.open(CACHE_NAME)
    const keys = await cache.keys()
    let totalBytes = 0
    const entries = []

    for (const request of keys) {
      const response = await cache.match(request)
      if (!response) continue
      const fileSize = parseInt(response.headers.get('X-File-Size') ?? '0')
      totalBytes += fileSize
      entries.push({
        storagePath: response.headers.get('X-Storage-Path') ?? '',
        fileSize,
        cachedAt: response.headers.get('X-Cached-At') ?? '',
      })
    }

    return { count: keys.length, totalBytes, entries }
  } catch {
    return { count: 0, totalBytes: 0, entries: [] }
  }
}

/** Clear all cached audio (e.g. for a "clear cache" button) */
export async function clearAudioCache(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME)
  } catch {
    // ignore
  }
}
