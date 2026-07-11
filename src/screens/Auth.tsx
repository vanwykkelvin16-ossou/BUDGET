/**
 * Auth screen — only rendered when Supabase is configured. Email/password
 * plus Google OAuth (needs provider config in the Supabase dashboard).
 */

import { useState } from 'react'
import { useAppStore } from '../state/appStore'
import { getSupabaseClient } from '../lib/supabaseClient'
import { Screen } from '../components/layout/Screen'
import { Button3D } from '../components/ui/Button3D'
import { Card } from '../components/ui/Card'
import { Randy } from '../components/ui/Randy'

export function Auth() {
  const reload = useAppStore((s) => s.reload)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const supabase = getSupabaseClient()
  if (!supabase) return null

  async function submit() {
    if (busy || !supabase) return
    setBusy(true)
    setError(null)
    const { error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setBusy(false)
    if (authError) {
      setError(authError.message)
      return
    }
    await reload()
  }

  async function google() {
    if (!supabase) return
    setError(null)
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (authError) setError(authError.message)
  }

  return (
    <Screen withTabBar={false} className="flex flex-col justify-center">
      <div className="flex flex-col items-center text-center gap-2 mb-6">
        <Randy mood="happy" size={150} />
        <h1 className="font-display font-extrabold text-3xl text-gradient-violet">PennyPlay</h1>
        <p className="text-ink-soft text-sm">Your money, but make it a game.</p>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex rounded-2xl bg-bg-deep border border-edge p-1 gap-1">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-xl font-display font-extrabold text-sm ${
                mode === m ? 'bg-gradient-to-b from-violet-soft to-violet text-white' : 'text-ink-faint'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          autoComplete="email"
          className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                     font-semibold placeholder:text-ink-faint focus:border-accent"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                     font-semibold placeholder:text-ink-faint focus:border-accent"
        />
        {error && <p className="text-coral text-xs font-bold">{error}</p>}
        <Button3D full size="lg" disabled={busy || !email || password.length < 6} onClick={() => void submit()}>
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </Button3D>
        <Button3D full variant="ghost" onClick={() => void google()}>
          Continue with Google
        </Button3D>
      </Card>
      <p className="text-center text-[10px] text-ink-faint font-bold mt-4">
        Google sign-in needs the provider enabled in your Supabase dashboard.
      </p>
    </Screen>
  )
}
