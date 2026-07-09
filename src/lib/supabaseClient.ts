/**
 * Supabase client — inert unless VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 * are set. Without them the app runs fully local (demo mode).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  client ??= createClient(url!, anonKey!)
  return client
}
