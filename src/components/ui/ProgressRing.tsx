import { useId, type ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Props {
  /** 0–1 */
  pct: number
  size?: number
  stroke?: number
  /** Gradient stops, e.g. ['#A3E635', '#34D399']. */
  colors: [string, string]
  trackClassName?: string
  children?: ReactNode
  /** Overfill (pct > 1) tints the whole ring with the danger colour. */
  overColor?: string
}

/** Juicy gradient progress ring with a rounded cap and springy fill. */
export function ProgressRing({
  pct,
  size = 96,
  stroke = 10,
  colors,
  children,
  overColor,
}: Props) {
  const gradientId = useId()
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, pct))
  const over = pct > 1 && overColor

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={over ? overColor : colors[0]} />
            <stop offset="100%" stopColor={over ? overColor : colors[1]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-edge"
          opacity={0.6}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped) }}
          transition={{ type: 'spring', stiffness: 60, damping: 15 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )
}
