export type RandyMood = 'happy' | 'celebrating' | 'worried' | 'sleeping' | 'wink'

interface Props {
  mood?: RandyMood
  size?: number
  className?: string
}

/**
 * Randy the Coin 🪙 — the app's mascot. A friendly gold coin with a face.
 * Pure inline SVG so he works offline and scales anywhere.
 */
export function Randy({ mood = 'happy', size = 120, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`Randy the coin, feeling ${mood}`}
    >
      <defs>
        <radialGradient id="randy-body" cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#FFE679" />
          <stop offset="55%" stopColor="#FFD700" />
          <stop offset="100%" stopColor="#E8A80C" />
        </radialGradient>
        <linearGradient id="randy-rim" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF3B0" />
          <stop offset="100%" stopColor="#C77F06" />
        </linearGradient>
      </defs>

      {/* body + rim */}
      <circle cx="60" cy="60" r="56" fill="url(#randy-rim)" />
      <circle cx="60" cy="60" r="48" fill="url(#randy-body)" />
      <circle cx="60" cy="60" r="48" fill="none" stroke="#B97705" strokeWidth="1.5" opacity="0.5" />

      {/* embossed R */}
      <text
        x="60"
        y="104"
        textAnchor="middle"
        fontFamily="'Baloo 2', sans-serif"
        fontWeight="800"
        fontSize="20"
        fill="#B97705"
        opacity="0.55"
      >
        R
      </text>

      {/* sparkle */}
      <circle cx="38" cy="30" r="5" fill="#FFFFFF" opacity="0.75" />
      <circle cx="47" cy="24" r="2.5" fill="#FFFFFF" opacity="0.55" />

      {/* face */}
      {mood === 'happy' && (
        <g>
          <circle cx="45" cy="52" r="5.5" fill="#3B2604" />
          <circle cx="75" cy="52" r="5.5" fill="#3B2604" />
          <circle cx="46.8" cy="50" r="1.8" fill="#fff" />
          <circle cx="76.8" cy="50" r="1.8" fill="#fff" />
          <path d="M44 70 Q60 84 76 70" fill="none" stroke="#3B2604" strokeWidth="4.5" strokeLinecap="round" />
          <ellipse cx="36" cy="64" rx="6" ry="4" fill="#FF9D66" opacity="0.55" />
          <ellipse cx="84" cy="64" rx="6" ry="4" fill="#FF9D66" opacity="0.55" />
        </g>
      )}

      {mood === 'celebrating' && (
        <g>
          <path d="M39 52 Q45 44 51 52" fill="none" stroke="#3B2604" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M69 52 Q75 44 81 52" fill="none" stroke="#3B2604" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M42 68 Q60 90 78 68" fill="#3B2604" />
          <path d="M46 70 Q60 82 74 70" fill="#FF7B93" />
          <ellipse cx="36" cy="63" rx="6" ry="4" fill="#FF9D66" opacity="0.6" />
          <ellipse cx="84" cy="63" rx="6" ry="4" fill="#FF9D66" opacity="0.6" />
        </g>
      )}

      {mood === 'worried' && (
        <g>
          <circle cx="45" cy="54" r="5" fill="#3B2604" />
          <circle cx="75" cy="54" r="5" fill="#3B2604" />
          <circle cx="46.5" cy="52.2" r="1.6" fill="#fff" />
          <circle cx="76.5" cy="52.2" r="1.6" fill="#fff" />
          <path d="M38 44 Q45 40 52 44" fill="none" stroke="#3B2604" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M68 44 Q75 40 82 44" fill="none" stroke="#3B2604" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M47 76 Q60 68 73 76" fill="none" stroke="#3B2604" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="86" cy="40" r="4" fill="#7DD3FC" opacity="0.9" />
        </g>
      )}

      {mood === 'sleeping' && (
        <g>
          <path d="M39 54 Q45 58 51 54" fill="none" stroke="#3B2604" strokeWidth="4" strokeLinecap="round" />
          <path d="M69 54 Q75 58 81 54" fill="none" stroke="#3B2604" strokeWidth="4" strokeLinecap="round" />
          <ellipse cx="60" cy="74" rx="6" ry="7" fill="#3B2604" />
          <text x="88" y="34" fontSize="16" fill="#3B2604" opacity="0.7" fontFamily="'Baloo 2', sans-serif" fontWeight="800">z</text>
          <text x="96" y="24" fontSize="12" fill="#3B2604" opacity="0.5" fontFamily="'Baloo 2', sans-serif" fontWeight="800">z</text>
        </g>
      )}

      {mood === 'wink' && (
        <g>
          <circle cx="45" cy="52" r="5.5" fill="#3B2604" />
          <circle cx="46.8" cy="50" r="1.8" fill="#fff" />
          <path d="M69 52 Q75 48 81 52" fill="none" stroke="#3B2604" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M44 70 Q60 84 76 70" fill="none" stroke="#3B2604" strokeWidth="4.5" strokeLinecap="round" />
          <ellipse cx="36" cy="64" rx="6" ry="4" fill="#FF9D66" opacity="0.55" />
        </g>
      )}
    </svg>
  )
}
