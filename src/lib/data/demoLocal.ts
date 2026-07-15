/**
 * Local side-channel for Demo Mode. When the active DataStore is Supabase
 * and there is no session, demo data can't persist through that adapter —
 * so we keep it in localStorage via LocalStore and resume it on boot.
 */

import type { AppData } from './types'
import { LocalStore } from './store'

const demoStore = new LocalStore()

/** Load a demo snapshot if one is on this device. */
export async function loadLocalDemo(): Promise<AppData | null> {
  const data = await demoStore.load()
  return data?.profile?.isDemo ? data : null
}

/** Persist demo data locally (survives refresh without an auth session). */
export async function saveLocalDemo(data: AppData): Promise<AppData> {
  return demoStore.persist(data)
}

/** Wipe a leftover demo snapshot (exit demo / reset / real signup). */
export async function clearLocalDemo(): Promise<void> {
  const data = await demoStore.load()
  if (data?.profile?.isDemo) await demoStore.clear()
}
