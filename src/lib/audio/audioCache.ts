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
// v2 : ajout des stores `projects` (instantanés de projets pour le hors-ligne)
// et `meta` (infos utilisateur). Le store `audio` est inchangé.
const DB_VERSION = 2
const STORE_NAME = 'audio'
export const PROJECTS_STORE = 'projects'
export const META_STORE = 'meta'

// Limite globale du cache : au-delà, on évince les entrées les plus anciennes (LRU par cachedAt).
// 1 Go est un compromis raisonnable (mobile compris) ; le quota navigateur reste prioritaire.
const MAX_CACHE_BYTES = 1024 * 1024 * 1024

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

export function openDB(): Promise<IDBDatabase> {
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
        if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
          db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' })
        }
      }

      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        // Si un autre onglet (ancienne version) doit migrer la base, on ferme
        // notre connexion au lieu de bloquer la mise à jour.
        db.onversionchange = () => {
          db.close()
          dbPromise = null
        }
        resolve(db)
      }
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

interface EntryMeta {
  key: string
  storagePath: string
  fileSize: number
  size: number
  cachedAt: number
}

/**
 * Parcourt le store au curseur et ne retient que les MÉTADONNÉES de chaque
 * entrée. Contrairement à getAll(), une seule valeur (avec son ArrayBuffer)
 * est en mémoire à la fois — getAll() matérialisait tout le cache (jusqu'à
 * 1 Go) d'un coup, ce qui pouvait tuer l'onglet sur mobile.
 */
function idbListMeta(db: IDBDatabase): Promise<EntryMeta[]> {
  return new Promise((resolve, reject) => {
    const metas: EntryMeta[] = []
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).openCursor()
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) {
        resolve(metas)
        return
      }
      const e = cursor.value as CacheEntry
      metas.push({
        key: e.key,
        storagePath: e.storagePath,
        fileSize: e.fileSize,
        size: e.data?.byteLength ?? e.fileSize ?? 0,
        cachedAt: e.cachedAt,
      })
      cursor.continue()
    }
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

    // Éviction LRU si on dépasse la limite globale
    await evictIfNeeded(db)
  } catch (err) {
    // Cache write failure is non-fatal — fall back to network
    console.warn('[audioCache] putCachedAudio failed:', err)
  }
}

/**
 * Évince les entrées les plus anciennes (par cachedAt) tant que la taille
 * totale du cache dépasse MAX_CACHE_BYTES.
 */
async function evictIfNeeded(db: IDBDatabase, maxBytes: number = MAX_CACHE_BYTES): Promise<void> {
  const metas = await idbListMeta(db)
  let total = metas.reduce((sum, m) => sum + m.size, 0)
  if (total <= maxBytes) return

  // Les morceaux « disponibles hors-ligne » (épinglés) ne sont jamais évincés :
  // c'est précisément ce que l'utilisateur a demandé de garder.
  const pinned = await getPinnedProjectIds(db)

  // Plus ancien en premier
  const sorted = metas.sort((a, b) => a.cachedAt - b.cachedAt)
  for (const meta of sorted) {
    if (total <= maxBytes) break
    const pid = projectIdFromStoragePath(meta.storagePath)
    if (pid && pinned.has(pid)) continue
    await idbDelete(db, meta.key)
    total -= meta.size
  }
}

/** Ramène le cache sous `maxBytes` (les morceaux épinglés sont épargnés). Surtout utile aux tests. */
export async function trimAudioCache(maxBytes: number = MAX_CACHE_BYTES): Promise<void> {
  try {
    await evictIfNeeded(await openDB(), maxBytes)
  } catch {
    // ignore
  }
}

/**
 * Les fichiers sont stockés sous `{userId}/{projectId}/{trackId}_{nom}` : le
 * projet est le 2ᵉ segment. Permet de regrouper le cache par chanson.
 */
export function projectIdFromStoragePath(storagePath: string): string | null {
  const parts = storagePath.split('/')
  return parts.length >= 3 ? parts[1] : null
}

/** Ids des projets marqués « disponibles hors-ligne » (lecture sans charger l'audio). */
function getPinnedProjectIds(db: IDBDatabase): Promise<Set<string>> {
  return new Promise((resolve) => {
    const ids = new Set<string>()
    try {
      const req = db.transaction(PROJECTS_STORE, 'readonly').objectStore(PROJECTS_STORE).openCursor()
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return resolve(ids)
        if (cursor.value?.pinned) ids.add(cursor.value.id as string)
        cursor.continue()
      }
      req.onerror = () => resolve(ids)
    } catch {
      resolve(ids)
    }
  })
}

export interface CacheEntryInfo {
  key: string
  storagePath: string
  projectId: string | null
  size: number
  cachedAt: number
}

/** Liste les entrées du cache audio (métadonnées seulement). */
export async function listCacheEntries(): Promise<CacheEntryInfo[]> {
  try {
    const db = await openDB()
    const metas = await idbListMeta(db)
    return metas.map(m => ({
      key: m.key,
      storagePath: m.storagePath,
      projectId: projectIdFromStoragePath(m.storagePath),
      size: m.size,
      cachedAt: m.cachedAt,
    }))
  } catch {
    return []
  }
}

/** Supprime tout l'audio en cache d'un projet. Retourne le nombre de fichiers supprimés. */
export async function deleteCachedAudioByProject(projectId: string): Promise<number> {
  try {
    const db = await openDB()
    const metas = await idbListMeta(db)
    let n = 0
    for (const m of metas) {
      if (projectIdFromStoragePath(m.storagePath) === projectId) {
        await idbDelete(db, m.key)
        n++
      }
    }
    return n
  } catch {
    return 0
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
    const metas = await idbListMeta(db)
    let totalBytes = 0
    const entries = metas.map(m => {
      totalBytes += m.size
      return {
        storagePath: m.storagePath,
        fileSize: m.fileSize,
        cachedAt: new Date(m.cachedAt).toISOString(),
      }
    })
    return { count: metas.length, totalBytes, entries }
  } catch {
    return { count: 0, totalBytes: 0, entries: [] }
  }
}

/** Clear all cached audio (e.g. for a "clear cache" button) */
export async function clearAudioCache(): Promise<void> {
  try {
    // On ne vide que le store audio : supprimer toute la base effacerait aussi
    // les instantanés de projets (infos nécessaires pour ouvrir hors-ligne).
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // ignore
  }
}
