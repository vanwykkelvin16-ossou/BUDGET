import { useCallback, useMemo, useState } from 'react'
import { formatZAR } from '../../lib/money'

/**
 * Number-pad money entry: digits build the rand amount, an optional comma
 * switches to cents (two digits max). Returns integer cents.
 */
export function useAmountEntry(initialCents = 0) {
  const [rands, setRands] = useState(() =>
    initialCents > 0 ? String(Math.floor(initialCents / 100)) : '',
  )
  const [cents, setCents] = useState<string | null>(() => {
    const c = initialCents % 100
    return c > 0 ? String(c).padStart(2, '0') : null
  })

  const digit = useCallback((d: string) => {
    if (!/^[0-9]$/.test(d)) return
    setCents((c) => {
      if (c !== null) {
        return c.length < 2 ? c + d : c
      }
      setRands((r) => {
        if (r === '' && d === '0') return r
        return r.length < 7 ? r + d : r
      })
      return c
    })
  }, [])

  const backspace = useCallback(() => {
    setCents((c) => {
      if (c !== null) {
        return c.length > 0 ? c.slice(0, -1) : null
      }
      setRands((r) => r.slice(0, -1))
      return null
    })
  }, [])

  const decimal = useCallback(() => {
    setCents((c) => (c === null ? '' : c))
  }, [])

  const clear = useCallback(() => {
    setRands('')
    setCents(null)
  }, [])

  const amountCents = useMemo(() => {
    const r = Number.parseInt(rands || '0', 10)
    const c = Number.parseInt((cents ?? '').padEnd(2, '0') || '0', 10)
    return r * 100 + c
  }, [rands, cents])

  const display = useMemo(() => {
    if (rands === '' && cents === null) return formatZAR(0)
    const base = formatZAR(Number.parseInt(rands || '0', 10) * 100, { showCents: false })
    if (cents === null) return base
    return `${base},${cents.padEnd(2, '·')}`
  }, [rands, cents])

  return { amountCents, display, digit, backspace, decimal, clear, isEmpty: rands === '' && !cents }
}
