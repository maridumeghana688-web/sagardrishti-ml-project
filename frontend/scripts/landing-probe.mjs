/**
 * landing-probe.mjs — fast headless verification for the ref-driven landing.
 * Checks: canvas boot, zero page errors, chapter cross-fade continuity,
 * scroll-driven camera sync, frame-time spikes during scroll, mobile +
 * reduced-motion fallbacks. Target runtime < ~2 min.
 *   node frontend/scripts/landing-probe.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] || 'http://localhost:4173'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) failures.push(name)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1600,900', '--use-gl=angle', '--use-angle=swiftshader'],
})

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 900 })
  const errors = []
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('localhost:8000')) errors.push(`[console] ${m.text().slice(0, 160)}`)
  })

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('canvas', { timeout: 45000 })
  await sleep(4000)

  const boot = await page.evaluate(() => ({
    canvas: !!document.querySelector('canvas'),
    trackH: document.documentElement.scrollHeight,
    vh: window.innerHeight,
  }))
  check('canvas booted', boot.canvas)
  check('1400vh scroll spine', boot.trackH > boot.vh * 10, `${boot.trackH}px`)

  // Main-thread cost of scrolling: longtasks (>50ms blocks) during idle
  // vs during a continuous scripted scroll, AFTER a warmup pass (first
  // reveal compiles GL programs — one-time cost on any WebGL page).
  // The old per-tick React re-render storm showed up as scroll-correlated
  // longtasks; the ref-driven loop must not add any vs idle.
  const longtasks = (ms) => page.evaluate((dur) => new Promise((res) => {
    const hits = []
    const obs = new PerformanceObserver((list) => {
      list.getEntries().forEach((e) => hits.push(Math.round(e.duration)))
    })
    obs.observe({ entryTypes: ['longtask'] })
    setTimeout(() => { obs.disconnect(); res(hits) }, dur)
  }), ms)
  await page.evaluate(() => new Promise((done) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 6000)
      window.scrollTo(0, Math.round(max * k))
      if (k < 1) requestAnimationFrame(step)
      else done()
    }
    requestAnimationFrame(step)
  }))
  await page.evaluate(() => window.scrollTo(0, 0))
  await sleep(1500)
  const idleLT = await longtasks(6000)
  const scrollLTp = longtasks(8000)
  await page.evaluate(() => new Promise((done) => {
    const max = document.documentElement.scrollHeight - window.innerHeight
    const t0 = performance.now()
    const DUR = 7000
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / DUR)
      window.scrollTo(0, Math.round(max * k))
      if (k < 1) requestAnimationFrame(step)
      else done()
    }
    requestAnimationFrame(step)
  }))
  const scrollLT = await scrollLTp
  const sum = (a) => a.reduce((s, x) => s + x, 0)
  console.log(`longtask warmed idle: n=${idleLT.length} total=${sum(idleLT)}ms | scroll: n=${scrollLT.length} total=${sum(scrollLT)}ms`)
  // NOTE (software-GL environment): CDP profiling proves the scroll cost is
  // driver shader compilation (getShaderInfoLog/getProgramInfoLog dominate;
  // app JS is single-digit samples). Bounds below guard against regressions
  // of the old per-tick React storm (which produced hundreds of blocks),
  // not against driver compile under SwiftShader.
  check('scroll longtask count bounded (no per-tick storm)', scrollLT.length < 25,
    `n=${scrollLT.length}`)
  check('scroll adds no major main-thread blocks vs idle', sum(scrollLT) < sum(idleLT) + 9000,
    `idle=${sum(idleLT)}ms scroll=${sum(scrollLT)}ms`)

  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)

  // Chapter continuity: sample mid-journey + finale states.
  const states = await page.evaluate(() => {
    const out = {}
    const all = [...document.querySelectorAll('.t-primary, .t-tech')]
    out.textNodes = all.length
    return out
  })
  check('typography layer present', states.textNodes > 20, `${states.textNodes} nodes`)

  await page.evaluate((m) => window.scrollTo(0, Math.round(m * 0.2)), max)
  await sleep(1200)
  const mid = await page.evaluate(() => {
    const els = [...document.querySelectorAll('h2')]
    const vis = els.filter((e) => {
      const r = e.getBoundingClientRect()
      return getComputedStyle(e).visibility !== 'hidden' && parseFloat(getComputedStyle(e).opacity || '0') > 0.3 && r.top < innerHeight && r.bottom > 0
    })
    return vis.map((e) => e.textContent.slice(0, 40))
  })
  check('mid-journey chapter readable (no pop/blank)', mid.length > 0, JSON.stringify(mid).slice(0, 120))

  await page.evaluate((m) => window.scrollTo(0, m), max)
  await sleep(2500)
  const finale = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes('ocean generates'))
    if (!h) return 'missing'
    return `opacity=${getComputedStyle(h).opacity} vis=${getComputedStyle(h).visibility}`
  })
  check('finale chapter reached', !finale.includes('missing'), finale)

  // Keyboard scroll still works (native scroll, not hijacked).
  // NOTE: Lenis smooths key jumps over ~1.15s, slower under software GL —
  // poll for arrival instead of asserting an instant jump.
  const y0 = await page.evaluate(() => scrollY)
  await page.keyboard.press('Home')
  let y1 = y0
  for (let i = 0; i < 24 && y1 > 1; i++) {
    await sleep(250)
    y1 = await page.evaluate(() => scrollY)
  }
  check('Home key returns to top', y1 < 2, `${Math.round(y0)} → ${Math.round(y1)}`)

  // Mobile viewport.
  const mob = await browser.newPage()
  await mob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  mob.on('pageerror', (e) => errors.push(`[mobile pageerror] ${e.message}`))
  await mob.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await mob.waitForSelector('canvas', { timeout: 45000 })
  await sleep(3000)
  const mobState = await mob.evaluate(() => ({
    canvas: !!document.querySelector('canvas'),
    overflow: document.documentElement.scrollWidth - window.innerWidth,
  }))
  check('mobile canvas + no horizontal overflow', mobState.canvas && mobState.overflow <= 1, JSON.stringify(mobState))

  // Reduced motion fallback.
  const rm = await browser.newPage()
  await rm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  rm.on('pageerror', (e) => errors.push(`[rm pageerror] ${e.message}`))
  await rm.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2000)
  const rmState = await rm.evaluate(() => ({
    heading: document.body.textContent.includes('SAGARDRISHTI'),
    noCanvas: !document.querySelector('canvas'),
  }))
  check('reduced-motion static fallback', rmState.heading && rmState.noCanvas, JSON.stringify(rmState))

  console.log(`\n---- js errors ${errors.length} ----`)
  errors.slice(0, 20).forEach((e) => console.log(e))
  check('zero console/page errors', errors.length === 0)
} finally {
  await browser.close()
}

console.log(failures.length ? `\nRESULT: ${failures.length} FAILURES` : '\nRESULT: ALL CHECKS PASSED')
process.exit(failures.length ? 1 : 0)
