'use client'

/**
 * Audio Cache using IndexedDB.
 *
 * IndexedDB is used instead of the Cache API for better cross-platform compatibility,
 * especially on iOS Safari where the Cache API is cleared aggressively between sessions.
 *
 * Cache key strategy: `{storagePath}@{fileSize}`
 *
 * If the file is updated (new upload → different fileSize in DB),
 * the cache key changes → old entry is ignored, new one is fetched.
 *
 * Cleanup of stale entries for the same storagePath is done on put().
 */

const DB_NAME = 'mixstudio-audio-cache'
const DB_VERSION = 1
const STORE_NAME = 'audio'

interface CacheEntry {
  key: string          // "{storagePath}@{fileSize}"
  storagePath: string
  fileSize: number
  data: ArrayBuffer
  cachedAt: number     // Date.now()
}

function cacheKey(storagePath: string, fileSize: number): string {
  return `${storagePath}@${fileSize}`
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)

      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          store.createIndex('storagePath', 'storagePath', { unique: false })
        }
      }

      req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result)
      req.onerror = (e) => {
        console.warn('[audioCache] IndexedDB open failed:', (e.target as IDBOpenDBRequest).error)
        dbPromise = null
        reject((e.target as IDBOpenDBRequest).error)
      }
    } catch (err) {
      console.warn('[audioCache] IndexedDB unavailable:', err)
      dbPromise = null
      reject(err)
    }
  })

  return dbPromise
}

function idbGet(db: IDBDatabase, key: string): Promise<CacheEntry | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result as CacheEntry | undefined)
    req.onerror = () => reject(req.error)
  })
}

function idbPut(db: IDBDatabase, entry: CacheEntry): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(entry)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).delete(key)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

function idbGetByIndex(db: IDBDatabase, indexName: string, value: string): Promise<CacheEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const index = tx.objectStore(STORE_NAME).index(indexName)
    const req = index.getAll(value)
    req.onsuccess = () => resolve(req.result as CacheEntry[])
    req.onerror = () => reject(req.error)
  })
}

function idbGetAll(db: IDBDatabase): Promise<CacheEntry[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result as CacheEntry[])
    req.onerror = () => reject(req.error)
  })
}

/** Returns true if a cached ArrayBuffer exists for this track version */
export async function hasCachedAudio(
  storagePath: string,
  fileSize: number
): Promise<boolean> {
  try {
    const db = await openDB()
    const entry = await idbGet(db, cacheKey(storagePath, fileSize))
    return !!entry
  } catch {
    return false
  }
}

/**
 * Get cached ArrayBuffer for a track, or null if not cached.
 * Returns null if IndexedDB is unavailable.
 */
export async function getCachedAudio(
  storagePath: string,
  fileSize: number
): Promise<ArrayBuffer | null> {
  try {
    const db = await openDB()
    const entry = await idbGet(db, cacheKey(storagePath, fileSize))
    if (!entry) return null
    return entry.data
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
    const db = await openDB()

    // Remove stale entries for the same storagePath
    const staleEntries = await idbGetByIndex(db, 'storagePath', storagePath)
    for (const entry of staleEntries) {
      if (entry.fileSize !== fileSize) {
        await idbDelete(db, entry.key)
      }
    }

    // Store new entry
    await idbPut(db, {
      key: cacheKey(storagePath, fileSize),
      storagePath,
      fileSize,
      data,
      cachedAt: Date.now(),
    })
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
    const db = await openDB()
    const all = await idbGetAll(db)
    let totalBytes = 0
    const entries = all.map(entry => {
      totalBytes += entry.fileSize
      return {
        storagePath: entry.storagePath,
        fileSize: entry.fileSize,
        cachedAt: new Date(entry.cachedAt).toISOString(),
      }
    })
    return { count: all.length, totalBytes, entries }
  } catch {
    return { count: 0, totalBytes: 0, entries: [] }
  }
}

/** Clear all cached audio (e.g. for a "clear cache" button) */
export async function clearAudioCache(): Promise<void> {
  try {
    indexedDB.deleteDatabase(DB_NAME)
    dbPromise = null
  } catch {
    // ignore
  }
}
