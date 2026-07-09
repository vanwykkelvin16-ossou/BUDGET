/**
 * Juice queue — celebration events produced by app actions and consumed by
 * the JuiceHost overlay (confetti, coin rain, level-ups, badges, fireworks).
 */

import { create } from 'zustand'
import type { BadgeDef, Goal } from '../lib/data/types'
import type { Rank } from '../lib/gamification/levels'

export type JuiceEvent =
  | { kind: 'xp'; amount: number }
  | { kind: 'coins' }
  | { kind: 'confetti' }
  | { kind: 'levelup'; level: number; rank: Rank; unlockedTheme: string | null }
  | { kind: 'badge'; badge: BadgeDef }
  | { kind: 'milestone'; goal: Goal; pct: number }
  | { kind: 'boss' }
  | { kind: 'freeze'; used: boolean }

interface JuiceState {
  queue: JuiceEvent[]
  push: (...events: JuiceEvent[]) => void
  shift: () => JuiceEvent | undefined
  clear: () => void
}

export const useJuiceStore = create<JuiceState>((set, get) => ({
  queue: [],
  push: (...events) => set((s) => ({ queue: [...s.queue, ...events] })),
  shift: () => {
    const [head, ...rest] = get().queue
    if (head) set({ queue: rest })
    return head
  },
  clear: () => set({ queue: [] }),
}))
