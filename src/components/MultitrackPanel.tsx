'use client'

import { useCallback, useRef } from 'react'
import { Upload, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TrackRow } from '@/components/TrackRow'
import { useAudioStore } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { registerFile, removeFile } from '@/lib/fileRegistry'
import { formatFileSize } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

const TRACK_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#22c55e',
  '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6',
]

const ACCEPTED_TYPES = '.mp3,.wav,.flac,.ogg,.aac,.m4a'
const MAX_FILE_SIZE = 300 * 1024 * 1024 // 300 MB

export function MultitrackPanel() {
  const {
    tracks, isPlaying,
    addTrack, removeTrack, setLoading,
    setDuration, setCurrentTime, setIsPlaying,
  } = useAudioStore()

  const engine = getAudioEngine()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAudioFile = useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      alert(`Fichier trop grand : ${formatFileSize(file.size)} (max 300 MB)`)
      return
    }

    setLoading(true, `Chargement de ${file.name}...`)

    try {
      const trackId = uuidv4()
      const buffer = await engine.loadBuffer(trackId, file)
      const waveformData = engine.generateWaveformData(trackId)

      // Stocker la référence File dans le registry externe (Immer ne peut pas sérialiser File)
      registerFile(trackId, file)

      const newTrack = {
        id: trackId,
        name: file.name.replace(/\.[^/.]+$/, ''),
        position: tracks.length,
        volume: 1,
        pan: 0,
        muted: false,
        soloed: false,
        color: TRACK_COLORS[tracks.length % TRACK_COLORS.length],
        waveformData,
        fileName: file.name,
        fileSize: file.size,
        duration: buffer.duration,
        sampleRate: buffer.sampleRate,
        storagePath: null,
      }

      addTrack(newTrack)
      setDuration(engine.getDuration())

      if (isPlaying) {
        engine.stop()
        setIsPlaying(false)
        setCurrentTime(0)
      }
    } catch (err) {
      console.error('Erreur chargement audio:', err)
      alert('Erreur lors du chargement du fichier audio')
    } finally {
      setLoading(false)
    }
  }, [engine, tracks.length, isPlaying, addTrack, setLoading, setDuration, setCurrentTime, setIsPlaying])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const audioFiles = fileArray.filter(
      f => f.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|aac|m4a)$/i.test(f.name)
    )
    audioFiles.forEach(f => loadAudioFile(f))
  }, [loadAudioFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleRemoveTrack = useCallback((id: string) => {
    engine.removeTrack(id)
    removeFile(id)
    removeTrack(id)
    setDuration(engine.getDuration())
  }, [engine, removeTrack, setDuration])

  return (
    <div
      className="flex flex-col flex-1 overflow-hidden"
      style={{ background: 'var(--background)' }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Pistes ({tracks.length}/16)
        </span>
        <Button
          variant="ghost" size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={tracks.length >= 16}
        >
          <Upload size={14} className="mr-1" />
          Importer
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Tracks list */}
      <div className="flex-1 overflow-y-auto">
        {tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
            <div
              className="border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 w-full max-w-md"
              style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
            >
              <Upload size={40} style={{ color: 'var(--accent)', opacity: 0.5 }} />
              <p className="text-base font-medium text-center" style={{ color: 'var(--text)' }}>
                Glissez vos fichiers audio ici
              </p>
              <p className="text-sm text-center" style={{ color: 'var(--text-muted)' }}>
                MP3, WAV, FLAC, OGG — jusqu&apos;à 300 MB par piste
              </p>
              <Button variant="default" onClick={() => fileInputRef.current?.click()}>
                <PlusCircle size={16} className="mr-2" />
                Sélectionner des fichiers
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {tracks
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((track, index) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  index={index}
                  onRemove={handleRemoveTrack}
                />
              ))}

            {tracks.length < 16 && (
              <button
                className="w-full py-3 flex items-center justify-center gap-2 text-sm transition-colors"
                style={{ color: 'var(--text-muted)', background: 'transparent' }}
                onClick={() => fileInputRef.current?.click()}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <PlusCircle size={14} />
                Ajouter une piste
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
