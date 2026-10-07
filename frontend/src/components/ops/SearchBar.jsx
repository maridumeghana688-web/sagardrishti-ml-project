import { useMaritime, REGIONS } from '../../state/MaritimeContext.jsx'
import { freshnessOf } from '../../api/live.js'

/** Shared search + region + live/demo controls used by map views. */
export default function SearchBar({ showMode = true }) {
  const m = useMaritime()
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          id="port-search" value={m.query} onChange={(e) => m.setQuery(e.target.value)}
          placeholder="Search port (name / WPI) or vessel (name / MMSI)…"
          aria-label="Search ports and vessels" role="combobox" aria-expanded={m.q.length > 0}
          className="min-w-52 flex-1 rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-cyan-300/50 focus:outline-none"
        />
        <div className="flex gap-1" role="group" aria-label="Region filter">
          {REGIONS.map((r) => (
            <button key={r.name} onClick={() => m.setRegion(r.name)} aria-pressed={m.region === r.name}
              className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${m.region === r.name ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-slate-900 text-slate-400'}`}>
              {r.name}
            </button>
          ))}
        </div>
        {showMode && (
          <div className="flex gap-1" role="group" aria-label="Data mode">
            {([['live', 'LIVE DATA'], ['demo', 'DEMO DATA']]).map(([k, l]) => (
              <button key={k} onClick={() => { m.setMode(k); m.setSelectedMmsi(null) }} aria-pressed={m.mode === k}
                title={k === 'demo' ? 'Deterministic simulated vessels for demonstration. Never real AIS.' : 'Real backend-fed AIS traffic only.'}
                className={`rounded-lg border px-2.5 py-2 font-mono-tech text-[11px] font-semibold ${m.mode === k ? (k === 'demo' ? 'border-violet-300/60 bg-violet-300/10 text-violet-100' : 'border-emerald-300/50 bg-emerald-300/10 text-emerald-100') : 'border-white/10 bg-slate-900 text-slate-500'}`}>
                {l}
              </button>
            ))}
          </div>
        )}
      </div>
      {m.q && !m.apiOnline && !m.demo && (
        <p role="status" className="rounded-lg border border-amber-300/30 bg-amber-400/5 px-4 py-2 font-mono-tech text-xs text-amber-200">SEARCH UNAVAILABLE · API OFFLINE</p>
      )}
      {m.q && (m.apiOnline || m.demo) && (
        <div id="port-results" role="listbox" aria-label="Search results" className="max-h-44 overflow-auto rounded-lg border border-white/10 bg-slate-950">
          {m.portHits.length === 0 && m.vesselHits.length === 0 && (
            <p className="px-4 py-2 text-sm text-slate-500">No matching ports.</p>
          )}
          {m.portHits.map((p) => (
            <button key={`p-${p.id}`} role="option" aria-selected={p.id === m.selectedId}
              onClick={() => { m.selectPort(p.id); m.setQuery('') }}
              className="block w-full px-4 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5">
              <span className="font-mono-tech mr-2 text-[10px] text-cyan-300">PORT</span>{p.name} <span className="font-mono-tech text-xs text-slate-500">· {p.id}</span>
            </button>
          ))}
          {m.vesselHits.map((v) => (
            <button key={`v-${v.mmsi}`} role="option" aria-selected={v.mmsi === m.selectedMmsi}
              onClick={() => { m.selectVessel(v.mmsi); m.setQuery('') }}
              className="block w-full px-4 py-1.5 text-left text-sm text-slate-200 hover:bg-white/5">
              <span className={`font-mono-tech mr-2 text-[10px] ${v.demo ? 'text-violet-300' : 'text-emerald-300'}`}>{v.demo ? 'DEMO' : 'VESSEL'}</span>{v.ship_name || 'Unknown vessel'} <span className="font-mono-tech text-xs text-slate-500">· {v.mmsi} · {v.demo ? 'SIMULATED' : freshnessOf(v)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
