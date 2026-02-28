'use client'

import { useState, useEffect, useCallback } from 'react'
import { FolderOpen, Plus, Trash2, Clock, X, Music2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useAudioStore } from '@/store/audioStore'
import { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']
type Track = Database['public']['Tables']['tracks']['Row']

interface ProjectsModalProps {
  onClose: () => void
  onLoadProject: (project: Project, tracks: Track[]) => void
}

export function ProjectsModal({ onClose, onLoadProject }: ProjectsModalProps) {
  const { projectName, tracks } = useAudioStore()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')

  const supabase = createClient()

  const loadProjects = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false })
    setProjects(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreateProject = async () => {
    const name = newProjectName.trim() || 'Nouveau projet'
    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data, error } = await supabase
      .from('projects')
      .insert({ user_id: userData.user.id, name })
      .select()
      .single()

    if (!error && data) {
      await loadProjects()
      setNewProjectName('')
    }
    setSaving(false)
  }

  const handleSaveCurrentProject = async () => {
    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) { setSaving(false); return }

    // Create or update project
    const { data: proj, error: projError } = await supabase
      .from('projects')
      .insert({
        user_id: userData.user.id,
        name: projectName,
      })
      .select()
      .single()

    if (projError || !proj) { setSaving(false); return }

    // Save tracks
    for (const track of tracks) {
      await supabase.from('tracks').insert({
        project_id: proj.id,
        name: track.name,
        position: track.position,
        volume: track.volume,
        pan: track.pan,
        muted: track.muted,
        soloed: track.soloed,
        color: track.color,
        storage_path: track.storagePath || null,
        file_name: track.fileName || null,
        file_size: track.fileSize || null,
        duration: track.duration || null,
        sample_rate: track.sampleRate || null,
      })
    }

    await loadProjects()
    setSaving(false)
  }

  const handleDeleteProject = async (id: string) => {
    if (!confirm('Supprimer ce projet ?')) return
    await supabase.from('projects').delete().eq('id', id)
    await loadProjects()
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
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: '80vh' }}
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

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(80vh - 130px)' }}>
          {/* Save current */}
          {tracks.length > 0 && (
            <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <Button variant="default" size="sm" onClick={handleSaveCurrentProject} disabled={saving}>
                {saving ? 'Sauvegarde...' : `Sauvegarder "${projectName}"`}
              </Button>
            </div>
          )}

          {/* New project */}
          <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Nom du nouveau projet..."
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
            {loading ? (
              <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-muted)' }}>
                Chargement...
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2" style={{ color: 'var(--text-muted)' }}>
                <Music2 size={28} style={{ opacity: 0.3 }} />
                <p className="text-sm">Aucun projet sauvegardé</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {projects.map(project => (
                  <div
                    key={project.id}
                    className="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
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
                        {project.bpm && (
                          <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
                            · {project.bpm} BPM
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id) }}
                      className="opacity-0 hover:opacity-100 transition-opacity p-1 rounded"
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
