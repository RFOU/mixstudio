import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

/**
 * POST /api/audio/signed-url
 * Body: { storagePath: string }
 *
 * Generates a signed URL for an audio file using the service role key,
 * after verifying server-side that the authenticated user can access the track.
 * This works for both admins and viewers (bypasses client-side RLS on storage.sign).
 */
export async function POST(request: Request) {
  // 1. Authenticate the caller via their session cookie
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // 2. Read the requested storage path
  const { storagePath } = await request.json() as { storagePath: string }
  if (!storagePath) {
    return NextResponse.json({ error: 'storagePath requis' }, { status: 400 })
  }

  // 3. Verify the user can access this track (via anon client — RLS enforced)
  const { data: track, error: trackError } = await supabase
    .from('tracks')
    .select('id, project_id')
    .eq('storage_path', storagePath)
    .single()

  if (trackError || !track) {
    return NextResponse.json({ error: 'Piste introuvable ou accès refusé' }, { status: 403 })
  }

  // 4. Generate the signed URL using service role (bypasses storage RLS for signing)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante' }, { status: 500 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: signedData, error: signedError } = await adminSupabase.storage
    .from('audio-files')
    .createSignedUrl(storagePath, 3600)

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: signedError?.message ?? 'Erreur génération URL' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: signedData.signedUrl })
}
