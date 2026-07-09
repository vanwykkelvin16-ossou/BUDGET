import { motion } from 'framer-motion'

interface Props {
  /** 0–1 */
  pct: number
  /** CSS gradient classes for the fill. */
  fillClassName?: string
  className?: string
  /** Show the moving shine sweep on the fill. */
  shine?: boolean
  height?: number
}

/** Horizontal gradient progress bar with an animated shine sweep. */
export function ProgressBar({
  pct,
  fillClassName = 'bg-gradient-to-r from-violet to-aqua',
  className = '',
  shine = true,
  height = 14,
}: Props) {
  const clamped = Math.max(0, Math.min(1, pct))
  return (
    <div
      className={`w-full rounded-full bg-bg-deep border border-edge overflow-hidden ${className}`}
      style={{ height }}
    >
      <motion.div
        className={`relative h-full rounded-full ${fillClassName} overflow-hidden`}
        initial={{ width: 0 }}
        animate={{ width: `${clamped * 100}%` }}
        transition={{ type: 'spring', stiffness: 70, damping: 16 }}
      >
        {shine && clamped > 0.02 && (
          <div className="absolute inset-y-0 w-1/3 bg-white/30 blur-[2px] animate-shine" />
        )}
      </motion.div>
    </div>
  )
}
