'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { X, Upload, FileText, AlignCenter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAudioStore } from '@/store/audioStore'
import { parseAnyLyrics, getCurrentLyricsLine } from '@/lib/lyrics/parseLyrics'
import { cn } from '@/lib/utils'
import { getAudioEngine } from '@/lib/audio/AudioEngine'

export function LyricsPanel() {
  const {
    lyrics, lyricsVisible, currentTime, isPlaying,
    setLyrics, setLyricsVisible, setLyricsOffset,
    tracks, setCurrentTime,
  } = useAudioStore()

  const engine = getAudioEngine()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeLyricsRef = useRef<HTMLDivElement>(null)
  const [isKaraokeMode, setIsKaraokeMode] = useState(false)

  const currentLineIndex = lyrics
    ? getCurrentLyricsLine(lyrics.lines, currentTime, lyrics.offsetMs)
    : -1

  useEffect(() => {
    const container = containerRef.current
    const activeEl = activeLyricsRef.current
    if (!container || !activeEl) return

    // Scroll manually within the container to avoid scrolling the whole page
    const containerTop = container.scrollTop
    const containerHeight = container.clientHeight
    const elTop = activeEl.offsetTop
    const elHeight = activeEl.offsetHeight

    const targetScroll = elTop - containerHeight / 2 + elHeight / 2
    container.scrollTo({ top: targetScroll, behavior: 'smooth' })
  }, [currentLineIndex])

  const handleFileLoad = useCallback(async (file: File) => {
    const text = await file.text()
    const { lines, format } = parseAnyLyrics(text)
    setLyrics({
      format,
      lines,
      offsetMs: 0,
      rawContent: text,
    })
  }, [setLyrics])

  const handleSeekToLine = useCallback((lineTime: number) => {
    // line.time is raw timestamp from LRC/SRT.
    // offsetMs shifts when the highlight appears relative to audio time:
    //   getCurrentLyricsLine does: adjustedTime = currentTime - offsetMs/1000
    //   so highlight matches line when: currentTime - offsetMs/1000 >= line.time
    //   i.e. currentTime >= line.time + offsetMs/1000
    // To seek so that the clicked line starts playing immediately, seek to:
    //   audioTime = lineTime + offsetMs/1000
    const offsetSec = (lyrics?.offsetMs ?? 0) / 1000
    const seekTime = Math.max(0, lineTime + offsetSec)
    engine.seekTo(seekTime)
    setCurrentTime(seekTime)
    if (isPlaying) {
      setTimeout(() => { engine.play(tracks, seekTime) }, 10)
    }
  }, [engine, isPlaying, tracks, setCurrentTime, lyrics?.offsetMs])

  if (!lyricsVisible) return null

  return (
    <div
      className="flex flex-col border-l"
      style={{
        width: 300,
        minWidth: 240,
        maxWidth: 400,
        background: 'var(--surface)',
        borderColor: 'var(--border)',
        flexShrink: 0,
        overflow: 'hidden',   // bounds the panel height within the flex parent
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: 'var(--text-muted)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Paroles
          </span>
          {lyrics && (
            <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--surface-3)', color: 'var(--text-muted)' }}>
              {lyrics.format.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {lyrics && (
            <Button
              variant={isKaraokeMode ? 'active' : 'ghost'}
              size="icon"
              onClick={() => setIsKaraokeMode(v => !v)}
              title="Mode karaoké"
            >
              <AlignCenter size={14} />
            </Button>
          )}
          <Button
            variant="ghost" size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="Importer paroles (LRC, SRT, TXT)"
          >
            <Upload size={14} />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setLyricsVisible(false)}>
            <X size={14} />
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".lrc,.srt,.txt"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileLoad(e.target.files[0])}
        />
      </div>

      {/* Offset control */}
      {lyrics && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Décalage:</span>
          <input
            type="number"
            value={lyrics.offsetMs}
            onChange={(e) => setLyricsOffset(parseInt(e.target.value) || 0)}
            step={100}
            min={-5000}
            max={5000}
            className="w-20 text-xs text-center rounded px-2 py-0.5 border"
            style={{
              background: 'var(--surface-2)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
            }}
          />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>ms</span>
          {lyrics.offsetMs !== 0 && (
            <button
              onClick={() => setLyricsOffset(0)}
              className="text-xs underline"
              style={{ color: 'var(--accent)' }}
            >
              Reset
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-3">
        {!lyrics ? (
          <div
            className="flex flex-col items-center justify-center h-full gap-3 text-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <FileText size={32} style={{ opacity: 0.3 }} />
            <p className="text-sm">Importez un fichier LRC, SRT ou TXT</p>
            <p className="text-xs opacity-70">
              Cliquez sur l&apos;icône upload ci-dessus
            </p>
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} className="mr-1" />
              Importer
            </Button>
          </div>
        ) : isKaraokeMode ? (
          <KaraokeView
            lines={lyrics.lines}
            currentLineIndex={currentLineIndex}
            onSeek={handleSeekToLine}
          />
        ) : (
          <div className="space-y-0.5">
            {lyrics.lines.map((line, index) => (
              <div
                key={index}
                ref={index === currentLineIndex ? activeLyricsRef : undefined}
                className={cn(
                  'px-2 py-1.5 rounded text-sm cursor-pointer transition-all duration-200',
                )}
                style={{
                  background: index === currentLineIndex ? 'var(--accent-dim)' : 'transparent',
                  color: index === currentLineIndex ? 'var(--text)' : 'var(--text-muted)',
                  borderLeft: index === currentLineIndex ? '2px solid var(--accent)' : '2px solid transparent',
                  fontWeight: index === currentLineIndex ? 600 : 400,
                  opacity: index === currentLineIndex ? 1 : 0.55,
                }}
                onClick={() => handleSeekToLine(line.time)}
              >
                {line.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KaraokeView({
  lines,
  currentLineIndex,
  onSeek,
}: {
  lines: { time: number; text: string }[]
  currentLineIndex: number
  onSeek: (time: number) => void
}) {
  const prev = currentLineIndex > 0 ? lines[currentLineIndex - 1] : null
  const current = currentLineIndex >= 0 ? lines[currentLineIndex] : null
  const next = currentLineIndex < lines.length - 1 ? lines[currentLineIndex + 1] : null

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-2">
      {prev && (
        <p className="text-sm opacity-30 cursor-pointer" onClick={() => onSeek(prev.time)}>
          {prev.text}
        </p>
      )}
      {current ? (
        <p
          className="text-xl font-bold leading-relaxed cursor-pointer"
          style={{ color: 'var(--accent)' }}
          onClick={() => onSeek(current.time)}
        >
          {current.text}
        </p>
      ) : (
        <p className="text-lg opacity-20">♪</p>
      )}
      {next && (
        <p className="text-sm opacity-50 cursor-pointer" onClick={() => onSeek(next.time)}>
          {next.text}
        </p>
      )}
    </div>
  )
}
