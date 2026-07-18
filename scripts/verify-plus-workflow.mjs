/**
 * End-to-end verification of the PennyPlay Plus subscription workflow
 * against the local dev server (no Supabase / no PayFast → labelled test
 * mode, which exercises the exact same gate + pricing logic).
 *
 * Run:  npm run dev   (in another terminal)
 *       npm run verify:plus
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5173'
const SHOTS = process.env.SHOTS_DIR ?? '/tmp/pennyplay-verify'
fs.mkdirSync(SHOTS, { recursive: true })

let failures = 0
function check(name, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failures++
}

const browser = await chromium.launch()

async function freshPage(gateSeconds) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await page.addInitScript((secs) => {
    if (secs != null) localStorage.setItem('pennyplay:gate-seconds', String(secs))
  }, gateSeconds)
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message))
  return { ctx, page }
}

/* ---------------- Scenario 1: demo mode is hard-gated ---------------- */
{
  const { ctx, page } = await freshPage(4)
  await page.goto(BASE)
  await page.getByText('Try demo mode first').click()
  await page.waitForTimeout(800)

  // Countdown pill visible during the explore window.
  const pill = await page.getByText(/Demo explore · \d+s/).isVisible().catch(() => false)
  check('demo: countdown pill shows during explore window', pill)

  // Can scroll around before the gate.
  const dashboardAlive = await page.getByText(/safe to spend|fun money/i).first().isVisible().catch(() => false)
  check('demo: app is explorable before the gate', dashboardAlive)
  await page.screenshot({ path: `${SHOTS}/01-demo-explore.png` })

  // Wait for the gate to fire.
  await page.waitForTimeout(4500)
  const gateUp = await page.getByText('Unlock the full PennyPlay experience').isVisible().catch(() => false)
  check('demo: subscription pop-up appears after the window', gateUp)

  const keepExploring = await page.getByText('Keep exploring').isVisible().catch(() => false)
  check('demo: no "Keep exploring" escape — payment required', !keepExploring)

  // Undismissable: Escape + clicking around must not close it.
  await page.keyboard.press('Escape')
  await page.mouse.click(10, 10)
  await page.waitForTimeout(300)
  const stillUp = await page.getByText('Unlock the full PennyPlay experience').isVisible().catch(() => false)
  check('demo: pop-up cannot be dismissed', stillUp)

  // Referral input present in the demo gate.
  const refInput = page.getByPlaceholder('Enter code')
  check('demo: referral code input present in pop-up', await refInput.isVisible().catch(() => false))

  const priceBefore = await page.getByText(/R\s?200/).first().isVisible().catch(() => false)
  check('demo: full price R200/year shown', priceBefore)
  await page.screenshot({ path: `${SHOTS}/02-demo-gate.png` })

  // Apply a friend's code → R150.
  await refInput.fill('FRIEND9')
  await page.getByRole('button', { name: 'Apply' }).click()
  await page.waitForTimeout(500)
  const discounted = await page.getByText(/Subscribe — R\s?150\/year/).isVisible().catch(() => false)
  check('demo: referral code drops first year to R150', discounted)
  await page.screenshot({ path: `${SHOTS}/03-demo-gate-referral.png` })

  // Pay (test mode) → gate clears, app unlocked.
  await page.getByRole('button', { name: /Subscribe — R\s?150\/year/ }).click()
  await page.waitForTimeout(1200)
  const cleared = !(await page.getByText('Unlock the full PennyPlay experience').isVisible().catch(() => false))
  check('demo: payment activates the subscription and unlocks the app', cleared)

  const membership = await page.evaluate(() => localStorage.getItem('pennyplay:membership:v1'))
  const m = membership ? JSON.parse(membership) : null
  check('demo: membership persisted with R150 first year', m?.amountCents === 15000, membership ?? 'none')
  const paidUntil = m ? new Date(m.paidUntil) : null
  const oneYearOut = paidUntil && paidUntil - Date.now() > 360 * 86400e3 && paidUntil - Date.now() < 366 * 86400e3
  check('demo: paid until ~1 year out (renewal cadence)', Boolean(oneYearOut), m?.paidUntil)

  // Reload → still unlocked, no pill, no gate.
  await page.reload()
  await page.waitForTimeout(1500)
  const pillAfter = await page.getByText(/explore · \d+s/i).isVisible().catch(() => false)
  const gateAfter = await page.getByText('Unlock the full PennyPlay experience').isVisible().catch(() => false)
  check('demo: active subscriber never sees timer or gate again', !pillAfter && !gateAfter)
  await page.screenshot({ path: `${SHOTS}/04-demo-unlocked.png` })
  await ctx.close()
}

/* -------- Scenario 2: real account — 30s scroll then hard gate -------- */
{
  const { ctx, page } = await freshPage(null) // real 30s default
  const t0 = Date.now()
  await page.goto(BASE)
  await page.getByText('Set up in 60 seconds').click()
  await page.getByLabel('Name', { exact: true }).fill('Thandi')
  await page.getByLabel('Surname').fill('Mokoena')
  await page.getByLabel('Username').fill('thandi_m')
  await page.getByLabel('Email').fill('thandi@example.com')
  await page.getByLabel('Phone').fill('0821234567')
  await page.getByRole('button', { name: "That's me" }).click()
  for (const d of ['2', '5', '0', '0', '0']) await page.getByRole('button', { name: d, exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Looks good' }).click()
  await page.getByRole('button', { name: /Let's go/ }).click()
  await page.waitForTimeout(1000)

  const pill = await page.getByText(/Free explore · \d+s/).textContent().catch(() => null)
  const pillReadAt = Date.now()
  check('real: 30s countdown starts after signup', Boolean(pill && /\d+/.test(pill)), pill ?? '')
  const secs = pill ? Number(pill.match(/(\d+)s/)?.[1]) : 0
  check('real: window is ~30 seconds', secs > 25 && secs <= 30, `${secs}s`)
  await page.screenshot({ path: `${SHOTS}/05-real-explore.png` })

  // Scroll around during the window.
  await page.mouse.wheel(0, 600)
  await page.waitForTimeout(500)
  const canScroll = !(await page.getByText('Your free look around is over').isVisible().catch(() => false))
  check('real: can scroll around during the free look', canScroll)

  // Refresh must NOT restart the window.
  await page.reload()
  await page.waitForTimeout(1200)
  const pill2 = await page.getByText(/Free explore · \d+s/).textContent().catch(() => null)
  const secs2 = pill2 ? Number(pill2.match(/(\d+)s/)?.[1]) : 0
  // The clock must have kept running through the reload: remaining now
  // can be at most (first reading − wall time since then), +2s slack.
  const sinceFirst = Math.floor((Date.now() - pillReadAt) / 1000)
  check('real: refresh does not restart the explore window', secs2 > 0 && secs2 <= secs - sinceFirst + 2, `left ${secs2}s, ${sinceFirst}s after first reading of ${secs}s`)

  // Wait out the remainder.
  await page.waitForTimeout((secs2 + 2) * 1000)
  const gateUp = await page.getByText('Your free look around is over').isVisible().catch(() => false)
  check('real: hard paywall appears when the 30 seconds are up', gateUp)
  const price = await page.getByText(/Subscribe — R\s?200\/year/).isVisible().catch(() => false)
  check('real: R200/year subscribe button', price)
  const renewCopy = await page.getByText(/auto-renews/).first().isVisible().catch(() => false)
  check('real: yearly auto-renew communicated', renewCopy)
  await page.screenshot({ path: `${SHOTS}/06-real-gate.png` })

  // Undismissable + tab bar unusable underneath.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('real: paywall cannot be dismissed', await page.getByText('Your free look around is over').isVisible().catch(() => false))

  // Subscribe at full price (no referral).
  await page.getByRole('button', { name: /Subscribe — R\s?200\/year/ }).click()
  await page.waitForTimeout(1200)
  const unlocked = !(await page.getByText('Your free look around is over').isVisible().catch(() => false))
  check('real: payment unlocks the app', unlocked)
  const m = JSON.parse(await page.evaluate(() => localStorage.getItem('pennyplay:membership:v1')) ?? 'null')
  check('real: membership live at R200 full price', m?.amountCents === 20000, JSON.stringify(m))
  await page.screenshot({ path: `${SHOTS}/07-real-unlocked.png` })

  // /plus shows active status + auto-renew line.
  await page.goto(`${BASE}/plus`)
  await page.waitForTimeout(800)
  const active = await page.getByText(/Active until/).isVisible().catch(() => false)
  const autorenew = await page.getByText(/auto-renews yearly/i).first().isVisible().catch(() => false)
  check('real: /plus shows active membership + yearly auto-renew', active && autorenew)
  await page.screenshot({ path: `${SHOTS}/08-plus-active.png` })
  await ctx.close()
}

/* ------- Scenario 3: lapsed membership → paywall straight back ------- */
{
  const { ctx, page } = await freshPage(4)
  await page.addInitScript(() => {
    localStorage.setItem(
      'pennyplay:membership:v1',
      JSON.stringify({ paidUntil: '2025-07-01', paymentRef: 'test-mode', amountCents: 20000, activatedAt: '2024-07-01T00:00:00Z' }),
    )
    // Explore window long since consumed.
    localStorage.setItem('pennyplay:explore-started:demo:v1', '2025-07-01T00:00:00.000Z')
  })
  await page.goto(BASE)
  await page.getByText('Try demo mode first').click()
  await page.waitForTimeout(2500)
  const gateUp = await page.getByText('Unlock the full PennyPlay experience').isVisible().catch(() => false)
  const resulting = await page.getByText(/Subscribe — R\s?200\/year/).isVisible().catch(() => false)
  check('lapsed: paywall returns immediately, renewal at full R200', gateUp && resulting)
  await page.screenshot({ path: `${SHOTS}/09-lapsed-gate.png` })
  await ctx.close()
}

await browser.close()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
