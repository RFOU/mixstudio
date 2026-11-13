'use client'

/**
 * Instantanés de projets pour le mode hors-ligne.
 *
 * Le cache audio (audioCache.ts) ne suffit pas à ouvrir une chanson sans réseau :
 * il faut aussi la liste des pistes, les paroles, les boucles et l'état de
 * session, qui viennent de Supabase. On en garde une copie dans IndexedDB.
 *
 * Stockés dans la même base que l'audio (stores `projects` et `meta`).
 */

import { openDB, PROJECTS_STORE, META_STORE } from '@/lib/audio/audioCache'
import type { Database } from '@/lib/supabase/types'
import type { PendingTrackRow } from '@/store/audioStore'

type ProjectRow = Database['public']['Tables']['projects']['Row']
type LyricsRow = Database['public']['Tables']['lyrics']['Row']
type LoopPresetRow = Database['public']['Tables']['loop_presets']['Row']

export interface SessionLoopState {
  loop_enabled: boolean | null
  loop_start: number | null
  loop_end: number | null
}

export interface ProjectSnapshot {
  id: string
  project: ProjectRow
  tracks: PendingTrackRow[]
  lyrics: LyricsRow | null
  loopPresets: LoopPresetRow[]
  session: SessionLoopState | null
  /** true = « disponible hors-ligne » : audio protégé de l'éviction. */
  pinned: boolean
  savedAt: number
}

export interface UserMeta {
  key: 'user'
  userId: string
  email?: string
  role: 'admin' | 'viewer'
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Enregistre (ou met à jour) l'instantané d'un projet. `pinned` est conservé si non fourni. */
export async function saveProjectSnapshot(
  snap: Omit<ProjectSnapshot, 'pinned' | 'savedAt'> & { pinned?: boolean }
): Promise<void> {
  try {
    const db = await openDB()
    const existing = await getProjectSnapshot(snap.id)
    const value: ProjectSnapshot = {
      ...snap,
      pinned: snap.pinned ?? existing?.pinned ?? false,
      savedAt: Date.now(),
    }
    await request(db.transaction(PROJECTS_STORE, 'readwrite').objectStore(PROJECTS_STORE).put(value))
  } catch (err) {
    console.warn('[offline] saveProjectSnapshot failed:', err)
  }
}

export async function getProjectSnapshot(id: string): Promise<ProjectSnapshot | null> {
  try {
    const db = await openDB()
    const v = await request(db.transaction(PROJECTS_STORE, 'readonly').objectStore(PROJECTS_STORE).get(id))
    return (v as ProjectSnapshot | undefined) ?? null
  } catch {
    return null
  }
}

export async function listProjectSnapshots(): Promise<ProjectSnapshot[]> {
  try {
    const db = await openDB()
    const all = await request(db.transaction(PROJECTS_STORE, 'readonly').objectStore(PROJECTS_STORE).getAll())
    return (all as ProjectSnapshot[]).sort(
      (a, b) => +new Date(b.project.updated_at) - +new Date(a.project.updated_at)
    )
  } catch {
    return []
  }
}

export async function setSnapshotPinned(id: string, pinned: boolean): Promise<void> {
  const snap = await getProjectSnapshot(id)
  if (!snap) return
  await saveProjectSnapshot({ ...snap, pinned })
}

export async function deleteProjectSnapshot(id: string): Promise<void> {
  try {
    const db = await openDB()
    await request(db.transaction(PROJECTS_STORE, 'readwrite').objectStore(PROJECTS_STORE).delete(id))
  } catch {
    // ignore
  }
}

// --- Infos utilisateur (rôle, id) : nécessaires pour ouvrir l'app hors-ligne ---

export async function saveUserMeta(meta: Omit<UserMeta, 'key'>): Promise<void> {
  try {
    const db = await openDB()
    await request(db.transaction(META_STORE, 'readwrite').objectStore(META_STORE).put({ key: 'user', ...meta }))
  } catch {
    // ignore
  }
}

export async function getUserMeta(): Promise<UserMeta | null> {
  try {
    const db = await openDB()
    const v = await request(db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get('user'))
    return (v as UserMeta | undefined) ?? null
  } catch {
    return null
  }
}

/** À appeler à la déconnexion : sans ces infos, le mode hors-ligne n'est plus accessible. */
export async function clearUserMeta(): Promise<void> {
  try {
    const db = await openDB()
    await request(db.transaction(META_STORE, 'readwrite').objectStore(META_STORE).delete('user'))
  } catch {
    // ignore
  }
}
