'use client'

import { cn } from '@/lib/utils'
import { useRef, useCallback } from 'react'

interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  vertical?: boolean
  className?: string
  label?: string
  disabled?: boolean
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  vertical = false,
  className,
  disabled = false,
}: SliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)

  const pct = Math.round(((value - min) / (max - min)) * 100)

  const getValueFromEvent = useCallback((clientX: number, clientY: number) => {
    const track = trackRef.current
    if (!track) return value
    const rect = track.getBoundingClientRect()
    let ratio: number
    if (vertical) {
      ratio = 1 - (clientY - rect.top) / rect.height
    } else {
      ratio = (clientX - rect.left) / rect.width
    }
    ratio = Math.max(0, Math.min(1, ratio))
    const raw = min + ratio * (max - min)
    const stepped = Math.round(raw / step) * step
    return Math.max(min, Math.min(max, stepped))
  }, [value, min, max, step, vertical])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(getValueFromEvent(e.clientX, e.clientY))
  }, [disabled, onChange, getValueFromEvent])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    onChange(getValueFromEvent(e.clientX, e.clientY))
  }, [onChange, getValueFromEvent])

  if (vertical) {
    return (
      <div
        ref={trackRef}
        role="slider"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={disabled ? -1 : 0}
        className={cn('relative flex flex-col items-center cursor-pointer select-none', disabled && 'opacity-40 cursor-not-allowed', className)}
        style={{ width: 18, height: '100%' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
      >
        {/* Border container */}
        <div className="relative flex-1 w-full rounded"
          style={{ border: '1px solid var(--border-2)', background: 'var(--surface-3)' }}>
          {/* Fill */}
          <div className="absolute bottom-0 left-0 right-0 rounded"
            style={{ height: `${pct}%`, background: 'var(--accent)', opacity: 0.85 }} />
          {/* Thumb */}
          <div className="absolute left-1/2 -translate-x-1/2 rounded-full pointer-events-none"
            style={{
              bottom: `calc(${pct}% - 6px)`,
              width: 12, height: 12,
              background: 'var(--accent)',
              border: '2px solid var(--surface)',
              boxShadow: '0 0 0 1px var(--border-2)',
            }} />
        </div>
      </div>
    )
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={disabled ? -1 : 0}
      className={cn('relative flex items-center cursor-pointer select-none', disabled && 'opacity-40 cursor-not-allowed', className)}
      style={{ height: 18 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {/* Border container */}
      <div className="relative w-full rounded"
        style={{
          height: 8,
          border: '1px solid var(--border-2)',
          background: 'var(--surface-3)',
        }}>
        {/* Fill */}
        <div className="absolute left-0 top-0 bottom-0 rounded"
          style={{ width: `${pct}%`, background: 'var(--accent)', opacity: 0.85 }} />
        {/* Thumb */}
        <div className="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
          style={{
            left: `calc(${pct}% - 6px)`,
            width: 13, height: 13,
            background: 'var(--accent)',
            border: '2px solid var(--surface)',
            boxShadow: '0 0 0 1px var(--border-2)',
          }} />
      </div>
    </div>
  )
}
