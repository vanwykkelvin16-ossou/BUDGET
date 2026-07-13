import { describe, expect, it } from 'vitest'
import { makeXpEvent } from '../gamification/xp'

describe('quest XP ref ids', () => {
  it('parses claim ref into quest id and period key', () => {
    const event = makeXpEvent({
      reason: 'quest_reward',
      refId: 'quest:q-log-days:2026-07-01',
      date: '2026-07-10',
      amount: 50,
    })
    const [, questId, ...rest] = event.refId.split(':')
    expect(questId).toBe('q-log-days')
    expect(rest.join(':')).toBe('2026-07-01')
  })
})
