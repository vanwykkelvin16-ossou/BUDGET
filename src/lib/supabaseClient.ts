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

// A misconfigured override (empty, whitespace, missing protocol) must never
// take the whole app down — fall back to the known-good production project.
const envUrl = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim()
const envKey = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim()

// The URL and key belong together — a broken override of either means
// both defaults are used.
const overrideValid = /^https?:\/\/.+/.test(envUrl) && envKey.length > 0
const url = overrideValid ? envUrl : DEFAULT_URL
const anonKey = overrideValid ? envKey : DEFAULT_PUBLISHABLE_KEY

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null
  client ??= createClient(url!, anonKey!)
  return client
}
