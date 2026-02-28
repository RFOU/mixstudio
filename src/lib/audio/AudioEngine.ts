'use client'

import { TrackData } from '@/store/audioStore'
import { getCachedAudio, putCachedAudio } from '@/lib/audio/audioCache'

interface TrackNode {
  id: string
  sourceNode: AudioBufferSourceNode | null
  gainNode: GainNode
  pannerNode: StereoPannerNode
  muteGainNode: GainNode
}

type EngineEventType = 'timeupdate' | 'ended' | 'looped'
type EngineEventCallback = (data?: { time?: number }) => void

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

  constructor() {
    this.listeners.set('timeupdate', new Set())
    this.listeners.set('ended', new Set())
    this.listeners.set('looped', new Set())
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
    const pannerNode = ctx.createStereoPanner()
    const muteGainNode = ctx.createGain()

    // Chain: gain -> panner -> muteGain -> master
    gainNode.connect(pannerNode)
    pannerNode.connect(muteGainNode)
    muteGainNode.connect(this.masterGain)

    this.trackNodes.set(trackId, {
      id: trackId,
      sourceNode: null,
      gainNode,
      pannerNode,
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

    // Update soloed tracks
    this.soloedTracks = new Set(tracks.filter(t => t.soloed).map(t => t.id))

    // Start all tracks
    tracks.forEach(track => {
      if (!this.audioBuffers.has(track.id)) return

      this.startTrack(track.id, offset)
      this.updateTrackAudio(track)
    })

    this.startTimeUpdateLoop()
  }

  pause() {
    if (!this.isPlaying) return
    const ctx = this.context
    if (!ctx) return

    this.startOffset = this.getCurrentTime()
    this.isPlaying = false
    this.stopAllSources()
    this.stopTimeUpdateLoop()
  }

  stop() {
    this.startOffset = 0
    this.isPlaying = false
    this.stopAllSources()
    this.stopTimeUpdateLoop()
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
      nodes.pannerNode.pan.setTargetAtTime(track.pan, now, 0.005)
    } else {
      nodes.muteGainNode.gain.value = isAudible ? 1 : 0
      nodes.gainNode.gain.value = track.volume
      nodes.pannerNode.pan.value = track.pan
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
      nodes.pannerNode.disconnect()
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
