import { useRef } from 'react'
import { CHAPTERS } from '../../data/landingStory.js'
import { useProgressLoop } from './scrollProgress.js'

const RAIL = [
  { num: '01', title: 'SIGNAL', pos: 0.075 },
  { num: '02', title: 'MOVEMENT', pos: 0.18 },
  { num: '03', title: 'PATTERNS', pos: 0.30 },
  { num: '04', title: 'PORT', pos: 0.58 },
  { num: '05', title: 'WAITING', pos: 0.70 },
  { num: '06', title: 'FUSION', pos: 0.79 },
  { num: '07', title: 'WAREHOUSE', pos: 0.85 },
  { num: '08', title: 'OLAP', pos: 0.885 },
  { num: '09', title: 'LEARNING', pos: 0.905 },
  { num: '10', title: 'FORECAST', pos: 0.925 },
  { num: '11', title: 'PEOPLE', pos: 0.954 },
  { num: '12', title: 'OUTCOME', pos: 0.968 },
]

/**
 * ScrollIndicator — ref-driven (no React renders per tick).
 * Previously re-rendered with the page on every scroll frame and animated
 * the progress hairline through a 150ms CSS width transition that fought
 * the live updates, adding visible lag. Width is now written directly.
 */
export default function ScrollIndicator({ progressRef, onNavigate }) {
  const bar = useRef()
  const pct = useRef()
  const readout = useRef()
  const counter = useRef()
  const counterTitle = useRef()
  const railNums = useRef([])
  const railBars = useRef([])
  const last = useRef({ idx: -2, chap: '', n: '', t: '', p: -1 })

  useProgressLoop(progressRef, (progress) => {
    const L = last.current
    // progress hairline: direct write, no CSS transition fighting it
    if (bar.current) bar.current.style.width = `${(progress * 100).toFixed(2)}%`
    const pi = Math.round(progress * 100)
    if (pi !== L.p) {
      L.p = pi
      if (pct.current) pct.current.textContent = `${String(pi).padStart(3, '0')}% VOYAGE`
    }
    let idx = -1
    RAIL.forEach((r, i) => {
      if (progress >= r.pos - 0.03) idx = i
    })
    if (idx !== L.idx) {
      L.idx = idx
      railNums.current.forEach((el, i) => {
        if (!el) return
        const on = i === idx
        el.style.opacity = on ? '1' : ''
        el.style.fontWeight = on ? '600' : ''
        el.style.color = on ? '#F5F7F4' : ''
      })
      railBars.current.forEach((el, i) => {
        if (!el) return
        const on = i === idx
        el.style.height = on ? '16px' : ''
        el.style.width = on ? '2px' : ''
        el.style.background = on ? '#6DE7FF' : ''
        el.style.borderRadius = on ? '0' : ''
      })
    }
    const active = [...CHAPTERS].reverse().find((c) => progress >= c.start && progress <= c.end)
    const key = active ? active.id : (progress < 0.075 ? 'pro' : 'epi')
    if (key !== L.chap) {
      L.chap = key
      const ro = active
        ? `${active.num} — ${active.label.toUpperCase()}`
        : progress < 0.075
          ? 'OPEN OCEAN'
          : 'SAGARDRISHTI — SEE THE MOVEMENT'
      if (readout.current) readout.current.textContent = ro
      const cn = active ? active.num : progress < 0.075 ? '01' : '12'
      const ct = active ? active.title : progress < 0.075 ? 'THE SIGNAL' : 'THE OUTCOME'
      if (counter.current) {
        counter.current.textContent = ''
        const b = document.createElement('span')
        b.textContent = `${cn} `
        const dim = document.createElement('span')
        dim.className = 't-dim font-normal'
        dim.textContent = '/ 12'
        counter.current.append(b, dim)
        counter.current.parentElement.style.opacity = active ? '1' : '0.55'
      }
      if (counterTitle.current) counterTitle.current.textContent = ct
    }
  })

  return (
    <>
      {/* chapter counter */}
      <div className="pointer-events-none fixed right-[4vw] top-[4.5rem] z-40 hidden text-right md:block">
        <p ref={counter} className="font-mono-tech text-[13px] font-semibold tracking-[0.2em] t-primary text-cine">
          01 <span className="t-dim font-normal">/ 12</span>
        </p>
        <p ref={counterTitle} className="font-mono-tech mt-1 text-[9px] tracking-[0.24em] t-tech text-cine">THE SIGNAL</p>
      </div>

      {/* right rail */}
      <div className="pointer-events-auto fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-[7px] lg:flex">
        {RAIL.map((item, idx) => (
          <button
            key={item.num}
            aria-label={`Go to chapter ${item.num} ${item.title}`}
            onClick={() => onNavigate?.(item.pos)}
            className="group flex items-center justify-end gap-2 text-right"
          >
            <span
              ref={(el) => { if (el) railNums.current[idx] = el }}
              className="font-mono-tech text-[9px] tracking-[0.18em] t-dim opacity-70 group-hover:opacity-100"
              style={{ textShadow: '0 1px 8px rgba(3,10,20,.8)' }}
            >
              {item.num}
            </span>
            <span
              ref={(el) => { if (el) railBars.current[idx] = el }}
              className="block h-[3px] w-[3px] rounded-full bg-slate-300/30 group-hover:bg-slate-100/70"
            />
          </button>
        ))}
      </div>

      {/* bottom progress hairline + chapter readout */}
      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="flex items-end justify-between px-[5vw] pb-4">
          <p ref={readout} className="font-mono-tech hidden text-[10px] tracking-[0.26em] text-slate-200/70 md:block" style={{ textShadow: '0 1px 8px rgba(3,10,20,.8)' }}>
            OPEN OCEAN
          </p>
          <p ref={pct} className="font-mono-tech text-[10px] tracking-[0.26em] text-slate-200/70" style={{ textShadow: '0 1px 8px rgba(3,10,20,.8)' }}>
            000% VOYAGE
          </p>
        </div>
        <div className="h-[2px] w-full bg-white/10">
          <div ref={bar} className="h-full bg-[#6DE7FF]" style={{ width: '0%' }} />
        </div>
      </div>
    </>
  )
}
