import { useEffect, useState } from 'react'
import { API_BASE } from '../../api/client.js'

export function Stat({ value, label, sub, demo }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${demo ? 'border-violet-300/30 bg-violet-300/[0.04]' : 'border-white/10 bg-white/[0.03]'}`}>
      <p className="font-display text-xl font-extrabold text-white">{value}</p>
      <p className="eyebrow mt-0.5 text-slate-400" style={{ fontSize: 9 }}>{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  )
}

export function Seg({ label, color }) {
  return (
    <span className="sd-status-seg">
      <span className="sd-dot" style={{ background: color }} aria-hidden />
      <span className="font-mono-tech" style={{ color }}>{label}</span>
    </span>
  )
}

/** Small ⓘ explainer for model-derived values (§19). No invented units. */
export function InfoTip({ text, label = 'What does this mean?' }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="sd-infotip">
      <button
        type="button" aria-label={label} aria-expanded={open} title={text}
        onClick={() => setOpen((o) => !o)}
        className="sd-infotip-btn"
      >
        ⓘ
      </button>
      {open && <span className="sd-infotip-pop" role="note">{text}</span>}
    </span>
  )
}

export const TRAFFIC_TIP = 'Model-derived traffic index: predicted GFW vessel presence-hours for the next day at this port. An index/model output — not a vessel count.'
export const CONGESTION_TIP = 'Model-derived congestion index: GFW-derived daily congestion proxy score for the next day. Higher values indicate greater modeled congestion. A score — not a percentage or vessel count.'

export function Explain({ target, portName, risk }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let live = true
    fetch(`${API_BASE}/api/v1/explainability/global`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (live) setData(j) }).catch(() => {})
    return () => { live = false }
  }, [])
  // Source audit: traffic importances are fractions (sum ≈ 0.97) but
  // congestion importances are RAW LightGBM gain values (sum ≈ 3976, top 932).
  // Multiplying raw gain by 100 produced "93200.0%". The mathematically
  // appropriate normalization for gain importance is share of total gain,
  // so percentages always sum to 100 per target.
  const all = data?.targets?.[target] || []
  const total = all.reduce((s, r) => s + Math.abs(r.importance || 0), 0)
  const rows = all.slice(0, 6)
  const max = Math.max(1e-9, ...rows.map((r) => Math.abs(r.importance)))
  const pretty = (f) => f.replace(/^num__|^cat__/, '').replace(/_/g, ' ')
  if (!rows.length) return <p className="text-xs text-slate-500">Driver data unavailable.</p>
  return (
    <div>
      {portName && <p className="eyebrow mb-2 text-cyan-200/80">MODEL DRIVERS · {portName}{risk ? ` · ${risk} RISK` : ''}</p>}
      <p className="eyebrow mb-2 text-slate-400">GLOBAL MODEL FEATURE IMPORTANCE</p>
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const share = total > 0 ? (Math.abs(r.importance) / total) * 100 : 0
          return (
            <div key={r.feature}>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>{i + 1}. {pretty(r.feature)} <span aria-hidden>{r.direction === 'down' ? '↓' : '↑'}</span></span>
                <span className="font-mono-tech" title={`raw gain ${r.importance}`}>{share.toFixed(1)}%</span>
              </div>
              <div className="h-1.5 rounded bg-white/5"><div className="h-1.5 rounded bg-cyan-300/70" style={{ width: `${(Math.abs(r.importance) / max) * 100}%` }} /></div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Share of total model gain across all features (sums to 100%). Global model importance — associational, not causal, and not an explanation of this port&apos;s individual prediction.</p>
    </div>
  )
}
