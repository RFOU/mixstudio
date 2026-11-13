'use client'

/**
 * Gestion du mode hors-ligne : téléchargement d'un morceau pour l'avoir
 * « disponible hors-ligne », repli sur les instantanés quand le réseau manque,
 * et rapport d'occupation du stockage.
 */

import type { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'
import { useAudioStore, type PendingTrackRow } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import {
  clearAudioCache, deleteCachedAudioByProject, hasCachedAudio,
  listCacheEntries, putCachedAudio,
} from '@/lib/audio/audioCache'
import {
  getProjectSnapshot, listProjectSnapshots, saveProjectSnapshot, setSnapshotPinned,
  type ProjectSnapshot, type SessionLoopState,
} from '@/lib/offline/projectSnapshot'

type Supa = ReturnType<typeof createClient>
type ProjectRow = Database['public']['Tables']['projects']['Row']
type TrackRow = Database['public']['Tables']['tracks']['Row']
type LyricsRow = Database['public']['Tables']['lyrics']['Row']
type LoopPresetRow = Database['public']['Tables']['loop_presets']['Row']

export interface ProjectAux {
  lyrics: LyricsRow | null
  loopPresets: LoopPresetRow[]
  session: SessionLoopState | null
}

export const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

export function toPendingTrack(t: TrackRow): PendingTrackRow {
  return {
    id: t.id,
    name: t.name,
    position: t.position,
    volume: t.volume,
    muted: t.muted,
    soloed: t.soloed,
    color: t.color,
    storage_path: t.storage_path,
    file_name: t.file_name,
    file_size: t.file_size,
    duration: t.duration,
    sample_rate: t.sample_rate,
  }
}

/** URL signée : route serveur (tous rôles), repli client direct (admins). */
export async function getSignedAudioUrl(
  supabase: Supa,
  storagePath: string,
  name = storagePath
): Promise<string | null> {
  const res = await fetch('/api/audio/signed-url', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storagePath }),
  })
  if (res.ok) {
    const { signedUrl } = await res.json()
    return signedUrl ?? null
  }
  let errMsg = res.statusText
  try { const j = await res.json(); errMsg = j.error ?? errMsg } catch {}
  console.warn(`Signed URL API (${res.status}) pour "${name}": ${errMsg} — fallback client`)
  const { data, error } = await supabase.storage.from('audio-files').createSignedUrl(storagePath, 3600)
  if (error || !data?.signedUrl) {
    console.error(`Fallback signed URL échoué pour "${name}":`, error?.message ?? 'no url')
    return null
  }
  return data.signedUrl
}

/**
 * Le morceau est-il déjà chargé en mémoire (store + moteur audio) et à jour ?
 * Si oui, le rouvrir ne demande aucun rechargement : retour instantané.
 * « À jour » = mêmes pistes (ids) et mêmes fichiers (taille) que ceux de la base.
 */
export function isProjectAlreadyLoaded(
  projectId: string,
  tracks: { id: string; storage_path: string | null; file_size: number | null }[]
): boolean {
  const st = useAudioStore.getState()
  if (st.projectId !== projectId) return false
  const files = tracks.filter(t => t.storage_path)
  if (files.length === 0 || st.tracks.length !== files.length) return false
  const engine = getAudioEngine()
  return files.every(
    t => !!engine.getBuffer(t.id) && st.tracks.find(x => x.id === t.id)?.fileSize === t.file_size
  )
}

// ---------------------------------------------------------------------------
// Données annexes d'un projet (paroles, boucles, session)
// ---------------------------------------------------------------------------

async function fetchProjectAux(supabase: Supa, projectId: string): Promise<ProjectAux> {
  const [lyrics, presets, session] = await Promise.all([
    supabase.from('lyrics').select('*').eq('project_id', projectId).maybeSingle(),
    supabase.from('loop_presets').select('*').eq('project_id', projectId).order('created_at'),
    supabase.from('project_sessions').select('loop_enabled, loop_start, loop_end')
      .eq('project_id', projectId).maybeSingle(),
  ])
  // Une vraie erreur (réseau, droits) fait échouer l'appel → l'appelant se rabat sur l'instantané.
  const err = lyrics.error ?? presets.error ?? session.error
  if (err) throw new Error(err.message)
  return {
    lyrics: lyrics.data ?? null,
    loopPresets: presets.data ?? [],
    session: session.data ?? null,
  }
}

/**
 * Paroles / boucles / session d'un projet : réseau si possible, sinon instantané
 * local (hors-ligne ou erreur réseau). `fromSnapshot` indique quelle source a servi.
 */
export async function loadProjectAux(
  supabase: Supa,
  projectId: string
): Promise<ProjectAux & { fromSnapshot: boolean }> {
  if (!isOffline()) {
    try {
      return { ...(await fetchProjectAux(supabase, projectId)), fromSnapshot: false }
    } catch (err) {
      console.warn('[offline] lecture réseau impossible, repli sur l’instantané:', err)
    }
  }
  const snap = await getProjectSnapshot(projectId)
  return {
    lyrics: snap?.lyrics ?? null,
    loopPresets: snap?.loopPresets ?? [],
    session: snap?.session ?? null,
    fromSnapshot: true,
  }
}

/** Met à jour l'instantané d'un projet (silencieux : ne doit jamais gêner l'ouverture). */
export async function refreshProjectSnapshot(
  supabase: Supa,
  project: ProjectRow,
  tracks: TrackRow[]
): Promise<void> {
  if (isOffline()) return
  try {
    const aux = await fetchProjectAux(supabase, project.id)
    await saveProjectSnapshot({ id: project.id, project, tracks: tracks.map(toPendingTrack), ...aux })
  } catch (err) {
    console.warn('[offline] refreshProjectSnapshot failed:', err)
  }
}

// ---------------------------------------------------------------------------
// « Disponible hors-ligne »
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  done: number
  total: number
}

const DOWNLOAD_CONCURRENCY = 2

/**
 * Télécharge l'audio de toutes les pistes dans le cache et épingle le projet
 * (protégé de l'éviction). Les pistes déjà en cache ne sont pas retéléchargées.
 */
export async function downloadProjectForOffline(
  supabase: Supa,
  project: ProjectRow,
  tracks: TrackRow[],
  onProgress?: (p: DownloadProgress) => void
): Promise<{ downloaded: number; alreadyCached: number }> {
  if (isOffline()) throw new Error('Connexion requise pour télécharger ce morceau')

  // Pistes cachables : il faut un chemin et une taille (la taille fait partie de la clé de cache).
  const files = tracks.filter(t => t.storage_path && t.file_size)
  if (files.length === 0) throw new Error('Aucun fichier audio à télécharger pour ce morceau')

  const aux = await fetchProjectAux(supabase, project.id)
  // On enregistre d'abord l'instantané (non épinglé) : les métadonnées sont déjà utiles.
  await saveProjectSnapshot({ id: project.id, project, tracks: tracks.map(toPendingTrack), ...aux, pinned: false })

  let done = 0
  let downloaded = 0
  let alreadyCached = 0
  const failures: string[] = []
  onProgress?.({ done, total: files.length })

  let cursor = 0
  const worker = async () => {
    while (cursor < files.length) {
      const t = files[cursor++]
      const path = t.storage_path as string
      const size = t.file_size as number
      try {
        if (await hasCachedAudio(path, size)) {
          alreadyCached++
        } else {
          const url = await getSignedAudioUrl(supabase, path, t.name)
          if (!url) throw new Error('URL signée indisponible')
          const res = await fetch(url)
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          await putCachedAudio(path, size, await res.arrayBuffer())
          downloaded++
        }
      } catch (err) {
        console.error(`[offline] téléchargement de "${t.name}" échoué:`, err)
        failures.push(t.name)
      }
      onProgress?.({ done: ++done, total: files.length })
    }
  }
  await Promise.all(Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, files.length) }, worker))

  if (failures.length > 0) {
    throw new Error(`Téléchargement incomplet : ${failures.join(', ')}`)
  }

  // Vérifie que tout est réellement en cache avant d'épingler (le cache peut
  // avoir été évincé / refusé par le navigateur faute de place).
  for (const t of files) {
    if (!(await hasCachedAudio(t.storage_path as string, t.file_size as number))) {
      throw new Error('Le navigateur n’a pas conservé tous les fichiers (stockage insuffisant ?)')
    }
  }
  await setSnapshotPinned(project.id, true)
  return { downloaded, alreadyCached }
}

/** Retire un morceau du hors-ligne : supprime son audio et le dés-épingle. */
export async function removeProjectOffline(projectId: string): Promise<void> {
  await deleteCachedAudioByProject(projectId)
  await setSnapshotPinned(projectId, false)
}

/** Vide tout l'audio en cache et dés-épingle tous les morceaux. */
export async function clearAllOffline(): Promise<void> {
  await clearAudioCache()
  for (const s of await listProjectSnapshots()) {
    if (s.pinned) await setSnapshotPinned(s.id, false)
  }
}

// ---------------------------------------------------------------------------
// Rapport de stockage
// ---------------------------------------------------------------------------

export interface StorageProjectLine {
  projectId: string | null
  name: string
  bytes: number
  files: number
  pinned: boolean
}

export interface StorageReport {
  projects: StorageProjectLine[]
  audioBytes: number
  /** Occupation totale de l'origine (audio + reste), si le navigateur l'indique. */
  usage: number | null
  quota: number | null
  persisted: boolean | null
}

export async function getStorageReport(): Promise<StorageReport> {
  const [entries, snapshots] = await Promise.all([listCacheEntries(), listProjectSnapshots()])
  const byId = new Map<string, ProjectSnapshot>(snapshots.map(s => [s.id, s]))

  const groups = new Map<string, StorageProjectLine>()
  for (const e of entries) {
    const gid = e.projectId ?? '__unknown__'
    const snap = e.projectId ? byId.get(e.projectId) : undefined
    const line = groups.get(gid) ?? {
      projectId: e.projectId,
      name: snap?.project.name ?? 'Chanson inconnue',
      bytes: 0,
      files: 0,
      pinned: snap?.pinned ?? false,
    }
    line.bytes += e.size
    line.files += 1
    groups.set(gid, line)
  }

  let usage: number | null = null
  let quota: number | null = null
  let persisted: boolean | null = null
  try {
    const est = await navigator.storage?.estimate?.()
    usage = est?.usage ?? null
    quota = est?.quota ?? null
    persisted = (await navigator.storage?.persisted?.()) ?? null
  } catch {
    // API indisponible : on n'affiche simplement pas ces infos
  }

  const projects = [...groups.values()].sort((a, b) => b.bytes - a.bytes)
  return { projects, audioBytes: projects.reduce((s, p) => s + p.bytes, 0), usage, quota, persisted }
}

/**
 * Demande au navigateur de ne pas vider le stockage de l'app.
 * Safari efface sinon les données d'un site non utilisé pendant ~7 jours ; une
 * app ajoutée à l'écran d'accueil est exemptée.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  try {
    return (await navigator.storage?.persist?.()) ?? null
  } catch {
    return null
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(bytes < 1e8 ? 1 : 0)} Mo`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`
}
