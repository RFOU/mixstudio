'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  Play, Pause, Square, SkipBack, Repeat,
  ZoomIn, ZoomOut, Music2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAudioStore } from '@/store/audioStore'
import { useShallow } from 'zustand/react/shallow'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { formatTime } from '@/lib/utils'

interface TransportProps {
  onSave?: () => void
}

export function Transport({ onSave }: TransportProps) {
  const {
    isPlaying, currentTime, duration,
    loopEnabled, loopStart, loopEnd,
    tracks, zoomLevel, projectName,
    setIsPlaying, setCurrentTime, setDuration,
    setLoopEnabled, setZoomLevel,
    activeLoopField, setLoopPoints, setActiveLoopField,
  } = useAudioStore(useShallow(s => ({
    isPlaying: s.isPlaying, currentTime: s.currentTime, duration: s.duration,
    loopEnabled: s.loopEnabled, loopStart: s.loopStart, loopEnd: s.loopEnd,
    tracks: s.tracks, zoomLevel: s.zoomLevel, projectName: s.projectName,
    setIsPlaying: s.setIsPlaying, setCurrentTime: s.setCurrentTime, setDuration: s.setDuration,
    setLoopEnabled: s.setLoopEnabled, setZoomLevel: s.setZoomLevel,
    activeLoopField: s.activeLoopField, setLoopPoints: s.setLoopPoints, setActiveLoopField: s.setActiveLoopField,
  })))

  const engine = getAudioEngine()
  // hasAudio: vérifie le moteur (source de vérité) ET le store comme fallback
  const hasAudio = tracks.length > 0 && (engine.getDuration() > 0 || tracks.some(t => t.storagePath || t.duration))

  // Sync engine events (including Media Session remote controls)
  useEffect(() => {
    const onTimeUpdate = (data?: { time?: number }) => {
      if (data?.time !== undefined) setCurrentTime(data.time)
    }
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }
    const onMediaPlay = () => setIsPlaying(true)
    const onMediaPause = () => setIsPlaying(false)

    engine.on('timeupdate', onTimeUpdate)
    engine.on('ended', onEnded)
    engine.on('mediasessionplay', onMediaPlay)
    engine.on('mediasessionpause', onMediaPause)
    return () => {
      engine.off('timeupdate', onTimeUpdate)
      engine.off('ended', onEnded)
      engine.off('mediasessionplay', onMediaPlay)
      engine.off('mediasessionpause', onMediaPause)
    }
  }, [engine, setCurrentTime, setIsPlaying])

  // Update duration when tracks change
  useEffect(() => {
    const d = engine.getDuration()
    if (d > 0) setDuration(d)
  }, [tracks, engine, setDuration])

  const handlePlayPause = useCallback(async () => {
    await engine.resume()

    if (isPlaying) {
      engine.pause()
      setIsPlaying(false)
    } else {
      engine.play(tracks, currentTime)
      setIsPlaying(true)
    }
  }, [engine, isPlaying, tracks, currentTime, setIsPlaying])

  const handleStop = useCallback(() => {
    engine.stop()
    setIsPlaying(false)
    setCurrentTime(0)
  }, [engine, setIsPlaying, setCurrentTime])

  const handleReturnToStart = useCallback(() => {
    engine.seekTo(0, isPlaying ? tracks : undefined)
    setCurrentTime(0)
    if (!isPlaying) {
      // Also reset internal engine state fully when stopped
      engine.stop()
    }
  }, [engine, isPlaying, tracks, setCurrentTime])

  const handleLoopToggle = useCallback(() => {
    const newEnabled = !loopEnabled
    setLoopEnabled(newEnabled)
    engine.setLoop(newEnabled, loopStart, loopEnd)
  }, [engine, loopEnabled, loopStart, loopEnd, setLoopEnabled])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handlePlayPause()
          break
        case 'KeyS':
          if (!e.metaKey && !e.ctrlKey) handleStop()
          break
        case 'Home':
        case 'KeyR':
          handleReturnToStart()
          break
        case 'KeyL':
          handleLoopToggle()
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlePlayPause, handleStop, handleReturnToStart, handleLoopToggle])

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  // Barre de progression — réutilisée sur les 2 layouts
  const progressBar = (
    <div className="flex-1 relative h-2 rounded-full overflow-hidden cursor-pointer"
      style={{ background: 'var(--border)' }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = (e.clientX - rect.left) / rect.width
        const newTime = ratio * duration
        if (activeLoopField) {
          if (activeLoopField === 'start') {
            const clamped = Math.max(0, Math.min(newTime, loopEnd > 0 ? loopEnd - 0.1 : duration))
            setLoopPoints(clamped, loopEnd)
            engine.setLoop(loopEnabled && loopEnd > clamped, clamped, loopEnd)
            setActiveLoopField('end')
          } else {
            const clamped = Math.max(loopStart + 0.1, Math.min(newTime, duration))
            setLoopPoints(loopStart, clamped)
            engine.setLoop(loopEnabled, loopStart, clamped)
            setActiveLoopField(null)
          }
          return
        }
        engine.seekTo(newTime, isPlaying ? tracks : undefined)
        setCurrentTime(newTime)
      }}
    >
      <div
        className="absolute h-full rounded-full transition-none"
        style={{ width: `${progress}%`, background: 'var(--accent)' }}
      />
      {loopEnabled && duration > 0 && loopEnd > loopStart && (
        <div
          className="absolute h-full"
          style={{
            left: `${(loopStart / duration) * 100}%`,
            width: `${((loopEnd - loopStart) / duration) * 100}%`,
            background: 'rgba(99,102,241,0.3)',
          }}
        />
      )}
    </div>
  )

  return (
    <div
      className="flex flex-col border-b select-none"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)', flexShrink: 0 }}
    >
      {/* Ligne 1 : nom + boutons transport + temps + zoom */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        {/* Project name */}
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink-0">
          <Music2 size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-semibold truncate max-w-[100px] sm:max-w-[160px]" style={{ color: 'var(--text)' }}>
            {projectName}
          </span>
        </div>

        <div className="w-px h-5 mx-0.5 flex-shrink-0" style={{ background: 'var(--border)' }} />

        {/* Transport buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={handleReturnToStart} title="Retour au début (R)" disabled={!hasAudio}>
            <SkipBack size={15} />
          </Button>
          <Button
            variant={isPlaying ? 'active' : 'default'} size="icon"
            onClick={handlePlayPause}
            title={isPlaying ? 'Pause (Espace)' : 'Lecture (Espace)'}
            disabled={!hasAudio}
            style={{ width: 36, height: 36 }}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleStop} title="Stop (S)" disabled={!hasAudio}>
            <Square size={13} />
          </Button>
        </div>

        <div className="w-px h-5 mx-0.5 flex-shrink-0 hidden sm:block" style={{ background: 'var(--border)' }} />

        {/* Temps — masqué sur très petit écran */}
        <div className="text-xs font-medium tabular-nums flex-shrink-0 hidden sm:block" style={{ color: 'var(--text)' }}>
          {formatTime(currentTime)}
          <span className="ml-1" style={{ color: 'var(--text-muted)' }}>/ {formatTime(duration)}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Loop — masqué sur mobile (déplacé dans LoopPanel) */}
        <Button
          variant={loopEnabled ? 'active' : 'ghost'} size="icon"
          onClick={handleLoopToggle} title="Boucle (L)" disabled={!hasAudio}
          className="hidden sm:inline-flex"
        >
          <Repeat size={14} />
        </Button>

        {/* Loop range — masqué sur mobile */}
        {loopEnabled && loopEnd > loopStart && (
          <span className="text-xs tabular-nums hidden sm:block" style={{ color: 'var(--accent)' }}>
            {formatTime(loopStart)} → {formatTime(loopEnd)}
          </span>
        )}

        <div className="w-px h-5 mx-0.5 flex-shrink-0" style={{ background: 'var(--border)' }} />

        {/* Zoom */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={() => setZoomLevel(Math.max(1, zoomLevel / 2))} disabled={zoomLevel <= 1} title="Dézoom">
            <ZoomOut size={13} />
          </Button>
          <span className="text-xs tabular-nums w-6 text-center" style={{ color: 'var(--text-muted)' }}>x{zoomLevel}</span>
          <Button variant="ghost" size="icon" onClick={() => setZoomLevel(Math.min(32, zoomLevel * 2))} disabled={zoomLevel >= 32} title="Zoom">
            <ZoomIn size={13} />
          </Button>
        </div>
      </div>

      {/* Ligne 2 : barre de progression + temps sur mobile */}
      <div className="flex items-center gap-2 px-3 pb-2">
        {/* Temps sur mobile uniquement */}
        <span className="text-xs tabular-nums flex-shrink-0 sm:hidden" style={{ color: 'var(--text-muted)' }}>
          {formatTime(currentTime)}
        </span>
        {progressBar}
        <span className="text-xs tabular-nums flex-shrink-0 sm:hidden" style={{ color: 'var(--text-muted)' }}>
          {formatTime(duration)}
        </span>
        {/* Progress bar desktop (déjà visible dans la ligne 1 via spacer, on duplique ici pour desktop) */}
      </div>
    </div>
  )
}
