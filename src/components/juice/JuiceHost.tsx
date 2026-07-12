/**
 * JuiceHost — consumes the juice queue and turns app events into joy:
 * confetti bursts, coin rain, XP toasts, badge pops, level-up and boss
 * celebration overlays. Mounted once at the app root.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import confetti from 'canvas-confetti'
import { useJuiceStore, type JuiceEvent } from '../../state/juiceStore'
import { playChime, playCoin, playLevelUp } from '../../lib/sound'
import { Button3D } from '../ui/Button3D'
import { Randy, RANDY_LOGO_SRC } from '../ui/Randy'
import { RankCrest } from '../ui/RankCrest'
import { formatRands } from '../../lib/money'

let coinShape: confetti.Shape | null = null
function getCoinShape(): confetti.Shape | null {
  try {
    coinShape ??= confetti.shapeFromPath(
      'M12,0C5.4,0,0,5.4,0,12s5.4,12,12,12s12-5.4,12-12S18.66,0,12,0z',
    )
    return coinShape
  } catch {
    return null
  }
}

function burst() {
  void confetti({
    particleCount: 90,
    spread: 75,
    startVelocity: 42,
    origin: { y: 0.7 },
    colors: ['#7C3AED', '#A3E635', '#22D3EE', '#FF5C7A', '#FACC15'],
    disableForReducedMotion: true,
  })
}

function coinRain() {
  const shape = getCoinShape()
  for (let i = 0; i < 5; i++) {
    setTimeout(() => {
      void confetti({
        particleCount: 7,
        angle: 90,
        spread: 50,
        startVelocity: 18,
        gravity: 1.1,
        ticks: 260,
        scalar: 1.6,
        origin: { x: 0.15 + Math.random() * 0.7, y: -0.05 },
        shapes: shape ? [shape] : undefined,
        colors: ['#FFD700', '#FFE679', '#E8A80C', '#FFF3B0'],
        disableForReducedMotion: true,
      })
    }, i * 120)
  }
  spawnRandyCoinRain()
}

function spawnRandyCoinRain() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const host = document.getElementById('root')
  if (!host) return
  for (let i = 0; i < 8; i++) {
    setTimeout(() => {
      const img = document.createElement('img')
      img.src = RANDY_LOGO_SRC
      img.alt = ''
      img.draggable = false
      const size = 28 + Math.random() * 18
      img.style.cssText = [
        'position:fixed',
        'z-index:9999',
        'pointer-events:none',
        `left:${10 + Math.random() * 80}vw`,
        'top:-48px',
        `width:${size}px`,
        `height:${size}px`,
        'object-fit:contain',
        'transition:transform 2.4s linear, opacity 2.4s ease-in',
        'transform:translateY(110vh) rotate(360deg)',
        'opacity:0',
      ].join(';')
      host.appendChild(img)
      requestAnimationFrame(() => {
        img.style.opacity = '1'
      })
      window.setTimeout(() => img.remove(), 2600)
    }, i * 90)
  }
}

function fireworks() {
  const end = Date.now() + 1200
  const frame = () => {
    void confetti({
      particleCount: 8,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.8 },
      colors: ['#FFD700', '#A3E635', '#22D3EE'],
      disableForReducedMotion: true,
    })
    void confetti({
      particleCount: 8,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.8 },
      colors: ['#7C3AED', '#FF5C7A', '#FACC15'],
      disableForReducedMotion: true,
    })
    if (Date.now() < end) requestAnimationFrame(frame)
  }
  frame()
}

interface Toast {
  id: number
  content: string
  tone: 'lime' | 'gold' | 'aqua'
}

let toastId = 0

export function JuiceHost() {
  const queue = useJuiceStore((s) => s.queue)
  const shift = useJuiceStore((s) => s.shift)
  const [overlay, setOverlay] = useState<JuiceEvent | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const processing = useRef(false)

  function addToast(content: string, tone: Toast['tone'] = 'lime') {
    const id = ++toastId
    setToasts((t) => [...t.slice(-2), { id, content, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2200)
  }

  useEffect(() => {
    if (queue.length === 0 || overlay || processing.current) return
    processing.current = true
    const event = shift()
    processing.current = false
    if (!event) return

    switch (event.kind) {
      case 'xp':
        addToast(`+${event.amount} XP`, 'lime')
        break
      case 'coins':
        coinRain()
        playCoin()
        break
      case 'confetti':
        burst()
        playChime()
        break
      case 'freeze':
        addToast(event.used ? '🧊 Streak freeze used!' : '🧊 Streak freeze earned!', 'aqua')
        break
      case 'badge':
        addToast(`${event.badge.emoji} Badge unlocked: ${event.badge.name}`, 'gold')
        burst()
        playChime()
        break
      case 'milestone':
        if (event.pct >= 100) {
          setOverlay(event)
          fireworks()
          playLevelUp()
        } else {
          addToast(`${event.goal.icon} ${event.goal.name}: ${event.pct}% there!`, 'aqua')
          burst()
          playChime()
        }
        break
      case 'levelup':
        setOverlay(event)
        burst()
        playLevelUp()
        break
      case 'boss':
        setOverlay(event)
        fireworks()
        playLevelUp()
        break
    }
  }, [queue, overlay, shift])

  const toneClasses: Record<Toast['tone'], string> = {
    lime: 'bg-gradient-to-r from-lime to-emerald text-[#1a2e05] shadow-glow-lime',
    gold: 'bg-gradient-to-r from-sun to-gold text-[#431407] shadow-glow-gold',
    aqua: 'bg-gradient-to-r from-aqua to-[#67e8f9] text-[#083344] shadow-glow-aqua',
  }

  return (
    <>
      {/* XP / badge toasts */}
      <div className="fixed top-4 inset-x-0 z-[60] flex flex-col items-center gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ y: -30, opacity: 0, scale: 0.8 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -20, opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className={`px-4 py-2 rounded-full font-display font-extrabold text-sm ${toneClasses[toast.tone]}`}
            >
              {toast.content}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Full-screen celebrations */}
      <AnimatePresence>
        {overlay && (
          <motion.div
            className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.5, y: 40 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="bg-card border-2 border-edge border-b-8 border-b-edge-strong rounded-[28px]
                         p-8 max-w-sm w-full text-center flex flex-col items-center gap-4"
            >
              {overlay.kind === 'levelup' && (
                <>
                  <motion.div
                    initial={{ rotate: -12, scale: 0 }}
                    animate={{ rotate: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200, damping: 12, delay: 0.15 }}
                    className="w-24 h-24 rounded-[28px] bg-gradient-to-b from-violet-soft to-violet
                               border-b-8 border-violet-deep shadow-glow-violet
                               flex items-center justify-center"
                  >
                    <RankCrest crest={overlay.rank.crest} size={56} />
                  </motion.div>
                  <div>
                    <p className="font-display font-extrabold text-3xl text-gradient-gold animate-shimmer">
                      Level {overlay.level}!
                    </p>
                    <p className="font-display font-bold text-ink-soft mt-1">{overlay.rank.name}</p>
                  </div>
                  {overlay.unlockedTheme && (
                    <p className="text-sm text-aqua font-bold">
                      🎨 New app theme unlocked — grab it in Profile!
                    </p>
                  )}
                </>
              )}

              {overlay.kind === 'boss' && (
                <>
                  <motion.div
                    initial={{ scale: 1.6, rotate: 8 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 160, damping: 10 }}
                    className="w-24 h-24 rounded-[28px] bg-gradient-to-b from-sun to-gold
                               border-b-8 border-[#b45309] shadow-glow-gold
                               flex items-center justify-center text-[52px] leading-none select-none"
                  >
                    🐲
                  </motion.div>
                  <p className="font-display font-extrabold text-3xl text-gradient-gold animate-shimmer">
                    Boss defeated!
                  </p>
                  <p className="text-ink-soft text-sm">
                    You beat the budget — savings target hit. Rand Royalty material, honestly.
                  </p>
                  <Randy mood="celebrating" size={90} />
                </>
              )}

              {overlay.kind === 'milestone' && (
                <>
                  <div
                    className="w-24 h-24 rounded-[28px] bg-gradient-to-b from-[#67e8f9] to-aqua
                               border-b-8 border-aqua-deep shadow-glow-aqua
                               flex items-center justify-center text-[52px] leading-none select-none"
                  >
                    {overlay.goal.icon}
                  </div>
                  <p className="font-display font-extrabold text-2xl text-gradient-win">
                    {overlay.goal.name} — done!
                  </p>
                  <p className="text-ink-soft text-sm">
                    {formatRands(overlay.goal.targetCents)} saved. Goal complete. 🎆
                  </p>
                  <Randy mood="celebrating" size={90} />
                </>
              )}

              <Button3D variant="gold" full onClick={() => setOverlay(null)}>
                Continue
              </Button3D>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
