'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Music2, FolderOpen, Plus, Trash2, Clock,
  LogOut, Play, ChevronRight, Loader2, ShieldCheck, MapPin, Building2, Check, ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useAudioStore } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { AppNav } from '@/components/AppNav'
import type { Database } from '@/lib/supabase/types'

type Project = Database['public']['Tables']['projects']['Row']
type TrackDB = Database['public']['Tables']['tracks']['Row']
type City = Database['public']['Tables']['cities']['Row']
type Role = 'admin' | 'viewer'

export function ProjectsPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [role, setRole] = useState<Role>('viewer')
  const [userCity, setUserCity] = useState<City | null>(null)
  const [allCities, setAllCities] = useState<City[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  // projectId → Set of cityIds currently assigned
  const [projectCityIds, setProjectCityIds] = useState<Record<string, Set<string>>>({})
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)
  const [expandedCityPicker, setExpandedCityPicker] = useState<string | null>(null)

  const {
    setProject, setPendingLoad, clearTracks,
    setCurrentTime, setIsPlaying,
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

      // Récupérer le rôle et la ville
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, city_id, cities(id, name, created_at)')
        .eq('id', user.id)
        .single()
      const userRole = (profile?.role ?? 'viewer') as Role
      setRole(userRole)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cityData = (profile as any)?.cities
      setUserCity(cityData ?? null)

      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false })
      setProjects(data || [])

      // Pour les admins : charger toutes les villes + assignations par chanson
      if (userRole === 'admin') {
        const [{ data: citiesData }, { data: pcData }] = await Promise.all([
          supabase.from('cities').select('*').order('name'),
          supabase.from('project_cities').select('project_id, city_id'),
        ])
        setAllCities(citiesData ?? [])
        const map: Record<string, Set<string>> = {}
        pcData?.forEach(pc => {
          if (!map[pc.project_id]) map[pc.project_id] = new Set()
          map[pc.project_id].add(pc.city_id)
        })
        setProjectCityIds(map)
      }

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
    const name = newName.trim() || 'Nouvelle chanson'
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
    if (!confirm('Supprimer cette chanson ?')) return
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

    // Reset engine + store state
    engine.stop()
    setIsPlaying(false)
    setCurrentTime(0)
    clearTracks()
    setProject(project.id, project.name, project.bpm)

    // Store track metadata for Studio to load (with visible loading modal)
    setPendingLoad({
      projectId: project.id,
      projectName: project.name,
      bpm: project.bpm,
      tracks: trackList.map(t => ({
        id: t.id,
        name: t.name,
        position: t.position,
        volume: t.volume,
        muted: t.muted,
        soloed: t.soloed,
        color: t.color,
        storage_path: t.storage_path,
        file_name: t.file_name,
        file_size: t.file_size,
        duration: t.duration,
        sample_rate: t.sample_rate,
      })),
    })

    // Navigate immediately — Studio will show the loading modal and load audio there
    router.push('/studio')
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleToggleProjectCity = async (
    e: React.MouseEvent,
    projectId: string,
    cityId: string,
    isActive: boolean,
  ) => {
    e.stopPropagation()
    const key = `${projectId}-${cityId}`
    setTogglingKey(key)

    if (isActive) {
      await supabase.from('project_cities')
        .delete().eq('project_id', projectId).eq('city_id', cityId)
    } else {
      await supabase.from('project_cities').insert({ project_id: projectId, city_id: cityId })
    }

    setProjectCityIds(prev => {
      const newSet = new Set(prev[projectId] ?? [])
      if (isActive) newSet.delete(cityId)
      else newSet.add(cityId)
      return { ...prev, [projectId]: newSet }
    })
    setTogglingKey(null)
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{ height: '100vh', overflowY: 'auto', overflowX: 'hidden', background: 'var(--background)' }}>

      {/* NAV */}
      <AppNav>
        {user && (
          <span className="text-xs hidden sm:block" style={{ color: 'var(--text-muted)' }}>{user.email}</span>
        )}
        {role === 'admin' && (
          <>
            <Link
              href="/admin/cities"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}
            >
              <Building2 size={11} />
              <span className="hidden sm:inline">Villes</span>
            </Link>
            <Link
              href="/admin/users"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
            >
              <ShieldCheck size={11} />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          </>
        )}
        <Link
          href="/studio"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}
        >
          <Play size={11} />
          <span className="hidden sm:inline">Studio</span>
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          <LogOut size={12} />
          Déconnexion
        </button>
      </AppNav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text)' }}>
              Mes chansons
            </h1>
            <p className="text-sm flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              {role === 'admin'
                ? 'Créez, gérez et ouvrez vos chansons'
                : userCity
                  ? <><MapPin size={12} />{userCity.name} — chansons disponibles</>
                  : 'Consultez et ouvrez les chansons disponibles'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
            <FolderOpen size={20} style={{ color: 'var(--accent)' }} />
          </div>
        </div>

        {/* Créer une chanson — admin seulement */}
        {role === 'admin' && (
          <div
            className="flex items-center gap-3 p-4 rounded-xl border mb-6"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
          >
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="Nom de la nouvelle chanson..."
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
        )}

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
            <p className="text-sm">Aucune chanson sauvegardée</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Créez votre première chanson ci-dessus ou importez des pistes dans le studio
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map(project => {
              const cityIds = projectCityIds[project.id] ?? new Set<string>()
              const isPickerOpen = expandedCityPicker === project.id
              return (
                <div
                  key={project.id}
                  className="rounded-xl border overflow-hidden"
                  style={{
                    borderColor: openingId === project.id || isPickerOpen ? 'var(--accent)' : 'var(--border)',
                    background: 'var(--surface)',
                  }}
                >
                  {/* Row principale */}
                  <div
                    onClick={() => handleOpen(project)}
                    className="flex items-center gap-4 p-4 cursor-pointer group transition-colors"
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
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
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Clock size={10} style={{ color: 'var(--text-muted)' }} />
                          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {formatDate(project.updated_at)}
                          </p>
                        </div>
                        {/* Badges villes */}
                        {role === 'admin' && cityIds.size > 0 && (
                          <div className="flex items-center gap-1 flex-wrap">
                            {allCities.filter(c => cityIds.has(c.id)).map(city => (
                              <span
                                key={city.id}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs"
                                style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa' }}
                              >
                                <MapPin size={9} />
                                {city.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {role === 'admin' && cityIds.size === 0 && (
                          <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                            Aucune ville
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      {/* Bouton sélecteur de villes (admin) */}
                      {role === 'admin' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedCityPicker(isPickerOpen ? null : project.id)
                          }}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border"
                          style={{
                            borderColor: isPickerOpen ? 'var(--accent)' : 'var(--border)',
                            color: isPickerOpen ? 'var(--accent)' : 'var(--text-muted)',
                            background: isPickerOpen ? 'var(--accent-dim)' : 'var(--surface)',
                          }}
                          title="Gérer les villes"
                        >
                          <Building2 size={11} />
                          <ChevronDown
                            size={10}
                            style={{ transform: isPickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                          />
                        </button>
                      )}
                      {role === 'admin' && (
                        <button
                          onClick={(e) => handleDelete(e, project.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg"
                          style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)' }}
                          title="Supprimer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <ChevronRight
                        size={16}
                        style={{ color: 'var(--text-muted)' }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                    </div>
                  </div>

                  {/* Panneau villes (accordion) */}
                  {isPickerOpen && role === 'admin' && (
                    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                      {allCities.length === 0 ? (
                        <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                          Aucune ville créée. <Link href="/admin/cities" className="underline" style={{ color: 'var(--accent)' }}>Créer des villes</Link>
                        </p>
                      ) : (
                        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                          {allCities.map(city => {
                            const isActive = cityIds.has(city.id)
                            const tKey = `${project.id}-${city.id}`
                            const toggling = togglingKey === tKey
                            return (
                              <div
                                key={city.id}
                                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                                style={{ background: isActive ? 'rgba(99,102,241,0.05)' : 'transparent' }}
                                onClick={(e) => !toggling && handleToggleProjectCity(e, project.id, city.id, isActive)}
                                onMouseEnter={(e) => { e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.1)' : 'var(--surface-2)' }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.05)' : 'transparent' }}
                              >
                                <div
                                  className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border"
                                  style={{
                                    background: isActive ? 'var(--accent)' : 'transparent',
                                    borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                                  }}
                                >
                                  {toggling
                                    ? <Loader2 size={10} className="animate-spin" style={{ color: 'white' }} />
                                    : isActive && <Check size={11} style={{ color: 'white' }} />
                                  }
                                </div>
                                <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                                  style={{ background: 'rgba(167,139,250,0.15)' }}>
                                  <Building2 size={11} style={{ color: '#a78bfa' }} />
                                </div>
                                <p className="text-sm flex-1" style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}>
                                  {city.name}
                                </p>
                                {isActive && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)' }}>
                                    Disponible
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
