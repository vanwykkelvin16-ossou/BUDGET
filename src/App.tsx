import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAppStore } from './state/appStore'
import { STORAGE_KEY } from './lib/data/store'
import { runNotificationSweep } from './lib/notifications'
import { captureIncomingRef } from './lib/referral'

// A share link (?ref=CODE) may land on any route — remember whose it was
// before the router strips the query.
captureIncomingRef()
import { TabBar } from './components/layout/TabBar'
import { JuiceHost } from './components/juice/JuiceHost'
import { PlusGate } from './components/PlusGate'
import { Randy } from './components/ui/Randy'
import { hydrateMembershipFromServer } from './lib/membershipSync'
import { syncReferralRewards } from './lib/referral'

import { Auth } from './screens/Auth'
import { Onboarding } from './screens/Onboarding'
import { Dashboard } from './screens/Dashboard'
import { AddTransaction } from './screens/AddTransaction'
import { Quests } from './screens/Quests'
import { Goals } from './screens/Goals'
import { Profile } from './screens/Profile'
import { Insights } from './screens/Insights'
import { Months } from './screens/Months'
import { Wealth } from './screens/Wealth'
import { TrophyCabinet } from './screens/TrophyCabinet'
import { SeasonRecap } from './screens/SeasonRecap'
import { Settings } from './screens/Settings'
import { Privacy } from './screens/Privacy'
import { Plus } from './screens/Plus'

export function App() {
  const loaded = useAppStore((s) => s.loaded)
  const needsAuth = useAppStore((s) => s.needsAuth)
  const data = useAppStore((s) => s.data)
  const profile = data.profile
  const init = useAppStore((s) => s.init)
  const location = useLocation()

  useEffect(() => {
    void init()
  }, [init])

  // After auth/onboarding: mirror Plus membership + referral unlocks from
  // Supabase so the 35s gate and /plus screen see the server truth.
  useEffect(() => {
    if (!loaded || !profile || profile.isDemo) return
    void hydrateMembershipFromServer()
    void syncReferralRewards()
  }, [loaded, profile])

  // Every navigation lands at the top of the new screen — no inherited
  // scroll position from the page you came from.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  // Keep the data live: pick up edits from other tabs the moment they
  // persist, and roll housekeeping over when the SAST day changes while
  // the app is open (recurring items, day-close XP, fresh Safe-to-Spend).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) void useAppStore.getState().syncExternal()
    }
    const onWake = () =>
      void useAppStore
        .getState()
        .rolloverIfNewDay()
        .then(() => runNotificationSweep(useAppStore.getState().data))
    const tick = window.setInterval(onWake, 30_000)
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', onWake)
      document.removeEventListener('visibilitychange', onWake)
    }
  }, [])

  // Nudge engine: an idempotent sweep on every ledger change means the
  // overspend warning lands the moment the tipping expense is logged.
  useEffect(() => {
    if (loaded && data.profile) void runNotificationSweep(data)
  }, [loaded, data])

  // Apply theme + dark mode to <html> whenever the profile changes.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = profile?.themeId ?? 'rookie'
    root.classList.toggle('light', profile ? !profile.darkMode : false)
    root.classList.toggle('dark', profile ? profile.darkMode : true)
  }, [profile?.themeId, profile?.darkMode, profile])

  if (!loaded) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
        <Randy mood="happy" size={110} className="animate-pop-in" />
        <p className="font-display font-extrabold text-xl text-gradient-violet">PennyPlay</p>
      </div>
    )
  }

  if (needsAuth) {
    return <Auth />
  }

  if (!profile) {
    return (
      <>
        <Routes>
          {/* Store reviewers open the policy URL cold — no profile needed. */}
          <Route path="/privacy" element={<Privacy />} />
          <Route path="*" element={<Onboarding />} />
        </Routes>
        <JuiceHost />
      </>
    )
  }

  const fullScreen = location.pathname === '/add' || location.pathname === '/recap'

  return (
    <>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/add" element={<AddTransaction />} />
        <Route path="/quests" element={<Quests />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/trophies" element={<TrophyCabinet />} />
        <Route path="/profile/settings" element={<Settings />} />
        <Route path="/insights" element={<Insights />} />
        <Route path="/months" element={<Months />} />
        <Route path="/wealth" element={<Wealth />} />
        <Route path="/recap" element={<SeasonRecap />} />
        <Route path="/plus" element={<Plus />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!fullScreen && <TabBar />}
      <JuiceHost />
      <PlusGate />
    </>
  )
}
