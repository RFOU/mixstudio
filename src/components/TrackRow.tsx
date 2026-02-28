'use client'

import { useCallback } from 'react'
import { Volume2, VolumeX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { WaveformCanvas } from '@/components/WaveformCanvas'
import { TrackData, useAudioStore } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { cn } from '@/lib/utils'

const TRACK_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#22c55e',
  '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface TrackRowProps {
  track: TrackData
  index: number
  onRemove: (id: string) => void
}

export function TrackRow({ track, index, onRemove }: TrackRowProps) {
  const {
    tracks, currentTime, duration,
    loopEnabled, loopStart, loopEnd,
    isPlaying,
    setTrackMute, setTrackSolo,
    setTrackVolume, setTrackPan,
    updateTrack,
    setCurrentTime, setIsPlaying,
  } = useAudioStore()

  const engine = getAudioEngine()
  const color = TRACK_COLORS[index % TRACK_COLORS.length]

  const hasSolo = tracks.some(t => t.soloed)

  const handleMute = useCallback(() => {
    const newMuted = !track.muted
    setTrackMute(track.id, newMuted)
    // Update audio immediately
    const updated = { ...track, muted: newMuted }
    engine.updateTrackAudio(updated)
  }, [engine, track, setTrackMute])

  const handleSolo = useCallback(() => {
    const newSoloed = !track.soloed
    setTrackSolo(track.id, newSoloed)
    // Rebuild solo state
    const updatedTracks = tracks.map(t =>
      t.id === track.id ? { ...t, soloed: newSoloed } : t
    )
    engine.updateSoloState(updatedTracks)
  }, [engine, track, tracks, setTrackSolo])

  const handleVolume = useCallback((volume: number) => {
    setTrackVolume(track.id, volume)
    engine.updateTrackAudio({ ...track, volume })
  }, [engine, track, setTrackVolume])

  const handlePan = useCallback((pan: number) => {
    setTrackPan(track.id, pan)
    engine.updateTrackAudio({ ...track, pan })
  }, [engine, track, setTrackPan])

  const handleSeek = useCallback((time: number) => {
    engine.seekTo(time)
    setCurrentTime(time)
    if (isPlaying) {
      setTimeout(() => { engine.play(tracks, time) }, 10)
    }
  }, [engine, isPlaying, tracks, setCurrentTime])

  const isAudible = !track.muted && (!hasSolo || track.soloed)
  const vuLevel = isAudible && isPlaying ? track.volume : 0

  return (
    <div
      className="flex items-stretch gap-0 border-b"
      style={{
        borderColor: 'var(--border)',
        background: 'var(--surface)',
        minHeight: 72,
      }}
    >
      {/* Color bar */}
      <div className="w-1 flex-shrink-0" style={{ background: color }} />

      {/* Controls panel */}
      <div
        className="flex flex-col justify-center gap-1 px-3 py-2 flex-shrink-0"
        style={{ width: 220, borderRight: '1px solid var(--border)' }}
      >
        {/* Track name */}
        <input
          type="text"
          value={track.name}
          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
          className="text-sm font-medium bg-transparent border-none outline-none w-full truncate"
          style={{ color: 'var(--text)' }}
        />

        <div className="flex items-center gap-1.5">
          {/* Mute */}
          <Button
            variant={track.muted ? 'danger' : 'ghost'}
            size="sm"
            onClick={handleMute}
            title="Mute (m)"
            className={cn('w-7 h-6 px-0 text-xs font-bold', track.muted && 'bg-[var(--danger)] text-white')}
          >
            M
          </Button>

          {/* Solo */}
          <Button
            variant={track.soloed ? 'active' : 'ghost'}
            size="sm"
            onClick={handleSolo}
            title="Solo (s)"
            className="w-7 h-6 px-0 text-xs font-bold"
          >
            S
          </Button>

          {/* Volume icon */}
          <div className="flex-shrink-0" style={{ color: track.muted ? 'var(--text-muted)' : 'var(--text-muted)' }}>
            {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </div>

          {/* Volume fader */}
          <div className="flex-1 min-w-0">
            <Slider
              value={track.volume}
              onChange={handleVolume}
              min={0}
              max={1}
              step={0.01}
            />
          </div>

          {/* VU meter */}
          <div className="flex gap-px flex-shrink-0">
            {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, i) => (
              <div
                key={i}
                className="rounded-sm transition-all duration-75"
                style={{
                  width: 3,
                  height: 12,
                  background: vuLevel >= threshold
                    ? (threshold > 0.8 ? 'var(--danger)' : threshold > 0.6 ? 'var(--warning)' : 'var(--success)')
                    : 'var(--border)',
                }}
              />
            ))}
          </div>
        </div>

        {/* Pan */}
        <div className="flex items-center gap-2">
          <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            PAN
          </span>
          <Slider
            value={track.pan}
            onChange={handlePan}
            min={-1}
            max={1}
            step={0.01}
            className="flex-1"
          />
          <span className="text-xs tabular-nums w-8 text-right flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
            {track.pan > 0 ? `R${Math.round(track.pan * 100)}` : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : 'C'}
          </span>
        </div>
      </div>

      {/* Waveform */}
      <div className="flex-1 relative overflow-hidden py-2 px-1"
        style={{ opacity: track.muted || (hasSolo && !track.soloed) ? 0.4 : 1 }}
      >
        <WaveformCanvas
          waveformData={track.waveformData || null}
          currentTime={currentTime}
          duration={duration}
          color={color}
          height={56}
          loopStart={loopStart}
          loopEnd={loopEnd}
          loopEnabled={loopEnabled}
          muted={track.muted || (hasSolo && !track.soloed)}
          onSeek={handleSeek}
          showLoop
        />
      </div>

      {/* Delete */}
      <div className="flex items-center px-2 flex-shrink-0">
        <Button
          variant="ghost" size="icon"
          onClick={() => onRemove(track.id)}
          className="opacity-0 group-hover:opacity-100 hover:!text-[var(--danger)]"
        >
          <Trash2 size={14} />
        </Button>
      </div>
    </div>
  )
}
