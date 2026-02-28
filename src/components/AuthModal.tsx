'use client'

import { useState } from 'react'
import { Music2, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

interface AuthModalProps {
  onClose?: () => void
}

export function AuthModal({ onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onClose?.()
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
        })
        if (error) throw error
        setSuccess('Vérifiez votre email pour confirmer votre compte.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-xl p-6 shadow-2xl"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2 mb-6">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--accent-dim)' }}
          >
            <Music2 size={24} style={{ color: 'var(--accent)' }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>MixStudio</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {mode === 'login' ? 'Connectez-vous à votre compte' : 'Créez votre compte'}
          </p>
        </div>

        {/* Toggle */}
        <div
          className="flex rounded-lg p-1 mb-5"
          style={{ background: 'var(--surface-2)' }}
        >
          <button
            className="flex-1 py-1.5 rounded-md text-sm font-medium transition-all"
            style={{
              background: mode === 'login' ? 'var(--surface-3)' : 'transparent',
              color: mode === 'login' ? 'var(--text)' : 'var(--text-muted)',
            }}
            onClick={() => setMode('login')}
          >
            Connexion
          </button>
          <button
            className="flex-1 py-1.5 rounded-md text-sm font-medium transition-all"
            style={{
              background: mode === 'signup' ? 'var(--surface-3)' : 'transparent',
              color: mode === 'signup' ? 'var(--text)' : 'var(--text-muted)',
            }}
            onClick={() => setMode('signup')}
          >
            Inscription
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Email */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Email
            </label>
            <div className="relative">
              <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                required
                className="w-full pl-9 pr-3 py-2 rounded-lg text-sm border"
                style={{
                  background: 'var(--surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Mot de passe
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full pl-9 pr-10 py-2 rounded-lg text-sm border"
                style={{
                  background: 'var(--surface-2)',
                  borderColor: 'var(--border)',
                  color: 'var(--text)',
                }}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-muted)' }}
                onClick={() => setShowPassword(v => !v)}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <p className="text-xs p-2 rounded" style={{ color: 'var(--danger)', background: 'rgba(239,68,68,0.1)' }}>
              {error}
            </p>
          )}
          {success && (
            <p className="text-xs p-2 rounded" style={{ color: 'var(--success)', background: 'rgba(34,197,94,0.1)' }}>
              {success}
            </p>
          )}

          <Button type="submit" variant="default" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Chargement...' : mode === 'login' ? 'Se connecter' : 'Créer un compte'}
          </Button>
        </form>

        {onClose && (
          <button
            className="mt-4 w-full text-xs text-center"
            style={{ color: 'var(--text-muted)' }}
            onClick={onClose}
          >
            Continuer sans compte
          </button>
        )}
      </div>
    </div>
  )
}
