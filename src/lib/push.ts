/**
 * Web Push registration.
 *
 * Local notifications (see notifications.ts) only fire while the app is
 * open. The weekly "come back" nudge has to reach someone who has stopped
 * opening it at all, which needs a real push subscription handed to the
 * server. This module is that handshake.
 *
 * Every function here fails soft: no push support, no signed-in user or a
 * flaky network degrades to "no weekly nudge", never to a broken screen.
 */

import { getSupabaseClient } from './supabaseClient'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  )
}

/** VAPID keys travel as base64url; subscribe() wants raw bytes. */
function toKeyBytes(base64url: string): Uint8Array {
  const t = base64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = t + '='.repeat((4 - (t.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/**
 * Register this browser for the weekly nudge. Idempotent — an existing
 * subscription is reused and just re-saved, so calling it on every sign-in
 * keeps the server's list fresh without piling up rows.
 *
 * Note for iOS: Safari only grants push to a PWA the user has added to
 * their Home Screen. In a normal tab this returns false and the app
 * carries on with local notifications only.
 */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false
  if (Notification.permission !== 'granted') return false

  const supabase = getSupabaseClient()
  if (!supabase) return false

  try {
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user) return false

    const registration = await navigator.serviceWorker.ready
    let sub = await registration.pushManager.getSubscription()

    if (!sub) {
      const { data, error } = await supabase.functions.invoke('push-key')
      const publicKey = (data as { publicKey?: string } | null)?.publicKey
      if (error || !publicKey) return false
      sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toKeyBytes(publicKey) as BufferSource,
      })
    }

    const keys = (sub.toJSON() as { keys?: { p256dh?: string; auth?: string } }).keys
    const { error: saveError } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: sub.endpoint,
        user_id: user.id,
        p256dh: keys?.p256dh ?? '',
        auth: keys?.auth ?? '',
      },
      { onConflict: 'endpoint' },
    )
    return !saveError
  } catch {
    return false
  }
}

/** Drop this browser's subscription — used when nudges are switched off. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const sub = await registration.pushManager.getSubscription()
    if (!sub) return
    const supabase = getSupabaseClient()
    if (supabase) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    }
    await sub.unsubscribe()
  } catch {
    /* best effort — an orphaned row is cleaned up on its next 410 */
  }
}
