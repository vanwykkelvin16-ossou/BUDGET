import { playTap } from '../../lib/sound'

interface Props {
  onDigit: (d: string) => void
  onBackspace: () => void
  onDecimal: () => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫']

/** Big thumb-friendly number pad for lightning-fast amount entry. */
export function NumberPad({ onDigit, onBackspace, onDecimal }: Props) {
  function press(key: string) {
    playTap()
    if (key === '⌫') onBackspace()
    else if (key === ',') onDecimal()
    else onDigit(key)
  }

  return (
    <div className="grid grid-cols-3 gap-2.5 no-select">
      {KEYS.map((key) => (
        <button
          key={key}
          onClick={() => press(key)}
          className="h-16 rounded-2xl font-display font-extrabold text-2xl
                     bg-card border border-edge border-b-4 border-b-edge-strong
                     active:translate-y-[2px] active:border-b transition-all duration-75
                     text-ink"
          aria-label={key === '⌫' ? 'backspace' : key}
        >
          {key}
        </button>
      ))}
    </div>
  )
}
