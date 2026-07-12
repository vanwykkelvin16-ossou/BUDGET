/**
 * Profile: level crest, XP, streaks, trophy cabinet link, theme unlocks,
 * settings and the Phase-2 coming-soon stubs.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { levelProgress, RANKS, unlockedThemes } from '../lib/gamification/levels'
import { BADGE_DEFS } from '../lib/gamification/badges'
import { displayStreak } from '../lib/gamification/streaks'
import { todaySAST } from '../lib/dates'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'
import { Button3D } from '../components/ui/Button3D'
import { ProgressBar } from '../components/ui/ProgressBar'
import { Sheet } from '../components/ui/Sheet'
import { Randy } from '../components/ui/Randy'
import { RankCrest } from '../components/ui/RankCrest'
import {
  ensureNotificationPermission,
  loadNotificationPrefs,
  notificationPermission,
  notificationsSupported,
  saveNotificationPrefs,
  showSystemNotification,
  type NotificationPrefs,
} from '../lib/notifications'

const PHASE2 = [
  { icon: '📄', title: 'Bank statement import', blurb: 'Drop a CSV, get everything categorised.' },
  { icon: '👫', title: 'Partner mode', blurb: 'Share a budget without sharing a headache.' },
]

const THEME_SWATCH: Record<string, string> = {
  rookie: '#7C3AED',
  collector: '#84CC16',
  master: '#FF5C7A',
  wizard: '#22D3EE',
  royalty: '#EAB308',
}

export function Profile() {
  const data = useAppStore((s) => s.data)
  const updateProfile = useAppStore((s) => s.updateProfile)
  const resetAll = useAppStore((s) => s.resetAll)
  const [stub, setStub] = useState<(typeof PHASE2)[number] | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [notifyPrefs, setNotifyPrefs] = useState<NotificationPrefs>(loadNotificationPrefs)
  const [notifyBlocked, setNotifyBlocked] = useState(
    () => notificationPermission() === 'denied',
  )
  const [testSent, setTestSent] = useState(false)

  async function changeNotify(patch: Partial<NotificationPrefs>) {
    let next = { ...notifyPrefs, ...patch }
    if (patch.enabled) {
      const granted = await ensureNotificationPermission()
      setNotifyBlocked(notificationPermission() === 'denied')
      if (!granted) next = { ...next, enabled: false }
    }
    setNotifyPrefs(next)
    saveNotificationPrefs(next)
  }

  async function sendTestNotification() {
    const ok = await showSystemNotification({
      key: `test:${Date.now()}`,
      title: '🪙 PennyPlay is on the job',
      body: "This is what a nudge looks like. You'll only get ones that matter.",
    })
    setTestSent(ok)
    window.setTimeout(() => setTestSent(false), 2500)
  }

  const profile = data.profile
  const progress = useMemo(() => levelProgress(profile?.xp ?? 0), [profile?.xp])
  if (!profile) return null

  const today = todaySAST()
  const streak = displayStreak(profile, today)
  const unlocked = new Set(unlockedThemes(progress.level))
  const badgeCount = data.userBadges.length

  return (
    <Screen>
      <h1 className="font-display font-extrabold text-2xl mb-4">Profile</h1>

      {/* Crest card */}
      <Card glow="violet" className="flex items-center gap-4 mb-4">
        <div
          className="w-20 h-20 rounded-[24px] bg-gradient-to-b from-violet-soft to-violet
                     border-b-8 border-violet-deep shadow-glow-violet
                     flex flex-col items-center justify-center shrink-0"
        >
          <RankCrest crest={progress.rank.crest} size={36} />
          <span className="font-display font-extrabold text-xs text-white">LV{progress.level}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-extrabold text-lg truncate">
            {profile.displayName} {profile.surname}
            {profile.username && (
              <span className="text-accent-soft font-body font-bold text-xs ml-1.5 align-middle">
                @{profile.username}
              </span>
            )}
          </h2>
          <p className="text-xs text-ink-soft mb-1.5">
            {progress.rank.name} · {profile.xp.toLocaleString()} XP
            {progress.nextRank && <> · next: {progress.nextRank.name}</>}
          </p>
          <ProgressBar pct={progress.pct} height={10} fillClassName="bg-gradient-to-r from-lime to-emerald" />
        </div>
      </Card>

      {/* Streak stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="text-center py-3">
          <p className="font-display font-extrabold text-xl">🔥 {streak.count}</p>
          <p className="text-[10px] text-ink-faint font-bold">day streak</p>
        </Card>
        <Card className="text-center py-3">
          <p className="font-display font-extrabold text-xl">🏅 {profile.longestStreak}</p>
          <p className="text-[10px] text-ink-faint font-bold">longest</p>
        </Card>
        <Card className="text-center py-3">
          <p className="font-display font-extrabold text-xl">🧊 {profile.streakFreezes}</p>
          <p className="text-[10px] text-ink-faint font-bold">freezes</p>
        </Card>
      </div>

      {/* Links */}
      <div className="flex flex-col gap-2 mb-5">
        <Link to="/profile/trophies">
          <Card className="flex items-center justify-between py-3">
            <span className="font-display font-extrabold text-sm">
              🏆 Trophy cabinet
              <span className="ml-2 text-xs text-gold font-bold">
                {badgeCount}/{BADGE_DEFS.length}
              </span>
            </span>
            <span className="text-ink-faint">→</span>
          </Card>
        </Link>
        <Link to="/insights">
          <Card className="flex items-center justify-between py-3">
            <span className="font-display font-extrabold text-sm">📊 Insights</span>
            <span className="text-ink-faint">→</span>
          </Card>
        </Link>
        <Link to="/months">
          <Card className="flex items-center justify-between py-3">
            <span className="font-display font-extrabold text-sm">📆 Month tracker</span>
            <span className="text-ink-faint">→</span>
          </Card>
        </Link>
        <Link to="/wealth">
          <Card className="flex items-center justify-between py-3">
            <span className="font-display font-extrabold text-sm">💎 Annual view & net worth</span>
            <span className="text-ink-faint">→</span>
          </Card>
        </Link>
        <Link to="/profile/settings">
          <Card className="flex items-center justify-between py-3">
            <span className="font-display font-extrabold text-sm">⚙️ Budget settings</span>
            <span className="text-ink-faint">→</span>
          </Card>
        </Link>
      </div>

      {/* Theme picker */}
      <h2 className="font-display font-extrabold text-lg mb-2">App themes</h2>
      <Card className="mb-5">
        <div className="flex justify-between gap-2">
          {RANKS.map((rank) => {
            const isUnlocked = unlocked.has(rank.themeId)
            const isActive = profile.themeId === rank.themeId
            return (
              <button
                key={rank.themeId}
                disabled={!isUnlocked}
                onClick={() => void updateProfile({ themeId: rank.themeId })}
                className={[
                  'flex flex-col items-center gap-1 flex-1 py-2 rounded-2xl border-2 transition-all',
                  isActive ? 'border-ink bg-bg-deep' : 'border-transparent',
                  isUnlocked ? '' : 'opacity-35 grayscale',
                ].join(' ')}
                title={isUnlocked ? rank.name : `Unlocks at ${rank.name} (level ${rank.minLevel})`}
              >
                <span
                  className="w-8 h-8 rounded-full border-b-4"
                  style={{ background: THEME_SWATCH[rank.themeId], borderColor: '#00000055' }}
                />
                <RankCrest crest={isUnlocked ? rank.crest : '🔒'} size={18} />
              </button>
            )
          })}
        </div>
        <p className="text-[10px] text-ink-faint font-bold text-center mt-2">
          Level up to unlock new accent themes
        </p>
      </Card>

      {/* Preferences */}
      <h2 className="font-display font-extrabold text-lg mb-2">Preferences</h2>
      <Card className="mb-5 flex flex-col divide-y divide-edge">
        <ToggleRow
          label="🔊 Sounds"
          value={profile.soundEnabled}
          onChange={(v) => void updateProfile({ soundEnabled: v })}
        />
        <ToggleRow
          label="🌙 Dark mode (the hero mode)"
          value={profile.darkMode}
          onChange={(v) => void updateProfile({ darkMode: v })}
        />
      </Card>

      {/* Notifications */}
      <h2 className="font-display font-extrabold text-lg mb-2">Nudges &amp; alerts</h2>
      <Card className="mb-5 flex flex-col divide-y divide-edge">
        {notificationsSupported() ? (
          <>
            <ToggleRow
              label="🔔 Allow notifications"
              value={notifyPrefs.enabled}
              onChange={(v) => void changeNotify({ enabled: v })}
            />
            {notifyBlocked && (
              <p className="text-xs text-coral font-bold py-2.5">
                Notifications are blocked for this site in your browser settings — allow them
                there, then flip the switch again.
              </p>
            )}
            {notifyPrefs.enabled && (
              <>
                <ToggleRow
                  label="💰 Pay day alert"
                  value={notifyPrefs.paydayAlert}
                  onChange={(v) => void changeNotify({ paydayAlert: v })}
                />
                <ToggleRow
                  label="🚨 Overspend warning"
                  value={notifyPrefs.overspendAlert}
                  onChange={(v) => void changeNotify({ overspendAlert: v })}
                />
                <ToggleRow
                  label="🔥 Streak rescue (after 17:00)"
                  value={notifyPrefs.streakAlert}
                  onChange={(v) => void changeNotify({ streakAlert: v })}
                />
                <ToggleRow
                  label="📝 Evening log reminder (19:00)"
                  value={notifyPrefs.dailyReminder}
                  onChange={(v) => void changeNotify({ dailyReminder: v })}
                />
                <div className="py-2.5">
                  <Button3D variant="ghost" size="sm" full onClick={() => void sendTestNotification()}>
                    {testSent ? 'Sent ✓ — check your notifications' : 'Send a test nudge'}
                  </Button3D>
                </div>
              </>
            )}
            <p className="text-[10px] text-ink-faint font-bold py-2.5">
              Nudges show while PennyPlay is open or installed on your phone. Everything stays on
              this device.
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-faint font-bold py-2.5">
            This browser doesn't support notifications — install PennyPlay to your home screen to
            get nudges.
          </p>
        )}
      </Card>

      {/* Phase 2 stubs */}
      <h2 className="font-display font-extrabold text-lg mb-2">Coming soon</h2>
      <div className="flex flex-col gap-2 mb-6">
        {PHASE2.map((item) => (
          <button key={item.title} onClick={() => setStub(item)} className="text-left">
            <Card className="flex items-center gap-3 py-3">
              <span className="text-xl">{item.icon}</span>
              <span className="font-display font-extrabold text-sm flex-1">{item.title}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet/20 text-violet-soft font-bold uppercase">
                soon
              </span>
            </Card>
          </button>
        ))}
      </div>

      <Button3D variant="ghost" full onClick={() => setConfirmReset(true)}>
        {profile.isDemo ? '🚪 Exit demo & start fresh' : '🗑️ Reset all data'}
      </Button3D>
      <p className="text-center text-[10px] text-ink-faint font-bold mt-4">
        PennyPlay · your money stays on this device{' '}
        {profile.isDemo ? '· demo data' : ''}
      </p>

      {/* Coming-soon sheet */}
      <Sheet open={stub !== null} onClose={() => setStub(null)} title={stub?.title}>
        <div className="flex flex-col items-center text-center gap-3 pb-2">
          <Randy mood="wink" size={90} />
          <p className="text-sm text-ink-soft max-w-[32ch]">
            {stub?.blurb} Randy's polishing this one — it's on the roadmap for the next season.
          </p>
          <Button3D full onClick={() => setStub(null)}>
            Can't wait
          </Button3D>
        </div>
      </Sheet>

      {/* Reset confirm */}
      <Sheet open={confirmReset} onClose={() => setConfirmReset(false)} title="Start over?">
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            This wipes {profile.isDemo ? 'the demo data' : 'ALL your data on this device'} and takes
            you back to onboarding. No undo.
          </p>
          <Button3D variant="coral" full onClick={() => void resetAll()}>
            Yes, wipe it
          </Button3D>
          <Button3D variant="ghost" full onClick={() => setConfirmReset(false)}>
            Keep my stuff
          </Button3D>
        </div>
      </Sheet>
    </Screen>
  )
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="font-bold text-sm">{label}</span>
      <button
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`w-12 h-7 rounded-full border-2 transition-colors relative ${
          value ? 'bg-lime/70 border-lime' : 'bg-bg-deep border-edge-strong'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
            value ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  )
}
