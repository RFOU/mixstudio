export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
      }
      projects: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          bpm: number | null
          time_signature: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          bpm?: number | null
          time_signature?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          bpm?: number | null
          time_signature?: string | null
          updated_at?: string
        }
      }
      tracks: {
        Row: {
          id: string
          project_id: string
          name: string
          position: number
          volume: number
          pan: number
          muted: boolean
          soloed: boolean
          color: string
          storage_path: string | null
          file_name: string | null
          file_size: number | null
          duration: number | null
          sample_rate: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          position?: number
          volume?: number
          pan?: number
          muted?: boolean
          soloed?: boolean
          color?: string
          storage_path?: string | null
          file_name?: string | null
          file_size?: number | null
          duration?: number | null
          sample_rate?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          position?: number
          volume?: number
          pan?: number
          muted?: boolean
          soloed?: boolean
          color?: string
          storage_path?: string | null
          file_name?: string | null
          file_size?: number | null
          duration?: number | null
          sample_rate?: number | null
          updated_at?: string
        }
      }
      loop_presets: {
        Row: {
          id: string
          project_id: string
          name: string
          start_time: number
          end_time: number
          created_at: string
        }
        Insert: {
          id?: string
          project_id: string
          name: string
          start_time: number
          end_time: number
          created_at?: string
        }
        Update: {
          name?: string
          start_time?: number
          end_time?: number
        }
      }
      lyrics: {
        Row: {
          id: string
          project_id: string
          format: 'lrc' | 'srt' | 'plain'
          content: string
          offset_ms: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          project_id: string
          format: 'lrc' | 'srt' | 'plain'
          content: string
          offset_ms?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          format?: 'lrc' | 'srt' | 'plain'
          content?: string
          offset_ms?: number
          updated_at?: string
        }
      }
      project_sessions: {
        Row: {
          id: string
          project_id: string
          user_id: string
          playback_position: number
          loop_enabled: boolean
          loop_start: number | null
          loop_end: number | null
          zoom_level: number
          last_accessed: string
        }
        Insert: {
          id?: string
          project_id: string
          user_id: string
          playback_position?: number
          loop_enabled?: boolean
          loop_start?: number | null
          loop_end?: number | null
          zoom_level?: number
          last_accessed?: string
        }
        Update: {
          playback_position?: number
          loop_enabled?: boolean
          loop_start?: number | null
          loop_end?: number | null
          zoom_level?: number
          last_accessed?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
