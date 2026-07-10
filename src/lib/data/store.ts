/**
 * Persistence adapters. The app state lives in memory (zustand); adapters
 * load it at boot and persist it on every mutation.
 *
 * - LocalStore: localStorage JSON. Source of truth in demo/offline mode.
 * - SupabaseStore (supabaseStore.ts): same interface; keeps the local cache
 *   as the fast path and queues row upserts for sync, so transaction entry
 *   stays offline-tolerant.
 */

import type { AppData } from './types'

/** Entity-level operation for sync-capable adapters. */
export interface SyncOp {
  table: string
  op: 'upsert' | 'delete'
  row: Record<string, unknown>
}

export interface DataStore {
  kind: 'local' | 'supabase'
  load(): Promise<AppData | null>
  /**
   * Persist the whole app state. `ops` describes what changed at row level;
   * local adapters may ignore it, sync adapters queue it.
   */
  persist(data: AppData, ops?: SyncOp[]): Promise<void>
  /** Wipe everything (sign-out / reset). */
  clear(): Promise<void>
  /** Authenticated user id, when the adapter has a notion of auth. */
  userId?(): Promise<string | null>
}

export const STORAGE_KEY = 'pennyplay:data:v1'
/** Pre-rename key — migrated on first load so nobody loses their data. */
const LEGACY_STORAGE_KEY = 'pulse-budget:data:v1'

export class LocalStore implements DataStore {
  kind = 'local' as const

  constructor(private key: string = STORAGE_KEY) {}

  async load(): Promise<AppData | null> {
    try {
      let raw = localStorage.getItem(this.key)
      if (!raw && this.key === STORAGE_KEY) {
        raw = localStorage.getItem(LEGACY_STORAGE_KEY)
        if (raw) {
          localStorage.setItem(this.key, raw)
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        }
      }
      if (!raw) return null
      return JSON.parse(raw) as AppData
    } catch {
      return null
    }
  }

  async persist(data: AppData): Promise<void> {
    localStorage.setItem(this.key, JSON.stringify(data))
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.key)
  }
}
