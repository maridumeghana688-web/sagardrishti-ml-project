import { useMaritime } from '../../state/MaritimeContext.jsx'
import { OfflineBanner } from '../../components/ops/StatusBar.jsx'
import RiskMatrix from '../../components/ops/RiskMatrix.jsx'
import { Explain, InfoTip, TRAFFIC_TIP, CONGESTION_TIP } from '../../components/ops/shared.jsx'

/** /dashboard/risk — model-derived port risk ranking with explanations. */
export default function RiskView() {
  const m = useMaritime()
  const counts = {
    HIGH: m.riskRows.filter((r) => r.status.label === 'HIGH').length,
    ELEVATED: m.riskRows.filter((r) => r.status.label === 'ELEVATED').length,
    NORMAL: m.riskRows.filter((r) => r.status.label === 'NORMAL').length,
  }
  return (
    <div className="sd-dash space-y-4">
      <div>
        <p className="eyebrow text-cyan-200/80">RISK CENTER</p>
        <h1 className="font-display text-2xl font-extrabold text-white">Port Risk Analysis</h1>
        <p className="mt-1 text-xs text-slate-400">Ranked by model-derived congestion output (tertile bands). Traffic values are model-derived indexes, not vessel counts. <InfoTip text={TRAFFIC_TIP} /> <InfoTip text={CONGESTION_TIP} /></p>
      </div>
      <OfflineBanner />
      {!m.apiOnline && m.riskRows.length === 0 ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">Backend unavailable — risk state unknown.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2" role="region" aria-label="Risk bands">
            {([['HIGH', '#EF4444'], ['ELEVATED', '#F59E0B'], ['NORMAL', '#22C55E']]).map(([l, c]) => (
              <div key={l} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center">
                <p className="font-display text-xl font-extrabold" style={{ color: c }}>{counts[l]}</p>
                <p className="eyebrow mt-0.5 text-slate-400" style={{ fontSize: 9 }}>{l}-RISK PORTS</p>
              </div>
            ))}
          </div>
          <RiskMatrix compact />
          {m.selectedPort && m.detail?.prediction && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><Explain target="traffic_target_next_day" portName={m.selectedPort.name} risk={m.selRisk?.label} /></div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><Explain target="congestion_target_next_day" portName={m.selectedPort.name} risk={m.selRisk?.label} /></div>
            </div>
          )}
          {!m.selectedPort && <p className="text-xs text-slate-500">Select a port (matrix row or search) for its detailed risk explanation.</p>}
        </>
      )}
    </div>
  )
}
