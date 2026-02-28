'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Music2, FolderOpen, Plus, Trash2, Clock,
  LogOut, Play, ChevronRight, Loader2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAudioStore } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { hasCachedAudio } from '@/lib/audio/audioCache'
import { parseAnyLyrics } from '@/lib/lyrics/parseLyrics'
import type { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']
type TrackDB = Database['public']['Tables']['tracks']['Row']

export function ProjectsPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)

  const {
    setProject, addTrack, clearTracks, setDuration,
    setCurrentTime, setIsPlaying, setLoading: setStoreLoading,
    setLyrics, setLyricsVisible,
  } = useAudioStore()

  const engine = getAudioEngine()

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/')
        return
      }
      setUser({ id: user.id, email: user.email })

      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
      setProjects(data || [])
      setLoading(false)
    }
    init()
  }, [supabase, router])

  const reloadProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })
    setProjects(data || [])
  }

  const handleCreate = async () => {
    if (!user) return
    const name = newName.trim() || 'Nouveau projet'
    setCreating(true)
    const { error } = await supabase
      .from('projects')
      .insert({ user_id: user.id, name })
    if (!error) {
      setNewName('')
      await reloadProjects()
    }
    setCreating(false)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Supprimer ce projet ?')) return
    await supabase.from('projects').delete().eq('id', id)
    setProjects(p => p.filter(x => x.id !== id))
  }

  const handleOpen = async (project: Project) => {
    setOpeningId(project.id)

    const { data: tracks } = await supabase
      .from('tracks')
      .select('*')
      .eq('project_id', project.id)
      .order('position')

    const trackList: TrackDB[] = tracks || []

    // Charger les pistes dans le store + audio engine
    engine.stop()
    setIsPlaying(false)
    setCurrentTime(0)
    clearTracks()
    setProject(project.id, project.name, project.bpm)

    if (trackList.length > 0) {
      setStoreLoading(true, `Chargement de "${project.name}"...`)
      let loaded = 0

      for (const track of trackList) {
        if (!track.storage_path) continue
        try {
          const cacheHint = track.file_size
            ? { storagePath: track.storage_path, fileSize: track.file_size }
            : undefined

          const isCached = cacheHint
            ? await hasCachedAudio(cacheHint.storagePath, cacheHint.fileSize)
            : false

          setStoreLoading(true, isCached
            ? `Piste ${loaded + 1}/${trackList.length} depuis le cache — ${track.name}`
            : `Chargement piste ${loaded + 1}/${trackList.length} — ${track.name}`)

          let signedUrl = ''
          if (!isCached) {
            const { data: signedData, error: signedError } = await supabase.storage
              .from('audio-files')
              .createSignedUrl(track.storage_path, 3600)
            if (signedError || !signedData?.signedUrl) {
              console.error(`Signed URL ${track.name}:`, signedError?.message)
              continue
            }
            signedUrl = signedData.signedUrl
          }

          const waveformData = await engine.loadBufferFromUrl(track.id, signedUrl, cacheHint)
            .then(() => engine.generateWaveformData(track.id))

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

      // Paroles
      const { data: lyricsData } = await supabase
        .from('lyrics')
        .select('*')
        .eq('project_id', project.id)
        .single()

      if (lyricsData) {
        const { lines, format } = parseAnyLyrics(
          lyricsData.content,
          lyricsData.format as 'lrc' | 'srt' | 'plain'
        )
        setLyrics({ format, lines, offsetMs: lyricsData.offset_ms ?? 0, rawContent: lyricsData.content })
        setLyricsVisible(true)
      } else {
        setLyrics(null)
      }

      setStoreLoading(false)
    }

    router.push('/studio')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ height: '100vh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--background)' }}>

      {/* NAV */}
      <nav
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}
      >
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
            <Music2 size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <span className="font-bold text-sm tracking-wide" style={{ color: 'var(--text)' }}>MIXSTUDIO</span>
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{user.email}</span>
          )}
          <Link
            href="/studio"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}
          >
            <Play size={11} />
            Studio
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={12} />
            Déconnexion
          </button>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
              Mes projets
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Choisissez un projet à ouvrir ou créez-en un nouveau
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
            <FolderOpen size={20} style={{ color: 'var(--accent)' }} />
          </div>
        </div>

        {/* Créer un projet */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl border mb-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Nom du nouveau projet..."
            className="flex-1 text-sm px-3 py-2 rounded-lg border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white', opacity: creating ? 0.7 : 1 }}
          >
            {creating
              ? <Loader2 size={14} className="animate-spin" />
              : <Plus size={14} />}
            Créer
          </button>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="animate-spin mr-2" />
            Chargement...
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--text-muted)' }}>
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'var(--surface)' }}>
              <Music2 size={28} style={{ opacity: 0.3 }} />
            </div>
            <p className="text-sm">Aucun projet sauvegardé</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Créez votre premier projet ci-dessus ou importez des pistes dans le studio
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(project => (
              <div
                key={project.id}
                onClick={() => handleOpen(project)}
                className="flex items-center gap-4 p-4 rounded-xl border cursor-pointer group transition-colors"
                style={{
                  background: 'var(--surface)',
                  borderColor: openingId === project.id ? 'var(--accent)' : 'var(--border)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = openingId === project.id ? 'var(--accent)' : 'var(--border)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--accent-dim)' }}
                >
                  {openingId === project.id
                    ? <Loader2 size={18} style={{ color: 'var(--accent)' }} className="animate-spin" />
                    : <Music2 size={18} style={{ color: 'var(--accent)' }} />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                    {project.name}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={10} style={{ color: 'var(--text-muted)' }} />
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Modifié le {formatDate(project.updated_at)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleDelete(e, project.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg"
                    style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)' }}
                    title="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                  <ChevronRight
                    size={16}
                    style={{ color: 'var(--text-muted)' }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
