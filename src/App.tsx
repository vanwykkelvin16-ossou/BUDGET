import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAppStore } from './state/appStore'
import { TabBar } from './components/layout/TabBar'
import { JuiceHost } from './components/juice/JuiceHost'
import { Randy } from './components/ui/Randy'

import { Auth } from './screens/Auth'
import { Onboarding } from './screens/Onboarding'
import { Dashboard } from './screens/Dashboard'
import { AddTransaction } from './screens/AddTransaction'
import { Quests } from './screens/Quests'
import { Goals } from './screens/Goals'
import { Profile } from './screens/Profile'
import { Insights } from './screens/Insights'
import { Months } from './screens/Months'
import { TrophyCabinet } from './screens/TrophyCabinet'
import { SeasonRecap } from './screens/SeasonRecap'
import { Settings } from './screens/Settings'

export function App() {
  const loaded = useAppStore((s) => s.loaded)
  const needsAuth = useAppStore((s) => s.needsAuth)
  const profile = useAppStore((s) => s.data.profile)
  const init = useAppStore((s) => s.init)
  const location = useLocation()

  useEffect(() => {
    void init()
  }, [init])

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
        <p className="font-display font-extrabold text-xl text-gradient-violet">Pulse Budget</p>
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
        <Route path="/recap" element={<SeasonRecap />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!fullScreen && <TabBar />}
      <JuiceHost />
    </>
  )
}
