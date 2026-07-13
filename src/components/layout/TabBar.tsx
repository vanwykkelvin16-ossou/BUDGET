import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

const TABS = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/quests', icon: '🎯', label: 'Quests' },
  { to: '/goals', icon: '🏆', label: 'Savings' },
  { to: '/profile', icon: '👤', label: 'Profile' },
]

/** Bottom tab bar with the oversized bouncing Add FAB in the middle. */
export function TabBar() {
  const navigate = useNavigate()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-md
                 bg-card/95 backdrop-blur border-t-2 border-edge
                 pb-[max(env(safe-area-inset-bottom),8px)]"
    >
      <div className="relative grid grid-cols-5 items-center px-2 pt-2">
        {TABS.slice(0, 2).map((tab) => (
          <Tab key={tab.to} {...tab} />
        ))}

        {/* FAB */}
        <div className="relative flex justify-center">
          <motion.button
            onClick={() => navigate('/add')}
            whileTap={{ scale: 0.88, y: 3 }}
            className="absolute -top-9 w-16 h-16 rounded-full font-display text-3xl text-white
                       bg-gradient-to-b from-violet-soft via-violet to-aqua-deep
                       border-b-[6px] border-violet-deep shadow-glow-violet
                       animate-bounce-fab flex items-center justify-center"
            aria-label="Add transaction"
          >
            +
          </motion.button>
          <span className="h-12" />
        </div>

        {TABS.slice(2).map((tab) => (
          <Tab key={tab.to} {...tab} />
        ))}
      </div>
    </nav>
  )
}

function Tab({ to, icon, label }: { to: string; icon: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'flex flex-col items-center gap-0.5 py-1.5 mx-1 rounded-2xl font-display font-bold text-[11px] transition-colors',
          isActive
            ? 'text-accent-soft bg-accent/10 border border-accent/25'
            : 'text-ink-faint grayscale opacity-75 border border-transparent',
        ].join(' ')
      }
    >
      <span className="text-[22px] leading-none">{icon}</span>
      {label}
    </NavLink>
  )
}
