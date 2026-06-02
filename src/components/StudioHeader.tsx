'use client'

import { useState, useEffect, useRef } from 'react'
import { FolderOpen, User, LogOut, FileText, Music2, Save, CheckCircle2, AlertCircle, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useAudioStore } from '@/store/audioStore'
import { useShallow } from 'zustand/react/shallow'
import { getFile } from '@/lib/fileRegistry'
import { APP_VERSION } from '@/lib/version'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface StudioHeaderProps {
  onOpenProjects: () => void
  onOpenAuth: () => void
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function StudioHeader({ onOpenProjects, onOpenAuth }: StudioHeaderProps) {
  const { lyricsVisible, setLyricsVisible, tracks, projectId, projectName, setProject, lyrics, setUserRole, loopPresets, loopEnabled, loopStart, loopEnd } = useAudioStore(useShallow(s => ({
    lyricsVisible: s.lyricsVisible, setLyricsVisible: s.setLyricsVisible, tracks: s.tracks,
    projectId: s.projectId, projectName: s.projectName, setProject: s.setProject,
    lyrics: s.lyrics, setUserRole: s.setUserRole, loopPresets: s.loopPresets,
    loopEnabled: s.loopEnabled, loopStart: s.loopStart, loopEnd: s.loopEnd,
  })))
  const { theme, toggle: toggleTheme } = useTheme()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [role, setRole] = useState<'admin' | 'viewer'>('viewer')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState('')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      const u = data.user ?? null
      setUser(u)
      if (u) {
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', u.id).single()
        const r = (profile?.role as 'admin' | 'viewer') ?? 'viewer'
        setRole(r)
        setUserRole(r)
      }
    }
    loadUser()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) {
        setRole('viewer')
        setUserRole('viewer')
      }
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSave = async () => {
    if (!user) { onOpenAuth(); return }
    if (tracks.length === 0) return

    setSaveStatus('saving')
    setSaveError('')

    try {
      let currentProjectId = projectId

      // Créer le projet s'il n'existe pas encore
      if (!currentProjectId) {
        const { data: proj, error: projError } = await supabase
          .from('projects')
          .insert({ user_id: user.id, name: projectName })
          .select()
          .single()

        if (projError || !proj) {
          setSaveStatus('error')
          setSaveError(projError?.message ?? 'Erreur création chanson')
          return
        }
        currentProjectId = proj.id
        setProject(proj.id, proj.name, proj.bpm)
      } else {
        // Mettre à jour updated_at du projet
        await supabase
          .from('projects')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', currentProjectId)
      }

      // Sauvegarder / mettre à jour chaque piste
      for (const track of tracks) {
        let storagePath = track.storagePath ?? null

        // Upload si fichier local pas encore uploadé
        if (!storagePath) {
          const localFile = getFile(track.id)
          if (localFile) {
            const filePath = `${user.id}/${currentProjectId}/${track.id}_${localFile.name}`
            const { data: storageData, error: storageError } = await supabase.storage
              .from('audio-files')
              .upload(filePath, localFile, { upsert: false })
            if (!storageError && storageData) {
              storagePath = storageData.path
            }
          }
        }

        // Upsert piste (insert ou update si déjà en DB)
        await supabase.from('tracks').upsert({
          id: track.id,
          project_id: currentProjectId,
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
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' })
      }

      // Sauvegarder les paroles si elles existent
      if (lyrics && currentProjectId) {
        const { data: existingLyrics } = await supabase
          .from('lyrics')
          .select('id')
          .eq('project_id', currentProjectId)
          .single()

        if (existingLyrics) {
          await supabase.from('lyrics')
            .update({
              format: lyrics.format,
              content: lyrics.rawContent,
              offset_ms: lyrics.offsetMs,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingLyrics.id)
        } else {
          await supabase.from('lyrics').insert({
            project_id: currentProjectId,
            format: lyrics.format,
            content: lyrics.rawContent,
            offset_ms: lyrics.offsetMs,
          })
        }
      }

      // Sauvegarder les loop presets
      if (currentProjectId) {
        // Supprimer les anciens presets puis insérer les actuels
        await supabase.from('loop_presets').delete().eq('project_id', currentProjectId)
        if (loopPresets.length > 0) {
          await supabase.from('loop_presets').insert(
            loopPresets.map(p => ({
              id: p.id,
              project_id: currentProjectId,
              name: p.name,
              start_time: p.startTime,
              end_time: p.endTime,
            }))
          )
        }

        // Sauvegarder l'état de la boucle (position courante)
        await supabase.from('project_sessions').upsert({
          project_id: currentProjectId,
          user_id: user.id,
          loop_enabled: loopEnabled,
          loop_start: loopStart,
          loop_end: loopEnd,
          last_accessed: new Date().toISOString(),
        }, { onConflict: 'project_id,user_id' })
      }

      setSaveStatus('saved')
      // Revenir à idle après 3s
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 3000)

    } catch (err: unknown) {
      setSaveStatus('error')
      setSaveError(err instanceof Error ? err.message : 'Erreur inconnue')
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  const hasTracks = tracks.length > 0
  const saveLabel = saveStatus === 'saving' ? 'Sauvegarde...'
    : saveStatus === 'saved' ? 'Sauvegardé ✓'
    : saveStatus === 'error' ? 'Erreur'
    : projectId ? 'Sauvegarder' : 'Sauvegarder'

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 border-b flex-shrink-0"
      style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', height: 36 }}
    >
      {/* Logo + version */}
      <div className="flex items-center gap-1.5">
        <Music2 size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--text)' }}>MIXSTUDIO</span>
        <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>v{APP_VERSION}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        {/* Toggle dark / light */}
        <Button
          variant="ghost" size="icon"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
        >
          {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
        </Button>

        <Button
          variant={lyricsVisible ? 'active' : 'ghost'} size="sm"
          onClick={() => setLyricsVisible(!lyricsVisible)}
          title="Afficher/masquer les paroles"
        >
          <FileText size={12} className="mr-1" />
          <span className="hidden sm:inline">Paroles</span>
        </Button>

        <Link href="/projects">
          <Button variant="ghost" size="sm">
            <FolderOpen size={12} className="mr-1" />
            <span className="hidden sm:inline">Chansons</span>
          </Button>
        </Link>

        {/* Bouton Sauvegarder — admin uniquement */}
        {hasTracks && role === 'admin' && (
          <Button
            variant={saveStatus === 'saved' ? 'active' : saveStatus === 'error' ? 'danger' : 'default'}
            size="sm"
            onClick={handleSave}
            disabled={saveStatus === 'saving' || !hasTracks}
            title={saveStatus === 'error' ? saveError : user ? `Sauvegarder "${projectName}"` : 'Connectez-vous pour sauvegarder'}
          >
            {saveStatus === 'saving' ? (
              <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent mr-1.5 animate-spin"
                style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
            ) : saveStatus === 'saved' ? (
              <CheckCircle2 size={12} className="mr-1" />
            ) : saveStatus === 'error' ? (
              <AlertCircle size={12} className="mr-1" />
            ) : (
              <Save size={12} className="mr-1" />
            )}
            {saveLabel}
          </Button>
        )}

        {user ? (
          <>
            <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: 'var(--text-muted)' }}>
              <User size={12} />
              <span className="max-w-[100px] truncate">{user.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Déconnexion">
              <LogOut size={12} />
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={onOpenAuth}>
            <User size={12} className="mr-1" />
            <span className="hidden sm:inline">Connexion</span>
          </Button>
        )}
      </div>
    </div>
  )
}
