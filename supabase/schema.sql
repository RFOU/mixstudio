-- MixStudio Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  bpm NUMERIC(6,2),
  time_signature TEXT DEFAULT '4/4',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tracks table
CREATE TABLE IF NOT EXISTS public.tracks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  volume NUMERIC(5,2) DEFAULT 1.0 CHECK (volume >= 0 AND volume <= 1),
  pan NUMERIC(5,2) DEFAULT 0.0 CHECK (pan >= -1 AND pan <= 1),
  muted BOOLEAN DEFAULT FALSE,
  soloed BOOLEAN DEFAULT FALSE,
  color TEXT DEFAULT '#6366f1',
  -- Storage reference
  storage_path TEXT,
  file_name TEXT,
  file_size BIGINT,
  duration NUMERIC(12,3),
  sample_rate INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Loop presets table
CREATE TABLE IF NOT EXISTS public.loop_presets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  start_time NUMERIC(12,3) NOT NULL,
  end_time NUMERIC(12,3) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lyrics table
CREATE TABLE IF NOT EXISTS public.lyrics (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('lrc', 'srt', 'plain')),
  content TEXT NOT NULL,
  offset_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Project sessions (playback state)
CREATE TABLE IF NOT EXISTS public.project_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  playback_position NUMERIC(12,3) DEFAULT 0,
  loop_enabled BOOLEAN DEFAULT FALSE,
  loop_start NUMERIC(12,3),
  loop_end NUMERIC(12,3),
  zoom_level INTEGER DEFAULT 1,
  last_accessed TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loop_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lyrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Projects policies
CREATE POLICY "Users can view own projects" ON public.projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create projects" ON public.projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);

-- Tracks policies
CREATE POLICY "Users can view tracks of own projects" ON public.tracks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can create tracks in own projects" ON public.tracks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update tracks of own projects" ON public.tracks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete tracks of own projects" ON public.tracks FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid()));

-- Loop presets policies
CREATE POLICY "Users can manage loop presets" ON public.loop_presets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = loop_presets.project_id AND projects.user_id = auth.uid()));

-- Lyrics policies
CREATE POLICY "Users can manage lyrics" ON public.lyrics FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lyrics.project_id AND projects.user_id = auth.uid()));

-- Project sessions policies
CREATE POLICY "Users can manage own sessions" ON public.project_sessions FOR ALL USING (auth.uid() = user_id);

-- Storage bucket setup (run separately if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', false);

-- Storage policies for audio files
CREATE POLICY "Users can upload their audio files" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'audio-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view their audio files" ON storage.objects FOR SELECT
  USING (bucket_id = 'audio-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can delete their audio files" ON storage.objects FOR DELETE
  USING (bucket_id = 'audio-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Functions
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
