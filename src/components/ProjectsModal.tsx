'use client'

import { useState, useEffect, useRef } from 'react'
import { FolderOpen, Plus, Trash2, Clock, X, Music2, AlertCircle, CheckCircle2, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useAudioStore } from '@/store/audioStore'
import { useShallow } from 'zustand/react/shallow'
import { Database } from '@/lib/supabase/types'
import { getFile } from '@/lib/fileRegistry'

type Project = Database['public']['Tables']['projects']['Row']
type Track = Database['public']['Tables']['tracks']['Row']

interface ProjectsModalProps {
  onClose: () => void
  onLoadProject: (project: Project, tracks: Track[]) => void
}

export function ProjectsModal({ onClose, onLoadProject }: ProjectsModalProps) {
  const { projectName, tracks, setProject } = useAudioStore(useShallow(s => ({
    projectName: s.projectName, tracks: s.tracks, setProject: s.setProject,
  })))
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error' | 'not-logged'>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [newProjectName, setNewProjectName] = useState('')
  const [currentUser, setCurrentUser] = useState<{ id: string; email?: string } | null>(null)

  // Client stable via ref
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // Charger l'utilisateur et les projets à l'ouverture
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user ? { id: user.id, email: user.email } : null)

      setLoading(true)
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) console.error('Erreur chargement projets:', error)
      setProjects(data || [])
      setLoading(false)
    }
    init()
  }, [supabase])

  const reloadProjects = async () => {
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })
    setProjects(data || [])
  }

  const handleSaveCurrentProject = async () => {
    setSaving(true)
    setSaveStatus('idle')
    setSaveMessage('')

    // 1. Vérifier connexion
    if (!currentUser) {
      setSaveStatus('not-logged')
      setSaveMessage('Vous devez être connecté pour sauvegarder.')
      setSaving(false)
      return
    }

    try {
      // 2. Créer le projet en DB
      const { data: proj, error: projError } = await supabase
        .from('projects')
        .insert({ user_id: currentUser.id, name: projectName })
        .select()
        .single()

      if (projError || !proj) {
        setSaveStatus('error')
        setSaveMessage(`Erreur DB : ${projError?.message ?? 'réponse vide'}`)
        setSaving(false)
        return
      }

      // 3. Mettre à jour le store
      setProject(proj.id, proj.name, proj.bpm)

      // 4. Uploader chaque piste
      let uploadErrors = 0
      for (const track of tracks) {
        let storagePath = track.storagePath ?? null

        // Upload Storage si fichier local disponible
        if (!storagePath) {
          const localFile = getFile(track.id)
          if (localFile) {
            const filePath = `${currentUser.id}/${proj.id}/${track.id}_${localFile.name}`
            const { data: storageData, error: storageError } = await supabase.storage
              .from('audio-files')
              .upload(filePath, localFile, { upsert: false })

            if (storageError) {
              console.error(`Upload Storage ${track.name}:`, storageError.message)
              uploadErrors++
            } else {
              storagePath = storageData.path
            }
          }
        }

        // Insert piste en DB
        const { error: trackError } = await supabase.from('tracks').insert({
          id: track.id,
          project_id: proj.id,
          name: track.name,
          position: track.position,
          volume: track.volume,
          muted: track.muted,
          soloed: track.soloed,
          color: track.color,
          storage_path: storagePath,
          file_name: track.fileName ?? null,
          file_size: track.fileSize ?? null,
          duration: track.duration ?? null,
          sample_rate: track.sampleRate ?? null,
        })

        if (trackError) {
          console.error(`Insert piste ${track.name}:`, trackError.message)
          uploadErrors++
        }
      }

      setSaveStatus('success')
      setSaveMessage(
        uploadErrors > 0
          ? `Chanson sauvegardée avec ${tracks.length - uploadErrors}/${tracks.length} piste(s). ${uploadErrors} erreur(s) d'upload.`
          : `"${proj.name}" sauvegardée — ${tracks.length} piste(s).`
      )
      await reloadProjects()
    } catch (err: unknown) {
      console.error('Erreur inattendue:', err)
      setSaveStatus('error')
      setSaveMessage(`Erreur inattendue : ${err instanceof Error ? err.message : String(err)}`)
    }

    setSaving(false)
  }

  const handleCreateProject = async () => {
    if (!currentUser) {
      setSaveStatus('not-logged')
      setSaveMessage('Vous devez être connecté.')
      return
    }

    const name = newProjectName.trim() || 'Nouvelle chanson'
    setSaving(true)

    const { error } = await supabase
      .from('projects')
      .insert({ user_id: currentUser.id, name })

    if (error) {
      console.error('Erreur création projet:', error.message)
      setSaveStatus('error')
      setSaveMessage(`Erreur : ${error.message}`)
    } else {
      setNewProjectName('')
      await reloadProjects()
    }
    setSaving(false)
  }

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Supprimer cette chanson ?')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) {
      console.error('Erreur suppression:', error.message)
    } else {
      await reloadProjects()
    }
  }

  const handleLoadProject = async (project: Project) => {
    const { data: trackData } = await supabase
      .from('tracks')
      .select('*')
      .eq('project_id', project.id)
      .order('position')

    onLoadProject(project, trackData || [])
    onClose()
  }

  const formatDate = (date: string) => new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2">
            <FolderOpen size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Chansons</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Statut connexion */}
            <span className="text-xs" style={{ color: currentUser ? 'var(--success)' : 'var(--warning)' }}>
              {currentUser ? `● ${currentUser.email}` : '● Non connecté'}
            </span>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={16} />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 64px)' }}>

          {/* Alerte si non connecté */}
          {!currentUser && (
            <div className="mx-5 mt-4 p-3 rounded-lg flex items-center gap-2 text-sm"
              style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', border: '1px solid rgba(245,158,11,0.3)' }}>
              <LogIn size={14} className="flex-shrink-0" />
              <span>Connectez-vous pour sauvegarder vos chansons dans le cloud.</span>
            </div>
          )}

          {/* Sauvegarder session courante */}
          {tracks.length > 0 && (
            <div className="px-5 py-4 border-b space-y-2" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Session actuelle — {tracks.length} piste(s)
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveCurrentProject}
                disabled={saving || !currentUser}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin"
                      style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
                    Sauvegarde...
                  </span>
                ) : (
                  `Sauvegarder "${projectName}"`
                )}
              </Button>

              {saveStatus !== 'idle' && (
                <div className="flex items-start gap-2 p-2 rounded text-xs"
                  style={{
                    background: saveStatus === 'success' ? 'rgba(34,197,94,0.1)' : saveStatus === 'not-logged' ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                    color: saveStatus === 'success' ? 'var(--success)' : saveStatus === 'not-logged' ? 'var(--warning)' : 'var(--danger)',
                  }}>
                  {saveStatus === 'success'
                    ? <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
                    : <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />}
                  <span>{saveMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* Nouvelle chanson vide */}
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Nom de la nouvelle chanson..."
              className="flex-1 text-sm px-3 py-1.5 rounded border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            />
            <Button variant="ghost" size="sm" onClick={handleCreateProject} disabled={saving || !currentUser}>
              <Plus size={14} className="mr-1" />
              Créer
            </Button>
          </div>

          {/* Liste des chansons */}
          <div className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wider px-1 mb-2" style={{ color: 'var(--text-muted)' }}>
              Chansons sauvegardées
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}>
                Chargement...
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--text-muted)' }}>
                <Music2 size={28} style={{ opacity: 0.3 }} />
                <p className="text-sm">Aucune chanson sauvegardée</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {projects.map(project => (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors group"
                    style={{ background: 'var(--surface-2)' }}
                    onClick={() => handleLoadProject(project)}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-3)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--accent-dim)' }}>
                      <Music2 size={14} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                        {project.name}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock size={10} style={{ color: 'var(--text-muted)' }} />
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {formatDate(project.updated_at)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                      style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
