/**
 * Privacy policy — required by the app stores. Short and true: PennyPlay
 * keeps money data on the device unless the owner wires up their own
 * Supabase backend.
 */

import { Link } from 'react-router-dom'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Your money data stays on your device',
    body: 'Everything you type into PennyPlay — income, spending, savings, goals — is stored locally on your phone or browser. By default nothing is sent to us or to anyone else.',
  },
  {
    title: 'No tracking, no ads, no selling data',
    body: 'PennyPlay has no analytics trackers, no advertising and no data brokers. We cannot sell what we never collect.',
  },
  {
    title: 'Optional cloud sync',
    body: 'If the app is connected to a Supabase backend (a setting made by the person who runs this copy of the app), your account data is stored in that database, protected so only your signed-in account can read it. You can delete it at any time by resetting the app.',
  },
  {
    title: 'Notifications',
    body: 'Nudges (pay-day, overspend, streak reminders) are generated on your device. Turning them on only asks your browser or phone for permission — no notification data leaves the device.',
  },
  {
    title: 'Deleting your data',
    body: 'Profile → Reset all data wipes everything PennyPlay stores on the device, instantly and permanently.',
  },
  {
    title: 'Changes',
    body: 'If this policy ever changes, the new version will appear on this page with a new date.',
  },
]

export function Privacy() {
  return (
    <Screen withTabBar={false}>
      <header className="flex items-center gap-3 mb-4">
        <Link
          to="/profile"
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     font-display font-extrabold flex items-center justify-center"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="font-display font-extrabold text-2xl">Privacy policy</h1>
      </header>
      <p className="text-xs text-ink-faint font-bold mb-4">PennyPlay · last updated 13 July 2026</p>

      <div className="flex flex-col gap-3 pb-8">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="py-4">
            <h2 className="font-display font-extrabold text-sm mb-1">{s.title}</h2>
            <p className="text-xs text-ink-soft leading-relaxed">{s.body}</p>
          </Card>
        ))}
      </div>
    </Screen>
  )
}
