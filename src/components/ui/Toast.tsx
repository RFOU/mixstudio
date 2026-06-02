'use client'

import { useEffect, useState } from 'react'

/**
 * Toast minimaliste, sans dépendance externe.
 *
 * Usage :
 *   import { toast } from '@/components/ui/Toast'
 *   toast.error('Fichier trop grand')
 *   toast.success('Projet enregistré')
 *
 * Le composant <Toaster /> doit être monté une fois (dans le layout racine).
 */

export type ToastVariant = 'info' | 'success' | 'error'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
const listeners = new Set<Listener>()
let nextId = 1

function emit() {
  for (const l of listeners) l(toasts)
}

function push(message: string, variant: ToastVariant, durationMs = 4000) {
  const id = nextId++
  toasts = [...toasts, { id, message, variant }]
  emit()
  setTimeout(() => {
    toasts = toasts.filter(t => t.id !== id)
    emit()
  }, durationMs)
}

export const toast = {
  info: (message: string) => push(message, 'info'),
  success: (message: string) => push(message, 'success'),
  error: (message: string) => push(message, 'error', 6000),
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'border-indigo-500/40 bg-indigo-950/90 text-indigo-100',
  success: 'border-green-500/40 bg-green-950/90 text-green-100',
  error: 'border-red-500/40 bg-red-950/90 text-red-100',
}

export function Toaster() {
  // Init paresseuse : récupère les toasts déjà en file avant le montage
  const [items, setItems] = useState<ToastItem[]>(() => [...toasts])

  useEffect(() => {
    const listener: Listener = (t) => setItems([...t])
    listeners.add(listener)
    // Resync au cas où un toast aurait été émis entre le rendu initial et l'abonnement
    if (toasts.length !== items.length) setItems([...toasts])
    return () => { listeners.delete(listener) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (items.length === 0) return null

  return (
    <div
      style={{ pointerEvents: 'none' }}
      className="fixed inset-x-0 bottom-4 z-[9999] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      role="status"
      aria-live="polite"
    >
      {items.map(item => (
        <div
          key={item.id}
          style={{ pointerEvents: 'auto' }}
          className={`pointer-events-auto w-full max-w-md rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${VARIANT_STYLES[item.variant]}`}
        >
          {item.message}
        </div>
      ))}
    </div>
  )
}
