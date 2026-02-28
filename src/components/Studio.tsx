'use client'

import { useState, useRef, useCallback } from 'react'
import { Transport } from '@/components/Transport'
import { MultitrackPanel } from '@/components/MultitrackPanel'
import { LyricsPanel } from '@/components/LyricsPanel'
import { LoopPanel } from '@/components/LoopPanel'
import { StudioHeader } from '@/components/StudioHeader'
import { AuthModal } from '@/components/AuthModal'
import { ProjectsModal } from '@/components/ProjectsModal'
import { useAudioStore } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { createClient } from '@/lib/supabase/client'
import { parseAnyLyrics } from '@/lib/lyrics/parseLyrics'
import type { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']
type TrackDB = Database['public']['Tables']['tracks']['Row']

export function Studio() {
  const [showAuth, setShowAuth] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const {
    isLoading, loadingMessage, lyricsVisible,
    setProject, addTrack, clearTracks, setDuration,
    setCurrentTime, setIsPlaying, setLoading, setLyrics,
  } = useAudioStore()

  const engine = getAudioEngine()
  // Client stable via ref
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const handleLoadProject = useCallback(async (project: Project, tracks: TrackDB[]) => {
    // Stop playback et reset
    engine.stop()
    setIsPlaying(false)
    setCurrentTime(0)
    clearTracks()
    setProject(project.id, project.name, project.bpm)

    if (tracks.length === 0) return

    setLoading(true, `Chargement de "${project.name}"...`)

    let loaded = 0

    for (const track of tracks) {
      if (!track.storage_path) continue

      try {
        // Bucket privé → signed URL (valide 1h)
        const { data: signedData, error: signedError } = await supabase.storage
          .from('audio-files')
          .createSignedUrl(track.storage_path, 3600)

        if (signedError || !signedData?.signedUrl) {
          console.error(`Signed URL ${track.name}:`, signedError?.message)
          continue
        }

        setLoading(true, `Chargement piste ${loaded + 1}/${tracks.length} — ${track.name}`)

        const buffer = await engine.loadBufferFromUrl(track.id, signedData.signedUrl)
        const waveformData = engine.generateWaveformData(track.id)

        addTrack({
          id: track.id,
          name: track.name,
          position: track.position,
          volume: track.volume,
          pan: track.pan,
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
        console.error(`Erreur chargement piste ${track.name}:`, err)
      }
    }

    setDuration(engine.getDuration())

    // Charger les paroles si elles existent pour ce projet
    const { data: lyricsData } = await supabase
      .from('lyrics')
      .select('*')
      .eq('project_id', project.id)
      .single()

    if (lyricsData) {
      const { lines, format } = parseAnyLyrics(lyricsData.content, lyricsData.format as 'lrc' | 'srt' | 'plain')
      setLyrics({
        format,
        lines,
        offsetMs: lyricsData.offset_ms ?? 0,
        rawContent: lyricsData.content,
      })
    } else {
      setLyrics(null)
    }

    setLoading(false)
  }, [engine, supabase, addTrack, clearTracks, setProject, setDuration, setCurrentTime, setIsPlaying, setLoading, setLyrics])

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

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <MultitrackPanel />
          <LoopPanel />
        </div>
        {lyricsVisible && <LyricsPanel />}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div
          className="fixed inset-0 flex items-center justify-center z-40"
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
