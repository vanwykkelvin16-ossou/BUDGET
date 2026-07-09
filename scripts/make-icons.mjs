/**
 * Renders public/icon.svg to the PNG sizes the PWA manifest needs.
 * Uses the Playwright-managed Chromium (pre-installed in CI/dev images).
 * Run: node scripts/make-icons.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const svg = readFileSync(resolve('public/icon.svg'), 'utf8')

// Prefer the environment's pre-installed Chromium when the Playwright-managed
// one isn't present (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD environments).
import { existsSync } from 'node:fs'
const fixedPath = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(fixedPath) ? { executablePath: fixedPath } : {},
)
const page = await browser.newPage()

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html><style>*{margin:0}body{width:${size}px;height:${size}px}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`,
  )
  const buffer = await page.screenshot({ omitBackground: true })
  writeFileSync(resolve(`public/icon-${size}.png`), buffer)
  console.log(`wrote public/icon-${size}.png`)
}

await browser.close()
