/**
 * Dashboard flow validation: register -> dashboard (44 markers) -> dropdown select ->
 * prediction/env/vessel/analytics -> refresh persistence -> mobile. Uses dev-auth (no backend auth).
 */
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://localhost:4173'
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = {}
const check = (name, ok, extra = '') => { results[name] = ok ? 'PASS' : `FAIL ${extra}`; console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`) }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,900'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

  // 1. register
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.type('#full_name', 'Test Analyst')
  await page.type('#user_id', 'testanalyst')
  await page.select('#organization', 'Ministry of Ports, Shipping and Waterways')
  await page.select('#department', 'Data & Analytics')
  await page.type('#reg-password', 'TestPass1234')
  await page.type('#confirm_password', 'TestPass1234')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await sleep(1500)
  check('1-register-redirect-dashboard', page.url().includes('/dashboard'), page.url())

  // 5/6. map + 44 markers (backend must be up on :8000)
  await sleep(4000)
  const mapInfo = await page.evaluate(async () => {
    const markers = document.querySelectorAll('.leaflet-marker-icon, path.leaflet-interactive').length
    const ports = await fetch('http://localhost:8000/api/v1/ports').then((r) => r.json()).catch(() => null)
    return { markers, apiCount: ports?.count ?? null }
  })
  check('5-map-renders', mapInfo.markers > 0, `markers=${mapInfo.markers}`)
  check('6-44-ports-api', mapInfo.apiCount === 44, `count=${mapInfo.apiCount}`)

  // 8. dropdown select Paradip
  await page.click('#port-search')
  await page.type('#port-search', 'Paradip', { delay: 60 })
  await page.waitForFunction(
    () => document.querySelectorAll('#port-search ~ div.max-h-36 button').length > 0,
    { timeout: 15000 }
  ).catch(() => {})
  const opts = await page.$$eval('#port-results button', (els) => els.map((e) => e.textContent))
  check('8-dropdown-search', opts.some((t) => t.includes('PARADIP')), JSON.stringify(opts).slice(0, 80))
  if (opts.length) await page.$$eval('#port-results button', (els) => els[0].click())
  await sleep(2500)

  // 9-11. prediction + env + vessel loaded
  const panel = await page.evaluate(() => document.body.innerText)
  check('9-prediction-shown', /TOMORROW'S TRAFFIC/.test(panel) && /\d+\.\d/.test(panel))
  check('10-env-shown', /SEA SURFACE TEMP|Current/i.test(panel))
  check('11-vessel-shown', /LATEST ACTIVITY/.test(panel))
  check('12-source-status', /GFW/.test(panel) && /CMEMS/.test(panel))

  // 17. refresh persistence (SSE holds a connection: use domcontentloaded, not networkidle)
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  await sleep(3000)
  check('17-refresh-stays-dashboard', page.url().includes('/dashboard'), page.url())

  // 4/18. fresh session then login
  await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear() })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.type('#identifier', 'testanalyst')
  await page.type('#password', 'TestPass1234')
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ])
  await sleep(1500)
  check('3-login-redirect-dashboard', page.url().includes('/dashboard'), page.url())

  // 17b. mobile
  const mob = await browser.newPage()
  await mob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await mob.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0', timeout: 60000 })
  await sleep(2000)
  const ov = await mob.evaluate(() => ({ w: window.innerWidth, s: document.documentElement.scrollWidth }))
  check('16-mobile-no-overflow', ov.s <= ov.w + 1, JSON.stringify(ov))
} finally {
  await browser.close()
}
const uniq = [...new Set(errors)]
console.log(`\npageerrors: ${uniq.length}`)
uniq.slice(0, 20).forEach((e) => console.log(e))
console.log(JSON.stringify(results, null, 1))
if (Object.values(results).some((v) => v.startsWith('FAIL')) || uniq.length) process.exitCode = 1
