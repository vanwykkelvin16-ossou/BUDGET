import { useState, useSyncExternalStore } from 'react'
import { motion } from 'framer-motion'
import { Button3D } from './Button3D'
import { Sheet } from './Sheet'
import { RandyIcon } from './Randy'
import { INSTALL_STEPS, installState, type InstallPlatform, type InstallState } from '../../lib/install'
import {
  getInstallSnapshot,
  promptInstall,
  SERVER_INSTALL_SNAPSHOT,
  subscribeInstall,
} from '../../lib/installPrompt'

/** What this device can be offered: a one-tap prompt, manual steps, or nothing. */
export function useInstallState(): InstallState {
  const snapshot = useSyncExternalStore(
    subscribeInstall,
    getInstallSnapshot,
    () => SERVER_INSTALL_SNAPSHOT,
  )
  return installState({
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints,
    standalone: snapshot.standalone,
    canPrompt: snapshot.canPrompt,
  })
}

const PLATFORM_TITLE: Record<InstallPlatform, string> = {
  ios: 'Put PennyPlay on your iPhone',
  android: 'Install PennyPlay on Android',
  other: 'Install PennyPlay',
}

/**
 * The loud "get this on your phone" card: a gold, shining call to action that
 * either fires the browser's own install prompt (Android/Chromium) or opens
 * the Share → Add to Home Screen steps (iOS). Renders nothing once installed.
 */
export function InstallAppButton() {
  const state = useInstallState()
  const [stepsOpen, setStepsOpen] = useState(false)

  if (state.kind === 'installed') return null

  const { platform } = state

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 24 }}
        className="w-full relative overflow-hidden rounded-[26px] p-[2px]
                   bg-gradient-to-b from-sun via-gold to-ember shadow-glow-gold"
      >
        {/* Sweeping highlight — this card is meant to catch the eye. */}
        <div className="pointer-events-none absolute inset-y-0 w-1/3 bg-white/25 blur-[3px] animate-shine" />
        {/* Colours inside the gold frame are fixed rather than themed, so the
            card reads the same wherever it is dropped in. */}
        <div className="relative rounded-[24px] bg-[#1a1033]/92 px-4 py-4 text-center">
          <p className="font-display font-extrabold text-lg text-gradient-gold">
            <RandyIcon size={20} className="mr-1.5" />
            {PLATFORM_TITLE[platform]}
          </p>
          <p className="text-white/75 text-xs mt-1 mb-3 mx-auto max-w-[34ch]">
            No app store, no download wait. It opens full-screen like a normal app and still works
            offline — iPhone and Android both.
          </p>
          <Button3D
            variant="gold"
            full
            onClick={() => (state.kind === 'prompt' ? void promptInstall() : setStepsOpen(true))}
          >
            📲 Add to home screen
          </Button3D>
          {state.kind === 'steps' && (
            <p className="text-white/50 text-[11px] font-bold mt-2">
              Takes 3 taps — we&apos;ll show you exactly where
            </p>
          )}
        </div>
      </motion.div>

      <Sheet open={stepsOpen} onClose={() => setStepsOpen(false)} title="Add to home screen">
        <ol className="flex flex-col gap-3">
          {INSTALL_STEPS[platform].map((instruction, i) => (
            <li key={instruction} className="flex items-start gap-3">
              <span
                className="shrink-0 h-7 w-7 rounded-full bg-gradient-to-b from-sun to-ember
                           text-[#431407] font-display font-extrabold text-sm
                           flex items-center justify-center"
              >
                {i + 1}
              </span>
              <span className="text-ink-soft text-sm pt-1">{instruction}</span>
            </li>
          ))}
        </ol>
        <p className="text-ink-faint text-xs mt-4">
          Installing just puts PennyPlay one tap away — your budget stays exactly where it is.
        </p>
        <Button3D full className="mt-4" onClick={() => setStepsOpen(false)}>
          Got it
        </Button3D>
      </Sheet>
    </>
  )
}
