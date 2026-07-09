/**
 * Money utilities. All amounts are integer cents (ZAR).
 * Display format follows South African convention: R 1 234,56
 * (non-breaking space thousands separator, comma decimal separator).
 */

const NBSP = ' '

/** Format cents as "R 1 234,56". Negative amounts render as "−R 1 234,56". */
export function formatZAR(cents: number, opts?: { showCents?: boolean }): string {
  const showCents = opts?.showCents ?? true
  const negative = cents < 0
  const abs = Math.abs(Math.round(cents))
  const rands = Math.floor(abs / 100)
  const cc = abs % 100

  const grouped = groupThousands(rands)
  const body = showCents ? `${grouped},${String(cc).padStart(2, '0')}` : grouped
  return `${negative ? '−' : ''}R${NBSP}${body}`
}

/** Format whole rands compactly: "R 12 450" (cents dropped, rounded down). */
export function formatRands(cents: number): string {
  return formatZAR(cents, { showCents: false })
}

/** Compact form for tight spots: R1,2k / R18k / R1,5m. */
export function formatZARCompact(cents: number): string {
  const negative = cents < 0
  const rands = Math.abs(cents) / 100
  let body: string
  if (rands >= 1_000_000) {
    body = trimDecimal(rands / 1_000_000) + 'm'
  } else if (rands >= 10_000) {
    body = Math.round(rands / 1000) + 'k'
  } else if (rands >= 1000) {
    body = trimDecimal(rands / 1000) + 'k'
  } else {
    body = String(Math.round(rands))
  }
  return `${negative ? '−' : ''}R${body}`
}

function trimDecimal(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',')
}

function groupThousands(n: number): string {
  const digits = String(n)
  let out = ''
  for (let i = 0; i < digits.length; i++) {
    const fromEnd = digits.length - i
    out += digits[i]
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += NBSP
  }
  return out
}

/** Parse a rand value ("1234.56", "1 234,56", "R950") into cents. */
export function randsToCents(input: string | number): number {
  if (typeof input === 'number') return Math.round(input * 100)
  const cleaned = input
    .replace(/[Rr\s  ]/g, '')
    .replace(',', '.')
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100)
}
