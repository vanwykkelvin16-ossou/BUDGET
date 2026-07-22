/**
 * End-to-end smoke test of the Plus payment flows against a running dev
 * server (npm run dev), in on-device test mode — pricing table, test-mode
 * checkout for both plans, cancel flow, monthly→yearly upgrade, and the
 * 45-second gate (shortened via the pennyplay:gate-seconds override).
 *
 *   npx playwright install chromium   # once
 *   node scripts/e2e-plus.mjs
 */

import { chromium } from 'playwright'
import fs from 'node:fs'

const ART = process.env.E2E_SHOTS_DIR ?? 'e2e-screenshots'
fs.mkdirSync(ART, { recursive: true })
const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5173'

const results = []
function check(name, ok, extra = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.setDefaultTimeout(15000)

// ---------- Part 1: demo mode → pricing page → test checkout ----------
await page.goto(BASE)
await page.getByText('Try demo mode first').click()
await page.waitForTimeout(1500)
check('demo mode loads dashboard', await page.getByText('Fun money for today').first().isVisible())

await page.goto(BASE + '/plus')
await page.waitForTimeout(800)
check('pricing: free tier card', await page.getByText('Free look').first().isVisible())
check('pricing: monthly card', await page.getByText('Plus Monthly').first().isVisible())
check('pricing: yearly card', await page.getByText('Plus Yearly').first().isVisible())
check('pricing: best value badge', await page.getByText('Best value').first().isVisible())
check('pricing: pros shown', (await page.getByText('Pros', { exact: true }).count()) >= 3)
check('pricing: cons shown', (await page.getByText('Cons', { exact: true }).count()) >= 3)
check('pricing: comparison matrix', await page.getByText('Compare everything').isVisible())
check('pricing: test-mode notice', await page.getByText(/Test mode/).isVisible())
await page.screenshot({ path: `${ART}/plus-pricing-top.png` })
await page.getByText('Compare everything').scrollIntoViewIfNeeded()
await page.screenshot({ path: `${ART}/plus-pricing-matrix.png` })

// Buy monthly in test mode
await page.getByRole('button', { name: /Go monthly/ }).click()
await page.waitForTimeout(800)
check('monthly activates (test mode)', await page.getByText('🌙 Plus Monthly').isVisible())
check('status: days left meter', await page.getByText(/days left/).isVisible())
check('status: upgrade button', await page.getByRole('button', { name: /Upgrade to Yearly/ }).isVisible())
check('status: cancel button', await page.getByRole('button', { name: 'Cancel subscription' }).isVisible())
await page.screenshot({ path: `${ART}/plus-monthly-active.png` })

// Cancel flow
await page.getByRole('button', { name: 'Cancel subscription' }).click()
await page.waitForTimeout(400)
check('cancel sheet opens', await page.getByText('Cancel Plus Monthly?').isVisible())
await page.screenshot({ path: `${ART}/plus-cancel-sheet.png` })
await page.getByRole('button', { name: 'Yes, stop billing' }).click()
await page.waitForTimeout(600)
check('cancelled: ending badge', await page.getByText('ending', { exact: true }).isVisible())
check('cancelled: access until note', await page.getByText(/Auto-billing stopped/).isVisible())
await page.screenshot({ path: `${ART}/plus-monthly-cancelled.png` })

// Upgrade to yearly
await page.getByRole('button', { name: /Upgrade to Yearly/ }).click()
await page.waitForTimeout(800)
check('upgrade: yearly active', await page.getByText('⭐ Plus Yearly').isVisible())
check('upgrade: set-for-year note', await page.getByText(/set for the year/).isVisible())
check('upgrade: pricing table hidden', !(await page.getByText('Pick your plan').isVisible().catch(() => false)))
await page.screenshot({ path: `${ART}/plus-yearly-active.png` })

await browser.close()

// ---------- Part 2: real profile → 45s gate (shortened override) ----------
const b2 = await chromium.launch()
const page2 = await b2.newPage({ viewport: { width: 390, height: 844 } })
page2.setDefaultTimeout(15000)
await page2.goto(BASE)
await page2.evaluate(() => localStorage.setItem('pennyplay:gate-seconds', '2'))
await page2.getByRole('button', { name: 'Set up in 60 seconds' }).click()
await page2.getByPlaceholder('Name', { exact: true }).fill('Testy')
await page2.getByPlaceholder('Surname').fill('McTest')
await page2.getByPlaceholder('Username').fill('testy123')
await page2.getByPlaceholder('you@example.com').fill('testy@example.com')
await page2.getByPlaceholder('082 123 4567').fill('0821234567')
await page2.getByRole('button', { name: "That's me" }).click()
// salary: tap 2 5 0 0 0 on the number pad
for (const d of ['2', '5', '0', '0', '0']) {
  await page2.getByRole('button', { name: d, exact: true }).first().click()
}
await page2.getByRole('button', { name: 'Next', exact: true }).click()
await page2.waitForTimeout(400)
// pay date step → keep default day
await page2.getByRole('button', { name: 'Next', exact: true }).click()
await page2.waitForTimeout(400)
// splits step
await page2.getByRole('button', { name: 'Looks good' }).click()
await page2.waitForTimeout(400)
// done step
await page2.getByRole('button', { name: /Let's go/ }).click()
await page2.waitForTimeout(1500)

// wait for the (shortened) gate
await page2.waitForTimeout(4000)
const gateVisible = await page2.getByText('Your free look around is over').isVisible().catch(() => false)
check('gate appears after grace period', gateVisible)
if (gateVisible) {
  check('gate: yearly button', await page2.getByRole('button', { name: /A year/ }).isVisible())
  check('gate: monthly button', await page2.getByRole('button', { name: /Monthly — / }).isVisible())
  check('gate: compare link', await page2.getByText('Compare the plans in detail').isVisible())
  await page2.screenshot({ path: `${ART}/plus-gate.png` })

  // Compare link → /plus must be reachable (gate never walls it off)
  await page2.getByText('Compare the plans in detail').click()
  await page2.waitForTimeout(800)
  check('gate: /plus reachable', await page2.getByText('Pick your plan').isVisible())
  check('gate hidden on /plus', !(await page2.getByText('Your free look around is over').isVisible().catch(() => false)))

  // Buy yearly from pricing page (test mode) → gate lifts
  await page2.getByRole('button', { name: /Get the year/ }).click()
  await page2.waitForTimeout(800)
  check('yearly purchase unlocks', await page2.getByText('⭐ Plus Yearly').isVisible())
  await page2.goto(BASE + '/')
  await page2.waitForTimeout(4000)
  check('gate stays lifted after payment', !(await page2.getByText('Your free look around is over').isVisible().catch(() => false)))
  await page2.screenshot({ path: `${ART}/dashboard-unlocked.png` })
}

await b2.close()
console.log(results.join('\n'))
