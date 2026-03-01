'use client'

import Link from 'next/link'
import { Music2, Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/useTheme'
import { APP_VERSION } from '@/lib/version'

interface AppNavProps {
  /** Éléments supplémentaires à afficher à droite (actions, liens, etc.) */
  children?: React.ReactNode
}

export function AppNav({ children }: AppNavProps) {
  const { theme, toggle } = useTheme()

  return (
    <nav
      className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 border-b"
      style={{
        background: 'var(--surface-2)',
        backdropFilter: 'blur(12px)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo + version */}
      <Link href="/" className="flex items-center gap-2 flex-shrink-0">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--accent-dim)' }}
        >
          <Music2 size={16} style={{ color: 'var(--accent)' }} />
        </div>
        <span className="font-bold text-sm tracking-wide" style={{ color: 'var(--text)' }}>
          MIXSTUDIO
        </span>
        <span
          className="text-xs tabular-nums hidden sm:inline"
          style={{ color: 'var(--text-muted)', opacity: 0.5 }}
        >
          v{APP_VERSION}
        </span>
      </Link>

      {/* Actions à droite */}
      <div className="flex items-center gap-2">
        {children}

        {/* Toggle dark / light */}
        <button
          onClick={toggle}
          title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
          className="flex items-center justify-center rounded-lg transition-colors"
          style={{
            width: 32, height: 32,
            color: 'var(--text-muted)',
            background: 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </nav>
  )
}
