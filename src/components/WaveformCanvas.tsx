'use client'

import { useRef, useEffect, useCallback } from 'react'

interface WaveformCanvasProps {
  waveformData: Float32Array | null
  currentTime: number
  duration: number
  color?: string
  height?: number
  loopStart?: number
  loopEnd?: number
  loopEnabled?: boolean
  muted?: boolean
  onSeek?: (time: number) => void
  onLoopSelect?: (start: number, end: number) => void
  showLoop?: boolean
}

export function WaveformCanvas({
  waveformData,
  currentTime,
  duration,
  color = '#6366f1',
  height = 60,
  loopStart = 0,
  loopEnd = 0,
  loopEnabled = false,
  muted = false,
  onSeek,
  onLoopSelect,
  showLoop = false,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const isLoopDragRef = useRef(false)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width } = canvas
    const h = canvas.height
    const mid = h / 2

    ctx.clearRect(0, 0, width, h)

    // Background
    ctx.fillStyle = '#0a0a0f'
    ctx.fillRect(0, 0, width, h)

    // Loop region
    if (showLoop && loopEnabled && duration > 0 && loopEnd > loopStart) {
      const lx = (loopStart / duration) * width
      const lw = ((loopEnd - loopStart) / duration) * width
      ctx.fillStyle = 'rgba(99, 102, 241, 0.12)'
      ctx.fillRect(lx, 0, lw, h)
      // Loop markers
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(lx, 0)
      ctx.lineTo(lx, h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(lx + lw, 0)
      ctx.lineTo(lx + lw, h)
      ctx.stroke()
    }

    // Waveform
    if (waveformData && waveformData.length > 0) {
      const playheadX = duration > 0 ? (currentTime / duration) * width : 0

      for (let i = 0; i < waveformData.length; i++) {
        const x = (i / waveformData.length) * width
        const amp = waveformData[i] * (h * 0.45)
        const isPlayed = x <= playheadX

        if (muted) {
          ctx.fillStyle = 'rgba(60, 60, 80, 0.5)'
        } else {
          ctx.fillStyle = isPlayed ? color : `${color}55`
        }

        ctx.fillRect(x, mid - amp, Math.max(1, width / waveformData.length - 0.5), amp * 2)
      }
    } else {
      // Empty waveform placeholder
      ctx.strokeStyle = '#2a2a3a'
      ctx.lineWidth = 1
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(0, mid)
      ctx.lineTo(width, mid)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Playhead
    if (duration > 0) {
      const px = (currentTime / duration) * width
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
      ctx.stroke()
    }
  }, [waveformData, currentTime, duration, color, loopStart, loopEnd, loopEnabled, muted, showLoop])

  useEffect(() => {
    draw()
  }, [draw])

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio
      canvas.height = canvas.offsetHeight * window.devicePixelRatio
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
      draw()
    })
    ro.observe(canvas)
    // Initial
    canvas.width = canvas.offsetWidth * window.devicePixelRatio
    canvas.height = canvas.offsetHeight * window.devicePixelRatio
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    draw()
    return () => ro.disconnect()
  }, [draw])

  const getTimeFromX = (e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas || duration === 0) return 0
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    return Math.max(0, Math.min(duration, (x / rect.width) * duration))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey && onLoopSelect) {
      isLoopDragRef.current = true
      dragStartXRef.current = getTimeFromX(e)
    } else if (onSeek) {
      isDraggingRef.current = true
      onSeek(getTimeFromX(e))
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current && onSeek) {
      onSeek(getTimeFromX(e))
    }
    if (isLoopDragRef.current && onLoopSelect) {
      const start = Math.min(dragStartXRef.current, getTimeFromX(e))
      const end = Math.max(dragStartXRef.current, getTimeFromX(e))
      onLoopSelect(start, end)
    }
  }

  const handleMouseUp = () => {
    isDraggingRef.current = false
    isLoopDragRef.current = false
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height, cursor: onSeek ? 'pointer' : 'default', display: 'block' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    />
  )
}
