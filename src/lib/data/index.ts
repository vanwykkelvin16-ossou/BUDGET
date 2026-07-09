/**
 * Adapter factory: Supabase when env vars are set, local demo mode otherwise.
 */

import type { DataStore } from './store'
import { LocalStore } from './store'
import { SupabaseStore } from './supabaseStore'
import { getSupabaseClient, isSupabaseConfigured } from '../supabaseClient'

let instance: DataStore | null = null

export function getDataStore(): DataStore {
  if (!instance) {
    const client = isSupabaseConfigured() ? getSupabaseClient() : null
    instance = client ? new SupabaseStore(client) : new LocalStore()
  }
  return instance
}
