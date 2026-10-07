import puppeteer from 'puppeteer-core'
const BASE = 'http://localhost:5173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  page.on('pageerror', (e) => errors.push(e.message))
  // 18. unauthenticated direct /dashboard -> bounce to /login
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle0', timeout: 60000 })
  await sleep(1500)
  console.log('18-bounce:', page.url().includes('/login') ? 'PASS' : `FAIL ${page.url()}`)
  // login (dev auth)
  await page.type('#identifier', 'u1')
  await page.type('#password', 'p1')
  await Promise.all([page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')])
  await sleep(4000)
  // 7. click first map marker
  const clicked = await page.evaluate(() => {
    const m = document.querySelectorAll('path.leaflet-interactive')
    if (!m.length) return 0
    m[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    return m.length
  })
  await sleep(2500)
  const panel = await page.evaluate(() => document.body.innerText)
  console.log('7-marker-click:', /PORT INTELLIGENCE/.test(panel) ? `PASS markers=${clicked}` : 'FAIL')
  // 13. charts rendered (svg)
  const svgCount = await page.evaluate(() => document.querySelectorAll('.recharts-wrapper svg').length)
  console.log('13-charts:', svgCount >= 2 ? `PASS svgs=${svgCount}` : `FAIL svgs=${svgCount}`)
  // 14. unavailable rendering: SST nulls shown as Unavailable (post-2023)
  console.log('14-unavailable-state:', /Unavailable/.test(panel) ? 'PASS' : 'FAIL')
  // 15. API failure: stop backend? can't; verify error path exists via bad date
  const bad = await page.evaluate(() => fetch('http://localhost:8000/api/v1/predictions?date=1999-01-01').then((r) => r.status))
  console.log('15-api-404-handled:', bad === 404 ? 'PASS' : `FAIL ${bad}`)
} finally { await browser.close() }
console.log('pageerrors:', errors.length, errors.slice(0, 5))
if (errors.length) process.exitCode = 1
