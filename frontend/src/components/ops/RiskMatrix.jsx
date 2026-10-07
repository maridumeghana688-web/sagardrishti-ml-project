import { useMaritime } from '../../state/MaritimeContext.jsx'
import { InfoTip, TRAFFIC_TIP, CONGESTION_TIP } from './shared.jsx'

/** Port risk matrix with model-index terminology (§18/19). Row click selects the port. */
export default function RiskMatrix({ compact = false }) {
  const m = useMaritime()
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="Port risk matrix">
      <div className="flex flex-wrap items-center gap-2">
        <p className="eyebrow text-slate-400">PORT RISK MATRIX · {m.sources?.latest_prediction_date || 'forecast unavailable'} · CLICK ROW TO SELECT</p>
        <div className="ml-auto flex gap-1" role="group" aria-label="Sort risks">
          {[['congestion', 'CONGESTION'], ['traffic', 'TRAFFIC'], ['activity', 'ACTIVITY'], ['trend', 'TREND'], ['port', 'PORT']].map(([k, l]) => (
            <button key={k} onClick={() => m.setRiskSort(k)} aria-pressed={m.riskSort === k}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${m.riskSort === k ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-slate-900 text-slate-500'}`}>{l}</button>
          ))}
        </div>
      </div>
      {!m.apiOnline && m.riskRows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-white/10 p-4 text-sm text-slate-400" role="status">FORECAST UNAVAILABLE — prediction service did not return data (API offline).</p>
      ) : (
        <div className={`mt-3 overflow-auto ${compact ? 'max-h-96' : 'max-h-64'}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-950">
              <tr className="font-mono-tech text-[10px] text-slate-500">
                <th className="py-1 text-left">PORT</th>
                <th className="text-right">TRAFFIC INDEX <InfoTip text={TRAFFIC_TIP} /></th>
                <th className="text-right">CONGESTION INDEX <InfoTip text={CONGESTION_TIP} /></th>
                <th className="text-right">RISK</th>
                <th className="text-right">LIVE</th>
                <th className="text-right">TREND 14D</th>
              </tr>
            </thead>
            <tbody>
              {m.riskRows.map((r) => (
                <tr key={r.id} onClick={() => m.selectPort(r.id)}
                  className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${r.id === m.selectedId ? 'bg-cyan-300/5' : ''}`} tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') m.selectPort(r.id) }} aria-label={`Select ${r.name}`}>
                  <td className="py-1.5 text-slate-200">{r.name} <span className="font-mono-tech text-[10px] text-slate-500">{r.id}</span></td>
                  <td className="text-right font-mono-tech text-xs text-slate-300">{r.traffic != null ? r.traffic.toFixed(1) : '—'}</td>
                  <td className="text-right font-mono-tech text-xs text-slate-300">{r.congestion != null ? r.congestion.toFixed(3) : '—'}</td>
                  <td className="text-right"><span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${r.status.color}22`, color: r.status.color }}>{r.status.label}</span></td>
                  <td className="text-right font-mono-tech text-xs text-slate-400">{m.demo ? (r.live || '—') : m.apiOnline ? (r.live || '—') : '—'}</td>
                  <td className="text-right font-mono-tech text-xs text-slate-400">{r.trend == null ? '—' : `${r.trend >= 0 ? '+' : ''}${r.trend.toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Traffic and congestion are model-derived indexes (presence-hours / proxy score) — not vessel counts or percentages. Risk bands come from model-output tertiles.</p>
    </div>
  )
}
