-- 002_security_fixes.sql
-- À exécuter dans le SQL editor Supabase (comme schema.sql).
--
-- Corrige deux failles :
--
-- 1. ESCALADE DE PRIVILÈGES : la policy RLS "Users can update own profile"
--    autorise UPDATE sur TOUTES les colonnes de la ligne. Un viewer pouvait
--    faire `UPDATE profiles SET role='admin' WHERE id=auth.uid()` et devenir
--    admin (ou changer son city_id pour voir les chansons d'autres villes).
--    → Trigger qui rejette tout changement de role/city_id sauf par un admin
--    ou par la clé service_role (Edge Functions / routes serveur).
--
-- 2. UPLOAD STORAGE OUVERT : la policy INSERT sur storage.objects permettait
--    à n'importe quel utilisateur authentifié (viewer inclus) d'uploader des
--    fichiers sous son préfixe uid. Seuls les admins importent des pistes.
--    → La policy exige désormais le rôle admin.

-- ---------------------------------------------------------------------------
-- 1. Protection des colonnes sensibles de profiles
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. Upload audio réservé aux admins
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can upload their audio files" ON storage.objects;
CREATE POLICY "Admins can upload audio files" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audio-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.get_my_role() = 'admin'
  );
