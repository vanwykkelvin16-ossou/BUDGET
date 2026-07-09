/**
 * Quests: weekly quest cards with claimable XP, the monthly boss battle,
 * and a gentle recovery quest when the budget's gone over.
 */

import { useMemo } from 'react'
import { useAppStore } from '../state/appStore'
import { computeCycleInfo, loggedDates, alreadyMarkedNoSpend, noExpensesToday } from '../state/selectors'
import {
  QUEST_DEFS,
  buildQuestContext,
  computeQuestProgress,
  questPeriodKey,
  type QuestProgress,
} from '../lib/gamification/quests'
import { addDays, isoWeekKey, todaySAST, weekBounds } from '../lib/dates'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { ProgressBar } from '../components/ui/ProgressBar'
import { ProgressRing } from '../components/ui/ProgressRing'
import { Randy } from '../components/ui/Randy'
import type { QuestDef } from '../lib/data/types'

export function Quests() {
  const data = useAppStore((s) => s.data)
  const claimQuest = useAppStore((s) => s.claimQuest)
  const markNoSpendDay = useAppStore((s) => s.markNoSpendDay)

  const today = todaySAST()
  const info = useMemo(() => computeCycleInfo(data, today), [data, today])

  const { thisWeek, lastWeekClaimables, boss } = useMemo(() => {
    if (!info) return { thisWeek: [], lastWeekClaimables: [], boss: null }
    const logged = loggedDates(data)

    // Quest context anchored to a given week (this week or last week).
    const makeCtx = (anchor: string) => {
      const bounds = weekBounds(anchor)
      const ctx = buildQuestContext({
        todayISO: today,
        cycle: info.cycle,
        transactions: data.transactions,
        contributions: data.contributions,
        categories: data.categories,
        loggedDates: logged,
        savingAllocatedCents: info.allocated.saving,
      })
      return { ...ctx, weekStart: bounds.start, weekEnd: bounds.end }
    }

    const ctxNow = makeCtx(today)
    const ctxLast = makeCtx(addDays(weekBounds(today).start, -1))

    const weeklyDefs = QUEST_DEFS.filter((d) => d.kind === 'weekly')
    const bossDef = QUEST_DEFS.find((d) => d.kind === 'boss')!

    const claimedSet = new Set(
      data.userQuests.filter((q) => q.claimedAt).map((q) => `${q.questId}:${q.periodKey}`),
    )

    const wrap = (def: QuestDef, ctx: typeof ctxNow, weekKey: string) => {
      const periodKey = questPeriodKey(def, { weekKey, cycle: info.cycle })
      return {
        def,
        periodKey,
        progress: computeQuestProgress(def, ctx),
        claimed: claimedSet.has(`${def.id}:${periodKey}`),
      }
    }

    const thisWeekKey = isoWeekKey(today)
    const lastWeekKey = isoWeekKey(ctxLast.weekStart)

    const thisWeekList = weeklyDefs.map((def) => wrap(def, ctxNow, thisWeekKey))
    const lastWeekList = weeklyDefs
      .map((def) => wrap(def, ctxLast, lastWeekKey))
      .filter((q) => q.progress.completed && !q.claimed)

    const bossPeriod = questPeriodKey(bossDef, { weekKey: thisWeekKey, cycle: info.cycle })
    return {
      thisWeek: thisWeekList,
      lastWeekClaimables: lastWeekList,
      boss: {
        def: bossDef,
        periodKey: bossPeriod,
        progress: computeQuestProgress(bossDef, ctxNow),
        claimed: claimedSet.has(`${bossDef.id}:${bossPeriod}`),
      },
    }
  }, [data, info, today])

  if (!info) return null

  const overBudget = info.sts.status === 'over'
  const canRecover = noExpensesToday(data, today) && !alreadyMarkedNoSpend(data, today)

  return (
    <Screen>
      <h1 className="font-display font-extrabold text-2xl mb-4">Quests 🎯</h1>

      {/* Boss battle */}
      {boss && (
        <Card glow="gold" className="mb-5 relative overflow-hidden">
          <div className="flex items-center gap-4">
            <ProgressRing
              pct={boss.progress.pct}
              size={92}
              stroke={11}
              colors={['#FACC15', '#FFD700']}
            >
              <span className="text-3xl">{boss.progress.completed ? '🏆' : '🐲'}</span>
            </ProgressRing>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                Monthly boss battle
              </p>
              <h2 className="font-display font-extrabold text-lg leading-tight">
                {boss.def.title}
              </h2>
              <p className="text-xs text-ink-soft mt-1">{boss.progress.detail}</p>
              <p className="text-xs font-bold text-gold mt-1">+{boss.def.rewardXp} XP</p>
            </div>
          </div>
          {boss.progress.completed && !boss.claimed && (
            <Button3D
              variant="gold"
              full
              className="mt-3"
              onClick={() => void claimQuest(boss.def, boss.periodKey)}
            >
              ⚔️ Claim victory!
            </Button3D>
          )}
          {boss.claimed && (
            <p className="mt-3 text-center text-sm font-display font-extrabold text-gold">
              Boss defeated this cycle 🎉
            </p>
          )}
        </Card>
      )}

      {/* Recovery quest — loss aversion, gently */}
      {overBudget && (
        <Card className="mb-5 flex items-center gap-3 border-ember/40">
          <Randy mood="worried" size={64} />
          <div className="flex-1">
            <p className="font-display font-extrabold text-sm">Recovery quest</p>
            <p className="text-xs text-ink-soft">
              Wants ran out — no shame. A no-spend day gets you +75 XP and back on track.
            </p>
          </div>
          {canRecover && (
            <Button3D size="sm" variant="lime" onClick={() => void markNoSpendDay()}>
              Start
            </Button3D>
          )}
        </Card>
      )}

      {/* Ready to claim from last week */}
      {lastWeekClaimables.length > 0 && (
        <>
          <h2 className="font-display font-extrabold text-lg mb-2">Ready to claim ✨</h2>
          <div className="flex flex-col gap-3 mb-5">
            {lastWeekClaimables.map((q) => (
              <QuestCard
                key={`${q.def.id}:${q.periodKey}`}
                q={q}
                onClaim={() => void claimQuest(q.def, q.periodKey)}
              />
            ))}
          </div>
        </>
      )}

      <h2 className="font-display font-extrabold text-lg mb-2">This week</h2>
      <div className="flex flex-col gap-3">
        {thisWeek.map((q) => (
          <QuestCard
            key={`${q.def.id}:${q.periodKey}`}
            q={q}
            onClaim={() => void claimQuest(q.def, q.periodKey)}
          />
        ))}
      </div>
    </Screen>
  )
}

interface QuestItem {
  def: QuestDef
  periodKey: string
  progress: QuestProgress
  claimed: boolean
}

function QuestCard({ q, onClaim }: { q: QuestItem; onClaim: () => void }) {
  const claimable = q.progress.completed && !q.claimed
  return (
    <Card glow={claimable ? 'lime' : 'none'} className={q.claimed ? 'opacity-60' : ''}>
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{q.def.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display font-extrabold text-sm leading-tight">{q.def.title}</h3>
            <span className="text-xs font-bold text-lime shrink-0">+{q.def.rewardXp} XP</span>
          </div>
          <p className="text-xs text-ink-soft mt-0.5">{q.def.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <ProgressBar
              pct={q.progress.pct}
              height={10}
              fillClassName={
                claimable || q.claimed
                  ? 'bg-gradient-to-r from-lime to-emerald'
                  : 'bg-gradient-to-r from-violet to-aqua'
              }
              className="flex-1"
            />
            <span className="text-[10px] font-bold text-ink-faint shrink-0">
              {q.progress.detail}
            </span>
          </div>
        </div>
      </div>
      {claimable && (
        <Button3D variant="lime" size="sm" full className="mt-3" onClick={onClaim}>
          Claim reward
        </Button3D>
      )}
      {q.claimed && (
        <p className="mt-2 text-right text-xs font-display font-extrabold text-ink-faint">
          Claimed ✓
        </p>
      )}
    </Card>
  )
}
