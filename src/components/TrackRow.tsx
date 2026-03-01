'use client'

import { useCallback, useRef } from 'react'
import { Volume2, VolumeX, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Slider } from '@/components/ui/Slider'
import { WaveformCanvas } from '@/components/WaveformCanvas'
import { TrackData, useAudioStore } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const TRACK_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#22c55e',
  '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6',
]

interface TrackRowProps {
  track: TrackData
  index: number
  onRemove: (id: string) => void
  compact?: boolean
}

export function TrackRow({ track, index, onRemove, compact = false }: TrackRowProps) {
  const {
    tracks, currentTime, duration,
    loopEnabled, loopStart, loopEnd,
    isPlaying, projectId,
    setTrackMute, setTrackSolo,
    setTrackVolume,
    updateTrack,
    setCurrentTime,
  } = useAudioStore()

  const engine = getAudioEngine()
  const supabaseRef = useRef(createClient())
  const color = TRACK_COLORS[index % TRACK_COLORS.length]
  const hasSolo = tracks.some(t => t.soloed)
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleNameChange = useCallback((newName: string) => {
    // Mise à jour locale immédiate
    updateTrack(track.id, { name: newName })
    // Sauvegarde DB avec debounce 500ms
    if (renameTimerRef.current) clearTimeout(renameTimerRef.current)
    renameTimerRef.current = setTimeout(async () => {
      if (!projectId) return
      const { error } = await supabaseRef.current
        .from('tracks')
        .update({ name: newName, updated_at: new Date().toISOString() })
        .eq('id', track.id)
        .eq('project_id', projectId)
      if (error) console.error('Erreur renommage piste:', error.message)
    }, 500)
  }, [track.id, projectId, updateTrack])

  const handleMute = useCallback(() => {
    const newMuted = !track.muted
    setTrackMute(track.id, newMuted)
    engine.updateTrackAudio({ ...track, muted: newMuted })
  }, [engine, track, setTrackMute])

  const handleSolo = useCallback(() => {
    const newSoloed = !track.soloed
    setTrackSolo(track.id, newSoloed)
    const updatedTracks = tracks.map(t =>
      t.id === track.id ? { ...t, soloed: newSoloed } : t
    )
    engine.updateSoloState(updatedTracks)
  }, [engine, track, tracks, setTrackSolo])

  const handleVolume = useCallback((volume: number) => {
    setTrackVolume(track.id, volume)
    engine.updateTrackAudio({ ...track, volume })
  }, [engine, track, setTrackVolume])

  const handleSeek = useCallback((time: number) => {
    engine.seekTo(time, isPlaying ? tracks : undefined)
    setCurrentTime(time)
  }, [engine, isPlaying, tracks, setCurrentTime])

  const isAudible = !track.muted && (!hasSolo || track.soloed)
  const vuLevel = isAudible && isPlaying ? track.volume : 0

  return (
    <div
      className="flex flex-col border-b group"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      {/* Ligne principale : color bar + contrôles + waveform + supprimer */}
      {/* En mode compact (mobile + paroles visibles) : hauteur réduite */}
      <div className="flex items-stretch gap-0" style={{ minHeight: compact ? 44 : 64 }}>
        <div className="w-1 flex-shrink-0" style={{ background: color }} />

        {/* Panneau contrôles — adaptatif */}
        <div
          className="flex flex-col justify-center gap-1 px-2 py-1 flex-shrink-0"
          style={{ width: 'clamp(120px, 28vw, 220px)', borderRight: '1px solid var(--border)' }}
        >
          {/* Nom — masqué en compact pour gagner de la place */}
          {!compact && (
            <input
              type="text"
              value={track.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="text-xs font-medium bg-transparent border-none outline-none w-full"
              style={{ color: 'var(--text)' }}
              title={projectId ? 'Renommer — sauvegarde auto' : 'Renommer'}
            />
          )}

          <div className="flex items-center gap-1">
            {/* Bouton Mute — rouge vif si actif */}
            <Button
              variant="ghost" size="sm" onClick={handleMute}
              className={cn('w-6 h-5 px-0 text-xs font-bold border',
                track.muted
                  ? 'bg-red-500 text-white border-red-500'
                  : ''
              )}
              style={!track.muted ? {
                color: 'var(--text)',
                borderColor: 'var(--border-2)',
              } : undefined}
            >M</Button>

            {/* Bouton Solo — jaune/doré si actif */}
            <Button
              variant="ghost" size="sm" onClick={handleSolo}
              className={cn('w-6 h-5 px-0 text-xs font-bold border',
                track.soloed
                  ? 'bg-yellow-400 text-black border-yellow-400'
                  : ''
              )}
              style={!track.soloed ? {
                color: 'var(--text)',
                borderColor: 'var(--border-2)',
              } : undefined}
            >S</Button>

            {/* Icône volume — couleur selon état */}
            <div className="flex-shrink-0" style={{
              color: track.muted ? 'var(--danger)' : 'var(--text)'
            }}>
              {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
            </div>

            <div className="flex-1 min-w-0">
              <Slider value={track.volume} onChange={handleVolume} min={0} max={1} step={0.01} />
            </div>

            {/* VU meter — masqué sur mobile et en compact */}
            {!compact && (
              <div className="flex gap-px flex-shrink-0 hidden sm:flex">
                {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, i) => (
                  <div key={i} className="rounded-sm transition-all duration-75" style={{
                    width: 3, height: 10,
                    background: vuLevel >= threshold
                      ? (threshold > 0.8 ? 'var(--danger)' : threshold > 0.6 ? 'var(--warning)' : 'var(--success)')
                      : 'var(--border)',
                  }} />
                ))}
              </div>
            )}

            {/* Bouton supprimer — en compact il est ici, sinon à droite de la waveform */}
            {compact && (
              <Button
                variant="ghost" size="icon"
                onClick={() => onRemove(track.id)}
                style={{ color: 'var(--danger)', width: 20, height: 20 } as React.CSSProperties}
              >
                <Trash2 size={11} />
              </Button>
            )}
          </div>

        </div>

        {/* Waveform */}
        <div className="flex-1 relative overflow-hidden py-1 px-1"
          style={{ opacity: track.muted || (hasSolo && !track.soloed) ? 0.4 : 1 }}>
          <WaveformCanvas
            waveformData={track.waveformData || null}
            currentTime={currentTime} duration={duration} color={color}
            height={compact ? 28 : 48}
            loopStart={loopStart} loopEnd={loopEnd} loopEnabled={loopEnabled}
            muted={track.muted || (hasSolo && !track.soloed)}
            onSeek={handleSeek} showLoop
          />
        </div>

        {/* Supprimer — à droite de la waveform en mode normal */}
        {!compact && (
          <div className="flex items-center px-1.5 flex-shrink-0">
            <Button
              variant="ghost" size="icon"
              onClick={() => onRemove(track.id)}
              className="opacity-40 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--danger)' } as React.CSSProperties}
            >
              <Trash2 size={13} />
            </Button>
          </div>
        )}
      </div>

    </div>
  )
}
