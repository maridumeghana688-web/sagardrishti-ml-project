/** qa-shots.mjs — premium AIS visual QA screenshots (Phase 39). */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
const BASE = process.argv[2] || 'http://127.0.0.1:4173'
const OUT = process.argv[3] || 'C:/Users/J SATYA/AppData/Local/Temp/opencode/map-verify'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,900', '--use-gl=angle', '--use-angle=swiftshader'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900 })
page.on('pageerror', (e) => console.log('PAGEERROR:', (e.message || '').slice(0, 150)))
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await sleep(1500)
await page.type('#identifier', 'qa')
await page.type('#password', 'qa-pass-123')
await page.evaluate(() => document.querySelector('form').requestSubmit())
await sleep(2000)

// 1 — Mumbai close-up with trails on
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await sleep(8000)
await page.evaluate(() => {
  const t = [...document.querySelectorAll('.sd-layer-toggle')].find((b) => /AIS TRAILS/.test(b.textContent))
  if (t && !t.className.includes('on')) t.click()
  const m = [...document.querySelectorAll('button')].filter((b) => /MUMBAI/.test(b.textContent))
  m[0]?.click()
})
await sleep(5000)
await page.screenshot({ path: `${OUT}/qa-mumbai-trails.png` })
console.log('mumbai shot ok')

// 2 — select first live vessel from AIS table, then map close-up w/ ring
await page.goto(`${BASE}/dashboard/ais`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await sleep(5000)
const sel = await page.evaluate(() => {
  const row = document.querySelector('table tbody tr')
  if (!row) return null
  const mmsi = row.querySelector('td')?.innerText.trim()
  row.click()
  return mmsi
})
console.log('selected vessel mmsi:', sel)
await sleep(1500)
await page.screenshot({ path: `${OUT}/qa-ais-selected.png` })
await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await sleep(6000)
await page.screenshot({ path: `${OUT}/qa-vessel-focus.png` })
console.log('vessel focus shot ok')

// 3 — vessel freshness colors + tooltip: hover first canvas vessel is
// impractical headless; instead verify layer facts via legend + table
const facts = await page.evaluate(() => {
  const t = document.body.innerText || ''
  return { live: /LIVE VESSELS/.test(t), stale: /STALE|LAST OBSERVED/.test(t) }
})
console.log('facts:', JSON.stringify(facts))
await browser.close()
