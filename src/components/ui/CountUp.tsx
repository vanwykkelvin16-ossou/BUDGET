import { useEffect, useRef, useState } from 'react'
import { animate } from 'framer-motion'

interface Props {
  value: number
  format?: (v: number) => string
  duration?: number
  className?: string
}

/** Number that counts up/down with a satisfying ease — money as game score. */
export function CountUp({
  value,
  format = (v) => String(v),
  duration = 0.9,
  className,
}: Props) {
  const previous = useRef(0)
  const [display, setDisplay] = useState(() => format(0))

  useEffect(() => {
    const controls = animate(previous.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(format(Math.round(v))),
    })
    previous.current = value
    return () => controls.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{display}</span>
}
