/**
 * Renders public/randy-logo.png to the PNG sizes the PWA manifest needs.
 * Uses the Playwright-managed Chromium (pre-installed in CI/dev images).
 * Run: node scripts/make-icons.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const logoPath = resolve('public/randy-logo.png')
const logoData = readFileSync(logoPath).toString('base64')
const logoSrc = `data:image/png;base64,${logoData}`

const fixedPath = '/opt/pw-browsers/chromium'
const browser = await chromium.launch(
  existsSync(fixedPath) ? { executablePath: fixedPath } : {},
)
const page = await browser.newPage()

for (const size of [192, 512]) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<!doctype html>
     <style>
       * { margin: 0; box-sizing: border-box; }
       body {
         width: ${size}px;
         height: ${size}px;
         display: flex;
         align-items: center;
         justify-content: center;
         background: radial-gradient(circle at 35% 25%, #2d1a54 0%, #1A1033 100%);
       }
       img {
         width: ${Math.round(size * 0.82)}px;
         height: ${Math.round(size * 0.82)}px;
         object-fit: contain;
         display: block;
       }
     </style>
     <img src="${logoSrc}" alt="PennyPlay" />`,
  )
  const buffer = await page.screenshot()
  writeFileSync(resolve(`public/icon-${size}.png`), buffer)
  console.log(`wrote public/icon-${size}.png`)
}

await browser.close()
