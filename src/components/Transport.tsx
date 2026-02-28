'use client'

import { useCallback, useEffect, useRef } from 'react'
import {
  Play, Pause, Square, SkipBack, Repeat,
  ZoomIn, ZoomOut, Music2
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAudioStore } from '@/store/audioStore'
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
  } = useAudioStore()

  const engine = getAudioEngine()
  // hasAudio: vérifie le moteur (source de vérité) ET le store comme fallback
  const hasAudio = tracks.length > 0 && (engine.getDuration() > 0 || tracks.some(t => t.storagePath || t.duration))

  // Sync engine events
  useEffect(() => {
    const onTimeUpdate = (data?: { time?: number }) => {
      if (data?.time !== undefined) setCurrentTime(data.time)
    }
    const onEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
    }

    engine.on('timeupdate', onTimeUpdate)
    engine.on('ended', onEnded)
    return () => {
      engine.off('timeupdate', onTimeUpdate)
      engine.off('ended', onEnded)
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

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border-b select-none"
      style={{
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        height: 56,
        flexShrink: 0,
      }}
    >
      {/* Logo + Project name */}
      <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
        <Music2 size={18} style={{ color: 'var(--accent)' }} />
        <span className="text-sm font-semibold truncate max-w-[160px]" style={{ color: 'var(--text)' }}>
          {projectName}
        </span>
      </div>

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

      {/* Transport buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon"
          onClick={handleReturnToStart}
          title="Retour au début (R)"
          disabled={!hasAudio}
        >
          <SkipBack size={16} />
        </Button>

        <Button
          variant={isPlaying ? 'active' : 'default'}
          size="icon"
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause (Espace)' : 'Lecture (Espace)'}
          disabled={!hasAudio}
          style={{ width: 40, height: 40 }}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </Button>

        <Button
          variant="ghost" size="icon"
          onClick={handleStop}
          title="Stop (S)"
          disabled={!hasAudio}
        >
          <Square size={14} />
        </Button>
      </div>

      <div className="w-px h-6 mx-1" style={{ background: 'var(--border)' }} />

      {/* Time display */}
      <div className="time-display text-sm font-medium tabular-nums" style={{ color: 'var(--text)', minWidth: 120 }}>
        {formatTime(currentTime)}
        <span className="ml-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          / {formatTime(duration)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex-1 relative h-1.5 rounded-full overflow-hidden cursor-pointer mx-2"
        style={{ background: 'var(--border)', maxWidth: 400 }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const ratio = (e.clientX - rect.left) / rect.width
          const newTime = ratio * duration
          engine.seekTo(newTime, isPlaying ? tracks : undefined)
          setCurrentTime(newTime)
        }}
      >
        <div
          className="absolute h-full rounded-full transition-none"
          style={{ width: `${progress}%`, background: 'var(--accent)' }}
        />
        {/* Loop region on progress bar */}
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

      {/* Loop */}
      <Button
        variant={loopEnabled ? 'active' : 'ghost'}
        size="icon"
        onClick={handleLoopToggle}
        title="Boucle (L)"
        disabled={!hasAudio}
      >
        <Repeat size={16} />
      </Button>

      {/* Loop range display */}
      {loopEnabled && loopEnd > loopStart && (
        <span className="text-xs tabular-nums" style={{ color: 'var(--accent)', minWidth: 120 }}>
          {formatTime(loopStart)} → {formatTime(loopEnd)}
        </span>
      )}

      <div className="flex-1" />

      {/* Zoom */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon"
          onClick={() => setZoomLevel(Math.max(1, zoomLevel / 2))}
          disabled={zoomLevel <= 1}
          title="Dézoom"
        >
          <ZoomOut size={14} />
        </Button>
        <span className="text-xs tabular-nums w-8 text-center" style={{ color: 'var(--text-muted)' }}>
          x{zoomLevel}
        </span>
        <Button
          variant="ghost" size="icon"
          onClick={() => setZoomLevel(Math.min(32, zoomLevel * 2))}
          disabled={zoomLevel >= 32}
          title="Zoom"
        >
          <ZoomIn size={14} />
        </Button>
      </div>

      {onSave && (
        <Button variant="ghost" size="sm" onClick={onSave} title="Sauvegarder (Cmd+S)">
          Sauvegarder
        </Button>
      )}
    </div>
  )
}
