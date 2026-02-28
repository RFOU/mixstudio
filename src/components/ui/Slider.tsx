'use client'

import { cn } from '@/lib/utils'

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
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      disabled={disabled}
      className={cn(
        'w-full cursor-pointer disabled:cursor-not-allowed',
        vertical && 'writing-mode-vertical',
        className
      )}
      style={vertical ? { writingMode: 'vertical-lr', direction: 'rtl', width: 24, height: '100%' } : {}}
    />
  )
}
