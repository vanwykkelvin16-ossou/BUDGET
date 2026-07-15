/**
 * Privacy policy — required by the app stores. Short and true: PennyPlay
 * keeps money data on the device unless the owner wires up their own
 * Supabase backend; Plus payments go through PayFast.
 */

import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Who we are',
    body: 'PennyPlay is operated by Kelvin Van Wyk. Contact: vanwykkelvin16@gmail.com',
  },
  {
    title: 'Your money data stays on your device',
    body: 'Everything you type into PennyPlay — income, spending, savings, goals — is stored locally on your phone or browser by default. Nothing is sent to us or to anyone else unless optional cloud sync is enabled for that copy of the app.',
  },
  {
    title: 'No tracking, no ads, no selling data',
    body: 'PennyPlay has no analytics trackers, no advertising and no data brokers. We cannot sell what we never collect.',
  },
  {
    title: 'Optional cloud sync & accounts',
    body: 'If the app is connected to a Supabase backend (a setting made by the person who runs this copy of the app), your account and budget data are stored in that database, protected so only your signed-in account can read it. Account signup may include name, surname, username, email and phone. You can delete on-device data at any time by resetting the app.',
  },
  {
    title: 'PennyPlay Plus payments',
    body: 'Yearly Plus membership is checked out through PayFast (South Africa). PennyPlay does not store your card numbers. PayFast processes the payment and may hold payment details under its own privacy policy. We may keep a record that a payment succeeded so we can unlock your membership year.',
  },
  {
    title: 'Hosting',
    body: 'When you use the web or installable PWA, pages and the service worker may be served from the live PennyPlay host (for example Vercel). That host may process standard technical request logs (IP address, user agent) as part of delivering the site — not for advertising.',
  },
  {
    title: 'Notifications',
    body: 'Nudges (pay-day, overspend, streak reminders) are generated on your device. Turning them on only asks your browser or phone for permission — no notification data leaves the device.',
  },
  {
    title: 'Deleting your data',
    body: 'Profile → Reset all data wipes everything PennyPlay stores on the device, instantly and permanently. If you used cloud sync, also delete or request deletion of your account through the operator if cloud data remains.',
  },
  {
    title: 'Changes',
    body: 'If this policy ever changes, the new version will appear on this page with a new date.',
  },
]

export function Privacy() {
  const profile = useAppStore((s) => s.data.profile)
  const backTo = profile ? '/profile' : '/'

  return (
    <Screen withTabBar={false}>
      <header className="flex items-center gap-3 mb-4">
        <Link
          to={backTo}
          className="w-10 h-10 rounded-2xl bg-card border border-edge border-b-4 border-b-edge-strong
                     font-display font-extrabold flex items-center justify-center"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="font-display font-extrabold text-2xl">Privacy policy</h1>
      </header>
      <p className="text-xs text-ink-faint font-bold mb-4">PennyPlay · last updated 15 July 2026</p>

      <div className="flex flex-col gap-3 pb-8">
        {SECTIONS.map((s) => (
          <Card key={s.title} className="py-4">
            <h2 className="font-display font-extrabold text-sm mb-1">{s.title}</h2>
            <p className="text-xs text-ink-soft leading-relaxed">{s.body}</p>
          </Card>
        ))}
        <p className="text-center text-[10px] text-ink-faint font-bold pt-2">
          Also see the{' '}
          <Link to="/terms" className="underline">
            Terms &amp; conditions
          </Link>
          .
        </p>
      </div>
    </Screen>
  )
}
