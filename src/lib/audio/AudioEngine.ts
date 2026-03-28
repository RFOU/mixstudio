'use client'

import { TrackData } from '@/store/audioStore'
import { getCachedAudio, putCachedAudio } from '@/lib/audio/audioCache'

interface TrackNode {
  id: string
  sourceNode: AudioBufferSourceNode | null
  gainNode: GainNode
  muteGainNode: GainNode
}

type EngineEventType = 'timeupdate' | 'ended' | 'looped' | 'mediasessionplay' | 'mediasessionpause'
type EngineEventCallback = (data?: { time?: number }) => void

// WAV silencieux 1s mono 8kHz 16-bit — empêche iOS/Android de suspendre la session audio
function createSilentAudioElement(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null
  // Minimal WAV: 44-byte header + 8000 samples of silence (16000 bytes)
  const sampleRate = 8000
  const numSamples = sampleRate // 1 seconde
  const dataSize = numSamples * 2
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  // RIFF header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true)  // PCM
  view.setUint16(22, 1, true)  // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true)  // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)
  // samples are all 0 (silence) — ArrayBuffer is zeroed by default

  const blob = new Blob([buffer], { type: 'audio/wav' })
  const audio = document.createElement('audio')
  audio.src = URL.createObjectURL(blob)
  audio.loop = true
  audio.volume = 0.01 // quasi-inaudible
  return audio
}

export class AudioEngine {
  private context: AudioContext | null = null
  private masterGain: GainNode | null = null
  private trackNodes: Map<string, TrackNode> = new Map()
  private audioBuffers: Map<string, AudioBuffer> = new Map()

  private startTime: number = 0
  private startOffset: number = 0
  private isPlaying: boolean = false
  private animationFrame: number | null = null

  private loopEnabled: boolean = false
  private loopStart: number = 0
  private loopEnd: number = 0

  private duration: number = 0
  private soloedTracks: Set<string> = new Set()

  private listeners: Map<EngineEventType, Set<EngineEventCallback>> = new Map()

  // Background playback: silent audio element keeps the OS audio session alive
  private silentAudio: HTMLAudioElement | null = null
  private visibilityHandler: (() => void) | null = null
  // Tracks ref for Media Session seek (needs current track list)
  private currentTracks: TrackData[] = []

  constructor() {
    this.listeners.set('timeupdate', new Set())
    this.listeners.set('ended', new Set())
    this.listeners.set('looped', new Set())
    this.listeners.set('mediasessionplay', new Set())
    this.listeners.set('mediasessionpause', new Set())
    this.silentAudio = createSilentAudioElement()
    this.setupVisibilityHandler()
  }

  /** Relance le contexte audio si suspendu après verrouillage écran */
  private setupVisibilityHandler() {
    if (typeof document === 'undefined') return
    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible' && this.isPlaying && this.context) {
        if (this.context.state === 'suspended') {
          this.context.resume()
        }
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  /** Démarre l'élément audio silencieux pour maintenir la session audio du navigateur */
  private startSilentAudio() {
    if (!this.silentAudio) return
    this.silentAudio.play().catch(() => {})
  }

  private stopSilentAudio() {
    if (!this.silentAudio) return
    this.silentAudio.pause()
    this.silentAudio.currentTime = 0
  }

  /** Met à jour les métadonnées Media Session (contrôles écran de verrouillage) */
  private updateMediaSession(playing: boolean) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    const ms = navigator.mediaSession

    if (playing) {
      ms.metadata = new MediaMetadata({
        title: 'MixStudio',
        artist: 'Lecture en cours',
      })
      ms.playbackState = 'playing'

      ms.setActionHandler('play', () => {
        if (!this.isPlaying) {
          this.play(this.currentTracks, this.startOffset)
          this.emit('mediasessionplay')
        }
      })
      ms.setActionHandler('pause', () => {
        if (this.isPlaying) {
          this.pause()
          this.emit('mediasessionpause')
        }
      })
      ms.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          this.seekTo(details.seekTime, this.isPlaying ? this.currentTracks : undefined)
          this.emit('timeupdate', { time: details.seekTime })
        }
      })
    } else {
      ms.playbackState = 'paused'
    }
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext()
      this.masterGain = this.context.createGain()
      this.masterGain.connect(this.context.destination)
    }
    return this.context
  }

  async resume() {
    const ctx = this.ensureContext()
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }
  }

  on(event: EngineEventType, callback: EngineEventCallback) {
    this.listeners.get(event)?.add(callback)
  }

  off(event: EngineEventType, callback: EngineEventCallback) {
    this.listeners.get(event)?.delete(callback)
  }

  private emit(event: EngineEventType, data?: { time?: number }) {
    this.listeners.get(event)?.forEach(cb => cb(data))
  }

  async loadBuffer(trackId: string, file: File): Promise<AudioBuffer> {
    const ctx = this.ensureContext()
    const arrayBuffer = await file.arrayBuffer()
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    this.audioBuffers.set(trackId, audioBuffer)

    // Update duration to max of all tracks
    if (audioBuffer.duration > this.duration) {
      this.duration = audioBuffer.duration
    }

    // Create nodes for this track
    this.createTrackNodes(trackId)

    return audioBuffer
  }

  async loadBufferFromUrl(
    trackId: string,
    url: string,
    cacheHint?: { storagePath: string; fileSize: number }
  ): Promise<AudioBuffer> {
    const ctx = this.ensureContext()

    let arrayBuffer: ArrayBuffer | null = null

    // Try cache first if we have metadata to identify the version
    if (cacheHint) {
      arrayBuffer = await getCachedAudio(cacheHint.storagePath, cacheHint.fileSize)
      if (arrayBuffer) {
        console.debug(`[AudioEngine] Cache hit: ${cacheHint.storagePath}`)
      }
    }

    // Fetch from network if not cached
    if (!arrayBuffer) {
      console.debug(`[AudioEngine] Cache miss, fetching: ${cacheHint?.storagePath ?? url}`)
      const response = await fetch(url)
      arrayBuffer = await response.arrayBuffer()

      // Store in cache for next time
      if (cacheHint) {
        putCachedAudio(cacheHint.storagePath, cacheHint.fileSize, arrayBuffer.slice(0))
          .catch(err => console.warn('[AudioEngine] Cache store failed:', err))
      }
    }

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    this.audioBuffers.set(trackId, audioBuffer)

    if (audioBuffer.duration > this.duration) {
      this.duration = audioBuffer.duration
    }

    this.createTrackNodes(trackId)
    return audioBuffer
  }

  private createTrackNodes(trackId: string) {
    const ctx = this.ensureContext()
    if (!this.masterGain) return

    // Remove old nodes if exist
    this.trackNodes.delete(trackId)

    const gainNode = ctx.createGain()
    const muteGainNode = ctx.createGain()

    // Chain: gain -> muteGain -> master
    gainNode.connect(muteGainNode)
    muteGainNode.connect(this.masterGain)

    this.trackNodes.set(trackId, {
      id: trackId,
      sourceNode: null,
      gainNode,
      muteGainNode,
    })
  }

  private startTrack(trackId: string, offset: number) {
    const ctx = this.ensureContext()
    const buffer = this.audioBuffers.get(trackId)
    const nodes = this.trackNodes.get(trackId)
    if (!buffer || !nodes) return

    // Stop existing source
    if (nodes.sourceNode) {
      try { nodes.sourceNode.stop() } catch {}
      nodes.sourceNode.disconnect()
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(nodes.gainNode)
    source.loop = this.loopEnabled
    if (this.loopEnabled) {
      source.loopStart = this.loopStart
      source.loopEnd = this.loopEnd
    }

    nodes.sourceNode = source
    source.start(0, offset)
  }

  play(tracks: TrackData[], offset: number = this.startOffset) {
    const ctx = this.ensureContext()

    // Stop all sources first
    this.stopAllSources()

    this.startTime = ctx.currentTime
    this.startOffset = offset
    this.isPlaying = true
    this.currentTracks = tracks

    // Update soloed tracks
    this.soloedTracks = new Set(tracks.filter(t => t.soloed).map(t => t.id))

    // Start all tracks
    tracks.forEach(track => {
      if (!this.audioBuffers.has(track.id)) return

      this.startTrack(track.id, offset)
      this.updateTrackAudio(track)
    })

    this.startTimeUpdateLoop()
    this.startSilentAudio()
    this.updateMediaSession(true)
  }

  pause() {
    if (!this.isPlaying) return
    const ctx = this.context
    if (!ctx) return

    this.startOffset = this.getCurrentTime()
    this.isPlaying = false
    this.stopAllSources()
    this.stopTimeUpdateLoop()
    this.stopSilentAudio()
    this.updateMediaSession(false)
  }

  stop() {
    this.startOffset = 0
    this.isPlaying = false
    this.stopAllSources()
    this.stopTimeUpdateLoop()
    this.stopSilentAudio()
    this.updateMediaSession(false)
    this.emit('timeupdate', { time: 0 })
  }

  seekTo(time: number, tracks?: TrackData[]) {
    const wasPlaying = this.isPlaying

    if (wasPlaying) {
      this.stopAllSources()
      this.stopTimeUpdateLoop()
    }

    this.startOffset = time

    if (wasPlaying && tracks) {
      // Restart playback immediately from new position
      const ctx = this.ensureContext()
      this.startTime = ctx.currentTime
      tracks.forEach(track => {
        if (!this.audioBuffers.has(track.id)) return
        this.startTrack(track.id, time)
        this.updateTrackAudio(track)
      })
      this.startTimeUpdateLoop()
    }

    // Always emit so the store/UI updates the playhead position
    this.emit('timeupdate', { time })
  }

  getCurrentTime(): number {
    if (!this.isPlaying || !this.context) return this.startOffset
    const elapsed = this.context.currentTime - this.startTime
    let current = this.startOffset + elapsed

    // Loop handling
    if (this.loopEnabled && this.loopEnd > this.loopStart) {
      if (current >= this.loopEnd) {
        current = this.loopStart + ((current - this.loopStart) % (this.loopEnd - this.loopStart))
      }
    } else if (current >= this.duration && this.duration > 0) {
      current = this.duration
    }

    return current
  }

  setLoop(enabled: boolean, start?: number, end?: number) {
    this.loopEnabled = enabled
    if (start !== undefined) this.loopStart = start
    if (end !== undefined) this.loopEnd = end

    // Update all active source nodes
    this.trackNodes.forEach((nodes) => {
      if (nodes.sourceNode) {
        nodes.sourceNode.loop = enabled
        if (enabled) {
          nodes.sourceNode.loopStart = this.loopStart
          nodes.sourceNode.loopEnd = this.loopEnd
        }
      }
    })
  }

  updateTrackAudio(track: TrackData) {
    const nodes = this.trackNodes.get(track.id)
    if (!nodes) return

    const hasSolo = this.soloedTracks.size > 0
    const isAudible = !track.muted && (!hasSolo || track.soloed)

    // Apply fade for click-free mute (5ms)
    const ctx = this.context
    if (ctx) {
      const now = ctx.currentTime
      nodes.muteGainNode.gain.cancelScheduledValues(now)
      nodes.muteGainNode.gain.setTargetAtTime(isAudible ? 1 : 0, now, 0.005)
      nodes.gainNode.gain.setTargetAtTime(track.volume, now, 0.005)
    } else {
      nodes.muteGainNode.gain.value = isAudible ? 1 : 0
      nodes.gainNode.gain.value = track.volume
    }
  }

  updateSoloState(tracks: TrackData[]) {
    this.soloedTracks = new Set(tracks.filter(t => t.soloed).map(t => t.id))
    tracks.forEach(track => this.updateTrackAudio(track))
  }

  removeTrack(trackId: string) {
    const nodes = this.trackNodes.get(trackId)
    if (nodes) {
      if (nodes.sourceNode) {
        try { nodes.sourceNode.stop() } catch {}
        nodes.sourceNode.disconnect()
      }
      nodes.gainNode.disconnect()
      nodes.muteGainNode.disconnect()
      this.trackNodes.delete(trackId)
    }
    this.audioBuffers.delete(trackId)

    // Recalculate duration
    this.duration = 0
    this.audioBuffers.forEach(buffer => {
      if (buffer.duration > this.duration) this.duration = buffer.duration
    })
  }

  /** Reset engine state between projects: stop playback and clear all buffers/nodes */
  reset() {
    this.stop()
    // Disconnect and clear all track nodes
    this.trackNodes.forEach((nodes) => {
      if (nodes.sourceNode) {
        try { nodes.sourceNode.stop() } catch {}
        nodes.sourceNode.disconnect()
      }
      try { nodes.gainNode.disconnect() } catch {}
      try { nodes.muteGainNode.disconnect() } catch {}
    })
    this.trackNodes.clear()
    this.audioBuffers.clear()
    this.soloedTracks.clear()
    this.duration = 0
    this.startOffset = 0
  }

  getBuffer(trackId: string): AudioBuffer | undefined {
    return this.audioBuffers.get(trackId)
  }

  getDuration(): number {
    return this.duration
  }

  getIsPlaying(): boolean {
    return this.isPlaying
  }

  private stopAllSources() {
    this.trackNodes.forEach((nodes) => {
      if (nodes.sourceNode) {
        try { nodes.sourceNode.stop() } catch {}
        nodes.sourceNode.disconnect()
        nodes.sourceNode = null
      }
    })
  }

  private startTimeUpdateLoop() {
    const update = () => {
      if (!this.isPlaying) return

      const current = this.getCurrentTime()
      this.emit('timeupdate', { time: current })

      // Check loop crossing or end
      if (this.loopEnabled && this.loopEnd > this.loopStart) {
        if (current >= this.loopEnd - 0.01) {
          // Will be handled by Web Audio loop
        }
      } else if (current >= this.duration && this.duration > 0) {
        this.isPlaying = false
        this.startOffset = 0
        this.stopTimeUpdateLoop()
        this.emit('ended')
        return
      }

      this.animationFrame = requestAnimationFrame(update)
    }

    this.animationFrame = requestAnimationFrame(update)
  }

  private stopTimeUpdateLoop() {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }

  generateWaveformData(trackId: string, samples: number = 200): Float32Array {
    const buffer = this.audioBuffers.get(trackId)
    if (!buffer) return new Float32Array(samples)

    const channelData = buffer.getChannelData(0)
    const blockSize = Math.floor(channelData.length / samples)
    const waveform = new Float32Array(samples)

    for (let i = 0; i < samples; i++) {
      let max = 0
      for (let j = 0; j < blockSize; j++) {
        const val = Math.abs(channelData[i * blockSize + j])
        if (val > max) max = val
      }
      waveform[i] = max
    }

    return waveform
  }

  destroy() {
    this.stopAllSources()
    this.stopTimeUpdateLoop()
    this.stopSilentAudio()
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
    if (this.context && this.context.state !== 'closed') {
      this.context.close()
    }
    this.trackNodes.clear()
    this.audioBuffers.clear()
  }
}

// Singleton
let engineInstance: AudioEngine | null = null

export function getAudioEngine(): AudioEngine {
  if (!engineInstance) {
    engineInstance = new AudioEngine()
  }
  return engineInstance
}
