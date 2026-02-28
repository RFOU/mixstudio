'use client'

import { useState, useEffect } from 'react'
import { FolderOpen, User, LogOut, FileText, Music2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { useAudioStore } from '@/store/audioStore'
import type { User as SupabaseUser } from '@supabase/supabase-js'

interface StudioHeaderProps {
  onOpenProjects: () => void
  onOpenAuth: () => void
}

export function StudioHeader({ onOpenProjects, onOpenAuth }: StudioHeaderProps) {
  const { lyricsVisible, setLyricsVisible } = useAudioStore()
  const [user, setUser] = useState<SupabaseUser | null>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 border-b flex-shrink-0"
      style={{
        background: 'var(--surface-2)',
        borderColor: 'var(--border)',
        height: 36,
      }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-1.5">
        <Music2 size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--text)' }}>
          MIXSTUDIO
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1">
        <Button
          variant={lyricsVisible ? 'active' : 'ghost'}
          size="sm"
          onClick={() => setLyricsVisible(!lyricsVisible)}
          title="Afficher/masquer les paroles"
        >
          <FileText size={12} className="mr-1" />
          Paroles
        </Button>

        {user ? (
          <>
            <Button variant="ghost" size="sm" onClick={onOpenProjects}>
              <FolderOpen size={12} className="mr-1" />
              Projets
            </Button>
            <div className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ color: 'var(--text-muted)' }}>
              <User size={12} />
              <span className="max-w-[100px] truncate">{user.email}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Déconnexion">
              <LogOut size={12} />
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onOpenProjects}>
              <FolderOpen size={12} className="mr-1" />
              Projets
            </Button>
            <Button variant="ghost" size="sm" onClick={onOpenAuth}>
              <User size={12} className="mr-1" />
              Connexion
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
