import { describe, expect, it } from 'vitest'
import type { BucketSplits } from '../data/types'
import { DEFAULT_SPLITS, adjustSplit, allocateIncome, splitsAreValid } from './allocate'

describe('allocateIncome', () => {
  it('allocates the 50/30/20 default exactly', () => {
    expect(allocateIncome(2850000, DEFAULT_SPLITS)).toEqual({
      need: 1425000,
      want: 855000,
      saving: 570000,
    })
  })

  it('never loses a cent (largest remainder)', () => {
    // 101 cents at 50/30/20 → floors 50/30/20, leftover 1 goes to the
    // largest fractional remainder (need: .5).
    expect(allocateIncome(101, DEFAULT_SPLITS)).toEqual({ need: 51, want: 30, saving: 20 })
  })

  it('sums exactly to the input across many amounts and splits', () => {
    const splitsList: BucketSplits[] = [
      DEFAULT_SPLITS,
      { need: 55, want: 25, saving: 20 },
      { need: 33, want: 33, saving: 34 },
      { need: 0, want: 0, saving: 100 },
      { need: 99, want: 1, saving: 0 },
      { need: 1, want: 98, saving: 1 },
    ]
    for (const splits of splitsList) {
      for (const total of [0, 1, 2, 3, 99, 100, 101, 12345, 999999, 2850001]) {
        const a = allocateIncome(total, splits)
        expect(a.need + a.want + a.saving).toBe(total)
        expect(a.need).toBeGreaterThanOrEqual(0)
        expect(a.want).toBeGreaterThanOrEqual(0)
        expect(a.saving).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('rejects splits that do not sum to 100', () => {
    expect(() => allocateIncome(1000, { need: 50, want: 30, saving: 30 })).toThrow()
    expect(() => allocateIncome(1000, { need: 50, want: 30, saving: 10 })).toThrow()
  })

  it('rejects negative income', () => {
    expect(() => allocateIncome(-1, DEFAULT_SPLITS)).toThrow()
  })
})

describe('splitsAreValid', () => {
  it('accepts valid splits', () => {
    expect(splitsAreValid(DEFAULT_SPLITS)).toBe(true)
    expect(splitsAreValid({ need: 100, want: 0, saving: 0 })).toBe(true)
  })
  it('rejects bad splits', () => {
    expect(splitsAreValid({ need: 50, want: 30, saving: 19 })).toBe(false)
    expect(splitsAreValid({ need: -10, want: 90, saving: 20 })).toBe(false)
    expect(splitsAreValid({ need: 50.5, want: 29.5, saving: 20 })).toBe(false)
  })
})

describe('adjustSplit', () => {
  it('moving one slider keeps the sum at 100', () => {
    for (let v = 0; v <= 100; v += 7) {
      const next = adjustSplit(DEFAULT_SPLITS, 'want', v)
      expect(next.need + next.want + next.saving).toBe(100)
      expect(next.want).toBe(v)
    }
  })

  it('redistributes proportionally to the other buckets', () => {
    // Dropping want 30 → 10 frees 20 points, split 50:20 between need and saving.
    const next = adjustSplit(DEFAULT_SPLITS, 'want', 10)
    expect(next).toEqual({ need: 64, want: 10, saving: 26 })
  })

  it('handles the others being zero', () => {
    const next = adjustSplit({ need: 0, want: 100, saving: 0 }, 'want', 60)
    expect(next.need + next.want + next.saving).toBe(100)
    expect(next.want).toBe(60)
  })

  it('clamps the target into 0–100', () => {
    expect(adjustSplit(DEFAULT_SPLITS, 'saving', 140).saving).toBe(100)
    expect(adjustSplit(DEFAULT_SPLITS, 'saving', -5).saving).toBe(0)
  })
})
