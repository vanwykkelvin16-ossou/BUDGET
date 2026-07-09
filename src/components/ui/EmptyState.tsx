import type { ReactNode } from 'react'
import { Randy, type RandyMood } from './Randy'

interface Props {
  mood?: RandyMood
  title: string
  message: string
  action?: ReactNode
}

/** Randy-fronted empty state. */
export function EmptyState({ mood = 'happy', title, message, action }: Props) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6 gap-3">
      <Randy mood={mood} size={110} className="animate-pop-in" />
      <h3 className="font-display font-extrabold text-lg">{title}</h3>
      <p className="text-ink-soft text-sm max-w-[26ch]">{message}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
