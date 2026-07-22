/**
 * Supabase client. VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY override the
 * defaults (empty values are ignored); otherwise the app connects to the
 * production PennyPlay project. The publishable key is safe to ship in the
 * bundle — every table is guarded by row-level security, and payments are
 * only ever written by the PayFast ITN edge function (service role).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://ewvaykmaoxcumkmrjvkm.supabase.co'
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_DzHfC_5FDQqaVTeml0_BLA_X5Zm-jag'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_URL
const anonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_PUBLISHABLE_KEY

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  client ??= createClient(url!, anonKey!)
  return client
}
