/**
 * Sound effects synthesised with WebAudio — no audio assets, works offline.
 * All calls are no-ops until enabled and are always triggered by user
 * gestures, so autoplay policies are satisfied.
 */

let enabled = true
let ctx: AudioContext | null = null

export function setSoundEnabled(value: boolean) {
  enabled = value
}

function audio(): AudioContext | null {
  if (!enabled || typeof window === 'undefined') return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function blip(
  ac: AudioContext,
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = 'sine',
  gainPeak = 0.12,
) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime + start)
  gain.gain.setValueAtTime(0, ac.currentTime + start)
  gain.gain.linearRampToValueAtTime(gainPeak, ac.currentTime + start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration)
  osc.connect(gain).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + duration + 0.05)
}

/** Coin drop: two quick rising pings. */
export function playCoin() {
  const ac = audio()
  if (!ac) return
  blip(ac, 987, 0, 0.09, 'triangle', 0.14) // B5
  blip(ac, 1318, 0.07, 0.22, 'triangle', 0.12) // E6
}

/** Soft click for number pad taps. */
export function playTap() {
  const ac = audio()
  if (!ac) return
  blip(ac, 640, 0, 0.04, 'square', 0.03)
}

/** Positive chime for claims and completions. */
export function playChime() {
  const ac = audio()
  if (!ac) return
  blip(ac, 659, 0, 0.14, 'sine', 0.1) // E5
  blip(ac, 831, 0.09, 0.16, 'sine', 0.1) // G#5
  blip(ac, 988, 0.18, 0.28, 'sine', 0.11) // B5
}

/** Level-up fanfare arpeggio. */
export function playLevelUp() {
  const ac = audio()
  if (!ac) return
  const notes = [523, 659, 784, 1047, 1319] // C5 E5 G5 C6 E6
  notes.forEach((f, i) => blip(ac, f, i * 0.09, 0.3, 'triangle', 0.12))
  blip(ac, 1568, 0.5, 0.5, 'sine', 0.1)
}

/** Gentle warning wobble (never shame, just a nudge). */
export function playWobble() {
  const ac = audio()
  if (!ac) return
  blip(ac, 330, 0, 0.12, 'sine', 0.07)
  blip(ac, 294, 0.1, 0.18, 'sine', 0.07)
}
