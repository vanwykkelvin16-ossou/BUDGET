/**
 * Auth screen — only rendered when Supabase is configured. One-time sign-up
 * collects the full identity (first name, surname, username, email, phone) plus
 * a password, so it's never asked again. Sign-in needs just email + password.
 * Google OAuth needs the provider enabled in the Supabase dashboard.
 */

import { useState } from 'react'
import { useAppStore } from '../state/appStore'
import { getSupabaseClient } from '../lib/supabaseClient'
import { Screen } from '../components/layout/Screen'
import { Button3D } from '../components/ui/Button3D'
import { Card } from '../components/ui/Card'
import { Randy } from '../components/ui/Randy'

/** Small labelled input with inline validity feedback (mirrors onboarding). */
function AuthField({
  label,
  value,
  onChange,
  ok,
  placeholder,
  type = 'text',
  prefix,
  hint,
  autoComplete,
  autoFocus = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  ok: boolean
  placeholder: string
  type?: string
  prefix?: string
  hint?: string
  autoComplete?: string
  autoFocus?: boolean
}) {
  const touched = value.length > 0
  return (
    <label className="block text-left">
      <p className="text-[10px] font-bold uppercase tracking-widest text-ink-faint mb-1 ml-1">
        {label}
        {touched && (
          <span className={ok ? 'text-lime ml-1.5' : 'text-coral ml-1.5'}>
            {ok ? '✓' : hint ? `· ${hint}` : '· required'}
          </span>
        )}
      </p>
      <div
        className={`flex items-center rounded-2xl bg-bg-deep border-2 transition-colors ${
          touched && !ok ? 'border-coral/60' : touched ? 'border-lime/50' : 'border-edge'
        } focus-within:border-accent`}
      >
        {prefix && <span className="pl-4 -mr-2 font-display font-extrabold text-ink-faint">{prefix}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          maxLength={64}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          aria-label={label}
          className="w-full px-4 py-3 bg-transparent outline-none font-semibold placeholder:text-ink-faint"
        />
      </div>
    </label>
  )
}

export function Auth() {
  const reload = useAppStore((s) => s.reload)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const supabase = getSupabaseClient()
  if (!supabase) return null

  // Validation — matches the onboarding profile step so identity is captured once.
  const nameOk = name.trim().length >= 2
  const surnameOk = surname.trim().length >= 2
  const usernameOk = /^[a-zA-Z0-9_.]{3,20}$/.test(username.trim())
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const phoneOk = phone.replace(/\D/g, '').length >= 9
  const passwordOk = password.length >= 6

  const canSubmit =
    mode === 'signin'
      ? emailOk && passwordOk
      : nameOk && surnameOk && usernameOk && emailOk && phoneOk && passwordOk

  async function submit() {
    if (busy || !supabase || !canSubmit) return
    setBusy(true)
    setError(null)
    const { error: authError } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password,
          })
        : await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            // Identity travels as user metadata; the DB trigger writes it onto
            // the profile, and onboarding reads it back so it's asked only once.
            options: {
              data: {
                display_name: name.trim(),
                surname: surname.trim(),
                username: username.trim().toLowerCase(),
                phone: phone.trim(),
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
        <Randy mood="happy" size={110} />
        <h1 className="font-display font-extrabold text-3xl text-gradient-violet">PennyPlay</h1>
        <p className="text-ink-soft text-sm">Your money, but make it a game.</p>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex rounded-2xl bg-bg-deep border border-edge p-1 gap-1">
          {(['signin', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m)
                setError(null)
              }}
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
              <AuthField
                label="First name"
                value={name}
                onChange={setName}
                ok={nameOk}
                placeholder="Kelvin"
                autoComplete="given-name"
                autoFocus
              />
              <AuthField
                label="Surname"
                value={surname}
                onChange={setSurname}
                ok={surnameOk}
                placeholder="van Wyk"
                autoComplete="family-name"
              />
            </div>
            <AuthField
              label="Username"
              value={username}
              onChange={(v) => setUsername(v.replace(/\s/g, ''))}
              ok={usernameOk}
              placeholder="kelvin_v"
              prefix="@"
              hint="3–20 letters, numbers, _ or ."
              autoComplete="username"
            />
          </>
        )}

        <AuthField
          label="Email"
          value={email}
          onChange={setEmail}
          ok={emailOk}
          placeholder="you@example.com"
          type="email"
          autoComplete="email"
        />

        {mode === 'signup' && (
          <AuthField
            label="Phone"
            value={phone}
            onChange={setPhone}
            ok={phoneOk}
            placeholder="082 123 4567"
            type="tel"
            hint="at least 9 digits"
            autoComplete="tel"
          />
        )}

        <AuthField
          label="Password"
          value={password}
          onChange={setPassword}
          ok={passwordOk}
          placeholder="••••••"
          type="password"
          hint="at least 6 characters"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />

        {error && <p className="text-coral text-xs font-bold">{error}</p>}
        <Button3D full size="lg" disabled={busy || !canSubmit} onClick={() => void submit()}>
          {mode === 'signin' ? 'Sign in' : 'Create account'}
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
