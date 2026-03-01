-- Migration 001 — Add role to profiles
-- Run this in Supabase SQL editor if the database already exists

-- 1. Add role column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer'
  CHECK (role IN ('admin', 'viewer'));

-- 2. Helper function to get current user role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Admin policies on profiles
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can view all profiles'
  ) THEN
    CREATE POLICY "Admins can view all profiles" ON public.profiles
      FOR SELECT USING (public.get_my_role() = 'admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Admins can update all profiles'
  ) THEN
    CREATE POLICY "Admins can update all profiles" ON public.profiles
      FOR UPDATE USING (public.get_my_role() = 'admin');
  END IF;
END $$;

-- 4. Admin policies on projects
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'Admins can view all projects'
  ) THEN
    CREATE POLICY "Admins can view all projects" ON public.projects
      FOR SELECT USING (public.get_my_role() = 'admin');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'Admins can delete all projects'
  ) THEN
    CREATE POLICY "Admins can delete all projects" ON public.projects
      FOR DELETE USING (public.get_my_role() = 'admin');
  END IF;
END $$;

-- 5. Promote yourself to admin (run once, replace with your user id)
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
