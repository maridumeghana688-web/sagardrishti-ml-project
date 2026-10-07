import puppeteer from 'puppeteer-core'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox'] })
try {
  const p = await b.newPage()
  p.on('pageerror', (e) => console.log('PAGEERROR:', e.stack || e.message))
  await p.goto('http://localhost:5173/register', { waitUntil: 'networkidle0', timeout: 60000 })
  await p.type('#full_name', 'Dbg8 User')
  await p.type('#user_id', 'dbguser8')
  await p.select('#organization', 'Port Authority')
  await p.select('#department', 'Logistics')
  await p.type('#reg-password', 'DbgPass1234')
  await p.type('#confirm_password', 'DbgPass1234')
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {}), p.click('button[type="submit"]')])
  await sleep(6000)
  const errs = await p.evaluate(() => window.__errs || 'no-hook')
  console.log('errs:', JSON.stringify(errs))
} finally { await b.close() }
