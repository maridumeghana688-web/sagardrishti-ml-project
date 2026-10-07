/**
 * smoke.mjs — headless-Chrome verification for the continuous 3D maritime world.
 * Drives scroll, screenshots journey beats, verifies zero photographs, and checks routes.
 *   node scripts/smoke.mjs [baseUrl] [outDir]
 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] || 'http://localhost:4173'
const OUT = process.argv[3] || 'C:/Users/J SATYA/AppData/Local/Temp/opencode/smoke-3d-maritime'
fs.mkdirSync(OUT, { recursive: true })

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,900', '--use-gl=angle', '--use-angle=swiftshader'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`))
  page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText}`))
  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes(':8000')) {
      errors.push(`[http ${res.status()}] ${res.url().split('?')[0]}`)
    }
  })

  console.log(`Navigating to ${BASE}/...`)
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60000 })
  await sleep(3000)

  const info = await page.evaluate(() => {
    const canvas = !!document.querySelector('canvas')
    const imgs = [...document.querySelectorAll('img')]
    const max = document.documentElement.scrollHeight - window.innerHeight
    return {
      hasCanvas: canvas,
      imgCount: imgs.length,
      imgs: imgs.map((i) => i.src),
      scrollableMax: max,
    }
  })
  console.log(`3D Canvas present: ${info.hasCanvas}`)
  console.log(`Images on landing page (MUST BE 0): ${info.imgCount}`)
  console.log(`Scrollable track height: ${info.scrollableMax}px`)

  // Journey beats across the master timeline
  const beats = [
    ['01-ocean-hero', 0.02],
    ['02-vessel-approach', 0.16],
    ['03-vessel-orbit', 0.32],
    ['04-ais-telemetry', 0.44],
    ['05-port-horizon', 0.65],
    ['06-congestion-choke', 0.80],
    ['07-data-intelligence', 0.89],
    ['08-decision-support', 0.95],
    ['09-outcome-cta', 0.99],
  ]

  for (const [name, frac] of beats) {
    await page.evaluate((f) => {
      const m = document.documentElement.scrollHeight - window.innerHeight
      window.scrollTo(0, Math.round(m * f))
    }, frac)
    await sleep(2500)
    const ssPath = path.join(OUT, `${name}.png`)
    await page.screenshot({ path: ssPath })
    const curP = await page.evaluate(() => {
      const m = document.documentElement.scrollHeight - window.innerHeight
      return (window.scrollY / m).toFixed(3)
    })
    console.log(`Captured beat ${name} at progress=${curP}`)
  }

  // Verify application routes
  for (const route of ['/login', '/dashboard', '/status']) {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle0', timeout: 60000 })
    await sleep(1000)
    console.log(`Route ${route}: status=${res.status()}`)
    await page.screenshot({ path: path.join(OUT, `route${route.replace('/', '-')}.png`) })
  }

  // Mobile viewport verification
  const mob = await browser.newPage()
  await mob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  mob.on('pageerror', (err) => errors.push(`[mobile pageerror] ${err.message}`))
  await mob.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 60000 })
  await sleep(3000)
  const overflow = await mob.evaluate(() => ({ inner: window.innerWidth, scroll: document.documentElement.scrollWidth }))
  console.log(`Mobile view: innerWidth=${overflow.inner}, scrollWidth=${overflow.scroll} (no overflow: ${overflow.scroll <= overflow.inner})`)
  await mob.screenshot({ path: path.join(OUT, 'mobile-hero.png') })
} finally {
  await browser.close()
}

const uniq = [...new Set(errors)].filter((e) => !e.includes('localhost:8000'))
console.log(`\n---- errors ${uniq.length} ----`)
uniq.slice(0, 40).forEach((e) => console.log(e))
if (uniq.length === 0) console.log('(none)')
