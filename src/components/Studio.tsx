'use client'

import { useState, useCallback } from 'react'
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
import type { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']
type TrackDB = Database['public']['Tables']['tracks']['Row']

export function Studio() {
  const [showAuth, setShowAuth] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const {
    isLoading, loadingMessage, lyricsVisible,
    setProject, addTrack, clearTracks, setDuration, setCurrentTime, setIsPlaying,
  } = useAudioStore()

  const engine = getAudioEngine()
  const supabase = createClient()

  const handleLoadProject = useCallback(async (project: Project, tracks: TrackDB[]) => {
    // Stop playback
    engine.stop()
    setIsPlaying(false)
    setCurrentTime(0)

    // Clear existing
    clearTracks()
    setProject(project.id, project.name, project.bpm)

    // Load tracks from storage
    for (const track of tracks) {
      if (track.storage_path) {
        try {
          const { data } = supabase.storage
            .from('audio-files')
            .getPublicUrl(track.storage_path)

          const buffer = await engine.loadBufferFromUrl(track.id, data.publicUrl)
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
            audioBuffer: buffer,
            waveformData,
            storagePath: track.storage_path,
            fileName: track.file_name,
            fileSize: track.file_size,
            duration: track.duration,
            sampleRate: track.sample_rate,
          })
        } catch (err) {
          console.error(`Failed to load track ${track.name}:`, err)
        }
      }
    }

    const newDuration = engine.getDuration()
    setDuration(newDuration)
  }, [engine, supabase, addTrack, clearTracks, setProject, setDuration, setCurrentTime, setIsPlaying])

  return (
    <div
      className="flex flex-col"
      style={{ height: '100vh', background: 'var(--background)', overflow: 'hidden' }}
    >
      {/* Top bar */}
      <StudioHeader
        onOpenProjects={() => setShowProjects(true)}
        onOpenAuth={() => setShowAuth(true)}
      />

      {/* Transport */}
      <Transport />

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Multitrack + Loop */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <MultitrackPanel />
          <LoopPanel />
        </div>

        {/* Lyrics panel */}
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
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              {loadingMessage || 'Chargement...'}
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
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
