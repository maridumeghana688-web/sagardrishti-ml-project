import { useMaritime } from '../../state/MaritimeContext.jsx'
import { InfoTip, TRAFFIC_TIP, CONGESTION_TIP } from './shared.jsx'

/** Today-observed vs next-day model forecast, with honest index terminology. */
export default function ForecastTimeline() {
  const m = useMaritime()
  if (!m.selectedPort || !m.detail?.prediction) return null
  const p = m.detail.prediction
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="Forecast timeline">
      <p className="eyebrow text-slate-400">FORECAST TIMELINE · {m.selectedPort.name} · MODEL FORECAST (NEXT-DAY MODELS ONLY)</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[0.02] p-4">
          <p className="font-mono-tech text-[10px] text-slate-500">TODAY · OBSERVED</p>
          <p className="mt-1 text-sm text-slate-300">
            {m.analytics?.history?.length ? `Presence ${m.analytics.history[m.analytics.history.length - 1].traffic} h · ${m.analytics.history[m.analytics.history.length - 1].date}` : 'No observed history for this port.'}
          </p>
        </div>
        <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-ocean-900 to-slate-900 p-4">
          <p className="font-mono-tech text-[10px] text-cyan-200">NEXT DAY · MODEL FORECAST · {p.date}</p>
          <p className="mt-1 text-sm text-white">
            Traffic index {p.traffic.toFixed(1)} <InfoTip text={TRAFFIC_TIP} /> ({p.traffic_lower.toFixed(0)}—{p.traffic_upper.toFixed(0)}) ·
            Congestion index {p.congestion.toFixed(3)} <InfoTip text={CONGESTION_TIP} />
          </p>
          <p className="font-mono-tech mt-1 text-[10px] text-slate-500">{m.detail.model.traffic_version} · {m.detail.model.congestion_version} · intervals ±1.28σ, not guaranteed accuracy{m.detail.model.training_period ? ` · trained on ${m.detail.model.training_period}` : ''}</p>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">Models predict next-day conditions only — no +2…+14 day ML output exists. Extended charts show observed history.</p>
    </div>
  )
}
