'use client'

import { useState, useEffect, useCallback } from 'react'

type Theme = 'dark' | 'light'

function applyTheme(t: Theme) {
  if (t === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  try {
    localStorage.setItem('mixstudio-theme', t)
  } catch {
    // ignore en navigation privée
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark')

  // Initialiser depuis localStorage au montage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mixstudio-theme') as Theme | null
      if (saved === 'light' || saved === 'dark') {
        setTheme(saved)
        applyTheme(saved)
      }
    } catch {
      // ignore
    }
  }, [])

  const toggle = useCallback(() => {
    setTheme(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      return next
    })
  }, [])

  return { theme, toggle }
}
