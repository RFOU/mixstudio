import { LyricsLine } from '@/store/audioStore'

export function parseLRC(content: string): LyricsLine[] {
  const lines: LyricsLine[] = []
  const lineRegex = /\[(\d+):(\d+)\.(\d+)\](.*)/
  const wordRegex = /\<(\d+):(\d+)\.(\d+)\>/g

  const rawLines = content.split('\n')

  for (const raw of rawLines) {
    const match = raw.match(lineRegex)
    if (!match) continue

    const mins = parseInt(match[1])
    const secs = parseInt(match[2])
    const centisecs = parseInt(match[3])
    const time = mins * 60 + secs + centisecs / 100
    // Préfixe optionnel {Voix} / {Voix1,Voix2} → tags de la ligne (couleur à la lecture)
    const { tags, rest } = extractTags(match[4].trim())
    const text = rest

    if (!text) continue

    // Check for word-level timestamps
    const words: { time: number; text: string }[] = []
    let wordMatch
    wordRegex.lastIndex = 0
    let lastIndex = 0
    const textWithWords = text

    while ((wordMatch = wordRegex.exec(textWithWords)) !== null) {
      const wMins = parseInt(wordMatch[1])
      const wSecs = parseInt(wordMatch[2])
      const wCenti = parseInt(wordMatch[3])
      const wTime = wMins * 60 + wSecs + wCenti / 100
      const wText = textWithWords.slice(lastIndex, wordMatch.index).trim()
      if (wText) words.push({ time: wTime, text: wText })
      lastIndex = wordMatch.index + wordMatch[0].length
    }

    if (lastIndex < textWithWords.length) {
      const remaining = textWithWords.slice(lastIndex).trim()
      if (remaining) words.push({ time: time, text: remaining })
    }

    lines.push({
      time,
      text: text.replace(/<\d+:\d+\.\d+>/g, '').trim(),
      words: words.length > 0 ? words : undefined,
      tags: tags.length > 0 ? tags : undefined,
    })
  }

  return lines.sort((a, b) => a.time - b.time)
}

export function parseSRT(content: string): LyricsLine[] {
  const lines: LyricsLine[] = []
  const blocks = content.trim().split(/\n\n+/)

  for (const block of blocks) {
    const blockLines = block.trim().split('\n')
    if (blockLines.length < 3) continue

    const timeMatch = blockLines[1]?.match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    )
    if (!timeMatch) continue

    const h = parseInt(timeMatch[1])
    const m = parseInt(timeMatch[2])
    const s = parseInt(timeMatch[3])
    const ms = parseInt(timeMatch[4])
    const time = h * 3600 + m * 60 + s + ms / 1000

    const text = blockLines.slice(2).join(' ').trim()
    if (text) lines.push({ time, text })
  }

  return lines.sort((a, b) => a.time - b.time)
}

export function parsePlain(content: string): LyricsLine[] {
  return content
    .split('\n')
    .filter(line => line.trim())
    .map((text, index) => ({
      time: index * 3, // Approximate 3s per line
      text: text.trim(),
    }))
}

export function detectFormat(content: string): 'lrc' | 'srt' | 'plain' {
  if (/\[\d+:\d+\.\d+\]/.test(content)) return 'lrc'
  if (/\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(content)) return 'srt'
  return 'plain'
}

export function parseAnyLyrics(content: string, format?: 'lrc' | 'srt' | 'plain'): {
  lines: LyricsLine[]
  format: 'lrc' | 'srt' | 'plain'
  voices?: Record<string, string>
} {
  const detected = format || detectFormat(content)
  let lines: LyricsLine[]
  let voices: Record<string, string> | undefined

  switch (detected) {
    case 'lrc':
      lines = parseLRC(content)
      voices = parseVoicesHeader(content)
      break
    case 'srt':
      lines = parseSRT(content)
      break
    default:
      lines = parsePlain(content)
  }

  return { lines, format: detected, voices }
}

// ---------------------------------------------------------------------------
// Voix / tags (couleur par voix à la lecture)
//
// Format dans le LRC (reste lisible par les autres lecteurs LRC) :
//   [voices:Soprane=#ec4899;Alto=#f59e0b]      ← en-tête optionnel (couleurs)
//   [00:12.50]{Soprane} Texte de la ligne       ← tag(s) en préfixe de ligne
//   [00:15.00]{Soprane,Alto} Texte à deux voix
// ---------------------------------------------------------------------------

/** Palette par défaut, attribuée de façon stable selon le nom de la voix. */
export const VOICE_PALETTE = [
  '#ec4899', '#f59e0b', '#22c55e', '#06b6d4',
  '#8b5cf6', '#ef4444', '#14b8a6', '#6366f1',
]

const TAG_PREFIX_RE = /^\{([^{}]*)\}\s*/

/** Sépare le préfixe `{Voix1,Voix2}` du texte de la ligne. */
export function extractTags(text: string): { tags: string[]; rest: string } {
  const m = text.match(TAG_PREFIX_RE)
  if (!m) return { tags: [], rest: text }
  const tags = m[1].split(',').map(t => t.trim()).filter(Boolean)
  return { tags, rest: text.slice(m[0].length).trim() }
}

/** Lit l'en-tête `[voices:Nom=#hex;Nom2=#hex]` (couleurs choisies par voix). */
export function parseVoicesHeader(content: string): Record<string, string> | undefined {
  const m = content.match(/^\[voices:([^\]]*)\]/m)
  if (!m) return undefined
  const voices: Record<string, string> = {}
  for (const pair of m[1].split(';')) {
    const idx = pair.lastIndexOf('=')
    if (idx <= 0) continue
    const name = pair.slice(0, idx).trim()
    const color = pair.slice(idx + 1).trim()
    if (name && /^#[0-9a-fA-F]{3,8}$/.test(color)) voices[name] = color
  }
  return Object.keys(voices).length > 0 ? voices : undefined
}

/** Couleur d'une voix : choix explicite, sinon couleur stable dérivée du nom. */
export function voiceColor(tag: string, voices?: Record<string, string>): string {
  if (voices?.[tag]) return voices[tag]
  let h = 0
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0
  return VOICE_PALETTE[h % VOICE_PALETTE.length]
}

/** Couleur de la ligne = couleur de sa première voix (null si aucun tag). */
export function lineColor(line: { tags?: string[] }, voices?: Record<string, string>): string | null {
  const first = line.tags?.[0]
  return first ? voiceColor(first, voices) : null
}

/** Secondes → `mm:ss.xx` (centièmes sur 2 chiffres, comme attend parseLRC). */
export function formatLrcTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100))
  const cs = total % 100
  const s = Math.floor(total / 100) % 60
  const m = Math.floor(total / 6000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(m)}:${pad(s)}.${pad(cs)}`
}

/** `mm:ss.xx` | `mm:ss` | `ss.xx` → secondes, ou null si invalide. */
export function parseTimeInput(value: string): number | null {
  const v = value.trim()
  if (!v) return null
  const m = v.match(/^(?:(\d+):)?(\d+)(?:[.,](\d{1,3}))?$/)
  if (!m) return null
  const mins = m[1] ? parseInt(m[1], 10) : 0
  const secs = parseInt(m[2], 10)
  const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) / 1000 : 0
  return mins * 60 + secs + frac
}

export interface LrcSourceLine {
  time: number | null
  text: string
  tags: string[]
}

/**
 * Génère le contenu LRC. Les lignes sans timestamp sont ignorées (comptées dans
 * `skipped`). Tri par temps. L'en-tête [voices:…] ne liste que les voix utilisées.
 */
export function generateLRC(
  lines: LrcSourceLine[],
  voices: Record<string, string>,
  title?: string
): { content: string; written: number; skipped: number } {
  const stamped = lines
    .filter((l): l is LrcSourceLine & { time: number } => l.time !== null && l.text.trim() !== '')
    .sort((a, b) => a.time - b.time)

  const used = new Set<string>()
  stamped.forEach(l => l.tags.forEach(t => used.add(t)))

  const out: string[] = []
  if (title) out.push(`[ti:${title}]`)
  if (used.size > 0) {
    const pairs = [...used].map(t => `${t.replace(/[;=\]]/g, ' ')}=${voiceColor(t, voices)}`)
    out.push(`[voices:${pairs.join(';')}]`)
  }
  for (const l of stamped) {
    const tagPrefix = l.tags.length > 0 ? `{${l.tags.join(',')}} ` : ''
    out.push(`[${formatLrcTime(l.time)}]${tagPrefix}${l.text.trim()}`)
  }

  return {
    content: out.join('\n') + '\n',
    written: stamped.length,
    skipped: lines.filter(l => l.text.trim() !== '').length - stamped.length,
  }
}

export function getCurrentLyricsLine(
  lines: LyricsLine[],
  currentTime: number,
  offsetMs: number = 0
): number {
  const adjustedTime = currentTime - offsetMs / 1000
  let index = -1

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= adjustedTime) {
      index = i
    } else {
      break
    }
  }

  return index
}
