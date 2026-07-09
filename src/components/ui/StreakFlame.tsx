interface Props {
  count: number
  aliveToday: boolean
  atRisk: boolean
  freezes: number
}

/** Daily streak flame counter. Grey when dead, blazing when alive. */
export function StreakFlame({ count, aliveToday, atRisk, freezes }: Props) {
  const active = count > 0
  return (
    <div
      className={[
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border-b-4 font-display font-extrabold',
        active
          ? 'bg-gradient-to-b from-[#43285c] to-[#38204f] border-[#2a1740] text-ink'
          : 'bg-card border-edge-strong text-ink-faint',
      ].join(' ')}
      title={
        atRisk
          ? 'Log something today to keep your streak!'
          : `${count}-day logging streak · ${freezes} freeze${freezes === 1 ? '' : 's'} banked`
      }
    >
      <span className={active && aliveToday ? 'animate-flame inline-block' : 'grayscale opacity-60'}>
        🔥
      </span>
      <span className={atRisk ? 'text-ember' : ''}>{count}</span>
      {freezes > 0 && (
        <span className="text-xs opacity-80" title={`${freezes} streak freeze banked`}>
          🧊{freezes}
        </span>
      )}
    </div>
  )
}
