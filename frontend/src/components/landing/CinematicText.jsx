import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { windowOf, stage, smooth, useProgressLoop } from './scrollProgress.js'

/**
 * CinematicText — premium editorial typography over the 3D world.
 *
 * ROOT-CAUSE FIX: this tree used to re-render from React state on every
 * scroll tick (12 chapters × staged nodes), while also mounting/unmounting
 * chapters via display:none at window edges (layout thrash + pop-in) and
 * animating `filter: blur()` on large text (full repaint per frame).
 *
 * Now: rendered ONCE, driven by a single rAF loop that writes opacity /
 * transform / visibility directly. Same copy, same windows, same staged
 * eyebrow → headline → body entrances and soft exits — with overlapping
 * cross-dissolves so chapters never pop. Blur removed (opacity + rise +
 * scale carry the cinematic feel at a fraction of the paint cost).
 */

function Eyebrow({ children, align = 'left' }) {
  const rule = <span className="inline-block h-px w-9 shrink-0 bg-[#6DE7FF]/70" />
  return (
    <p className={`font-mono-tech flex items-center gap-3 text-[12px] font-medium tracking-[0.14em] t-tech text-cine ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {rule}
      <span>{children}</span>
    </p>
  )
}

function Title({ children }) {
  return (
    <h2 className="font-display mt-5 text-[clamp(3rem,5vw,5.75rem)] font-extrabold leading-[0.95] tracking-[-0.03em] t-primary text-cine">
      {children}
    </h2>
  )
}

function Body({ children }) {
  return (
    <p className="mt-5 max-w-[30rem] text-[16px] font-normal leading-[1.6] t-secondary text-cine">
      {children}
    </p>
  )
}

function StreamRows({ items }) {
  return (
    <div className="mt-6 w-full max-w-[30rem] space-y-2">
      {items.map(([t, c]) => (
        <div key={t} className="flex items-center gap-3">
          <span className="inline-block h-px w-7 shrink-0" style={{ background: c }} />
          <span className="font-mono-tech text-[11px] tracking-[0.14em] t-primary text-cine">{t}</span>
        </div>
      ))}
    </div>
  )
}

// Chapter copy + windows — unchanged narrative, unchanged timing.
const CHAPTERS = [
  { id: 'c1', s: 0.075, e: 0.18, side: 'left', top: 'top-[30%]', eyebrow: '01 — THE SIGNAL',
    title: (<>EVERY VOYAGE<br />LEAVES A SIGNAL.</>),
    body: 'Every vessel continuously generates movement data: position, speed, heading and time. AIS turns that movement into a digital trace.' },
  { id: 'c2', s: 0.18, e: 0.30, side: 'right', top: 'top-[27%]', eyebrow: '02 — VESSEL MOVEMENT',
    title: (<>MOVEMENT<br />BECOMES DATA.</>),
    body: 'A single vessel is only one signal. Across thousands of movements, those signals reveal traffic corridors, vessel density and changing maritime activity.' },
  { id: 'c3', s: 0.30, e: 0.52, side: 'left', top: 'top-[30%]', eyebrow: '03 — MARITIME PATTERNS',
    title: (<>ONE VOYAGE<br />IS A SIGNAL.<br />THOUSANDS<br />BECOME A PATTERN.</>),
    body: 'AIS trajectories reveal where vessels move, where traffic concentrates and how maritime activity changes over time.' },
  { id: 'c4', s: 0.58, e: 0.70, side: 'right', top: 'top-[12%]', eyebrow: '04 — THE PORT',
    title: (<>EVERY VOYAGE<br />MEETS A PORT.</>),
    body: 'When vessels converge around a terminal, movement becomes operational pressure. Traffic, port activity and environmental conditions can influence congestion and waiting.' },
  { id: 'c5', s: 0.70, e: 0.79, side: 'left', top: 'top-[28%]', eyebrow: '05 — CONGESTION',
    title: (<>WHEN TRAFFIC<br />CONVERGES,<br />WAITING BEGINS.</>),
    body: 'Vessel density, port activity and surrounding conditions help identify where pressure is building.' },
  { id: 'c6', s: 0.79, e: 0.85, side: 'right', top: 'top-[24%]', eyebrow: '06 — DATA FUSION',
    title: (<>THE SIGNAL<br />IS NOT ENOUGH.</>),
    body: 'Maritime conditions cannot be understood from vessel movement alone. SAGARDRISHTI brings together six complementary data streams.',
    extra: 'streams' },
  { id: 'c7', s: 0.85, e: 0.895, side: 'left', top: 'top-[22%]', eyebrow: '07 — DATA WAREHOUSE',
    title: (<>FRAGMENTED SIGNALS<br />BECOME STRUCTURED<br />INTELLIGENCE.</>),
    body: 'A dimensional warehouse organizes maritime activity across time, vessel, port, weather and geography.',
    extra: 'warehouse' },
  { id: 'c8', s: 0.885, e: 0.915, side: 'right', top: 'top-[24%]', eyebrow: '08 — OLAP',
    title: (<>SEE THE SAME<br />MARITIME WORLD<br />FROM EVERY ANGLE.</>),
    body: 'Explore activity across time, location, vessel and environmental conditions.',
    extra: 'olap' },
  { id: 'c9', s: 0.905, e: 0.94, side: 'left', top: 'top-[22%]', eyebrow: '09 — MACHINE LEARNING',
    title: (<>FROM WHAT<br />HAPPENED —<br />TO WHAT<br />MAY HAPPEN NEXT.</>),
    body: 'Machine learning extracts patterns from historical maritime data.',
    extra: 'ml' },
  { id: 'c10', s: 0.925, e: 0.958, side: 'right', top: 'top-[20%]', eyebrow: '10 — PREDICTION',
    title: (<>SEE PRESSURE<br />BEFORE IT PEAKS.</>),
    body: 'Models transform historical patterns and current conditions into predictive indicators for congestion, waiting and maritime risk.',
    extra: 'predict' },
  { id: 'c11', s: 0.954, e: 0.982, side: 'left', top: 'top-[44%]', eyebrow: '11 — DECISION SUPPORT',
    title: (<>PREDICTION<br />INFORMS PEOPLE.</>),
    body: 'SAGARDRISHTI does not control the vessel. It gives operators a clearer view of current conditions, predicted pressure and contributing factors so decisions can be made earlier.',
    extra: 'decide' },
]

function ChapterExtra({ kind }) {
  if (kind === 'streams') {
    return (
      <StreamRows items={[
        ['AIS / VESSEL MOVEMENT', '#5EEAD4'],
        ['PORT ACTIVITY', '#38BDF8'],
        ['WEATHER', '#93C5FD'],
        ['OCEAN CONDITIONS', '#22D3EE'],
        ['WAVE CONDITIONS', '#2DD4BF'],
        ['GEOSPATIAL + HISTORICAL DATA', '#A5B4FC'],
      ]} />
    )
  }
  if (kind === 'warehouse') {
    return (
      <div className="mt-5 max-w-[30rem] space-y-2">
        <p className="font-mono-tech text-[11px] leading-relaxed tracking-[0.12em] t-accent text-cine">
          FACT VESSEL MOVEMENT · FACT PORT ACTIVITY · FACT DELAY · FACT TRAFFIC
        </p>
        <p className="font-mono-tech text-[11px] tracking-[0.12em] t-dim text-cine">
          TIME · PORT · VESSEL · WEATHER · GEOGRAPHY
        </p>
      </div>
    )
  }
  if (kind === 'olap') {
    return (
      <p className="mt-5 font-mono-tech text-[12px] tracking-[0.2em] t-primary text-cine">
        DRILL DOWN · ROLL UP · SLICE · DICE · PIVOT
      </p>
    )
  }
  if (kind === 'ml') {
    return (
      <div className="mt-5 max-w-[30rem] space-y-2.5 text-[14px] leading-relaxed text-cine">
        <p className="t-secondary"><span className="font-mono-tech text-[11px] tracking-[0.14em] t-amber">CLASSIFICATION&nbsp;&nbsp;</span>Congestion • Risk • Status</p>
        <p className="t-secondary"><span className="font-mono-tech text-[11px] tracking-[0.14em] t-accent">REGRESSION&nbsp;&nbsp;</span>Waiting • Delay</p>
        <p className="t-secondary"><span className="font-mono-tech text-[11px] tracking-[0.14em] text-[#A5B4FC]">CLUSTERING&nbsp;&nbsp;</span>Traffic • Vessel • Port Patterns</p>
      </div>
    )
  }
  if (kind === 'predict') {
    return (
      <div className="mt-5 space-y-1.5 font-mono-tech text-[11px] tracking-[0.14em] text-cine">
        <p className="t-primary">PREDICTED CONGESTION — <span className="t-amber">ELEVATED · TIER 2</span></p>
        <p className="t-primary">ESTIMATED WAITING — <span className="t-accent">8.4 HRS ± 32 MIN</span></p>
        <p className="t-primary">TRAFFIC INTENSITY — <span className="t-amber">HIGH · OUTER SWARM</span></p>
        <p className="pt-1 text-[9px] tracking-[0.24em] t-dim">ILLUSTRATIVE PREDICTION — NOT LIVE DATA</p>
      </div>
    )
  }
  if (kind === 'decide') {
    return (
      <p className="mt-5 inline-block border border-[#6DE7FF]/40 px-3 py-1.5 font-mono-tech text-[10px] tracking-[0.22em] t-accent text-cine">
        HUMAN-CONTROLLED DECISION SUPPORT
      </p>
    )
  }
  return null
}

function writePart(el, t, dy = 26) {
  if (!el) return
  const y = (1 - t) * dy
  const s = 0.96 + 0.04 * t
  el.style.opacity = t < 0.01 ? '0' : t.toFixed(3)
  el.style.visibility = t <= 0.01 ? 'hidden' : 'visible'
  el.style.transform = `translateY(${y.toFixed(1)}px) scale(${s.toFixed(4)})`
  el.style.willChange = t > 0 && t < 1 ? 'opacity, transform' : 'auto'
}

export default function CinematicText({ progressRef, onNavigate }) {
  const nodes = useRef({})

  useProgressLoop(progressRef, (p) => {
    const n = nodes.current
    // — hero —
    const hero = windowOf(p, -0.06, 0.075)
    if (n.hero) {
      n.hero.style.opacity = hero.opacity.toFixed(3)
      n.hero.style.visibility = hero.visible ? 'visible' : 'hidden'
    }
    writePart(n.heroE, stage(hero.w, -0.2, 0.2), 18)
    writePart(n.heroT, stage(hero.w, -0.1, 0.35), 30)
    writePart(n.heroB, stage(hero.w, 0.1, 0.5), 20)
    // — chapters —
    for (const c of CHAPTERS) {
      const w = windowOf(p, c.s, c.e)
      const root = n[`${c.id}`]
      if (root) {
        const exc = smooth((w.w - 0.78) / 0.22)
        root.style.opacity = (w.opacity * (1 - exc)).toFixed(3)
        root.style.visibility = w.visible ? 'visible' : 'hidden'
        root.style.transform = `translateY(${(-20 * exc).toFixed(1)}px)`
      }
      writePart(n[`${c.id}E`], stage(w.w, 0.0, 0.28), 18)
      writePart(n[`${c.id}T`], stage(w.w, 0.12, 0.5), 26)
      writePart(n[`${c.id}B`], stage(w.w, 0.32, 0.68), 20)
    }
    // — telemetry strip —
    const tele = windowOf(p, 0.27, 0.55)
    if (n.tele) {
      n.tele.style.opacity = tele.opacity.toFixed(3)
      n.tele.style.visibility = tele.visible ? 'visible' : 'hidden'
    }
    // — outcome strip —
    const outcome = windowOf(p, 0.968, 0.986)
    if (n.outcome) {
      n.outcome.style.opacity = outcome.opacity.toFixed(3)
      n.outcome.style.visibility = outcome.visible ? 'visible' : 'hidden'
    }
    // — finale —
    if (n.finale) {
      const on = p >= 0.982
      const t = on ? Math.min(1, (p - 0.982) / 0.018) : 0
      n.finale.style.opacity = t.toFixed(3)
      n.finale.style.visibility = t > 0.01 ? 'visible' : 'hidden'
    }
    // — closing scrim —
    if (n.scrim) {
      const o = p < 0.965 ? 0 : Math.min(0.62, ((p - 0.965) / 0.035) * 0.62)
      n.scrim.style.opacity = o.toFixed(3)
    }
  })

  const set = (key) => (el) => {
    if (el) nodes.current[key] = el
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-[#04101D]/45 to-transparent" />
      <div ref={set('scrim')} className="absolute inset-0 bg-[#04101D]" style={{ opacity: 0 }} />

      {/* ================= HERO OPENING ================= */}
      <div ref={set('hero')} className="absolute inset-0" style={{ opacity: 1 }}>
        <div className="absolute left-[8.33vw] top-[15vh] w-[52vw] max-w-[800px]">
          <div ref={set('heroE')} className="relative">
            <Eyebrow>INDIAN MARITIME INTELLIGENCE</Eyebrow>
          </div>
          <h1
            ref={set('heroT')}
            className="font-display relative mt-4 whitespace-nowrap text-[clamp(3rem,6.4vw,6.2rem)] font-extrabold leading-[0.92] tracking-[-0.035em] t-primary text-cine"
          >
            SAGARDRISHTI
          </h1>
          <div ref={set('heroB')} className="relative">
            <p className="mt-5 text-[16px] font-medium leading-[1.55] t-secondary text-cine">
              Port Analytics&nbsp;&nbsp;•&nbsp;&nbsp;Vessel Intelligence&nbsp;&nbsp;•&nbsp;&nbsp;Predictive Decision Support
            </p>
            <p className="font-display mt-3 text-[clamp(1.25rem,1.8vw,1.7rem)] font-semibold leading-snug t-primary text-cine">
              Every voyage leaves a signal.
            </p>
          </div>
        </div>

        <div ref={set('heroB2')} className="absolute bottom-[13vh] left-[8.33vw]">
          <div className="space-y-1.5">
            {['VESSEL MOVEMENT', 'PORT ACTIVITY', 'WEATHER', 'OCEAN', 'PREDICTION'].map((t) => (
              <div key={t} className="flex items-center gap-3">
                <span className="inline-block h-px w-5 bg-[#8FD8E8]/50" />
                <span className="font-mono-tech text-[10px] tracking-[0.16em] t-dim text-cine">{t}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute inset-x-[8.33vw] bottom-[6vh] flex items-end justify-between">
          <button onClick={() => onNavigate?.(0.12)} className="btn-ghost pointer-events-auto">
            EXPLORE THE JOURNEY <span aria-hidden>↓</span>
          </button>
          <div className="flex flex-col items-center gap-3">
            <span className="font-mono-tech text-[10px] tracking-[0.3em] t-dim text-cine">SCROLL TO EXPLORE</span>
            <span className="animate-scrollline block h-10 w-px bg-[#6DE7FF]/80" />
          </div>
          <Link to="/dashboard" className="btn-ghost pointer-events-auto">
            VIEW SYSTEM <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      {/* ================= 12 CHAPTERS (11 windowed + outcome strip) ================= */}
      {CHAPTERS.map((c) => (
        <div
          key={c.id}
          ref={set(c.id)}
          className={`absolute ${c.top} ${c.side === 'left' ? 'left-[8.33vw] w-[34vw] max-w-[560px]' : 'right-[8.33vw] w-[34vw] max-w-[560px]'} flex-col px-1 ${c.side === 'left' ? 'items-start text-left' : 'items-end text-right'}`}
          style={{ display: 'flex', opacity: 0, visibility: 'hidden' }}
        >
          <div className={`chapter-scrim ${c.side === 'right' ? 'chapter-scrim-right' : ''}`} />
          <div ref={set(`${c.id}E`)} className="relative">
            <Eyebrow align={c.side}>{c.eyebrow}</Eyebrow>
          </div>
          <div ref={set(`${c.id}T`)} className="relative">
            <Title>{c.title}</Title>
          </div>
          <div ref={set(`${c.id}B`)} className={`relative ${c.side === 'right' ? 'flex flex-col items-end' : ''}`}>
            <Body>{c.body}</Body>
            {c.extra && <ChapterExtra kind={c.extra} />}
          </div>
        </div>
      ))}

      {/* ================= VESSEL TELEMETRY (cinematic micro-UI) ================= */}
      <div ref={set('tele')} className="absolute bottom-[7vh] left-[8.33vw] hidden md:block" style={{ opacity: 0, visibility: 'hidden' }}>
        <p className="font-mono-tech mb-2.5 text-[9px] tracking-[0.24em] t-tech text-cine">AIS · VESSEL TRACK — ILLUSTRATIVE</p>
        <div className="rule-cine mb-3 w-64" />
        <div className="flex gap-7 font-mono-tech text-[11px] tracking-[0.12em] text-cine">
          {[
            ['POSITION', '15.92°N / 80.12°E'],
            ['HEADING', '087°'],
            ['SPEED', '12.8 KN'],
            ['TIME', '14:32:07 UTC'],
            ['STATUS', 'UNDERWAY'],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="t-tech opacity-80">{k}</div>
              <div className="t-primary mt-1 text-[13px] font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= 12 OUTCOME strip ================= */}
      <div
        ref={set('outcome')}
        className="absolute inset-x-0 bottom-[10vh] flex flex-col items-center px-6 text-center"
        style={{ opacity: 0, visibility: 'hidden' }}
      >
        <p className="font-mono-tech mb-3 text-[11px] tracking-[0.22em] t-tech text-cine">12 — THE OUTCOME</p>
        <p className="font-display text-[clamp(1.5rem,2.6vw,2.5rem)] font-extrabold leading-[1.05] tracking-[-0.02em] t-primary text-cine">
          BETTER INFORMATION. EARLIER DECISIONS.<br />POTENTIALLY LESS WAITING.
        </p>
      </div>

      {/* ================= FINALE ================= */}
      <div
        ref={set('finale')}
        className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
        style={{ opacity: 0, visibility: 'hidden' }}
      >
        <div className="chapter-scrim-center" />
        <p className="font-mono-tech text-[12px] tracking-[0.3em] t-tech text-cine">SAGARDRISHTI</p>
        <h2 className="font-display mt-5 max-w-4xl text-[clamp(2rem,4.6vw,4.2rem)] font-extrabold leading-[1.04] tracking-[-0.025em] t-primary text-cine">
          The ocean generates the data.<br /><span className="t-accent">We turn it into intelligence.</span>
        </h2>
        <div className="pointer-events-auto mt-9 flex flex-col items-center gap-4 sm:flex-row">
          <Link to="/login" className="btn-primary">ENTER COMMAND CENTER <span aria-hidden>→</span></Link>
          <Link to="/dashboard" className="btn-ghost">EXPLORE SYSTEM <span aria-hidden>→</span></Link>
        </div>
      </div>
    </div>
  )
}
