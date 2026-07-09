import { describe, expect, it } from 'vitest'
import { XP_RULES, alreadyAwarded, makeXpEvent, totalXp } from './xp'

describe('XP rules', () => {
  it('match the spec', () => {
    expect(XP_RULES.log_expense).toBe(10)
    expect(XP_RULES.under_sts_day).toBe(50)
    expect(XP_RULES.savings_contribution).toBe(100)
    expect(XP_RULES.no_spend_day).toBe(75)
  })
})

describe('makeXpEvent', () => {
  it('uses the rule amount by default', () => {
    const e = makeXpEvent({ reason: 'log_expense', refId: 'txn-1', date: '2026-07-09' })
    expect(e.amount).toBe(10)
    expect(e.id).toBe('xp:txn-1')
  })

  it('accepts explicit amounts for quest rewards', () => {
    const e = makeXpEvent({
      reason: 'quest_reward',
      refId: 'quest:q-boss:2026-06-25',
      date: '2026-07-09',
      amount: 500,
    })
    expect(e.amount).toBe(500)
  })

  it('throws when a variable-amount reason has no amount', () => {
    expect(() =>
      makeXpEvent({ reason: 'quest_reward', refId: 'x', date: '2026-07-09' }),
    ).toThrow()
  })
})

describe('idempotence', () => {
  it('detects already-awarded refIds', () => {
    const events = [makeXpEvent({ reason: 'log_expense', refId: 'txn-1', date: '2026-07-09' })]
    expect(alreadyAwarded(events, 'txn-1')).toBe(true)
    expect(alreadyAwarded(events, 'txn-2')).toBe(false)
  })

  it('sums totals', () => {
    const events = [
      makeXpEvent({ reason: 'log_expense', refId: 'a', date: '2026-07-09' }),
      makeXpEvent({ reason: 'no_spend_day', refId: 'b', date: '2026-07-09' }),
    ]
    expect(totalXp(events)).toBe(85)
  })
})
