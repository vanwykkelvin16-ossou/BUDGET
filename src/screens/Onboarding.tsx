/**
 * First-run onboarding: salary → pay date → split sliders → done, in under
 * a minute. Demo mode is one tap away on the first step.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import { Screen } from '../components/layout/Screen'
import { Button3D } from '../components/ui/Button3D'
import { Card } from '../components/ui/Card'
import { NumberPad } from '../components/ui/NumberPad'
import { useAmountEntry } from '../components/ui/useAmountEntry'
import { Randy } from '../components/ui/Randy'
import { adjustSplit, allocateIncome, DEFAULT_SPLITS } from '../lib/engine/allocate'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import type { Bucket, BucketSplits } from '../lib/data/types'
import { formatRands } from '../lib/money'

type Step = 'welcome' | 'name' | 'salary' | 'payDate' | 'splits' | 'done'

const STEP_ORDER: Step[] = ['welcome', 'name', 'salary', 'payDate', 'splits', 'done']
/** Steps that show progress dots (everything between welcome and done). */
const DOT_STEPS = STEP_ORDER.length - 2

const BUCKET_META: Record<Bucket, { label: string; blurb: string; barClass: string }> = {
  need: { label: 'Needs', blurb: 'rent, groceries, transport', barClass: 'accent-violet' },
  want: { label: 'Wants', blurb: 'fun, eating out, date nights', barClass: 'accent-coral' },
  saving: { label: 'Savings', blurb: 'goals & future you', barClass: 'accent-aqua' },
}

export function Onboarding() {
  const startDemo = useAppStore((s) => s.startDemo)
  const createProfile = useAppStore((s) => s.createProfile)

  const [step, setStep] = useState<Step>('welcome')
  const [name, setName] = useState('')
  const [payDate, setPayDate] = useState(25)
  const [splits, setSplits] = useState<BucketSplits>(DEFAULT_SPLITS)
  const [busy, setBusy] = useState(false)
  const salary = useAmountEntry()

  const stepIndex = STEP_ORDER.indexOf(step)
  const preview = allocateIncome(salary.amountCents, splits)

  async function finish() {
    if (busy) return
    setBusy(true)
    await createProfile({
      displayName: name.trim() || 'You',
      salaryCents: salary.amountCents,
      payDate,
      splits,
    })
  }

  return (
    <Screen withTabBar={false} className="flex flex-col">
      {/* progress dots */}
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
              <Randy mood="celebrating" size={150} className="animate-pop-in" />
              <div>
                <h1 className="font-display font-extrabold text-4xl text-gradient-violet">
                  Pulse Budget
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
                {/* Demo data stays on-device, so it's a local-mode feature. */}
                {!isSupabaseConfigured() && (
                  <Button3D variant="ghost" full onClick={() => void startDemo()}>
                    👀 Try demo mode first
                  </Button3D>
                )}
              </div>
            </div>
          )}

          {step === 'name' && (
            <div className="flex-1 flex flex-col gap-5">
              <header className="text-center">
                <h2 className="font-display font-extrabold text-2xl">First — who are you?</h2>
                <p className="text-ink-soft text-sm mt-1">
                  One-time sign-up. Randy likes to know who he's cheering for.
                </p>
              </header>
              <div className="flex justify-center">
                <Randy mood="wink" size={90} />
              </div>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) setStep('salary')
                }}
                placeholder="Your name"
                maxLength={24}
                className="w-full px-5 py-4 rounded-3xl bg-card border-2 border-edge outline-none
                           font-display font-extrabold text-2xl text-center
                           placeholder:text-ink-faint placeholder:font-body placeholder:text-lg
                           focus:border-accent focus:shadow-glow-violet transition-all"
              />
              {name.trim() && (
                <p className="text-center text-sm text-ink-soft animate-pop-in">
                  Nice to meet you, <b className="text-gradient-gold">{name.trim()}</b>! 🪙
                </p>
              )}
              <Button3D size="lg" full disabled={!name.trim()} onClick={() => setStep('salary')}>
                That's me
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
                Salary lands on the <b className="text-ink">{payDate}th</b> — cycle runs {payDate}th → {payDate}th
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
              <Randy mood="wink" size={130} className="animate-pop-in" />
              <div>
                <h2 className="font-display font-extrabold text-3xl text-gradient-win">
                  Ready, {name.trim().split(' ')[0] || 'friend'}!
                </h2>
                <p className="text-ink-soft mt-2 max-w-[30ch]">
                  {formatRands(salary.amountCents)} lands on the {payDate}th and gets split{' '}
                  {splits.need}/{splits.want}/{splits.saving}. I'll do the maths — you live your life.
                </p>
              </div>
              <Button3D size="lg" variant="lime" full onClick={() => void finish()} disabled={busy}>
                🚀 Let's go
              </Button3D>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </Screen>
  )
}
