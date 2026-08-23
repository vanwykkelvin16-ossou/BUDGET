import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
}

/**
 * Bottom sheet that springs up from the tab bar.
 *
 * The sheet stays fully on screen in the installed PWA: it never grows past
 * the notch at the top, and its bottom padding clears the home indicator so
 * the last button in a sheet is always tappable.
 */
export function Sheet({ open, onClose, title, children }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/60 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md
                       bg-card border-t-2 border-x border-edge rounded-t-[28px]
                       px-5 pt-5 pb-[max(env(safe-area-inset-bottom),20px)]
                       max-h-[calc(100dvh_-_max(env(safe-area-inset-top),16px))]
                       overflow-y-auto overscroll-contain no-scrollbar"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          >
            <div className="mx-auto w-10 h-1.5 rounded-full bg-edge-strong mb-4" />
            {title && (
              <h2 className="font-display font-extrabold text-xl mb-4">{title}</h2>
            )}
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
