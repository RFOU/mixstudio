'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Transport } from '@/components/Transport'
import { MultitrackPanel } from '@/components/MultitrackPanel'
import { LyricsPanel } from '@/components/LyricsPanel'
import { LoopPanel } from '@/components/LoopPanel'
import { StudioHeader } from '@/components/StudioHeader'
import { AuthModal } from '@/components/AuthModal'
import { ProjectsModal } from '@/components/ProjectsModal'
import { useAudioStore } from '@/store/audioStore'
import { useShallow } from 'zustand/react/shallow'
import type { PendingTrackRow } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { createClient } from '@/lib/supabase/client'
import { parseAnyLyrics } from '@/lib/lyrics/parseLyrics'
import { hasCachedAudio } from '@/lib/audio/audioCache'
import type { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']
type TrackDB = Database['public']['Tables']['tracks']['Row']

export function Studio() {
  const [showAuth, setShowAuth] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  // Detect mobile breakpoint (< 640px = Tailwind sm) — false by default (SSR-safe)
  const [isMobile, setIsMobile] = useState(false)
  const router = useRouter()
  const {
    isLoading, loadingMessage, lyricsVisible, projectId, pendingLoad,
    setProject, addTrack, clearTracks, setDuration, setPendingLoad,
    setCurrentTime, setIsPlaying, setLoading, setLyrics, setLyricsVisible,
    setLoopPoints, setLoopEnabled, addLoopPreset,
  } = useAudioStore(useShallow(s => ({
    isLoading: s.isLoading, loadingMessage: s.loadingMessage, lyricsVisible: s.lyricsVisible,
    projectId: s.projectId, pendingLoad: s.pendingLoad,
    setProject: s.setProject, addTrack: s.addTrack, clearTracks: s.clearTracks,
    setDuration: s.setDuration, setPendingLoad: s.setPendingLoad,
    setCurrentTime: s.setCurrentTime, setIsPlaying: s.setIsPlaying, setLoading: s.setLoading,
    setLyrics: s.setLyrics, setLyricsVisible: s.setLyricsVisible,
    setLoopPoints: s.setLoopPoints, setLoopEnabled: s.setLoopEnabled, addLoopPreset: s.addLoopPreset,
  })))

  const engine = getAudioEngine()
  // Client stable via ref
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current
  // Guard: prevents double-run in React Strict Mode or on re-renders
  const pendingLoadConsumedRef = useRef(false)

  // Detect mobile on mount and on resize
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Redirect to projects list if no project loaded (and not currently loading)
  useEffect(() => {
    if (!isLoading && !projectId && !pendingLoad) {
      router.replace('/projects')
    }
  }, [isLoading, projectId, pendingLoad, router])

  /** Core loading logic — shared by both pendingLoad and ProjectsModal flows */
  const loadTracks = useCallback(async (
    projectId: string,
    projectName: string,
    tracks: PendingTrackRow[]
  ) => {
    setLoading(true, `Chargement de "${projectName}"...`)

    if (tracks.length === 0) {
      setLoading(false)
      return
    }

    let loaded = 0

    for (const track of tracks) {
      if (!track.storage_path) continue

      try {
        const cacheHint = track.file_size
          ? { storagePath: track.storage_path, fileSize: track.file_size }
          : undefined

        const isCached = cacheHint ? await hasCachedAudio(cacheHint.storagePath, cacheHint.fileSize) : false

        setLoading(true, isCached
          ? `Piste ${loaded + 1}/${tracks.length} depuis le cache — ${track.name}`
          : `Chargement piste ${loaded + 1}/${tracks.length} — ${track.name}`)

        let signedUrl = ''
        if (!isCached) {
          // Try the server-side API route first (works for all roles, bypasses storage RLS)
          const res = await fetch('/api/audio/signed-url', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storagePath: track.storage_path }),
          })

          if (res.ok) {
            const { signedUrl: url } = await res.json()
            signedUrl = url
          } else {
            let errMsg = res.statusText
            try { const j = await res.json(); errMsg = j.error ?? errMsg } catch {}
            console.warn(`Signed URL API (${res.status}) pour "${track.name}": ${errMsg} — fallback client`)

            // Fallback: try directly via browser Supabase client (works for admins)
            const { data: fallbackData, error: fallbackErr } = await supabase.storage
              .from('audio-files')
              .createSignedUrl(track.storage_path, 3600)

            if (fallbackErr || !fallbackData?.signedUrl) {
              console.error(`Fallback signed URL échoué pour "${track.name}":`, fallbackErr?.message ?? 'no url')
              continue
            }
            signedUrl = fallbackData.signedUrl
          }
        }

        await engine.loadBufferFromUrl(track.id, signedUrl, cacheHint)
        const waveformData = await engine.generateWaveformDataAsync(track.id)

        addTrack({
          id: track.id,
          name: track.name,
          position: track.position,
          volume: track.volume,
          muted: track.muted,
          soloed: track.soloed,
          color: track.color,
          waveformData,
          storagePath: track.storage_path,
          fileName: track.file_name,
          fileSize: track.file_size,
          duration: track.duration,
          sampleRate: track.sample_rate,
        })

        loaded++
      } catch (err) {
        console.error(`Erreur chargement piste "${track.name}":`, err)
      }
    }

    if (loaded === 0 && tracks.filter(t => t.storage_path).length > 0) {
      console.error('Aucune piste chargée — vérifier l\'authentification et les politiques RLS')
    }

    setDuration(engine.getDuration())

    // Load lyrics
    const { data: lyricsData } = await supabase
      .from('lyrics')
      .select('*')
      .eq('project_id', projectId)
      .single()

    if (lyricsData) {
      const { lines, format } = parseAnyLyrics(lyricsData.content, lyricsData.format as 'lrc' | 'srt' | 'plain')
      setLyrics({
        format,
        lines,
        offsetMs: lyricsData.offset_ms ?? 0,
        rawContent: lyricsData.content,
      })
      setLyricsVisible(true)
    } else {
      setLyrics(null)
    }

    // Load loop presets
    const { data: presets } = await supabase
      .from('loop_presets')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at')

    if (presets && presets.length > 0) {
      for (const p of presets) {
        addLoopPreset({
          id: p.id,
          name: p.name,
          startTime: Number(p.start_time),
          endTime: Number(p.end_time),
        })
      }
    }

    // Load loop state from session
    const { data: session } = await supabase
      .from('project_sessions')
      .select('loop_enabled, loop_start, loop_end')
      .eq('project_id', projectId)
      .single()

    if (session) {
      const start = Number(session.loop_start ?? 0)
      const end = Number(session.loop_end ?? 0)
      if (end > start) {
        setLoopPoints(start, end)
        setLoopEnabled(session.loop_enabled ?? false)
        engine.setLoop(session.loop_enabled ?? false, start, end)
      }
    }

    setLoading(false)
  }, [engine, supabase, addTrack, setDuration, setLoading, setLyrics, setLyricsVisible, addLoopPreset, setLoopPoints, setLoopEnabled])

  // Keep a stable ref to loadTracks so the pendingLoad effect doesn't re-fire on each render
  const loadTracksRef = useRef(loadTracks)
  useEffect(() => { loadTracksRef.current = loadTracks }, [loadTracks])

  // Consume pendingLoad set by ProjectsPage — runs the loading here so the modal is visible
  useEffect(() => {
    if (!pendingLoad) return
    if (pendingLoadConsumedRef.current) return
    pendingLoadConsumedRef.current = true

    // Set loading immediately to prevent the redirect effect from triggering
    setLoading(true, `Chargement de "${pendingLoad.projectName}"...`)
    // Clear from store to avoid double-run on remount
    setPendingLoad(null)
    // Use the ref so this effect has no dependency on loadTracks itself
    loadTracksRef.current(pendingLoad.projectId, pendingLoad.projectName, pendingLoad.tracks)
      .finally(() => { pendingLoadConsumedRef.current = false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLoad])

  /** Used by ProjectsModal (in-studio project switcher) */
  const handleLoadProject = useCallback(async (project: Project, tracks: TrackDB[]) => {
    engine.stop()
    setIsPlaying(false)
    setCurrentTime(0)
    clearTracks()
    setProject(project.id, project.name, project.bpm)

    await loadTracks(project.id, project.name, tracks.map(t => ({
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
    })))
  }, [engine, loadTracks, clearTracks, setProject, setCurrentTime, setIsPlaying])

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', background: 'var(--background)', overflow: 'hidden' }}
    >
      <StudioHeader
        onOpenProjects={() => setShowProjects(true)}
        onOpenAuth={() => setShowAuth(true)}
      />

      <Transport />

      {/* Sur mobile : colonne (pistes compactes en haut, paroles en bas). Sur desktop : côte à côte */}
      <div className="flex flex-col sm:flex-row flex-1 overflow-hidden">
        {/* Zone pistes — compacte uniquement sur mobile si paroles visibles */}
        <div
          className="flex flex-col overflow-hidden flex-shrink-0 sm:flex-1 sm:flex-shrink sm:min-h-0"
          style={isMobile && lyricsVisible
            ? { height: 'clamp(180px, 48vh, 300px)' }
            : { flex: 1, minHeight: 0 }
          }
        >
          <MultitrackPanel compact={isMobile && lyricsVisible} />
          {/* LoopPanel complet — masqué sur mobile si paroles visibles */}
          <div className={isMobile && lyricsVisible ? 'hidden' : ''}>
            <LoopPanel />
          </div>
        </div>
        {lyricsVisible && (
          // Mobile : colonne pleine hauteur (flex-1). Desktop : panneau latéral
          // dimensionné par son contenu (flex-none) pour que la zone pistes
          // occupe tout l'espace restant au lieu de laisser un vide à droite.
          <div className="flex flex-col flex-1 sm:flex-none overflow-hidden min-h-0">
            {/* Presets de boucle en mode mobile + paroles */}
            {isMobile && <LoopPanel presetsOnly />}
            <LyricsPanel />
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        >
          <div
            className="flex flex-col items-center gap-3 p-6 rounded-xl"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <div
              className="w-8 h-8 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {loadingMessage || 'Chargement...'}
            </p>
          </div>
        </div>
      )}

      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showProjects && (
        <ProjectsModal
          onClose={() => setShowProjects(false)}
          onLoadProject={handleLoadProject}
        />
      )}
    </div>
  )
}
