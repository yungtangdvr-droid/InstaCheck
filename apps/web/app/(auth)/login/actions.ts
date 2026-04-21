'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient as createServerClient } from '@/lib/supabase/server'

type ActionResult = { data: null; error: string } | { data: true; error: null }

export async function login(formData: FormData): Promise<ActionResult> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { data: null, error: error.message }

  redirect('/analytics')
}

export async function logout(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
