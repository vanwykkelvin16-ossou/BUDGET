import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  action?: ReactNode
}

/** Section heading with the little gradient tick — quiet, modern, consistent. */
export function SectionTitle({ children, action }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-1 h-4 rounded-full bg-gradient-to-b from-accent-soft to-accent shrink-0" />
      <h2 className="font-display font-extrabold text-lg flex-1">{children}</h2>
      {action}
    </div>
  )
}
