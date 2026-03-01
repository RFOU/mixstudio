'use client'

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface TrackData {
  id: string
  name: string
  position: number
  volume: number
  muted: boolean
  soloed: boolean
  color: string
  // Local state
  audioBuffer?: AudioBuffer
  sourceNode?: AudioBufferSourceNode
  gainNode?: GainNode
  localFile?: File
  // DB state
  storagePath?: string | null
  fileName?: string | null
  fileSize?: number | null
  duration?: number | null
  sampleRate?: number | null
  // Waveform data
  waveformData?: Float32Array
}

/** Raw DB track row stored for deferred loading in Studio */
export interface PendingTrackRow {
  id: string
  name: string
  position: number
  volume: number
  muted: boolean
  soloed: boolean
  color: string
  storage_path: string | null
  file_name: string | null
  file_size: number | null
  duration: number | null
  sample_rate: number | null
}

export interface PendingLoad {
  projectId: string
  projectName: string
  bpm: number | null
  tracks: PendingTrackRow[]
}

export interface LoopPreset {
  id: string
  name: string
  startTime: number
  endTime: number
}

export interface LyricsLine {
  time: number
  text: string
  words?: { time: number; text: string }[]
}

export interface LyricsData {
  id?: string
  format: 'lrc' | 'srt' | 'plain'
  lines: LyricsLine[]
  offsetMs: number
  rawContent: string
}

interface AudioState {
  // Project
  projectId: string | null
  projectName: string
  bpm: number | null

  // Deferred load (set by ProjectsPage before navigating to /studio)
  pendingLoad: PendingLoad | null

  // Tracks
  tracks: TrackData[]

  // Transport
  isPlaying: boolean
  currentTime: number
  duration: number
  zoomLevel: number

  // Loop
  loopEnabled: boolean
  loopStart: number
  loopEnd: number
  loopPresets: LoopPreset[]

  // Lyrics
  lyrics: LyricsData | null
  lyricsVisible: boolean

  // UI
  isLoading: boolean
  loadingMessage: string

  // User role (set by StudioHeader after auth check — avoids duplicate Supabase queries)
  userRole: 'admin' | 'viewer'

  // Actions - Project
  setProject: (id: string, name: string, bpm?: number | null) => void
  setProjectName: (name: string) => void
  setPendingLoad: (pending: PendingLoad | null) => void
  setUserRole: (role: 'admin' | 'viewer') => void

  // Actions - Tracks
  addTrack: (track: TrackData) => void
  removeTrack: (id: string) => void
  updateTrack: (id: string, updates: Partial<TrackData>) => void
  setTrackMute: (id: string, muted: boolean) => void
  setTrackSolo: (id: string, soloed: boolean) => void
  setTrackVolume: (id: string, volume: number) => void
  reorderTracks: (fromIndex: number, toIndex: number) => void
  clearTracks: () => void

  // Actions - Transport
  setIsPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setZoomLevel: (level: number) => void

  // Actions - Loop
  setLoopEnabled: (enabled: boolean) => void
  setLoopPoints: (start: number, end: number) => void
  addLoopPreset: (preset: LoopPreset) => void
  removeLoopPreset: (id: string) => void

  // Actions - Lyrics
  setLyrics: (lyrics: LyricsData | null) => void
  setLyricsVisible: (visible: boolean) => void
  setLyricsOffset: (offsetMs: number) => void

  // Actions - UI
  setLoading: (loading: boolean, message?: string) => void
}

export const useAudioStore = create<AudioState>()(
  immer((set) => ({
    // Initial state
    projectId: null,
    projectName: 'Nouveau projet',
    bpm: null,
    pendingLoad: null,

    tracks: [],

    isPlaying: false,
    currentTime: 0,
    duration: 0,
    zoomLevel: 1,

    loopEnabled: false,
    loopStart: 0,
    loopEnd: 0,
    loopPresets: [],

    lyrics: null,
    lyricsVisible: true,

    isLoading: false,
    loadingMessage: '',

    userRole: 'viewer',

    // Project actions
    setProject: (id, name, bpm) => set((state) => {
      state.projectId = id
      state.projectName = name
      state.bpm = bpm ?? null
    }),
    setProjectName: (name) => set((state) => {
      state.projectName = name
    }),
    setPendingLoad: (pending) => set((state) => {
      state.pendingLoad = pending
    }),
    setUserRole: (role) => set((state) => {
      state.userRole = role
    }),

    // Track actions
    addTrack: (track) => set((state) => {
      state.tracks.push(track)
    }),
    removeTrack: (id) => set((state) => {
      state.tracks = state.tracks.filter(t => t.id !== id)
    }),
    updateTrack: (id, updates) => set((state) => {
      const track = state.tracks.find(t => t.id === id)
      if (track) Object.assign(track, updates)
    }),
    setTrackMute: (id, muted) => set((state) => {
      const track = state.tracks.find(t => t.id === id)
      if (track) track.muted = muted
    }),
    setTrackSolo: (id, soloed) => set((state) => {
      const track = state.tracks.find(t => t.id === id)
      if (track) track.soloed = soloed
    }),
    setTrackVolume: (id, volume) => set((state) => {
      const track = state.tracks.find(t => t.id === id)
      if (track) track.volume = volume
    }),
    reorderTracks: (fromIndex, toIndex) => set((state) => {
      const [track] = state.tracks.splice(fromIndex, 1)
      state.tracks.splice(toIndex, 0, track)
      state.tracks.forEach((t, i) => { t.position = i })
    }),
    clearTracks: () => set((state) => {
      state.tracks = []
    }),

    // Transport actions
    setIsPlaying: (playing) => set((state) => {
      state.isPlaying = playing
    }),
    setCurrentTime: (time) => set((state) => {
      state.currentTime = time
    }),
    setDuration: (duration) => set((state) => {
      state.duration = duration
    }),
    setZoomLevel: (level) => set((state) => {
      state.zoomLevel = level
    }),

    // Loop actions
    setLoopEnabled: (enabled) => set((state) => {
      state.loopEnabled = enabled
    }),
    setLoopPoints: (start, end) => set((state) => {
      state.loopStart = start
      state.loopEnd = end
    }),
    addLoopPreset: (preset) => set((state) => {
      state.loopPresets.push(preset)
    }),
    removeLoopPreset: (id) => set((state) => {
      state.loopPresets = state.loopPresets.filter(p => p.id !== id)
    }),

    // Lyrics actions
    setLyrics: (lyrics) => set((state) => {
      state.lyrics = lyrics
    }),
    setLyricsVisible: (visible) => set((state) => {
      state.lyricsVisible = visible
    }),
    setLyricsOffset: (offsetMs) => set((state) => {
      if (state.lyrics) state.lyrics.offsetMs = offsetMs
    }),

    // UI actions
    setLoading: (loading, message = '') => set((state) => {
      state.isLoading = loading
      state.loadingMessage = message
    }),
  }))
)
