/**
 * Season Recap — a Spotify-Wrapped-style story of the last completed cycle
 * (or the current one if there's no history yet). Tap to advance.
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../state/appStore'
import { computeCycleInfo } from '../state/selectors'
import { monthSummary } from '../lib/engine/insights'
import { formatMonthLabel, todaySAST } from '../lib/dates'
import { formatRands } from '../lib/money'
import { Randy } from '../components/ui/Randy'
import { Button3D } from '../components/ui/Button3D'

interface Slide {
  bg: string
  content: React.ReactNode
}

export function SeasonRecap() {
  const navigate = useNavigate()
  const data = useAppStore((s) => s.data)
  const [index, setIndex] = useState(0)

  const slides = useMemo<Slide[]>(() => {
    const profile = data.profile
    if (!profile) return []
    const today = todaySAST()

    // Prefer the most recent completed cycle's snapshot; fall back to now.
    const snapshot = [...data.snapshots].sort((a, b) => b.cycleStart.localeCompare(a.cycleStart))[0]
    const live = computeCycleInfo(data, today)

    const monthLabel = snapshot
      ? formatMonthLabel(snapshot.cycleStart)
      : live
        ? formatMonthLabel(live.cycle.start)
        : ''
    const incomeCents = snapshot?.incomeCents ?? live?.incomeCents ?? 0
    const spentByCategory = snapshot?.spentByCategory ?? live?.spentByCat ?? {}
    const savedCents = snapshot?.savedCents ?? live?.savedCents ?? 0
    const bossDefeated = snapshot?.bossDefeated ?? false
    const summary = snapshot ? monthSummary(snapshot, data.categories) : null

    const catById = new Map(data.categories.map((c) => [c.id, c]))
    const top3 = Object.entries(spentByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id, cents]) => ({ cat: catById.get(id), cents }))

    const big = 'font-display font-extrabold text-4xl leading-tight'
    const label = 'text-xs font-bold uppercase tracking-[0.25em] opacity-80'

    return [
      {
        bg: 'from-violet-deep via-bg to-bg',
        content: (
          <>
            <Randy mood="celebrating" size={130} />
            <p className={label}>your money month</p>
            <h1 className={`${big} text-gradient-violet`}>{monthLabel}</h1>
            <p className="text-ink-soft text-sm">tap anywhere to play ▶</p>
          </>
        ),
      },
      {
        bg: 'from-[#1c3a1a] via-bg to-bg',
        content: (
          <>
            <p className={label}>money in</p>
            <h1 className={`${big} text-gradient-win`}>{formatRands(incomeCents)}</h1>
            <p className="text-ink-soft text-sm max-w-[26ch]">
              landed in your world. Every rand got a job. 💼
            </p>
          </>
        ),
      },
      {
        bg: 'from-[#3a1a2a] via-bg to-bg',
        content: (
          <>
            <p className={label}>where it went</p>
            <div className="flex flex-col gap-3 items-center">
              {top3.map(({ cat, cents }, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-3xl">{cat?.icon ?? '📦'}</span>
                  <span className="font-display font-extrabold text-xl">
                    {cat?.name ?? 'Other'}
                  </span>
                  <span className="font-display font-extrabold text-coral">
                    {formatRands(cents)}
                  </span>
                </div>
              ))}
              {top3.length === 0 && <p className="text-ink-soft">Nowhere! A quiet month.</p>}
            </div>
          </>
        ),
      },
      {
        bg: 'from-[#0f3a3a] via-bg to-bg',
        content: (
          <>
            <p className={label}>you saved</p>
            <h1 className={`${big} text-gradient-win`}>{formatRands(savedCents)}</h1>
            {bossDefeated ? (
              <p className="font-display font-extrabold text-gold text-lg">
                🐲 Boss defeated — savings target smashed!
              </p>
            ) : (
              <p className="text-ink-soft text-sm max-w-[26ch]">
                Future you says thanks. The boss awaits next cycle. 🐲
              </p>
            )}
          </>
        ),
      },
      ...(summary
        ? [
            {
              bg: 'from-[#3a2a0f] via-bg to-bg',
              content: (
                <>
                  <p className={label}>habits</p>
                  <div className="flex flex-col gap-4 max-w-[30ch]">
                    <p className="font-display font-extrabold text-lg text-lime">
                      ✅ {summary.bestHabit}
                    </p>
                    <p className="font-display font-extrabold text-lg text-ember">
                      👀 {summary.worstHabit}
                    </p>
                  </div>
                </>
              ),
            },
          ]
        : []),
      {
        bg: 'from-violet-deep via-bg to-bg',
        content: (
          <>
            <p className={label}>the grind</p>
            <div className="flex gap-6">
              <div className="text-center">
                <p className={`${big} text-gradient-gold`}>🔥{profile.longestStreak}</p>
                <p className="text-xs text-ink-soft font-bold">best streak</p>
              </div>
              <div className="text-center">
                <p className={`${big} text-gradient-win`}>{profile.xp.toLocaleString()}</p>
                <p className="text-xs text-ink-soft font-bold">total XP</p>
              </div>
              <div className="text-center">
                <p className={`${big} text-gradient-violet`}>{data.userBadges.length}</p>
                <p className="text-xs text-ink-soft font-bold">badges</p>
              </div>
            </div>
            <Randy mood="wink" size={100} />
            <Button3D
              variant="gold"
              onClick={(e) => {
                e.stopPropagation()
                const text = `My ${monthLabel} on PennyPlay: saved ${formatRands(savedCents)}, ${profile.longestStreak}-day streak, ${data.userBadges.length} badges 🔥`
                if (navigator.share) void navigator.share({ text })
                else void navigator.clipboard?.writeText(text)
              }}
            >
              📣 Share the flex
            </Button3D>
          </>
        ),
      },
    ]
  }, [data])

  if (slides.length === 0) return null
  const last = index >= slides.length - 1

  return (
    <div
      className={`min-h-dvh bg-gradient-to-b ${slides[index].bg} cursor-pointer select-none`}
      onClick={() => (last ? navigate('/') : setIndex((i) => i + 1))}
    >
      {/* progress ticks */}
      <div className="mx-auto max-w-md flex gap-1.5 px-4 pt-[max(env(safe-area-inset-top),16px)]">
        {slides.map((_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= index ? 'bg-ink' : 'bg-edge'}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -30, scale: 1.02 }}
          transition={{ type: 'spring', stiffness: 220, damping: 24 }}
          className="mx-auto max-w-md min-h-[calc(100dvh-40px)] flex flex-col items-center
                     justify-center text-center gap-5 px-8"
        >
          {slides[index].content}
        </motion.div>
      </AnimatePresence>

      <button
        onClick={(e) => {
          e.stopPropagation()
          navigate('/')
        }}
        className="fixed top-[max(env(safe-area-inset-top),16px)] right-4 w-9 h-9 rounded-full
                   bg-card/80 border border-edge font-display font-extrabold z-10"
        aria-label="Close recap"
      >
        ✕
      </button>
    </div>
  )
}
