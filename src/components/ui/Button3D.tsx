import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'lime' | 'coral' | 'aqua' | 'gold' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-violet-soft to-violet text-white border-b-violet-deep shadow-glow-violet',
  lime:
    'bg-gradient-to-b from-lime to-lime-deep text-[#1a2e05] border-b-[#3f6212] shadow-glow-lime',
  coral:
    'bg-gradient-to-b from-[#ff8ba0] to-coral text-white border-b-coral-deep',
  aqua:
    'bg-gradient-to-b from-[#67e8f9] to-aqua text-[#083344] border-b-aqua-deep shadow-glow-aqua',
  gold:
    'bg-gradient-to-b from-sun to-ember text-[#431407] border-b-[#c2410c] shadow-glow-gold',
  ghost:
    'bg-card text-ink border-b-edge-strong border border-edge',
}

const SIZES: Record<Size, string> = {
  sm: 'px-4 py-2 text-sm rounded-2xl border-b-[4px]',
  md: 'px-6 py-3.5 text-base rounded-2xl border-b-[5px]',
  lg: 'px-8 py-4 text-lg rounded-3xl border-b-[6px]',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  full?: boolean
  children: ReactNode
}

/**
 * The chunky pressable game button: thick bottom border gives a 3D edge,
 * and the button physically depresses on tap.
 */
export function Button3D({
  variant = 'primary',
  size = 'md',
  full = false,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      className={[
        'relative font-display font-extrabold tracking-wide no-select',
        'transition-all duration-75 select-none',
        'active:translate-y-[3px] active:border-b-[1px]',
        'disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        full ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
