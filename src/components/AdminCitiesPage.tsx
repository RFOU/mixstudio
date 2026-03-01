'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Music2, ShieldCheck, LogOut, Building2, Plus, Trash2,
  Loader2, Users, FolderOpen, ChevronDown, ChevronRight, Check,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/supabase/types'

type City = Database['public']['Tables']['cities']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface CityWithStats extends City {
  user_count: number
  project_ids: Set<string>
}

export function AdminCitiesPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [loading, setLoading] = useState(true)
  const [cities, setCities] = useState<CityWithStats[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [newCityName, setNewCityName] = useState('')
  const [creating, setCreating] = useState(false)
  const [expandedCity, setExpandedCity] = useState<string | null>(null)
  const [togglingKey, setTogglingKey] = useState<string | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') { router.replace('/projects'); return }

      await loadAll()
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadAll = async () => {
    setLoading(true)

    const [
      { data: citiesData },
      { data: projectsData },
      { data: profilesData },
      { data: pcData },
    ] = await Promise.all([
      supabase.from('cities').select('*').order('name'),
      supabase.from('projects').select('*').order('name'),
      supabase.from('profiles').select('city_id'),
      supabase.from('project_cities').select('project_id, city_id'),
    ])

    // Compter les utilisateurs par ville
    const userCountMap: Record<string, number> = {}
    profilesData?.forEach(p => {
      if (p.city_id) userCountMap[p.city_id] = (userCountMap[p.city_id] ?? 0) + 1
    })

    // Chansons par ville
    const cityProjectsMap: Record<string, Set<string>> = {}
    pcData?.forEach(pc => {
      if (!cityProjectsMap[pc.city_id]) cityProjectsMap[pc.city_id] = new Set()
      cityProjectsMap[pc.city_id].add(pc.project_id)
    })

    setCities((citiesData ?? []).map(c => ({
      ...c,
      user_count: userCountMap[c.id] ?? 0,
      project_ids: cityProjectsMap[c.id] ?? new Set(),
    })))
    setProjects(projectsData ?? [])
    setLoading(false)
  }

  const handleCreateCity = async () => {
    const name = newCityName.trim()
    if (!name) return
    setCreating(true)
    const { error } = await supabase.from('cities').insert({ name })
    if (!error) {
      setNewCityName('')
      await loadAll()
    }
    setCreating(false)
  }

  const handleDeleteCity = async (cityId: string) => {
    if (!confirm('Supprimer cette ville ? Les utilisateurs associés seront désassignés.')) return
    await supabase.from('cities').delete().eq('id', cityId)
    setCities(prev => prev.filter(c => c.id !== cityId))
  }

  const handleToggleProject = async (cityId: string, projectId: string, isActive: boolean) => {
    const key = `${cityId}-${projectId}`
    setTogglingKey(key)

    if (isActive) {
      await supabase.from('project_cities')
        .delete().eq('city_id', cityId).eq('project_id', projectId)
    } else {
      await supabase.from('project_cities').insert({ city_id: cityId, project_id: projectId })
    }

    setCities(prev => prev.map(c => {
      if (c.id !== cityId) return c
      const newSet = new Set(c.project_ids)
      if (isActive) newSet.delete(projectId)
      else newSet.add(projectId)
      return { ...c, project_ids: newSet }
    }))
    setTogglingKey(null)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--background)' }}>

      {/* NAV */}
      <nav
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b"
        style={{ background: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(12px)', borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
              <Music2 size={16} style={{ color: 'var(--accent)' }} />
            </div>
            <span className="font-bold text-sm tracking-wide" style={{ color: 'var(--text)' }}>MIXSTUDIO</span>
          </Link>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
            style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)' }}>
            <ShieldCheck size={11} />
            Admin
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/users"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}
          >
            <Users size={11} />
            Utilisateurs
          </Link>
          <Link
            href="/projects"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}
          >
            <FolderOpen size={11} />
            Chansons
          </Link>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
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
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Building2 size={22} />
              Gestion des villes
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Créez des villes et choisissez quelles chansons y sont disponibles
            </p>
          </div>
        </div>

        {/* Créer une ville */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl border mb-6"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
        >
          <Building2 size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={newCityName}
            onChange={e => setNewCityName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreateCity()}
            placeholder="Nom de la nouvelle ville..."
            className="flex-1 text-sm px-3 py-2 rounded-lg border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
          <button
            onClick={handleCreateCity}
            disabled={creating || !newCityName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white', opacity: creating || !newCityName.trim() ? 0.6 : 1 }}
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Ajouter
          </button>
        </div>

        {/* Liste des villes */}
        {loading ? (
          <div className="flex items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={20} className="animate-spin mr-2" />Chargement...
          </div>
        ) : cities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3" style={{ color: 'var(--text-muted)' }}>
            <Building2 size={32} style={{ opacity: 0.3 }} />
            <p className="text-sm">Aucune ville créée</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cities.map(city => {
              const isExpanded = expandedCity === city.id
              return (
                <div
                  key={city.id}
                  className="rounded-xl border overflow-hidden"
                  style={{ borderColor: isExpanded ? 'var(--accent)' : 'var(--border)', background: 'var(--surface)' }}
                >
                  {/* En-tête de la ville */}
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 cursor-pointer"
                    onClick={() => setExpandedCity(isExpanded ? null : city.id)}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(167,139,250,0.15)' }}>
                      <Building2 size={16} style={{ color: '#a78bfa' }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{city.name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <Users size={10} />{city.user_count} utilisateur{city.user_count !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                          <FolderOpen size={10} />{city.project_ids.size} chanson{city.project_ids.size !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteCity(city.id) }}
                      className="p-1.5 rounded-lg mr-1 opacity-0 group-hover:opacity-100"
                      style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)' }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                    >
                      <Trash2 size={13} />
                    </button>

                    {isExpanded
                      ? <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      : <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    }
                  </div>

                  {/* Liste des chansons (accordion) */}
                  {isExpanded && (
                    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                      {projects.length === 0 ? (
                        <p className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                          Aucune chanson disponible.
                        </p>
                      ) : (
                        <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                          {projects.map(project => {
                            const isActive = city.project_ids.has(project.id)
                            const key = `${city.id}-${project.id}`
                            const toggling = togglingKey === key
                            return (
                              <div
                                key={project.id}
                                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                                style={{ background: isActive ? 'rgba(99,102,241,0.05)' : 'transparent' }}
                                onClick={() => !toggling && handleToggleProject(city.id, project.id, isActive)}
                                onMouseEnter={e => { e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.1)' : 'var(--surface-2)' }}
                                onMouseLeave={e => { e.currentTarget.style.background = isActive ? 'rgba(99,102,241,0.05)' : 'transparent' }}
                              >
                                {/* Checkbox */}
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
                                  style={{ background: 'var(--accent-dim)' }}>
                                  <Music2 size={11} style={{ color: 'var(--accent)' }} />
                                </div>

                                <p className="text-sm flex-1 truncate" style={{ color: isActive ? 'var(--text)' : 'var(--text-muted)' }}>
                                  {project.name}
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
