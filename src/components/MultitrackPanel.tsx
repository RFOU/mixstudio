'use client'

import { useCallback, useRef } from 'react'
import { Upload, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TrackRow } from '@/components/TrackRow'
import { useAudioStore } from '@/store/audioStore'
import { useShallow } from 'zustand/react/shallow'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { registerFile, removeFile } from '@/lib/fileRegistry'
import { formatFileSize } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/Toast'
import { v4 as uuidv4 } from 'uuid'

const TRACK_COLORS = [
  '#6366f1', '#ec4899', '#f59e0b', '#22c55e',
  '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6',
]

const ACCEPTED_TYPES = '.mp3,.wav,.flac,.ogg,.aac,.m4a'
const ACCEPTED_EXT_RE = /\.(mp3|wav|flac|ogg|aac|m4a)$/i
const MAX_FILE_SIZE = 300 * 1024 * 1024 // 300 MB
const MAX_TRACKS = 16

/** Validation côté client : extension OU type MIME audio (le navigateur ne fournit pas toujours le MIME). */
function isAcceptedAudioFile(file: File): boolean {
  return ACCEPTED_EXT_RE.test(file.name) || file.type.startsWith('audio/')
}

interface MultitrackPanelProps {
  compact?: boolean
}

export function MultitrackPanel({ compact = false }: MultitrackPanelProps) {
  const {
    tracks, isPlaying, userRole,
    addTrack, removeTrack, setLoading,
    setDuration, setCurrentTime, setIsPlaying,
  } = useAudioStore(useShallow(s => ({
    tracks: s.tracks, isPlaying: s.isPlaying, userRole: s.userRole,
    addTrack: s.addTrack, removeTrack: s.removeTrack, setLoading: s.setLoading,
    setDuration: s.setDuration, setCurrentTime: s.setCurrentTime, setIsPlaying: s.setIsPlaying,
  })))

  const isAdmin = userRole === 'admin'

  const engine = getAudioEngine()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const loadAudioFile = useCallback(async (file: File) => {
    if (!isAcceptedAudioFile(file)) {
      toast.error(`Format non supporté : ${file.name} (MP3, WAV, FLAC, OGG, AAC, M4A)`)
      return
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(`Fichier trop grand : ${formatFileSize(file.size)} (max 300 MB)`)
      return
    }

    setLoading(true, `Chargement de ${file.name}...`)

    try {
      const trackId = uuidv4()
      const buffer = await engine.loadBuffer(trackId, file)
      const waveformData = await engine.generateWaveformDataAsync(trackId)

      // Stocker la référence File dans le registry externe (Immer ne peut pas sérialiser File)
      registerFile(trackId, file)

      const newTrack = {
        id: trackId,
        name: file.name.replace(/\.[^/.]+$/, ''),
        position: tracks.length,
        volume: 1,
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
      toast.error(`Erreur lors du chargement de ${file.name}`)
    } finally {
      setLoading(false)
    }
  }, [engine, tracks.length, isPlaying, addTrack, setLoading, setDuration, setCurrentTime, setIsPlaying])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const audioFiles = Array.from(files).filter(isAcceptedAudioFile)

    if (audioFiles.length === 0) {
      toast.error('Aucun fichier audio valide (MP3, WAV, FLAC, OGG, AAC, M4A)')
      return
    }

    // Respecter la limite de pistes (drag-drop / multi-sélection inclus)
    const available = MAX_TRACKS - tracks.length
    if (available <= 0) {
      toast.error(`Limite atteinte : ${MAX_TRACKS} pistes maximum`)
      return
    }

    const toLoad = audioFiles.slice(0, available)
    if (audioFiles.length > available) {
      toast.error(`Seules ${available} piste(s) ajoutée(s) — limite de ${MAX_TRACKS} pistes`)
    }

    // Chargement séquentiel : évite que plusieurs fichiers lisent la même valeur
    // périmée de tracks.length (position/couleur) et de saturer le décodage.
    void (async () => {
      for (const f of toLoad) {
        await loadAudioFile(f)
      }
    })()
  }, [loadAudioFile, tracks.length])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleRemoveTrack = useCallback(async (id: string) => {
    // Suppression locale immédiate
    engine.removeTrack(id)
    removeFile(id)
    removeTrack(id)
    setDuration(engine.getDuration())

    // Suppression en DB si la piste est sauvegardée
    const track = tracks.find(t => t.id === id)
    if (track?.storagePath) {
      // Supprimer le fichier du storage
      await supabase.storage.from('audio-files').remove([track.storagePath])
    }
    // Supprimer la ligne en DB (même si pas de fichier storage)
    await supabase.from('tracks').delete().eq('id', id)
  }, [engine, tracks, removeTrack, setDuration, supabase])

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
          Pistes ({tracks.length}/{MAX_TRACKS})
        </span>
        {isAdmin && (
          <Button
            variant="ghost" size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={tracks.length >= MAX_TRACKS}
          >
            <Upload size={14} className="mr-1" />
            Importer
          </Button>
        )}
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
          isAdmin ? (
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
            <div className="flex flex-col items-center justify-center h-full gap-2 p-8" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">Aucune piste chargée</p>
            </div>
          )
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
                  compact={compact}
                />
              ))}

            {isAdmin && tracks.length < MAX_TRACKS && (
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
