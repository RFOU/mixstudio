'use client'

import { useState, useEffect, useCallback } from 'react'
import { FolderOpen, Plus, Trash2, Clock, X, Music2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useAudioStore } from '@/store/audioStore'
import { Database } from '@/lib/supabase/types'
import { getFile } from '@/lib/fileRegistry'

type Project = Database['public']['Tables']['projects']['Row']
type Track = Database['public']['Tables']['tracks']['Row']

interface ProjectsModalProps {
  onClose: () => void
  onLoadProject: (project: Project, tracks: Track[]) => void
}

export function ProjectsModal({ onClose, onLoadProject }: ProjectsModalProps) {
  const { projectName, tracks, setProject } = useAudioStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error' | 'not-logged'>('idle')
  const [saveMessage, setSaveMessage] = useState('')
  const [newProjectName, setNewProjectName] = useState('')

  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Erreur chargement projets:', error)
    }
    setProjects(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleSaveCurrentProject = async () => {
    setSaving(true)
    setSaveStatus('idle')
    setSaveMessage('')

    // 1. Vérifier que l'utilisateur est connecté
    const { data: userData, error: authError } = await supabase.auth.getUser()
    if (authError || !userData.user) {
      setSaveStatus('not-logged')
      setSaveMessage('Vous devez être connecté pour sauvegarder.')
      setSaving(false)
      return
    }

    const userId = userData.user.id

    try {
      // 2. Créer le projet en base
      const { data: proj, error: projError } = await supabase
        .from('projects')
        .insert({ user_id: userId, name: projectName })
        .select()
        .single()

      if (projError || !proj) {
        console.error('Erreur création projet:', projError)
        setSaveStatus('error')
        setSaveMessage(`Erreur création projet : ${projError?.message}`)
        setSaving(false)
        return
      }

      // 3. Mettre à jour le store avec le nouveau projectId
      setProject(proj.id, proj.name, proj.bpm)

      // 4. Pour chaque piste : uploader le fichier + enregistrer en DB
      for (const track of tracks) {
        let storagePath = track.storagePath || null

        // Upload fichier local si pas encore dans le cloud
        const localFile = getFile(track.id)
        if (!storagePath && localFile) {
          const filePath = `${userId}/${proj.id}/${track.id}_${localFile.name}`
          const { data: storageData, error: storageError } = await supabase.storage
            .from('audio-files')
            .upload(filePath, localFile, { upsert: false })

          if (storageError) {
            console.error(`Erreur upload ${track.name}:`, storageError)
          } else if (storageData) {
            storagePath = storageData.path
          }
        }

        // Enregistrer la piste en DB
        const { error: trackError } = await supabase.from('tracks').insert({
          id: track.id,
          project_id: proj.id,
          name: track.name,
          position: track.position,
          volume: track.volume,
          pan: track.pan,
          muted: track.muted,
          soloed: track.soloed,
          color: track.color,
          storage_path: storagePath,
          file_name: track.fileName || null,
          file_size: track.fileSize || null,
          duration: track.duration || null,
          sample_rate: track.sampleRate || null,
        })

        if (trackError) {
          console.error(`Erreur sauvegarde piste ${track.name}:`, trackError)
        }
      }

      setSaveStatus('success')
      setSaveMessage(`Projet "${proj.name}" sauvegardé avec ${tracks.length} piste(s).`)
      await loadProjects()
    } catch (err) {
      console.error('Erreur inattendue:', err)
      setSaveStatus('error')
      setSaveMessage('Erreur inattendue lors de la sauvegarde.')
    }

    setSaving(false)
  }

  const handleCreateProject = async () => {
    const name = newProjectName.trim() || 'Nouveau projet'
    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setSaveStatus('not-logged')
      setSaveMessage('Vous devez être connecté.')
      setSaving(false)
      return
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: userData.user.id, name })
      .select()
      .single()

    if (!error && data) {
      await loadProjects()
      setNewProjectName('')
    } else {
      console.error('Erreur création projet vide:', error)
    }
    setSaving(false)
  }

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Supprimer ce projet ? Les pistes associées seront aussi supprimées.')) return
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) {
      console.error('Erreur suppression:', error)
    } else {
      await loadProjects()
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

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

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
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Projets</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 64px)' }}>

          {/* Save current session */}
          {tracks.length > 0 && (
            <div className="px-5 py-4 border-b space-y-2" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                Session actuelle — {tracks.length} piste(s)
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={handleSaveCurrentProject}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-t-transparent mr-2 animate-spin"
                      style={{ borderColor: 'white', borderTopColor: 'transparent' }}
                    />
                    Sauvegarde en cours...
                  </>
                ) : (
                  `Sauvegarder "${projectName}"`
                )}
              </Button>

              {/* Feedback message */}
              {saveStatus !== 'idle' && (
                <div
                  className="flex items-start gap-2 p-2 rounded text-xs"
                  style={{
                    background: saveStatus === 'success'
                      ? 'rgba(34,197,94,0.1)'
                      : saveStatus === 'not-logged'
                        ? 'rgba(245,158,11,0.1)'
                        : 'rgba(239,68,68,0.1)',
                    color: saveStatus === 'success'
                      ? 'var(--success)'
                      : saveStatus === 'not-logged'
                        ? 'var(--warning)'
                        : 'var(--danger)',
                  }}
                >
                  {saveStatus === 'success'
                    ? <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5" />
                    : <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                  }
                  <span>{saveMessage}</span>
                </div>
              )}
            </div>
          )}

          {/* New empty project */}
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Nom du nouveau projet vide..."
              className="flex-1 text-sm px-3 py-1.5 rounded border"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            />
            <Button variant="ghost" size="sm" onClick={handleCreateProject} disabled={saving}>
              <Plus size={14} className="mr-1" />
              Créer
            </Button>
          </div>

          {/* Projects list */}
          <div className="p-3">
            <p className="text-xs font-semibold uppercase tracking-wider px-1 mb-2" style={{ color: 'var(--text-muted)' }}>
              Projets sauvegardés
            </p>
            {loading ? (
              <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}>
                Chargement...
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--text-muted)' }}>
                <Music2 size={28} style={{ opacity: 0.3 }} />
                <p className="text-sm">Aucun projet sauvegardé</p>
                <p className="text-xs opacity-60">Connectez-vous et sauvegardez votre session</p>
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
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--accent-dim)' }}
                    >
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
                      style={{ color: 'var(--danger)' }}
                    >
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
