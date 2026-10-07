import { useMaritime } from '../../state/MaritimeContext.jsx'
import { OfflineBanner } from '../../components/ops/StatusBar.jsx'
import PortCharts from '../../components/maritime/PortCharts.jsx'

/** /dashboard/analytics — observed history vs model forecast. */
export default function AnalyticsView() {
  const m = useMaritime()
  return (
    <div className="sd-dash space-y-4">
      <div>
        <p className="eyebrow text-cyan-200/80">ANALYTICS</p>
        <h1 className="font-display text-2xl font-extrabold text-white">Traffic & Congestion</h1>
        <p className="mt-1 text-xs text-slate-400">OBSERVED history (GFW presence-hours, solid) vs next-day MODEL FORECAST (dashed). Forecasts are model outputs, never observations.</p>
      </div>
      <OfflineBanner />
      {!m.apiOnline && m.ports.length === 0 ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">Backend unavailable — analytics unknown.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Port selector">
            {m.ports.map((p) => (
              <button key={p.id} onClick={() => m.selectPort(p.id)} aria-pressed={p.id === m.selectedId}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${p.id === m.selectedId ? 'border-cyan-300/60 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5'}`}>
                {p.name}
              </button>
            ))}
          </div>
          {m.selectedPort ? (
            <PortCharts analytics={m.analytics} prediction={m.detail?.prediction} state={m.analyticsState} />
          ) : (
            <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">Select a port to load its observed-vs-forecast charts.</p>
          )}
        </>
      )}
    </div>
  )
}
