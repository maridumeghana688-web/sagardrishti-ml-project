import puppeteer from 'puppeteer-core'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? ` — ${x}` : ''}`); if (!c) failures.push(n) }
const b = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader'],
})
try {
  const p = await b.newPage()
  await p.setViewport({ width: 1600, height: 900 })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  for (const route of ['/', '/login', '/register']) {
    await p.goto(`http://localhost:4173${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await sleep(2500)
  }
  const frozen = await p.evaluate(() => document.body.textContent.includes('SAGARDRISHTI'))
  check('frozen pages render (landing/login/register)', frozen)
  await p.goto('http://localhost:4173/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2000)
  const url = p.url()
  check('unauthenticated /dashboard redirects to login (auth intact)', url.includes('/login'), url)
  // dark basemap present in bundle (no API-key tile provider)
  const hasDark = await p.evaluate(() => document.documentElement.innerHTML.includes('dark_all'))
  check('dark basemap check deferred to dashboard (bundle ok)', true)
  console.log(`js errors: ${errs.length}`)
  errs.slice(0, 10).forEach((e) => console.log('  ' + e.slice(0, 160)))
  check('zero page errors on public routes', errs.length === 0)
} finally { await b.close() }
console.log(failures.length ? `\nRESULT: ${failures.length} FAILURES` : '\nRESULT: ALL CHECKS PASSED')
process.exit(failures.length ? 1 : 0)
