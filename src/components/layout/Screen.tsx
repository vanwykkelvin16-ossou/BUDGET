import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

interface Props {
  children: ReactNode
  /** Extra bottom padding for the tab bar (off for full-screen modals). */
  withTabBar?: boolean
  className?: string
}

/** Page wrapper: phone-width column with a springy slide-in. */
export function Screen({ children, withTabBar = true, className = '' }: Props) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 24, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={[
        'mx-auto max-w-md min-h-dvh px-4 pt-[max(env(safe-area-inset-top),16px)]',
        withTabBar ? 'pb-32' : 'pb-8',
        className,
      ].join(' ')}
    >
      {children}
    </motion.main>
  )
}
