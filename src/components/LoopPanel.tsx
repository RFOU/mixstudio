'use client'

import { useState, useCallback } from 'react'
import { Repeat, Plus, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAudioStore } from '@/store/audioStore'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { formatTime } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

interface LoopPanelProps {
  /** N'affiche que la liste des presets (mode mobile + paroles visibles) */
  presetsOnly?: boolean
}

export function LoopPanel({ presetsOnly = false }: LoopPanelProps) {
  const {
    loopEnabled, loopStart, loopEnd, loopPresets, duration,
    setLoopEnabled, setLoopPoints, addLoopPreset, removeLoopPreset,
    tracks, isPlaying, setIsPlaying, setCurrentTime,
    setActiveLoopField,
  } = useAudioStore()

  const engine = getAudioEngine()
  const [presetName, setPresetName] = useState('')
  const [showSaveForm, setShowSaveForm] = useState(false)

  const handleToggleLoop = useCallback(() => {
    const newEnabled = !loopEnabled
    setLoopEnabled(newEnabled)
    const valid = loopEnd > loopStart
    engine.setLoop(newEnabled && valid, loopStart, loopEnd)
    // Si on active sans points valides, focus automatique sur IN
    if (newEnabled && !valid) {
      setActiveLoopField('start')
    }
  }, [engine, loopEnabled, loopStart, loopEnd, setLoopEnabled, setActiveLoopField])

  const handleStartChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0
    const clamped = Math.max(0, Math.min(val, loopEnd - 0.1))
    setLoopPoints(clamped, loopEnd)
    engine.setLoop(loopEnabled, clamped, loopEnd)
  }, [engine, loopEnabled, loopEnd, setLoopPoints])

  const handleEndChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0
    const clamped = Math.max(loopStart + 0.1, Math.min(val, duration))
    setLoopPoints(loopStart, clamped)
    engine.setLoop(loopEnabled, loopStart, clamped)
  }, [engine, loopEnabled, loopStart, duration, setLoopPoints])

  const handleSavePreset = useCallback(() => {
    if (!presetName.trim()) return
    addLoopPreset({
      id: uuidv4(),
      name: presetName.trim(),
      startTime: loopStart,
      endTime: loopEnd,
    })
    setPresetName('')
    setShowSaveForm(false)
  }, [addLoopPreset, loopStart, loopEnd, presetName])

  const handleLoadPreset = useCallback((id: string) => {
    const preset = loopPresets.find(p => p.id === id)
    if (!preset) return

    // Toggle : si ce preset est déjà actif, on désactive la boucle
    const isActive = loopEnabled
      && Math.abs(loopStart - preset.startTime) < 0.001
      && Math.abs(loopEnd - preset.endTime) < 0.001
    if (isActive) {
      setLoopEnabled(false)
      engine.setLoop(false, preset.startTime, preset.endTime)
      return
    }

    setLoopPoints(preset.startTime, preset.endTime)
    setLoopEnabled(true)
    engine.setLoop(true, preset.startTime, preset.endTime)
    engine.seekTo(preset.startTime)
    setCurrentTime(preset.startTime)
    if (isPlaying) {
      setTimeout(() => { engine.play(tracks, preset.startTime) }, 10)
    }
  }, [engine, loopPresets, loopEnabled, loopStart, loopEnd, isPlaying, tracks, setLoopPoints, setLoopEnabled, setCurrentTime])

  const hasValidLoop = loopEnd > loopStart && loopEnd <= duration
  const activeLoopField = useAudioStore(s => s.activeLoopField)
  const waitingForPoints = loopEnabled && !hasValidLoop

  const isPresetActive = (preset: { startTime: number; endTime: number }) =>
    loopEnabled
    && Math.abs(loopStart - preset.startTime) < 0.001
    && Math.abs(loopEnd - preset.endTime) < 0.001

  // Mode presets uniquement (mobile + paroles visibles)
  if (presetsOnly) {
    if (loopPresets.length === 0) return null
    return (
      <div
        className="border-t flex-shrink-0 px-4 py-1.5 flex items-center gap-2 flex-wrap"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Presets:</span>
        {loopPresets.map(preset => {
          const active = isPresetActive(preset)
          return (
            <div key={preset.id} className="flex items-center gap-1">
              <button
                className="text-xs px-2 py-0.5 rounded border transition-colors"
                style={{
                  background: active ? 'var(--accent)' : 'var(--surface-2)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? '#fff' : 'var(--text)',
                }}
                onClick={() => handleLoadPreset(preset.id)}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'var(--accent)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'var(--border)' }}
              >
                {preset.name}
                <span className="ml-1 opacity-70">({formatTime(preset.endTime - preset.startTime)})</span>
              </button>
              <button
                onClick={() => removeLoopPreset(preset.id)}
                className="opacity-40 hover:opacity-100 transition-opacity"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={10} />
              </button>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="border-t flex-shrink-0"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Toggle loop */}
        <Button
          variant={loopEnabled ? 'active' : 'ghost'}
          size="sm"
          onClick={handleToggleLoop}
        >
          <Repeat size={14} className="mr-1" />
          Boucle
        </Button>

        {/* Loop points */}
        <div className="flex items-center gap-2 text-sm">
          <label className="text-xs" style={{ color: activeLoopField === 'start' ? 'var(--accent)' : 'var(--text-muted)' }}>IN</label>
          <input
            type="number"
            value={loopStart.toFixed(3)}
            onChange={handleStartChange}
            onFocus={() => setActiveLoopField('start')}
            onBlur={() => setTimeout(() => setActiveLoopField(null), 200)}
            min={0}
            max={duration}
            step={0.001}
            className="w-20 text-xs text-center rounded px-2 py-1 border"
            style={{
              background: 'var(--surface-2)',
              borderColor: activeLoopField === 'start' ? 'var(--accent)' : 'var(--border)',
              color: 'var(--text)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatTime(loopStart)}
          </span>

          <span style={{ color: 'var(--text-muted)' }}>→</span>

          <label className="text-xs" style={{ color: activeLoopField === 'end' ? 'var(--accent)' : 'var(--text-muted)' }}>OUT</label>
          <input
            type="number"
            value={loopEnd.toFixed(3)}
            onChange={handleEndChange}
            onFocus={() => setActiveLoopField('end')}
            onBlur={() => setTimeout(() => setActiveLoopField(null), 200)}
            min={0}
            max={duration}
            step={0.001}
            className="w-20 text-xs text-center rounded px-2 py-1 border"
            style={{
              background: 'var(--surface-2)',
              borderColor: activeLoopField === 'end' ? 'var(--accent)' : 'var(--border)',
              color: 'var(--text)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {formatTime(loopEnd)}
          </span>

          {hasValidLoop && (
            <span className="text-xs" style={{ color: 'var(--accent)' }}>
              Durée: {formatTime(loopEnd - loopStart)}
            </span>
          )}
          {waitingForPoints && (
            <span className="text-xs animate-pulse" style={{ color: 'var(--accent)' }}>
              Cliquez sur la timeline
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* Presets */}
        {hasValidLoop && !showSaveForm && (
          <Button variant="ghost" size="sm" onClick={() => setShowSaveForm(true)}>
            <Plus size={14} className="mr-1" />
            Sauvegarder
          </Button>
        )}

        {showSaveForm && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Nom du preset..."
              className="text-xs px-2 py-1 rounded border"
              style={{
                background: 'var(--surface-2)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
                width: 140,
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSavePreset()
                if (e.key === 'Escape') setShowSaveForm(false)
              }}
              autoFocus
            />
            <Button variant="ghost" size="icon" onClick={handleSavePreset}>
              <Check size={14} />
            </Button>
          </div>
        )}
      </div>

      {/* Presets list */}
      {loopPresets.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-2 flex-wrap">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Presets:</span>
          {loopPresets.map(preset => {
            const active = isPresetActive(preset)
            return (
              <div key={preset.id} className="flex items-center gap-1">
                <button
                  className="text-xs px-2 py-0.5 rounded border transition-colors"
                  style={{
                    background: active ? 'var(--accent)' : 'var(--surface-2)',
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    color: active ? '#fff' : 'var(--text)',
                  }}
                  onClick={() => handleLoadPreset(preset.id)}
                  onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = 'var(--border)' }}
                >
                  {preset.name}
                  <span className="ml-1 opacity-70">
                    ({formatTime(preset.endTime - preset.startTime)})
                  </span>
                </button>
                <button
                  onClick={() => removeLoopPreset(preset.id)}
                  className="opacity-40 hover:opacity-100 transition-opacity"
                  style={{ color: 'var(--danger)' }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
