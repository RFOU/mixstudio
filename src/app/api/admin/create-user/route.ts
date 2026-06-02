import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  // 1. Vérifier que l'appelant est bien admin
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

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // 2. Lire le body
  const { email, password, username, role, city_id } = await request.json() as {
    email: string
    password: string
    username?: string
    role?: 'admin' | 'viewer'
    city_id?: string | null
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  // Validation runtime : email plausible, mot de passe minimal, rôle dans l'enum autorisé
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères' }, { status: 400 })
  }
  if (role !== undefined && role !== 'admin' && role !== 'viewer') {
    return NextResponse.json({ error: 'Rôle invalide' }, { status: 400 })
  }

  // 3. Créer l'utilisateur avec le client service_role
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY manquante dans .env.local' }, { status: 500 })
  }

  const adminSupabase = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createError || !newUser.user) {
    return NextResponse.json({ error: createError?.message ?? 'Erreur création' }, { status: 400 })
  }

  // 4. Mettre à jour le profil (username, role, city)
  const updates: Record<string, unknown> = {}
  if (username) updates.username = username
  if (role) updates.role = role
  if (city_id !== undefined) updates.city_id = city_id

  if (Object.keys(updates).length > 0) {
    await adminSupabase
      .from('profiles')
      .update(updates)
      .eq('id', newUser.user.id)
  }

  return NextResponse.json({ id: newUser.user.id, email: newUser.user.email })
}
