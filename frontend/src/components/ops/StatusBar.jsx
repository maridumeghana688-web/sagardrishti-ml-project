import { useMaritime } from '../../state/MaritimeContext.jsx'
import { useAuth } from '../../auth/AuthContext.jsx'
import { Seg } from './shared.jsx'

/** Compact command-center status bar with expandable per-system details. */
export default function StatusBar() {
  const m = useMaritime()
  const { user } = useAuth()
  return (
    <div className="sd-statusbar" role="status" aria-label="System status">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <Seg label={m.sysLabel[0]} color={m.sysLabel[1]} />
        <Seg label={m.apiLabel[0]} color={m.apiLabel[1]} />
        <Seg label={m.demo ? `${m.aisLabel[0]} · ${m.stats.total} SIMULATED` : `${m.aisLabel[0]}${m.apiOnline && m.aisConnected && m.health.last_event_age_s != null && m.vessels.length ? ` · ${Math.round(m.health.last_event_age_s)}s ago` : ''}`} color={m.aisLabel[1]} />
        <Seg label={`${m.dataLabel[0]}${m.sources?.latest_prediction_date ? ` · ${m.sources.latest_prediction_date}` : ''}`} color={m.dataLabel[1]} />
        <Seg label={m.modelLabel[0]} color={m.modelLabel[1]} />
        <span className="font-mono-tech ml-auto text-xs text-slate-400">
          LAST UPDATE <span className="text-cyan-200">{m.clock} IST</span>
          {user && <span className="ml-3 text-cyan-200/80">{(user.full_name || '').toUpperCase()}</span>}
        </span>
        <button
          type="button" onClick={() => m.setStatusOpen((o) => !o)} aria-expanded={m.statusOpen} aria-label="Toggle system details"
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono-tech text-[11px] text-slate-300 hover:bg-white/10"
        >
          {m.statusOpen ? 'HIDE ▴' : 'DETAILS ▾'}
        </button>
      </div>
      {m.statusOpen && (
        <div className="sd-status-detail">
          {[
            ['SYSTEM', m.sysLabel[0], m.apiOnline ? 'All core services reachable.' : 'Backend unreachable — live data, search and forecasts are suspended. Auto-retry every 10s.'],
            ['API', m.apiLabel[0], m.apiOnline ? 'http://localhost:8000 responding.' : 'http://localhost:8000 unreachable. Start backend: cd backend; py -m uvicorn app.main:app --port 8000'],
            ['AIS', m.aisLabel[0], m.demo ? 'Demo fleet active; live AIS state preserved underneath.' : (() => {
              const va = m.aisSources.find((s) => s.id === 'vesselapi')
              const vaBit = !va || va.status === 'NOT_CONFIGURED' ? 'VA n/a' : `${va.connected ? `${va.vessels ?? 0} vessels` : 'down'}`
              return `OW ${m.aisSources.find((s) => s.id === 'openwaters')?.connected ? `${m.aisSources.find((s) => s.id === 'openwaters')?.vessels ?? 0} vessels` : 'down'} · AS ${m.aisSources.find((s) => s.id === 'aisstream')?.connected ? `${m.aisSources.find((s) => s.id === 'aisstream')?.vessels ?? 0} vessels` : 'down'} · VA ${vaBit} · unique ${m.aggregation?.unique_vessels ?? m.stats.total} (3-way ${m.aggregation?.from_all_three ?? 0}).`
            })()],
            ['DATA', m.dataLabel[0], m.sources ? `GFW ${m.sources.sources.gfw} · CMEMS ${m.sources.sources.cmems} · NOAA ${m.sources.sources.noaa} · age ${m.sources.data_age_days ?? '—'}d` : 'No source snapshot yet.'],
            ['MODEL', m.modelLabel[0], m.predictions.length ? `daily_traffic_model_v1 + daily_congestion_model_v1 · ${m.predictions.length} port forecasts` : 'No forecasts loaded.'],
          ].map(([k, v, note]) => (
            <div key={k} className="sd-status-row">
              <span className="font-mono-tech text-[11px] text-cyan-200">{k}</span>
              <span className="text-xs text-slate-200">{v}</span>
              <span className="text-[11px] text-slate-500">{note}</span>
              {k === 'API' && !m.apiOnline && (
                <button type="button" onClick={m.retry} className="rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-3 py-1 font-mono-tech text-[11px] text-cyan-100 hover:bg-cyan-300/20">RETRY CONNECTION</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function OfflineBanner() {
  const m = useMaritime()
  if (m.apiOnline) return null
  return (
    <div role="alert" className="sd-offline-banner">
      <div>
        <p className="font-mono-tech text-sm tracking-[0.15em] text-red-200">BACKEND OFFLINE · API CONNECTION FAILED</p>
        <p className="mt-1 text-xs text-slate-400">MARITIME API OFFLINE — unable to retrieve operational data at http://localhost:8000. Retrying automatically every 10s; no page refresh needed on recovery. Previously loaded data (if any) is retained, never zero-filled.</p>
      </div>
      <button type="button" onClick={m.retry} className="shrink-0 rounded-lg border border-red-300/40 bg-red-400/10 px-4 py-2 font-mono-tech text-xs text-red-100 hover:bg-red-400/20">RETRY CONNECTION</button>
    </div>
  )
}

export function DemoBanner() {
  const m = useMaritime()
  if (!m.demo) return null
  return (
    <div role="status" className="sd-demo-banner">
      <p className="font-mono-tech text-sm tracking-[0.15em]">DEMO MODE · SIMULATED TRAFFIC · DEMO TIME ×240</p>
      <p className="mt-0.5 text-[11px] opacity-80">Deterministic demonstration vessels (MMSI 9990001xx block) sailing fixed routes to real ports. NOT real AIS. Live pipeline untouched underneath — switch back to LIVE DATA anytime.</p>
    </div>
  )
}
