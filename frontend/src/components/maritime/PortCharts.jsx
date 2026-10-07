import { useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const RANGES = [
  { key: '7d', label: '7 DAYS', days: 7 },
  { key: '14d', label: '14 DAYS', days: 14 },
  { key: '30d', label: '30 DAYS', days: 30 },
  { key: 'all', label: 'AVAILABLE HISTORY', days: 90 },
]

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
      <p className="eyebrow mb-3 text-slate-400">{title}</p>
      {children}
    </div>
  )
}

/** Observed history (solid) + predicted point (marked). Explicit loading/no-data/error. */
export default function PortCharts({ analytics, prediction, state }) {
  const [range, setRange] = useState('30d')
  const days = RANGES.find((r) => r.key === range)?.days ?? 30

  const hist = useMemo(() => (analytics?.history || []).slice(-days), [analytics, days])

  if (state === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-red-400/20 bg-red-500/5 p-4">
        <p className="text-sm text-red-200">HISTORICAL DATA UNAVAILABLE</p>
        <p className="mt-1 text-xs text-slate-400">What still works: live AIS, port metadata, cached forecasts. Charts retry automatically.</p>
      </div>
    )
  }
  if (state === 'loading' || !analytics) {
    return (
      <div role="status" aria-label="Loading charts" className="grid gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="animate-pulse rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <div className="h-3 w-40 rounded bg-white/10" />
            <div className="mt-3 h-56 rounded bg-white/5" />
          </div>
        ))}
      </div>
    )
  }
  if (!analytics.history || analytics.history.length === 0) {
    return <p className="rounded-xl border border-white/10 p-4 text-sm text-slate-400" role="status">No historical observations are available for this port.</p>
  }
  const withPred = prediction
    ? [...hist, { date: `${prediction.date} (forecast)`, traffic: null, congestion: null, trafficPred: prediction.traffic, congestionPred: prediction.congestion }]
    : hist
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="History range">
        {RANGES.map((r) => (
          <button
            key={r.key} type="button" onClick={() => setRange(r.key)} aria-pressed={range === r.key}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${range === r.key ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-slate-900 text-slate-500'}`}
          >
            {r.label}
          </button>
        ))}
        <span className="ml-auto font-mono-tech text-[10px] text-slate-500">{hist.length} observed days · GFW daily</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="TRAFFIC — OBSERVED vs FORECAST">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={withPred}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} width={60} />
              <Tooltip contentStyle={{ background: '#0A1628', border: '1px solid rgba(255,255,255,0.15)' }} />
              <Legend />
              <Line type="monotone" dataKey="traffic" name="Observed" stroke="#22D3EE" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="trafficPred" name="Forecast" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="CONGESTION — OBSERVED vs FORECAST">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={withPred}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} width={60} />
              <Tooltip contentStyle={{ background: '#0A1628', border: '1px solid rgba(255,255,255,0.15)' }} />
              <Legend />
              <Line type="monotone" dataKey="congestion" name="Observed proxy" stroke="#22D3EE" dot={false} strokeWidth={2} connectNulls />
              <Line type="monotone" dataKey="congestionPred" name="Forecast" stroke="#F59E0B" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 4 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}
