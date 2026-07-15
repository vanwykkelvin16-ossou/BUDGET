/**
 * Auth screen — only rendered when Supabase is configured. Email/password
 * plus Google OAuth (needs provider config in the Supabase dashboard).
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { getSupabaseClient } from '../lib/supabaseClient'
import { referredBy } from '../lib/referral'
import { Screen } from '../components/layout/Screen'
import { Button3D } from '../components/ui/Button3D'
import { Card } from '../components/ui/Card'
import { Randy } from '../components/ui/Randy'

export function Auth() {
  const reload = useAppStore((s) => s.reload)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const supabase = getSupabaseClient()
  if (!supabase) return null

  const identityComplete =
    name.trim().length > 0 &&
    surname.trim().length > 0 &&
    username.trim().length >= 3 &&
    phone.trim().length >= 10

  async function submit() {
    if (busy || !supabase) return
    setBusy(true)
    setError(null)
    const { error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : // The identity travels as user metadata; the handle_new_user
          // trigger writes it onto the profiles row at creation.
          await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                display_name: name.trim(),
                surname: surname.trim(),
                username: username.trim(),
                phone: phone.trim(),
                // Whose share link brought them here (unlocks the
                // referrer's R50 once this account exists).
                referred_by: referredBy() ?? '',
              },
            },
          })
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
        {mode === 'signup' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="name"
                aria-label="Name"
                autoComplete="given-name"
                className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                           font-semibold placeholder:text-ink-faint focus:border-accent"
              />
              <input
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="surname"
                aria-label="Surname"
                autoComplete="family-name"
                className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                           font-semibold placeholder:text-ink-faint focus:border-accent"
              />
            </div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              aria-label="Username"
              autoComplete="username"
              className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                         font-semibold placeholder:text-ink-faint focus:border-accent"
            />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="phone"
              aria-label="Phone"
              autoComplete="tel"
              className="w-full px-4 py-3 rounded-2xl bg-bg-deep border border-edge outline-none
                         font-semibold placeholder:text-ink-faint focus:border-accent"
            />
          </>
        )}
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
        <Button3D
          full
          size="lg"
          disabled={
            busy || !email || password.length < 6 || (mode === 'signup' && !identityComplete)
          }
          onClick={() => void submit()}
        >
          {mode === 'signin' ? 'Sign in' : 'Sign up'}
        </Button3D>
        {mode === 'signup' && (
          <p className="text-center text-[10px] text-ink-faint font-bold leading-relaxed">
            By creating an account you agree to the{' '}
            <Link to="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="underline">
              Privacy policy
            </Link>
            .
          </p>
        )}
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
