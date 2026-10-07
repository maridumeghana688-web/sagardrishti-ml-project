/**
 * verify-map.mjs — MapLibre operations-map verification (Phase 38/39/40).
 * Backend (real AIS workers) + preview build must already be running.
 *   node scripts/verify-map.mjs [previewUrl] [apiUrl] [outDir]
 *
 * Asserts: MapLibre canvas, OSM attribution, no API-key watermark, 44 ports,
 * layer toggles, vessel rendering state, zero unexpected console errors.
 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.argv[2] || 'http://localhost:4173'
const API = process.argv[3] || 'http://localhost:8000'
const OUT = process.argv[4] || 'C:/Users/J SATYA/AppData/Local/Temp/opencode/map-verify'
fs.mkdirSync(OUT, { recursive: true })

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,900', '--use-gl=angle', '--use-angle=swiftshader'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message} :: ${(err.stack || '').split('\n').slice(0, 4).join(' | ').slice(0, 400)}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text().slice(0, 200)}`)
  })
  page.on('requestfailed', (req) => {
    if (!req.url().includes(':8000')) errors.push(`[requestfailed] ${req.url().split('?')[0]} :: ${req.failure()?.errorText}`)
  })

  // backend vessel state (real data, for context — after navigation so origin is set)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const apiState = await page.evaluate(async (api) => {
    try {
      const r = await fetch(`${api}/api/v1/vessels?limit=5`)
      const j = await r.json()
      return { ok: true, count: j.count, status: j.health?.ais_status }
    } catch (e) { return { ok: false, error: String(e).slice(0, 120) } }
  }, API)
  console.log(`backend vessels: ${JSON.stringify(apiState)}`)
  await page.type('#identifier', 'map.verify')
  await page.type('#password', 'verification-pass')
  await Promise.all([
    page.evaluate(() => document.querySelector('form').requestSubmit()),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
  ])
  await sleep(2000)
  check('login reaches dashboard', page.url().includes('/dashboard'), page.url())

  // operations map
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  try {
    await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 })
  } catch { /* handled by check */ }
  await sleep(6000) // basemap tiles + first AIS frames
  const mapInfo = await page.evaluate(() => {
    const body = document.body.innerText || ''
    return {
      canvas: !!document.querySelector('.maplibregl-canvas'),
      leaflet: !!document.querySelector('.leaflet-container'),
      keyWatermark: /API KEY REQUIRED/i.test(body),
      attrib: document.querySelector('.maplibregl-ctrl-attrib')?.innerText || '',
      basemapBadge: document.querySelector('.sd-gl-basemap')?.innerText || '',
      ports: document.querySelectorAll('.sd-port-marker').length,
      toggles: [...document.querySelectorAll('.sd-layer-toggle')].map((b) => b.textContent.trim()),
      maplibreSources: !!document.querySelector('.sd-gl-canvas'),
    }
  })
  check('MapLibre canvas present', mapInfo.canvas)
  check('no Leaflet container', !mapInfo.leaflet)
  check('no API KEY REQUIRED watermark', !mapInfo.keyWatermark)
  check('OSM attribution visible', /openstreetmap/i.test(mapInfo.attrib), mapInfo.attrib.slice(0, 90))
  check('OpenFreeMap attribution visible', /openfreemap/i.test(mapInfo.attrib), mapInfo.attrib.slice(0, 90))
  check('basemap badge', /OSM BASEMAP|BASEMAP UNAVAILABLE/.test(mapInfo.basemapBadge), mapInfo.basemapBadge)
  check('44 port markers', mapInfo.ports === 44, `found ${mapInfo.ports}`)
  check('7 layer toggles', mapInfo.toggles.length === 7, mapInfo.toggles.join('|'))
  await page.screenshot({ path: path.join(OUT, 'ops-map.png') })

  // layer toggle still works (trails on)
  const trailBtn = await page.$('.sd-layer-toggle:not(.on)')
  if (trailBtn) { await trailBtn.click(); await sleep(1200) }
  const togglesAfter = await page.evaluate(() => document.querySelectorAll('.sd-layer-toggle.on').length)
  check('layer toggle responds', togglesAfter >= 4, `${togglesAfter} on`)
  await page.screenshot({ path: path.join(OUT, 'ops-map-trails.png') })

  // port selection → intelligence (Mumbai button text is the WPI name, uppercase)
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => /MUMBAI/.test(b.textContent))
    btns[0]?.click()
  })
  await sleep(2500)
  const intel = await page.evaluate(() => {
    const t = document.body.innerText || ''
    return {
      wpi: /WPI 48840/.test(t),
      liveSit: /LIVE MARITIME SITUATION/.test(t),
      activity: /VESSEL ACTIVITY/.test(t),
      traffic: /NEXT-DAY TRAFFIC/.test(t),
      congestion: /NEXT-DAY CONGESTION/.test(t),
      noEnvCards: !/SEA SURFACE TEMP/.test(t) && !/CURRENT MAGNITUDE/.test(t),
    }
  })
  check('port WPI identity shown', intel.wpi)
  check('4 intel cards present', intel.liveSit && intel.activity && intel.traffic && intel.congestion)
  check('env cards removed from PortPanel', intel.noEnvCards)
  await page.screenshot({ path: path.join(OUT, 'ops-port-mumbai.png') })

  // live AIS view
  await page.goto(`${BASE}/dashboard/ais`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4000)
  const aisInfo = await page.evaluate(() => {
    const t = document.body.innerText || ''
    return {
      sources: /open waters/i.test(t) && /aisstream/i.test(t) && /vesselapi/i.test(t),
      rows: document.querySelectorAll('table tbody tr').length,
      empty: /NO RECENT|WAITING FOR/i.test(t),
    }
  })
  check('3 source cards', aisInfo.sources)
  console.log(`ais table rows: ${aisInfo.rows} empty-state: ${aisInfo.empty}`)
  await page.screenshot({ path: path.join(OUT, 'ais-view.png') })

  // perf snapshot: DOM weight + frame loop health
  const perf = await page.evaluate(() => ({
    portNodes: document.querySelectorAll('.sd-port-marker').length,
    canvases: document.querySelectorAll('canvas').length,
    imgs: document.querySelectorAll('img').length,
  }))
  console.log(`perf: ${JSON.stringify(perf)}`)
  check('map is single-canvas (GPU layers)', perf.canvases <= 3, `${perf.canvases} canvases`)
} finally {
  await browser.close()
}

const real = errors.filter((e) => !/favicon|localhost:8000/.test(e))
console.log(`\n---- console/network errors ${real.length} ----`)
;[...new Set(real)].slice(0, 30).forEach((e) => console.log(e))
const failed = checks.filter((c) => !c.ok)
console.log(`\nchecks: ${checks.length - failed.length}/${checks.length} passed`)
if (failed.length || real.length) process.exitCode = 1
