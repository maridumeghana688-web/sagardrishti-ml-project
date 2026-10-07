import { portStatus } from '../../api/maritime.js'
import { InfoTip, TRAFFIC_TIP, CONGESTION_TIP } from '../ops/shared.jsx'

function Card({ label, value, sub, accent, fresh }) {
  return (
    <div className="sd-card">
      <p className="eyebrow text-slate-400">{label}</p>
      <p className="font-display mt-1 break-words text-xl font-bold leading-tight" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
      {fresh && <p className="font-mono-tech mt-1 text-[10px] text-slate-500">{fresh}</p>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="sd-section" aria-label={title}>
      <p className="eyebrow text-slate-400">{title}</p>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function StateBlock({ state, children }) {
  if (state === 'loading') return <p className="animate-pulse text-sm text-slate-400" role="status">Loading intelligence…</p>
  if (state === 'error') {
    return (
      <div role="alert" className="rounded-xl border border-red-400/20 bg-red-500/5 p-4">
        <p className="text-sm text-red-200">FORECAST SERVICE UNAVAILABLE</p>
        <p className="mt-1 text-xs text-slate-400">Port metadata and live AIS below still work. Retry is automatic on next selection.</p>
      </div>
    )
  }
  return children
}

function regionOf(port) {
  if (port.longitude < 74.5) return { region: 'WEST COAST', coast: 'Arabian Sea' }
  if (port.longitude >= 78.5) return { region: 'EAST COAST', coast: 'Bay of Bengal' }
  return { region: 'SOUTHERN COAST', coast: 'Indian Ocean approaches' }
}

function trendText(history, key) {
  const tail = (history || []).slice(-14)
  const vals = tail.map((h) => h[key]).filter((x) => x != null)
  if (vals.length < 4) return 'NO RECENT GFW READING'
  const n = Math.min(7, vals.length)
  const a = vals.slice(0, n).reduce((s, x) => s + x, 0) / n
  const b = vals.slice(-n).reduce((s, x) => s + x, 0) / n
  // Same guard as trendOf: no percentage against a near-zero baseline.
  if (!a || Math.abs(a) < 1e-9) return '— (near-zero baseline)'
  const pct = ((b - a) / Math.abs(a)) * 100
  if (!Number.isFinite(pct) || Math.abs(pct) > 999) return '— (near-zero baseline)'
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% / 14d observed`
}

/** Premium port intelligence panel — every value backs onto API data; missing → honest empty state. */
export default function PortPanel({ port, detail, state, live, history }) {
  const { region, coast } = regionOf(port)

  return (
    <div className="sd-intel" aria-live="polite">
      <div>
        <p className="eyebrow text-cyan-200/80">PORT INTELLIGENCE</p>
        <h3 className="font-display text-2xl font-bold text-white">{port.name}</h3>
        <p className="font-mono-tech text-xs text-slate-400">
          WPI {port.id} · {port.latitude.toFixed(2)}°N {port.longitude.toFixed(2)}°E · {region} · {coast}
        </p>
      </div>

      <StateBlock state={state}>
        {detail && (
          <>
            {(() => {
              const st = portStatus(detail.prediction.congestion)
              return (
                <span
                  className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: `${st.color}22`, color: st.color, border: `1px solid ${st.color}55` }}
                  role="status"
                >
                  {st.label} · from model output tertiles
                </span>
              )
            })()}

            <Section title="PORT INTELLIGENCE">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="eyebrow text-cyan-200/70">LIVE MARITIME SITUATION</p>
                  {live ? (
                    <p className="mt-1 text-xs text-slate-300">
                      Live vessels <strong className="text-white">{live.near}</strong>
                      {' '}· Approaching <strong className="text-white">{live.appr}</strong>
                      {' '}· Within 50 km <strong className="text-white">{live.near}</strong>
                      {' '}· Departing <strong className="text-white">{live.dep}</strong>
                      {live.avgSog != null ? ` · avg ${live.avgSog} kn` : ''}
                      {live.avgDist != null ? ` · avg ${live.avgDist} km` : ''}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">NO RECENT AIS READING — live situation unknown.</p>
                  )}
                  <p className="font-mono-tech mt-2 text-[10px] text-slate-500">
                    {live?.lastUpdate ? `LIVE AIS · updated ${live.lastUpdate}` : 'LIVE AIS · NO RECENT AIS READING'}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <p className="eyebrow text-cyan-200/70">VESSEL ACTIVITY</p>
                  <p className="font-display mt-1 text-xl font-bold text-white">
                    {detail.vessel.latest ? `${detail.vessel.latest.presence_hours.toLocaleString('en-IN')} presence-hrs` : 'NO RECENT GFW READING'}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    {detail.vessel.latest ? `Observed ${detail.vessel.latest.date} · GFW daily port total` : 'No active day in the last 30 days'}
                  </p>
                  <p className="font-mono-tech mt-1 text-[10px] text-slate-500">
                    {detail.vessel.latest ? `OBSERVED · ${detail.vessel.latest.date} · SOURCE GFW · Daily` : 'OBSERVED · NO RECENT GFW READING'}
                    {detail.vessel.latest ? ` · 14d trend ${trendText(history, 'traffic')}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-ocean-900 to-slate-900 p-5">
                  <p className="eyebrow text-cyan-200/70">NEXT-DAY TRAFFIC <InfoTip text={TRAFFIC_TIP} /></p>
                  <p className="font-display text-4xl font-extrabold text-white">{detail.prediction.traffic.toFixed(1)}</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Model-derived traffic index · estimated range {detail.prediction.traffic_lower.toFixed(0)} — {detail.prediction.traffic_upper.toFixed(0)}
                  </p>
                  <p className="font-mono-tech mt-2 text-[10px] text-slate-500">
                    FORECAST · NEXT DAY · {detail.prediction.date} · {detail.model.traffic_version}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-300/20 bg-gradient-to-br from-ocean-900 to-slate-900 p-5">
                  <p className="eyebrow text-cyan-200/70">NEXT-DAY CONGESTION <InfoTip text={CONGESTION_TIP} /></p>
                  <p className="font-display text-4xl font-extrabold text-white">{detail.prediction.congestion.toFixed(3)}</p>
                  <p className="mt-1 text-xs text-slate-300">
                    Model-derived congestion index · estimated range {detail.prediction.congestion_lower.toFixed(3)} — {detail.prediction.congestion_upper.toFixed(3)}
                  </p>
                  <p className="font-mono-tech mt-2 text-[10px] text-slate-500">
                    FORECAST · NEXT DAY · {detail.prediction.date} · {detail.model.congestion_version}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Traffic is a predicted GFW presence-hours index and congestion a GFW-derived proxy score — neither is a vessel count or percentage. Ranges are estimated prediction intervals (±1.28σ validation residuals) — not guaranteed accuracy.
              </p>
            </Section>

            <Section title="DATA QUALITY">
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="font-mono-tech text-[11px] text-slate-300">
                  GFW {detail.freshness.gfw} · AIS {live ? `${live.near} tracked` : 'NO RECENT AIS READING'} · CMEMS {detail.freshness.cmems} · NOAA {detail.freshness.noaa} · WPI reference
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  CMEMS monthly physics and NOAA historical SST live under System Status · Data Sources — never presented as live port conditions here.
                </p>
              </div>
            </Section>
          </>
        )}
      </StateBlock>
    </div>
  )
}
