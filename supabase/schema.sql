-- MixStudio Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Cities table
CREATE TABLE IF NOT EXISTS public.cities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  city_id UUID REFERENCES public.cities(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Helper function: returns current user role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

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

-- Project cities (chanson disponible par ville)
CREATE TABLE IF NOT EXISTS public.project_cities (
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  city_id UUID REFERENCES public.cities(id) ON DELETE CASCADE NOT NULL,
  PRIMARY KEY (project_id, city_id)
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
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_cities ENABLE ROW LEVEL SECURITY;
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
-- Admins can view and update all profiles (for user management page)
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (public.get_my_role() = 'admin');

-- Cities policies
CREATE POLICY "Anyone can view cities" ON public.cities FOR SELECT USING (true);
CREATE POLICY "Admins can manage cities" ON public.cities FOR ALL USING (public.get_my_role() = 'admin');

-- Project_cities policies
CREATE POLICY "Viewers see songs of their city" ON public.project_cities FOR SELECT
  USING (
    public.get_my_role() = 'admin'
    OR city_id = (SELECT city_id FROM public.profiles WHERE id = auth.uid())
  );
CREATE POLICY "Admins can manage project_cities" ON public.project_cities FOR ALL
  USING (public.get_my_role() = 'admin');

-- Projects policies
-- Viewers see only songs available in their city
CREATE POLICY "Viewers see songs of their city" ON public.projects FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.project_cities pc
      JOIN public.profiles p ON p.city_id = pc.city_id
      WHERE pc.project_id = projects.id AND p.id = auth.uid()
    )
  );
CREATE POLICY "Admins can create projects" ON public.projects FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "Users can update own projects" ON public.projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects FOR DELETE USING (auth.uid() = user_id);
-- Admins can view and delete all projects
CREATE POLICY "Admins can view all projects" ON public.projects FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "Admins can delete all projects" ON public.projects FOR DELETE USING (public.get_my_role() = 'admin');

-- Helper: can the current user access a given project?
-- Admins: yes always. Viewers: only if project is in their city.
CREATE OR REPLACE FUNCTION public.can_access_project(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT
    public.get_my_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.project_cities pc
      JOIN public.profiles pr ON pr.city_id = pc.city_id
      WHERE pc.project_id = p_project_id AND pr.id = auth.uid()
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Tracks policies
CREATE POLICY "Users can view tracks of accessible projects" ON public.tracks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid())
    OR public.can_access_project(tracks.project_id)
  );
CREATE POLICY "Users can create tracks in own projects" ON public.tracks FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can update tracks of own projects" ON public.tracks FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can delete tracks of own projects" ON public.tracks FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = tracks.project_id AND projects.user_id = auth.uid()));

-- Loop presets policies
CREATE POLICY "Users can view loop presets of accessible projects" ON public.loop_presets FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = loop_presets.project_id AND projects.user_id = auth.uid())
    OR public.can_access_project(loop_presets.project_id)
  );
CREATE POLICY "Users can manage loop presets of own projects" ON public.loop_presets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = loop_presets.project_id AND projects.user_id = auth.uid()));

-- Lyrics policies
CREATE POLICY "Users can view lyrics of accessible projects" ON public.lyrics FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lyrics.project_id AND projects.user_id = auth.uid())
    OR public.can_access_project(lyrics.project_id)
  );
CREATE POLICY "Users can manage lyrics of own projects" ON public.lyrics FOR ALL
  USING (EXISTS (SELECT 1 FROM public.projects WHERE projects.id = lyrics.project_id AND projects.user_id = auth.uid()));

-- Project sessions policies
CREATE POLICY "Users can manage own sessions" ON public.project_sessions FOR ALL USING (auth.uid() = user_id);

-- Storage bucket setup (run separately if needed)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('audio-files', 'audio-files', false);

-- Storage policies for audio files
-- Import réservé aux admins (les viewers ne créent jamais de pistes)
CREATE POLICY "Admins can upload audio files" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audio-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.get_my_role() = 'admin'
  );
-- Viewers can access audio files of projects available in their city
CREATE POLICY "Users can view audio files" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audio-files'
    AND (
      -- Propriétaire du fichier
      auth.uid()::text = (storage.foldername(name))[1]
      -- Admin
      OR public.get_my_role() = 'admin'
      -- Lecteur : fichier appartient à un projet accessible
      OR EXISTS (
        SELECT 1 FROM public.tracks t
        JOIN public.project_cities pc ON pc.project_id = t.project_id
        JOIN public.profiles pr ON pr.city_id = pc.city_id
        WHERE t.storage_path = name AND pr.id = auth.uid()
      )
    )
  );
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

-- Protection des colonnes sensibles de profiles : la policy UPDATE "own profile"
-- couvre toutes les colonnes, donc sans ce trigger un viewer pourrait s'élever
-- admin (SET role='admin') ou changer sa ville. Seuls un admin ou la clé
-- service_role peuvent modifier role / city_id.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role
      OR NEW.city_id IS DISTINCT FROM OLD.city_id)
     AND auth.role() <> 'service_role'
     AND public.get_my_role() IS DISTINCT FROM 'admin'
  THEN
    RAISE EXCEPTION 'Seul un admin peut modifier role ou city_id';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS protect_profile_columns ON public.profiles;
CREATE TRIGGER protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();
