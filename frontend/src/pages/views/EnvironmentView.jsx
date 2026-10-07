import { useMaritime } from '../../state/MaritimeContext.jsx'
import { OfflineBanner } from '../../components/ops/StatusBar.jsx'

function EnvCard({ label, value, sub }) {
  return (
    <div className="sd-card">
      <p className="eyebrow text-slate-400">{label}</p>
      <p className="font-display mt-1 break-words text-xl font-bold leading-tight text-white">{value ?? 'NO RECENT READING'}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

/** /dashboard/environment — CMEMS/NOAA/GFW marine environment + provenance. */
export default function EnvironmentView() {
  const m = useMaritime()
  const env = m.detail?.environment
  const src = (name) => m.sourceHealth.find(([k]) => k === name)?.[1]
  return (
    <div className="sd-dash space-y-4">
      <div>
        <p className="eyebrow text-cyan-200/80">ENVIRONMENT</p>
        <h1 className="font-display text-2xl font-extrabold text-white">Marine Environmental Intelligence</h1>
        <p className="mt-1 text-xs text-slate-400">CMEMS ocean physics + NOAA SST for the selected port. Stale values are never presented as live.</p>
      </div>
      <OfflineBanner />
      {!m.apiOnline && m.ports.length === 0 ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">Backend unavailable — environment unknown.</p>
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
          {!m.selectedPort ? (
            <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">Select a port to inspect its marine environment.</p>
          ) : m.detailState === 'loading' ? (
            <p className="animate-pulse text-sm text-slate-400" role="status">Loading environment…</p>
          ) : m.detailState === 'error' || !env ? (
            <p role="status" className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">NO RECENT READING for {m.selectedPort.name} — no recent CMEMS/NOAA values in the current window.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <EnvCard label="SEA SURFACE TEMP" value={env.sst != null ? `${env.sst} °C` : 'NO RECENT READING'} sub={env.sst_date ? `Source: CMEMS · Observed ${env.sst_date}` : 'NOAA HISTORICAL REFERENCE · last available 2023 — no recent reading'} />
                <EnvCard label="CURRENT MAGNITUDE" value={env.current_magnitude != null ? `${env.current_magnitude} m/s` : 'NO RECENT READING'} sub={env.obs_date ? `Source: CMEMS monthly · ${env.obs_date}` : 'Source: CMEMS monthly · no recent reading'} />
                <EnvCard label="SALINITY" value={env.salinity != null ? `${env.salinity} PSU` : 'NO RECENT READING'} sub={env.obs_date ? `Source: CMEMS monthly · ${env.obs_date}` : 'Source: CMEMS monthly · no recent reading'} />
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <p className="font-mono-tech text-[11px] text-slate-300">
                  SOURCE {env.source || 'CMEMS physics + NOAA SST'} · TIMESTAMP {env.obs_date || 'NO RECENT READING'} · RESOLUTION monthly gridded · DATA AGE {env.data_age || 'NO RECENT READING'}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  STATUS CMEMS {env.current_magnitude != null || env.salinity != null ? 'RECENT · monthly physics' : 'NO RECENT READING'} ·
                  STATUS NOAA SST HISTORICAL · product ended 2023-12-31, last available 2023 — never shown as live.
                </p>
                {env.sst == null && (
                  <p className="mt-1 text-[11px] text-slate-500">NOAA historical data — live SST unavailable. CMEMS fields shown only where observed.</p>
                )}
              </div>
            </>
          )}
          <div className="grid gap-3 sm:grid-cols-3" role="region" aria-label="Source provenance">
            {['GFW', 'CMEMS', 'NOAA'].map((k) => {
              const h = src(k)
              if (!h) return null
              return (
                <div key={k} className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
                  <p className="font-mono-tech text-xs text-cyan-200">{k}</p>
                  <p className="mt-1 text-sm font-semibold" style={{ color: h.color }}>{h.state}</p>
                  <p className="font-mono-tech mt-1 text-[10px] text-slate-500">{h.detail}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
