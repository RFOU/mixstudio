'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Music2, Users, ShieldCheck, Eye, LogOut,
  Loader2, Search, ChevronDown, FolderOpen,
  Trash2, MoreVertical, MapPin, Building2,
  UserPlus, X, Mail, Lock, User,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/components/ui/Toast'
import { AppNav } from '@/components/AppNav'
import type { Database } from '@/lib/supabase/types'

type Profile = Database['public']['Tables']['profiles']['Row']
type City = Database['public']['Tables']['cities']['Row']
type Role = 'admin' | 'viewer'

interface UserRow extends Profile {
  project_count?: number
}

export function AdminUsersPage() {
  const router = useRouter()
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserRow[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // Modale création utilisateur
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', password: '', username: '', role: 'viewer' as Role, city_id: '' })
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/'); return }

      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()

      if (profile?.role !== 'admin') { router.replace('/projects'); return }

      setCurrentUserId(user.id)
      await Promise.all([loadUsers(), loadCities()])
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadCities = async () => {
    const { data } = await supabase.from('cities').select('*').order('name')
    setCities(data || [])
  }

  const loadUsers = async () => {
    setLoading(true)
    const { data: profiles } = await supabase
      .from('profiles').select('*').order('created_at', { ascending: false })

    if (!profiles) { setLoading(false); return }

    const { data: projectCounts } = await supabase.from('projects').select('user_id')
    const countMap: Record<string, number> = {}
    projectCounts?.forEach(p => { countMap[p.user_id] = (countMap[p.user_id] ?? 0) + 1 })

    setUsers(profiles.map(p => ({ ...p, project_count: countMap[p.id] ?? 0 })))
    setLoading(false)
  }

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (userId === currentUserId && newRole !== 'admin') {
      toast.error('Vous ne pouvez pas vous retirer le rôle admin.')
      return
    }
    setUpdatingId(userId)
    setOpenMenuId(null)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId)
    if (!error) setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u))
    setUpdatingId(null)
  }

  const handleCityChange = async (userId: string, cityId: string | null) => {
    setUpdatingId(userId)
    const { error } = await supabase
      .from('profiles').update({ city_id: cityId }).eq('id', userId)
    if (!error) setUsers(prev => prev.map(u => u.id === userId ? { ...u, city_id: cityId } : u))
    setUpdatingId(null)
  }

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.password) {
      setCreateError('Email et mot de passe requis')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          username: createForm.username || undefined,
          role: createForm.role,
          city_id: createForm.city_id || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setCreateError(data.error ?? 'Erreur inconnue')
      } else {
        setShowCreateModal(false)
        setCreateForm({ email: '', password: '', username: '', role: 'viewer', city_id: '' })
        await loadUsers()
      }
    } catch {
      setCreateError('Erreur réseau')
    }
    setCreating(false)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const cityName = (cityId: string | null) =>
    cities.find(c => c.id === cityId)?.name ?? null

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const city = cityName(u.city_id)
    return (
      (u.username ?? '').toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q) ||
      (city ?? '').toLowerCase().includes(q)
    )
  })

  const adminCount = users.filter(u => u.role === 'admin').length
  const viewerCount = users.filter(u => u.role === 'viewer').length
  const withCityCount = users.filter(u => u.city_id).length

  return (
    <div style={{ height: '100vh', overflowY: 'auto', background: 'var(--background)' }}>

      {/* NAV */}
      <AppNav>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
          style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--accent)' }}>
          <ShieldCheck size={11} />
          Admin
        </div>
        <Link
          href="/admin/cities"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface)' }}
        >
          <Building2 size={11} />
          Villes
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
      </AppNav>

      <div className="max-w-5xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              <Users size={22} />
              Gestion des utilisateurs
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              Gérez les rôles et les villes de chaque utilisateur
            </p>
          </div>
          <button
            onClick={() => { setShowCreateModal(true); setCreateError('') }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <UserPlus size={15} />
            Créer un utilisateur
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total', value: users.length, icon: Users, color: 'var(--accent)' },
            { label: 'Admins', value: adminCount, icon: ShieldCheck, color: '#f59e0b' },
            { label: 'Lecteurs', value: viewerCount, icon: Eye, color: 'var(--success)' },
            { label: 'Avec ville', value: withCityCount, icon: MapPin, color: '#a78bfa' },
          ].map(stat => (
            <div key={stat.label} className="p-4 rounded-xl border flex items-center gap-3"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${stat.color}20` }}>
                <stat.icon size={16} style={{ color: stat.color }} />
              </div>
              <div>
                <p className="text-xl font-bold" style={{ color: 'var(--text)' }}>{stat.value}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Recherche */}
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher par nom, ID ou ville..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border text-sm"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>

          {/* En-tête — 12 colonnes : 4 user / 2 chansons / 2 ville / 1 date / 2 rôle / 1 menu */}
          <div
            className="grid grid-cols-12 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
          >
            <div className="col-span-4">Utilisateur</div>
            <div className="col-span-1 text-center">Chansons</div>
            <div className="col-span-3">Ville</div>
            <div className="col-span-2 text-center">Inscription</div>
            <div className="col-span-1 text-center">Rôle</div>
            <div className="col-span-1" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
              <Loader2 size={20} className="animate-spin mr-2" />Chargement...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: 'var(--text-muted)' }}>
              <Users size={28} style={{ opacity: 0.3 }} />
              <p className="text-sm">Aucun utilisateur trouvé</p>
            </div>
          ) : (
            filtered.map((user, i) => (
              <div
                key={user.id}
                className="grid grid-cols-12 items-center px-4 py-3 border-b last:border-b-0 group transition-colors"
                style={{
                  borderColor: 'var(--border)',
                  background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)' }}
                onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface-2)' }}
              >
                {/* Utilisateur */}
                <div className="col-span-4 flex items-center gap-3 min-w-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      background: user.role === 'admin' ? 'rgba(245,158,11,0.2)' : 'var(--accent-dim)',
                      color: user.role === 'admin' ? '#f59e0b' : 'var(--accent)',
                    }}
                  >
                    {(user.username ?? user.id).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                      {user.username ?? 'Sans nom'}
                      {user.id === currentUserId && (
                        <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-dim)', color: 'var(--accent)' }}>
                          vous
                        </span>
                      )}
                    </p>
                    <p className="text-xs truncate font-mono" style={{ color: 'var(--text-muted)' }}>
                      {user.id.substring(0, 16)}…
                    </p>
                  </div>
                </div>

                {/* Chansons */}
                <div className="col-span-1 flex items-center justify-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  <span className="text-sm">{user.project_count ?? 0}</span>
                </div>

                {/* Ville — sélecteur inline */}
                <div className="col-span-3 pr-2">
                  {updatingId === user.id ? (
                    <Loader2 size={13} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
                  ) : (
                    <select
                      value={user.city_id ?? ''}
                      onChange={e => handleCityChange(user.id, e.target.value || null)}
                      className="w-full text-xs px-2 py-1.5 rounded-lg border"
                      style={{
                        background: 'var(--surface-2)',
                        borderColor: user.city_id ? 'var(--accent)' : 'var(--border)',
                        color: user.city_id ? 'var(--text)' : 'var(--text-muted)',
                      }}
                    >
                      <option value="">— Aucune ville —</option>
                      {cities.map(city => (
                        <option key={city.id} value={city.id}>{city.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Date */}
                <div className="col-span-2 text-center">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(user.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </span>
                </div>

                {/* Rôle */}
                <div className="col-span-1 flex items-center justify-center">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={user.role === 'admin'
                      ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
                      : { background: 'rgba(34,197,94,0.1)', color: 'var(--success)' }
                    }
                  >
                    {user.role === 'admin' ? <ShieldCheck size={10} /> : <Eye size={10} />}
                    {user.role === 'admin' ? 'Admin' : 'Viewer'}
                  </span>
                </div>

                {/* Menu */}
                <div className="col-span-1 flex items-center justify-end relative">
                  <button
                    onClick={() => setOpenMenuId(openMenuId === user.id ? null : user.id)}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--text-muted)', background: 'var(--surface-3)' }}
                  >
                    <MoreVertical size={13} />
                  </button>

                  {openMenuId === user.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                      <div
                        className="absolute right-0 top-8 z-20 rounded-xl shadow-xl border py-1 w-44"
                        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                      >
                        <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                          Changer le rôle
                        </p>
                        {(['admin', 'viewer'] as Role[]).map(role => (
                          <button
                            key={role}
                            onClick={() => handleRoleChange(user.id, role)}
                            disabled={user.role === role}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                            style={{
                              color: user.role === role ? 'var(--text-muted)' : 'var(--text)',
                              opacity: user.role === role ? 0.5 : 1,
                              cursor: user.role === role ? 'default' : 'pointer',
                            }}
                            onMouseEnter={e => { if (user.role !== role) e.currentTarget.style.background = 'var(--surface-3)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                          >
                            {role === 'admin'
                              ? <><ShieldCheck size={13} style={{ color: '#f59e0b' }} /> Admin</>
                              : <><Eye size={13} style={{ color: 'var(--success)' }} /> Viewer</>
                            }
                            {user.role === role && <ChevronDown size={12} className="ml-auto" />}
                          </button>
                        ))}

                        <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />

                        <button
                          onClick={async () => {
                            setOpenMenuId(null)
                            if (!confirm('Supprimer toutes les chansons de cet utilisateur ?')) return
                            await supabase.from('projects').delete().eq('user_id', user.id)
                            setUsers(prev => prev.map(u => u.id === user.id ? { ...u, project_count: 0 } : u))
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left"
                          style={{ color: 'var(--danger)' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                          <Trash2 size={13} />
                          Supprimer les chansons
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modale création utilisateur */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header modale */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-dim)' }}>
                  <UserPlus size={15} style={{ color: 'var(--accent)' }} />
                </div>
                <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Créer un utilisateur</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Formulaire */}
            <div className="px-6 py-5 space-y-4">

              {/* Email */}
              <div>
                <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Mail size={11} /> Email *
                </label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="utilisateur@exemple.com"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  autoFocus
                />
              </div>

              {/* Mot de passe */}
              <div>
                <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <Lock size={11} /> Mot de passe *
                </label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="Minimum 6 caractères"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>

              {/* Nom d'affichage */}
              <div>
                <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <User size={11} /> Nom d&apos;affichage
                </label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="Optionnel"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>

              {/* Ligne Rôle + Ville */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <ShieldCheck size={11} /> Rôle
                  </label>
                  <select
                    value={createForm.role}
                    onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as Role }))}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    <option value="viewer">Lecteur</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <Building2 size={11} /> Ville
                  </label>
                  <select
                    value={createForm.city_id}
                    onChange={e => setCreateForm(f => ({ ...f, city_id: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border text-sm"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  >
                    <option value="">— Aucune —</option>
                    {cities.map(city => (
                      <option key={city.id} value={city.id}>{city.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Erreur */}
              {createError && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
                  {createError}
                </p>
              )}
            </div>

            {/* Footer modale */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                Annuler
              </button>
              <button
                onClick={handleCreateUser}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: 'var(--accent)', color: 'white', opacity: creating ? 0.7 : 1 }}
              >
                {creating ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                Créer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
