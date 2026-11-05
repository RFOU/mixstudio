'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, FileUp, ClipboardPaste, Play, Pause, Timer, Trash2, Download, Save,
  Plus, Rewind, FastForward, CornerLeftUp, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { toast } from '@/components/ui/Toast'
import { useAudioStore } from '@/store/audioStore'
import { useShallow } from 'zustand/react/shallow'
import { getAudioEngine } from '@/lib/audio/AudioEngine'
import { createClient } from '@/lib/supabase/client'
import {
  VOICE_PALETTE, voiceColor, formatLrcTime, parseTimeInput,
  generateLRC, parseAnyLyrics, type LrcSourceLine,
} from '@/lib/lyrics/parseLyrics'
import { extractLinesFromPdf } from '@/lib/lyrics/pdfLyrics'

interface Row extends LrcSourceLine {
  id: string
}

const MAX_PDF_BYTES = 20 * 1024 * 1024
const sanitizeVoice = (name: string) => name.replace(/[{},;=[\]]/g, '').trim()

export function LyricsEditor({ onClose }: { onClose: () => void }) {
  const {
    lyrics, projectId, projectName, tracks, isPlaying, currentTime,
    setLyrics, setIsPlaying, setCurrentTime,
  } = useAudioStore(useShallow(s => ({
    lyrics: s.lyrics, projectId: s.projectId, projectName: s.projectName,
    tracks: s.tracks, isPlaying: s.isPlaying, currentTime: s.currentTime,
    setLyrics: s.setLyrics, setIsPlaying: s.setIsPlaying, setCurrentTime: s.setCurrentTime,
  })))

  const engine = getAudioEngine()
  const supabase = useMemo(() => createClient(), [])
  const seq = useRef(0)
  const newId = () => `r${++seq.current}`

  // --- État initial : on repart des paroles déjà chargées (édition) -----------
  const [rows, setRows] = useState<Row[]>(() =>
    (lyrics?.lines ?? []).map(l => ({
      id: `i${seq.current++}`,
      text: l.text,
      // En « plain », les temps sont fictifs (index × 3 s) → on les ignore.
      time: lyrics?.format === 'plain' ? null : l.time,
      tags: l.tags ?? [],
    }))
  )
  const [voices, setVoices] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const l of lyrics?.lines ?? []) {
      for (const t of l.tags ?? []) v[t] = voiceColor(t, lyrics?.voices)
    }
    for (const [k, c] of Object.entries(lyrics?.voices ?? {})) v[k] = c
    return v
  })
  const [nextIdx, setNextIdx] = useState(0)
  const [anticipationMs, setAnticipationMs] = useState(200)
  const [dirty, setDirty] = useState(false)
  const [pasteMode, setPasteMode] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newVoiceName, setNewVoiceName] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const nextIdxRef = useRef(nextIdx)
  const rowsLenRef = useRef(rows.length)
  nextIdxRef.current = nextIdx
  rowsLenRef.current = rows.length

  const mutate = useCallback((fn: (r: Row[]) => Row[]) => {
    setRows(fn)
    setDirty(true)
  }, [])

  const voiceNames = Object.keys(voices)

  // --- Génération LRC (aperçu + sauvegarde) ----------------------------------
  const lrc = useMemo(
    () => generateLRC(rows, voices, projectName),
    [rows, voices, projectName]
  )

  // --- Lecture / navigation ---------------------------------------------------
  const togglePlay = useCallback(async () => {
    await engine.resume()
    if (isPlaying) {
      engine.pause()
      setIsPlaying(false)
    } else {
      engine.play(tracks, useAudioStore.getState().currentTime)
      setIsPlaying(true)
    }
  }, [engine, isPlaying, tracks, setIsPlaying])

  const seekTo = useCallback((t: number) => {
    const time = Math.max(0, t)
    engine.seekTo(time, isPlaying ? tracks : undefined)
    setCurrentTime(time)
  }, [engine, isPlaying, tracks, setCurrentTime])

  // --- Horodatage -------------------------------------------------------------
  const stampRow = useCallback((index: number) => {
    const now = useAudioStore.getState().currentTime
    const time = Math.max(0, now - anticipationMs / 1000)
    mutate(r => r.map((row, i) => (i === index ? { ...row, time } : row)))
    setNextIdx(Math.min(index + 1, rowsLenRef.current))
  }, [anticipationMs, mutate])

  // Entrée = horodate la prochaine ligne (hors champs de saisie / boutons).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return
      if (nextIdxRef.current >= rowsLenRef.current) return
      e.preventDefault()
      stampRow(nextIdxRef.current)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stampRow])

  // Garde la ligne « prochaine à horodater » visible.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-row="${nextIdx}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [nextIdx])

  // --- Import -----------------------------------------------------------------
  const confirmReplace = () =>
    rows.length === 0 || window.confirm('Remplacer les lignes actuelles par le nouveau texte ?')

  const loadLines = (texts: string[]) => {
    mutate(() => texts.map(text => ({ id: newId(), text, time: null, tags: [] })))
    setNextIdx(0)
  }

  const handlePdf = async (file: File) => {
    if (file.size > MAX_PDF_BYTES) {
      toast.error('PDF trop volumineux (20 Mo maximum)')
      return
    }
    if (!confirmReplace()) return
    setImporting(true)
    try {
      const lines = await extractLinesFromPdf(file)
      if (lines.length === 0) throw new Error('Aucune ligne de texte trouvée dans ce PDF')
      loadLines(lines)
      toast.success(`${lines.length} lignes importées — supprimez les titres/numéros inutiles`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Lecture du PDF impossible')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handlePaste = () => {
    const texts = pasteText.split('\n').map(l => l.trim()).filter(Boolean)
    if (texts.length === 0) return
    if (!confirmReplace()) return
    loadLines(texts)
    setPasteText('')
    setPasteMode(false)
  }

  // --- Voix -------------------------------------------------------------------
  const addVoice = (rawName: string) => {
    const name = sanitizeVoice(rawName)
    if (!name || voices[name]) return
    const used = new Set(Object.values(voices))
    const color = VOICE_PALETTE.find(c => !used.has(c)) ?? voiceColor(name)
    setVoices(v => ({ ...v, [name]: color }))
    setDirty(true)
  }

  const removeVoice = (name: string) => {
    setVoices(v => {
      const { [name]: _removed, ...rest } = v
      void _removed
      return rest
    })
    mutate(r => r.map(row => ({ ...row, tags: row.tags.filter(t => t !== name) })))
  }

  const toggleTag = (index: number, name: string) =>
    mutate(r => r.map((row, i) => {
      if (i !== index) return row
      const has = row.tags.includes(name)
      return { ...row, tags: has ? row.tags.filter(t => t !== name) : [...row.tags, name] }
    }))

  const addTrackVoices = () => {
    for (const t of tracks) addVoice(t.name)
  }

  // --- Sauvegarde / export ----------------------------------------------------
  const handleDownload = () => {
    const blob = new Blob([lrc.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(projectName || 'paroles').replace(/[^\w\- ]+/g, '_')}.lrc`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleSave = async () => {
    if (!projectId) {
      toast.error('Aucun projet ouvert')
      return
    }
    if (lrc.written === 0) {
      toast.error('Posez au moins un timestamp avant d’enregistrer')
      return
    }
    if (lrc.skipped > 0 &&
        !window.confirm(`${lrc.skipped} ligne(s) sans timestamp seront ignorées. Enregistrer quand même ?`)) {
      return
    }
    setSaving(true)
    try {
      const offsetMs = lyrics?.offsetMs ?? 0
      const { data: existing } = await supabase
        .from('lyrics').select('id').eq('project_id', projectId).maybeSingle()

      const payload = { format: 'lrc' as const, content: lrc.content, offset_ms: offsetMs }
      const { error } = existing
        ? await supabase.from('lyrics')
            .update({ ...payload, updated_at: new Date().toISOString() }).eq('id', existing.id)
        : await supabase.from('lyrics').insert({ project_id: projectId, ...payload })
      if (error) throw new Error(error.message)

      const parsed = parseAnyLyrics(lrc.content, 'lrc')
      setLyrics({
        id: existing?.id,
        format: 'lrc',
        lines: parsed.lines,
        offsetMs,
        rawContent: lrc.content,
        voices: parsed.voices,
      })
      setDirty(false)
      toast.success(`Paroles enregistrées (${lrc.written} lignes)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (dirty && !window.confirm('Fermer sans enregistrer ? Les modifications seront perdues.')) return
    onClose()
  }

  const duration = engine.getDuration()
  const inputStyle = {
    background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)',
  } as const

  return (
    <div
      className="fixed inset-0 flex items-stretch sm:items-center justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="flex flex-col w-full sm:max-w-3xl sm:rounded-xl overflow-hidden"
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          height: 'var(--vh-screen)', maxHeight: '100%',
        }}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Éditeur de paroles</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {lrc.written}/{rows.filter(r => r.text.trim()).length} lignes horodatées
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose} title="Fermer"><X size={16} /></Button>
        </div>

        {/* Import */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 size={12} className="mr-1 animate-spin" /> : <FileUp size={12} className="mr-1" />}
            Importer un PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPasteMode(v => !v)}>
            <ClipboardPaste size={12} className="mr-1" /> Coller du texte
          </Button>
          <input
            ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={e => e.target.files?.[0] && handlePdf(e.target.files[0])}
          />
        </div>

        {pasteMode && (
          <div className="px-4 py-2 border-b flex flex-col gap-2 flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
            <textarea
              value={pasteText} onChange={e => setPasteText(e.target.value)} rows={5}
              placeholder="Collez les paroles, une ligne par ligne chantée…"
              className="w-full text-sm rounded px-2 py-1.5 border" style={inputStyle}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handlePaste} disabled={!pasteText.trim()}>Charger</Button>
              <Button size="sm" variant="ghost" onClick={() => setPasteMode(false)}>Annuler</Button>
            </div>
          </div>
        )}

        {/* Voix */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Voix :</span>
          {voiceNames.map(name => (
            <span
              key={name}
              className="inline-flex items-center gap-1 text-xs rounded-full pl-1.5 pr-1 py-0.5 border"
              style={{ borderColor: voices[name], color: 'var(--text)' }}
            >
              <input
                type="color" value={voices[name]} aria-label={`Couleur ${name}`}
                onChange={e => { setVoices(v => ({ ...v, [name]: e.target.value })); setDirty(true) }}
                className="w-4 h-4 p-0 border-0 bg-transparent cursor-pointer"
              />
              {name}
              <button onClick={() => removeVoice(name)} title={`Supprimer ${name}`} className="opacity-60 hover:opacity-100">
                <X size={11} />
              </button>
            </span>
          ))}
          <form
            className="inline-flex items-center gap-1"
            onSubmit={e => { e.preventDefault(); addVoice(newVoiceName); setNewVoiceName('') }}
          >
            <input
              value={newVoiceName} onChange={e => setNewVoiceName(e.target.value)} placeholder="Nouvelle voix"
              className="w-28 text-xs rounded px-2 py-1 border" style={inputStyle}
            />
            <Button size="icon" variant="ghost" type="submit" title="Ajouter la voix"><Plus size={14} /></Button>
          </form>
          {tracks.length > 0 && (
            <button className="text-xs underline" style={{ color: 'var(--accent)' }} onClick={addTrackVoices}>
              Reprendre les noms des pistes
            </button>
          )}
        </div>

        {/* Lecture + horodatage */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Button size="icon" variant="ghost" onClick={() => seekTo(currentTime - 5)} title="−5 s"><Rewind size={14} /></Button>
          <Button size="icon" onClick={togglePlay} disabled={duration === 0} title="Lecture / pause (Espace)">
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => seekTo(currentTime + 5)} title="+5 s"><FastForward size={14} /></Button>
          <span className="text-xs font-mono tabular-nums" style={{ color: 'var(--text)' }}>
            {formatLrcTime(currentTime)}
          </span>
          <Button
            size="sm" variant="active" onClick={() => stampRow(nextIdx)}
            disabled={nextIdx >= rows.length} title="Horodater la ligne en surbrillance (Entrée)"
          >
            <Timer size={12} className="mr-1" /> Horodater (Entrée)
          </Button>
          <label className="flex items-center gap-1 text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
            Anticipation
            <input
              type="number" min={0} max={1000} step={50} value={anticipationMs}
              onChange={e => setAnticipationMs(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 text-xs text-center rounded px-1 py-0.5 border" style={inputStyle}
            />
            ms
          </label>
        </div>

        {/* Lignes */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
          {rows.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>
              Importez un PDF ou collez du texte pour commencer.
            </p>
          ) : rows.map((row, i) => (
            <div
              key={row.id} data-row={i}
              className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 px-1.5 py-1 rounded"
              style={{
                background: i === nextIdx ? 'var(--accent-dim)' : 'transparent',
                borderLeft: `3px solid ${row.tags[0] ? voiceColor(row.tags[0], voices) : 'transparent'}`,
              }}
              onClick={() => setNextIdx(i)}
            >
              <TimeInput value={row.time} onCommit={t => mutate(r => r.map((x, k) => (k === i ? { ...x, time: t } : x)))} style={inputStyle} />
              <Button size="icon" variant="ghost" onClick={e => { e.stopPropagation(); stampRow(i) }} title="Horodater maintenant">
                <Timer size={13} />
              </Button>
              <Button
                size="icon" variant="ghost" disabled={row.time === null}
                onClick={e => { e.stopPropagation(); if (row.time !== null) seekTo(row.time) }} title="Aller à ce timestamp"
              >
                <Play size={12} />
              </Button>
              <div className="flex items-center gap-1">
                {voiceNames.map(name => {
                  const on = row.tags.includes(name)
                  return (
                    <button
                      key={name} title={name} aria-pressed={on}
                      onClick={e => { e.stopPropagation(); toggleTag(i, name) }}
                      className="w-4 h-4 rounded-full border-2"
                      style={{ borderColor: voices[name], background: on ? voices[name] : 'transparent' }}
                    />
                  )
                })}
              </div>
              <input
                value={row.text}
                onChange={e => mutate(r => r.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))}
                className="flex-1 min-w-[10rem] text-sm rounded px-2 py-1 border" style={inputStyle}
              />
              <Button
                size="icon" variant="ghost" disabled={i === 0} title="Fusionner avec la ligne précédente"
                onClick={e => {
                  e.stopPropagation()
                  mutate(r => {
                    const merged = [...r]
                    merged[i - 1] = { ...merged[i - 1], text: `${merged[i - 1].text} ${merged[i].text}`.trim() }
                    merged.splice(i, 1)
                    return merged
                  })
                }}
              >
                <CornerLeftUp size={13} />
              </Button>
              <Button
                size="icon" variant="ghost" title="Supprimer la ligne"
                onClick={e => { e.stopPropagation(); mutate(r => r.filter((_, k) => k !== i)) }}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
          {rows.length > 0 && (
            <Button
              size="sm" variant="ghost" className="mt-1 ml-1.5"
              onClick={() => mutate(r => [...r, { id: newId(), text: '', time: null, tags: [] }])}
            >
              <Plus size={12} className="mr-1" /> Ajouter une ligne
            </Button>
          )}
        </div>

        {/* Aperçu LRC */}
        {showPreview && (
          <pre
            className="text-xs font-mono px-4 py-2 border-t overflow-auto flex-shrink-0 whitespace-pre-wrap"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', maxHeight: '30%' }}
          >
            {lrc.content}
          </pre>
        )}

        {/* Pied */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'var(--border)' }}>
          <Button size="sm" variant="ghost" onClick={() => setShowPreview(v => !v)}>
            {showPreview ? 'Masquer' : 'Aperçu'} LRC
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDownload} disabled={lrc.written === 0}>
            <Download size={12} className="mr-1" /> Télécharger .lrc
          </Button>
          <Button size="sm" className="ml-auto" onClick={handleSave} disabled={saving || lrc.written === 0 || !projectId}>
            {saving ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Save size={12} className="mr-1" />}
            Enregistrer dans le projet
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Champ `mm:ss.xx` : valide à la perte de focus / Entrée, revient en arrière si invalide. */
function TimeInput({
  value, onCommit, style,
}: {
  value: number | null
  onCommit: (t: number | null) => void
  style: React.CSSProperties
}) {
  const format = (v: number | null) => (v === null ? '' : formatLrcTime(v))
  const [text, setText] = useState(format(value))
  useEffect(() => { setText(format(value)) }, [value])

  const commit = () => {
    if (text.trim() === '') { onCommit(null); return }
    const parsed = parseTimeInput(text)
    if (parsed === null) setText(format(value))
    else onCommit(parsed)
  }

  return (
    <input
      value={text} placeholder="--:--.--" inputMode="decimal"
      onChange={e => setText(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      onClick={e => e.stopPropagation()}
      className="w-20 text-xs font-mono text-center rounded px-1 py-1 border" style={style}
    />
  )
}
