import type { Category } from '../../lib/data/types'

interface Props {
  category: Pick<Category, 'icon' | 'color' | 'name'>
  size?: number
  className?: string
}

/** Category icon as a colourful filled circle badge. */
export function CategoryBadge({ category, size = 44, className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        background: `linear-gradient(135deg, ${category.color}33, ${category.color}55)`,
        border: `2px solid ${category.color}88`,
        boxShadow: `0 0 12px ${category.color}44`,
      }}
      aria-hidden
    >
      {category.icon}
    </span>
  )
}
