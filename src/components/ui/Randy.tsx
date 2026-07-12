export type RandyMood = 'happy' | 'celebrating' | 'worried' | 'sleeping' | 'wink'

export const RANDY_LOGO_SRC = '/randy-logo.png'

interface Props {
  mood?: RandyMood
  size?: number
  className?: string
}

/** Keep moods for API compatibility; logo always renders unmodified. */
const MOOD_STYLES: Record<RandyMood, string> = {
  happy: '',
  celebrating: '',
  worried: '',
  sleeping: '',
  wink: '',
}

/**
 * Randy — the app's mascot. Uses the official Randy coin logo everywhere.
 */
export function Randy({ mood = 'happy', size = 120, className = '' }: Props) {
  return (
    <img
      src={RANDY_LOGO_SRC}
      alt={`Randy the coin, feeling ${mood}`}
      width={size}
      height={size}
      className={[
        'block object-contain select-none pointer-events-none',
        MOOD_STYLES[mood],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      draggable={false}
    />
  )
}

/** Inline Randy logo at emoji-like sizes (rank crests, copy, etc.). */
export function RandyIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src={RANDY_LOGO_SRC}
      alt="Randy"
      width={size}
      height={size}
      className={['inline-block object-contain align-middle', className].filter(Boolean).join(' ')}
      draggable={false}
    />
  )
}
