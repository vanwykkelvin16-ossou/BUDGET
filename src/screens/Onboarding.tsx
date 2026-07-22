/**
 * First-run onboarding — the ONE sign-up path. Profile + account are created
 * here (no separate Auth screen before it). Returning users tap “Sign in”
 * on the welcome step; everyone else sets up in ~60 seconds.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import { Screen } from '../components/layout/Screen'
import { Button3D } from '../components/ui/Button3D'
import { Card } from '../components/ui/Card'
import { NumberPad } from '../components/ui/NumberPad'
import { useAmountEntry } from '../components/ui/useAmountEntry'
import { Randy, RandyIcon } from '../components/ui/Randy'
import { adjustSplit, allocateIncome, DEFAULT_SPLITS } from '../lib/engine/allocate'
import { isSupabaseConfigured, getSupabaseClient } from '../lib/supabaseClient'
import { referredBy } from '../lib/referral'
import type { Bucket, BucketSplits } from '../lib/data/types'
import { formatRands } from '../lib/money'

type Step = 'welcome' | 'signin' | 'name' | 'salary' | 'payDate' | 'splits' | 'done'

const STEP_ORDER: Step[] = ['welcome', 'name', 'salary', 'payDate', 'splits', 'done']
/** Steps that show progress dots (everything between welcome and done). */
const DOT_STEPS = STEP_ORDER.length - 2

const BUCKET_META: Record<Bucket, { label: string; blurb: string; barClass: string }> = {
  need: { label: 'Needs', blurb: 'rent, groceries, transport', barClass: 'accent-violet' },
  want: { label: 'Wants', blurb: 'fun, eating out, date nights', barClass: 'accent-coral' },
  saving: { label: 'Savings', blurb: 'goals & future you', barClass: 'accent-aqua' },
}

function SignupField({
  label,
  value,
  onChange,
  ok,
  placeholder,
  type = 'text',
  prefix,
  hint,
  autoFocus = false,
  maxLength = 40,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  ok: boolean
  placeholder: string
  type?: string
  prefix?: string
  hint?: string
  autoFocus?: boolean
  maxLength?: number
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
        className={`flex items-center rounded-2xl bg-card border-2 transition-colors ${
          touched && !ok ? 'border-coral/60' : touched ? 'border-lime/50' : 'border-edge'
        } focus-within:border-accent`}
      >
        {prefix && <span className="pl-4 -mr-2 font-display font-extrabold text-ink-faint">{prefix}</span>}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          type={type}
          maxLength={maxLength}
          autoFocus={autoFocus}
          aria-label={label}
          className="w-full px-4 py-3 bg-transparent outline-none font-semibold
                     placeholder:text-ink-faint"
        />
      </div>
    </label>
  )
}

function authErrorMessage(message: string): string {
  const msg = message.toLowerCase()
  if (msg.includes('rate limit')) {
    return 'Too many emails sent — wait about an hour, or turn off “Confirm email” in Supabase Auth settings and try again.'
  }
  return message
}

export function Onboarding() {
  const startDemo = useAppStore((s) => s.startDemo)
  const createProfile = useAppStore((s) => s.createProfile)
  const reload = useAppStore((s) => s.reload)
  const needsAccount = isSupabaseConfigured()

  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [payDate, setPayDate] = useState(25)
  const [splits, setSplits] = useState<BucketSplits>(DEFAULT_SPLITS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const salary = useAmountEntry()

  // Pre-fill from an existing session (returning user mid-setup).
  useEffect(() => {
    if (!needsAccount) return
    const client = getSupabaseClient()
    if (!client) return
    void client.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (!user) return
      const meta = user.user_metadata ?? {}
      if (user.email) setEmail((current) => current || user.email!.toLowerCase())
      if (typeof meta.display_name === 'string' && meta.display_name) {
        setName((current) => current || meta.display_name)
      }
      if (typeof meta.surname === 'string' && meta.surname) {
        setSurname((current) => current || meta.surname)
      }
      if (typeof meta.username === 'string' && meta.username) {
        setUsername((current) => current || meta.username)
      }
      if (typeof meta.phone === 'string' && meta.phone) {
        setPhone((current) => current || meta.phone)
      }
    })
  }, [needsAccount])

  const stepIndex = STEP_ORDER.indexOf(step)
  const preview = allocateIncome(salary.amountCents, splits)

  const nameOk = name.trim().length >= 2
  const surnameOk = surname.trim().length >= 2
  const usernameOk = /^[a-zA-Z0-9_.]{3,20}$/.test(username.trim())
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const phoneOk = phone.replace(/\D/g, '').length >= 9
  const passwordOk = !needsAccount || password.length >= 6
  const signupOk = nameOk && surnameOk && usernameOk && emailOk && phoneOk && passwordOk

  /** Create the Supabase account once, then continue into salary setup. */
  async function continueFromName() {
    if (!signupOk || busy) return
    setBusy(true)
    setError(null)
    try {
      const client = getSupabaseClient()
      if (client) {
        const { data: session } = await client.auth.getSession()
        if (!session.session) {
          const { error: authError } = await client.auth.signUp({
            email: email.trim().toLowerCase(),
            password,
            options: {
              data: {
                display_name: name.trim(),
                surname: surname.trim(),
                username: username.trim().toLowerCase(),
                phone: phone.trim(),
                referred_by: referredBy() ?? '',
              },
            },
          })
          if (authError) {
            setError(authErrorMessage(authError.message))
            return
          }
        }
      }
      setStep('salary')
    } finally {
      setBusy(false)
    }
  }

  async function signIn() {
    if (busy || !emailOk || password.length < 6) return
    const client = getSupabaseClient()
    if (!client) return
    setBusy(true)
    setError(null)
    const { error: authError } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    setBusy(false)
    if (authError) {
      setError(authErrorMessage(authError.message))
      return
    }
    await reload()
  }

  async function finish() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await createProfile({
        displayName: name.trim() || 'You',
        surname: surname.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        salaryCents: salary.amountCents,
        payDate,
        splits,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <Screen withTabBar={false} className="flex flex-col">
      {/* progress dots — hidden on welcome / sign-in */}
      {step !== 'welcome' && step !== 'signin' && (
        <div className="flex justify-center gap-2 mb-6 mt-2">
          {STEP_ORDER.slice(1, 1 + DOT_STEPS).map((s, i) => (
            <span
              key={s}
              className={`h-2 rounded-full transition-all duration-300 ${
                i < Math.min(Math.max(stepIndex, 1), DOT_STEPS) ? 'w-6 bg-accent' : 'w-2 bg-edge-strong'
              }`}
            />
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="flex-1 flex flex-col"
        >
          {step === 'welcome' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
              <Randy mood="celebrating" size={170} className="animate-pop-in" />
              <div>
                <h1 className="font-display font-extrabold text-4xl text-gradient-violet">
                  PennyPlay
                </h1>
                <p className="text-ink-soft mt-3 max-w-[30ch]">
                  Hey! I'm <b className="text-gold">Randy</b>. Let's make your money fun —
                  safe-to-spend daily numbers, streaks, quests and real savings. 🇿🇦
                </p>
              </div>
              <div className="w-full flex flex-col gap-3 mt-4">
                <Button3D size="lg" full onClick={() => setStep('name')}>
                  Set up in 60 seconds
                </Button3D>
                {needsAccount ? (
                  <Button3D
                    variant="ghost"
                    full
                    onClick={() => {
                      setError(null)
                      setStep('signin')
                    }}
                  >
                    Already have an account? Sign in
                  </Button3D>
                ) : (
                  <Button3D variant="ghost" full onClick={() => void startDemo()}>
                    👀 Try demo mode first
                  </Button3D>
                )}
              </div>
            </div>
          )}

          {step === 'signin' && (
            <div className="flex-1 flex flex-col gap-3 justify-center">
              <header className="text-center mb-2">
                <Randy mood="happy" size={120} className="mx-auto" />
                <h2 className="font-display font-extrabold text-2xl mt-2">Welcome back</h2>
                <p className="text-ink-soft text-sm mt-1">Sign in with your email and password.</p>
              </header>
              <SignupField
                label="Email"
                value={email}
                onChange={setEmail}
                ok={emailOk}
                placeholder="you@example.com"
                type="email"
                autoFocus
              />
              <SignupField
                label="Password"
                value={password}
                onChange={setPassword}
                ok={password.length >= 6}
                placeholder="Password"
                type="password"
                hint="at least 6 characters"
                maxLength={72}
              />
              {error && <p className="text-coral text-xs font-bold text-center">{error}</p>}
              <Button3D
                size="lg"
                full
                disabled={busy || !emailOk || password.length < 6}
                onClick={() => void signIn()}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button3D>
              <Button3D
                variant="ghost"
                full
                onClick={() => {
                  setError(null)
                  setStep('welcome')
                }}
              >
                ← Back
              </Button3D>
            </div>
          )}

          {step === 'name' && (
            <div className="flex-1 flex flex-col gap-3">
              <header className="text-center">
                <div className="flex justify-center mb-1">
                  <Randy mood="wink" size={120} />
                </div>
                <h2 className="font-display font-extrabold text-2xl">Create your profile</h2>
                <p className="text-ink-soft text-sm mt-1">
                  One-time sign-up — all fields required.
                </p>
              </header>

              <div className="grid grid-cols-2 gap-3">
                <SignupField
                  label="Name"
                  value={name}
                  onChange={setName}
                  ok={nameOk}
                  placeholder="Name"
                  autoFocus
                />
                <SignupField
                  label="Surname"
                  value={surname}
                  onChange={setSurname}
                  ok={surnameOk}
                  placeholder="Surname"
                />
              </div>
              <SignupField
                label="Username"
                value={username}
                onChange={(v) => setUsername(v.replace(/\s/g, ''))}
                ok={usernameOk}
                placeholder="Username"
                prefix="@"
                hint="3–20 letters, numbers, _ or ."
              />
              <SignupField
                label="Email"
                value={email}
                onChange={setEmail}
                ok={emailOk}
                placeholder="you@example.com"
                type="email"
              />
              <SignupField
                label="Phone"
                value={phone}
                onChange={setPhone}
                ok={phoneOk}
                placeholder="082 123 4567"
                type="tel"
                hint="at least 9 digits"
              />
              {needsAccount && (
                <SignupField
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  ok={passwordOk}
                  placeholder="Choose a password"
                  type="password"
                  hint="at least 6 characters"
                  maxLength={72}
                />
              )}

              {signupOk && (
                <p className="text-center text-sm text-ink-soft animate-pop-in">
                  Nice to meet you, <b className="text-gradient-gold">{name.trim()}</b>!{' '}
                  <RandyIcon size={18} className="inline" />
                </p>
              )}
              {error && <p className="text-coral text-xs font-bold text-center">{error}</p>}
              <Button3D
                size="lg"
                full
                disabled={!signupOk || busy}
                onClick={() => void continueFromName()}
              >
                {busy ? 'Creating account…' : "That's me"}
              </Button3D>
            </div>
          )}

          {step === 'salary' && (
            <div className="flex-1 flex flex-col gap-5">
              <header className="text-center">
                <h2 className="font-display font-extrabold text-2xl">What lands each month?</h2>
                <p className="text-ink-soft text-sm mt-1">Your take-home salary, after tax.</p>
              </header>
              <Card glow="violet" className="text-center py-6">
                <span className="font-display font-extrabold text-4xl text-gradient-win">
                  {salary.display}
                </span>
              </Card>
              <NumberPad onDigit={salary.digit} onBackspace={salary.backspace} onDecimal={salary.decimal} />
              <Button3D
                size="lg"
                full
                disabled={salary.amountCents < 100000}
                onClick={() => setStep('payDate')}
              >
                Next
              </Button3D>
            </div>
          )}

          {step === 'payDate' && (
            <div className="flex-1 flex flex-col gap-5">
              <header className="text-center">
                <h2 className="font-display font-extrabold text-2xl">When is payday?</h2>
                <p className="text-ink-soft text-sm mt-1">
                  Your budget month starts here — not on the 1st.
                </p>
              </header>
              <div className="grid grid-cols-7 gap-1.5">
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <button
                    key={day}
                    onClick={() => setPayDate(day)}
                    className={[
                      'h-11 rounded-xl font-display font-extrabold text-sm border-b-4 transition-all duration-75',
                      day === payDate
                        ? 'bg-gradient-to-b from-violet-soft to-violet text-white border-violet-deep shadow-glow-violet'
                        : 'bg-card border-edge-strong text-ink-soft active:translate-y-[2px] active:border-b',
                    ].join(' ')}
                  >
                    {day}
                  </button>
                ))}
              </div>
              <p className="text-center text-sm text-ink-faint">
                Salary lands on the <b className="text-ink">{payDate}th</b> — cycle runs {payDate}th →{' '}
                {payDate}th
              </p>
              <Button3D size="lg" full onClick={() => setStep('splits')}>
                Next
              </Button3D>
            </div>
          )}

          {step === 'splits' && (
            <div className="flex-1 flex flex-col gap-4">
              <header className="text-center">
                <h2 className="font-display font-extrabold text-2xl">Split your money</h2>
                <p className="text-ink-soft text-sm mt-1">
                  50/30/20 is the classic — drag to make it yours.
                </p>
              </header>

              {(Object.keys(BUCKET_META) as Bucket[]).map((bucket) => (
                <Card key={bucket} className="py-3">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="font-display font-extrabold">
                      {BUCKET_META[bucket].label}
                      <span className="text-ink-faint font-body font-semibold text-xs ml-2">
                        {BUCKET_META[bucket].blurb}
                      </span>
                    </span>
                    <span className="font-display font-extrabold text-xl text-accent-soft">
                      {splits[bucket]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={splits[bucket]}
                    onChange={(e) => setSplits(adjustSplit(splits, bucket, Number(e.target.value)))}
                    className="w-full accent-(--color-accent)"
                    aria-label={`${BUCKET_META[bucket].label} percentage`}
                  />
                  <p className="text-right text-xs text-ink-faint font-bold">
                    {formatRands(preview[bucket])} / month
                  </p>
                </Card>
              ))}

              <Button3D size="lg" full onClick={() => setStep('done')}>
                Looks good
              </Button3D>
            </div>
          )}

          {step === 'done' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
              <Randy mood="wink" size={150} className="animate-pop-in" />
              <div>
                <h2 className="font-display font-extrabold text-3xl text-gradient-win">
                  Ready, {name.trim().split(' ')[0] || 'friend'}!
                </h2>
                <p className="text-ink-soft mt-2 max-w-[30ch]">
                  {formatRands(salary.amountCents)} lands on the {payDate}th and gets split{' '}
                  {splits.need}/{splits.want}/{splits.saving}. I'll do the maths — you live your life.
                </p>
              </div>
              {error && <p className="text-coral text-xs font-bold">{error}</p>}
              <Button3D size="lg" variant="lime" full onClick={() => void finish()} disabled={busy}>
                {busy ? 'Saving…' : "🚀 Let's go"}
              </Button3D>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Screen>
  )
}
