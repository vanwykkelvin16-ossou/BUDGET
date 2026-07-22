// Browser e2e against the Vercel preview: sign in with the seeded test
// user, open /plus, click the pay button and confirm the browser lands on
// the PayFast sandbox payment page with the right amount.
import { chromium } from 'playwright'
import fs from 'node:fs'

const SHARE = 'https://budget-git-cursor-payfast-ad0aeb-vanwykkelvin16-ossous-projects.vercel.app/?_vercel_share=38gtCvwWmmGcjb0Rqss1x55tlwzcvbrA'
const ART = '/opt/cursor/artifacts/screenshots'
fs.mkdirSync(ART, { recursive: true })

const results = []
const check = (name, ok, extra = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) process.exitCode = 1
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.setDefaultTimeout(25000)

await page.goto(SHARE)
await page.waitForTimeout(2500)
await page.screenshot({ path: `${ART}/01-landing.png` })

// The app should show the Auth screen (Supabase is wired by default now).
const authVisible = await page.getByPlaceholder('you@example.com').isVisible().catch(() => false)
check('auth screen shows (Supabase connected)', authVisible)

if (authVisible) {
  await page.getByPlaceholder('you@example.com').fill('payfast.e2e@pennyplay.dev')
  await page.getByPlaceholder(/password/i).fill('E2eTest!2026pay')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${ART}/02-after-signin.png` })
}

await page.goto(SHARE.replace('/?', '/plus?'))
await page.waitForTimeout(2500)
await page.screenshot({ path: `${ART}/03-plus-page.png` })

const payBtn = page.getByRole('button', { name: /Join Plus|Pay|Renew/i }).first()
check('pay button visible', await payBtn.isVisible().catch(() => false))

const [nav] = await Promise.all([
  page.waitForURL(/payfast\.co\.za/, { timeout: 30000 }).then(() => true).catch(() => false),
  payBtn.click(),
])
await page.waitForTimeout(4000)
const url = page.url()
check('redirected to PayFast sandbox', /sandbox\.payfast\.co\.za/.test(url), url.slice(0, 90))
await page.screenshot({ path: `${ART}/04-payfast-checkout.png`, fullPage: false })

const body = await page.textContent('body').catch(() => '')
check('PayFast page shows R200', /200\.00|R\s?200/.test(body ?? ''))
check('PayFast page mentions PennyPlay', /PennyPlay/i.test(body ?? ''))

await browser.close()
console.log(results.join('\n'))
