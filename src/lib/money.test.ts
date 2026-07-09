import { describe, expect, it } from 'vitest'
import { formatRands, formatZAR, formatZARCompact, randsToCents } from './money'

const NBSP = ' '

describe('formatZAR', () => {
  it('formats with space thousands separator and comma decimals', () => {
    expect(formatZAR(123456)).toBe(`R${NBSP}1${NBSP}234,56`)
  })

  it('formats zero', () => {
    expect(formatZAR(0)).toBe(`R${NBSP}0,00`)
  })

  it('pads cents', () => {
    expect(formatZAR(100205)).toBe(`R${NBSP}1${NBSP}002,05`)
  })

  it('formats millions', () => {
    expect(formatZAR(123456789)).toBe(`R${NBSP}1${NBSP}234${NBSP}567,89`)
  })

  it('formats negatives with a minus sign', () => {
    expect(formatZAR(-950)).toBe(`−R${NBSP}9,50`)
  })

  it('drops cents when asked', () => {
    expect(formatRands(2850000)).toBe(`R${NBSP}28${NBSP}500`)
  })
})

describe('formatZARCompact', () => {
  it('keeps small amounts whole', () => {
    expect(formatZARCompact(85000)).toBe('R850')
  })
  it('abbreviates thousands', () => {
    expect(formatZARCompact(450000)).toBe('R4,5k') // decimals under 10k
    expect(formatZARCompact(1250000)).toBe('R13k') // whole k from 10k up
    expect(formatZARCompact(1000000)).toBe('R10k')
    expect(formatZARCompact(4500000)).toBe('R45k')
  })
  it('abbreviates millions', () => {
    expect(formatZARCompact(150000000)).toBe('R1,5m')
  })
})

describe('randsToCents', () => {
  it('parses plain numbers', () => {
    expect(randsToCents(1234.56)).toBe(123456)
  })
  it('parses dot decimals', () => {
    expect(randsToCents('1234.56')).toBe(123456)
  })
  it('parses comma decimals with spaces', () => {
    expect(randsToCents(`1${NBSP}234,56`)).toBe(123456)
    expect(randsToCents('1 234,56')).toBe(123456)
  })
  it('parses R prefix', () => {
    expect(randsToCents('R950')).toBe(95000)
  })
  it('returns 0 for garbage', () => {
    expect(randsToCents('abc')).toBe(0)
  })
})
