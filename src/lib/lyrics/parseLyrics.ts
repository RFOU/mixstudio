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
    const text = match[4].trim()

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
} {
  const detected = format || detectFormat(content)
  let lines: LyricsLine[]

  switch (detected) {
    case 'lrc':
      lines = parseLRC(content)
      break
    case 'srt':
      lines = parseSRT(content)
      break
    default:
      lines = parsePlain(content)
  }

  return { lines, format: detected }
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
