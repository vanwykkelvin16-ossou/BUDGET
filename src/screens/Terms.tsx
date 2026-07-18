/**
 * Terms and Conditions — required for app stores and Plus checkout.
 * Plain language matched to how PennyPlay actually works.
 */

import { Link } from 'react-router-dom'
import { useAppStore } from '../state/appStore'
import { Screen } from '../components/layout/Screen'
import { Card } from '../components/ui/Card'

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'Agreement',
    body: 'By using PennyPlay you agree to these Terms and our Privacy Policy. If you do not agree, do not use the app. PennyPlay is operated by Kelvin Van Wyk.',
  },
  {
    title: 'What PennyPlay is',
    body: 'PennyPlay is a personal budgeting app for ZAR (South African rand) with game-style features — safe-to-spend numbers, goals, quests, XP and streaks. It is a self-tracking tool only. It is not financial, tax, investment or legal advice, and it is not a bank or payment account.',
  },
  {
    title: 'How you use it',
    body: 'You may use PennyPlay for your own household budgeting. Keep login details private when accounts are enabled. Do not misuse the service, attempt to break security, or use it for anything unlawful.',
  },
  {
    title: 'Your data stays local by default',
    body: 'Income, spending, savings and goals you enter are stored on your device unless the copy of the app is connected to a Supabase backend. That optional cloud mode is controlled by whoever runs the deployment — see the Privacy Policy for details.',
  },
  {
    title: 'PennyPlay Plus',
    body: 'PennyPlay Plus is a paid yearly membership (R200 for twelve months; a referral discount may apply on a first payment). Checkout is through PayFast when merchant keys are configured. There is no auto-renewal — you choose when to pay again. Prices may change for future purchases; an active year already paid stays active until it ends.',
  },
  {
    title: 'Demo mode',
    body: 'Demo mode loads sample data so you can explore the app. It is not your real budget. Exit demo and start fresh before relying on the numbers.',
  },
  {
    title: 'Intellectual property',
    body: 'PennyPlay’s name, Randy the Coin, themes, UI and content belong to Kelvin Van Wyk / PennyPlay. You may not copy, resell or rebrand the app without permission.',
  },
  {
    title: 'Disclaimers',
    body: 'The app is provided “as is”. Budget figures depend on what you enter. We do not guarantee uninterrupted access, perfect calculations for every edge case, or that local storage cannot be cleared by your device or browser. To the fullest extent allowed by South African law, we are not liable for lost data, missed payments, or decisions you make based on the app.',
  },
  {
    title: 'Ending use',
    body: 'You can stop using PennyPlay at any time. Profile → Reset all data wipes what the app stores on the device. If you paid for Plus, that membership does not transfer to another product and is not a bank balance.',
  },
  {
    title: 'Changes',
    body: 'We may update these Terms. The latest version will appear on this page with a new date. Continued use after a change means you accept the updated Terms.',
  },
  {
    title: 'Governing law',
    body: 'These Terms are governed by the laws of the Republic of South Africa. South African courts have jurisdiction over disputes arising from them.',
  },
  {
    title: 'Contact',
    body: 'Questions about these Terms: vanwykkelvin16@gmail.com',
  },
]

export function Terms() {
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
        <h1 className="font-display font-extrabold text-2xl">Terms &amp; conditions</h1>
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
          <Link to="/privacy" className="underline">
            Privacy policy
          </Link>
          .
        </p>
      </div>
    </Screen>
  )
}
