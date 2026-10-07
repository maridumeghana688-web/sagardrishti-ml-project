import { useMaritime } from '../../state/MaritimeContext.jsx'
import { OfflineBanner } from '../../components/ops/StatusBar.jsx'
import SearchBar from '../../components/ops/SearchBar.jsx'
import ForecastTimeline from '../../components/ops/ForecastTimeline.jsx'
import { Explain } from '../../components/ops/shared.jsx'
import IndiaMap from '../../components/maritime/IndiaMapGL.jsx'
import PortPanel from '../../components/maritime/PortPanel.jsx'
import VesselPanel from '../../components/maritime/VesselPanel.jsx'

/** /dashboard/ports — the 44 monitored WPI ports with full intelligence. */
export default function PortsView() {
  const m = useMaritime()
  return (
    <div className="sd-dash space-y-4">
      <div>
        <p className="eyebrow text-cyan-200/80">PORT INTELLIGENCE</p>
        <h1 className="font-display text-2xl font-extrabold text-white">44 Monitored Ports</h1>
        <p className="mt-1 text-xs text-slate-400">Real WPI port metadata with live situation, next-day model forecast and risk drivers.</p>
      </div>
      <OfflineBanner />
      {!m.apiOnline && m.ports.length === 0 ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">Backend unavailable — port list unknown.</p>
      ) : (
        <>
          <SearchBar showMode={false} />
          <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4" role="region" aria-label="Port browser">
            <div className="space-y-3">
              {m.groupedPorts.map((g) => (
                <div key={g.name}>
                  <p className="font-mono-tech text-[10px] text-cyan-200/70">{g.name} · {g.list.length}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {g.list.map((p) => (
                      <button key={p.id} onClick={() => m.selectPort(p.id)}
                        aria-pressed={p.id === m.selectedId}
                        className={`rounded-full border px-2.5 py-1 text-[11px] ${p.id === m.selectedId ? 'border-cyan-300/60 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/5'}`}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="sd-ops-grid">
            <div className="sd-map-col space-y-2">
              <IndiaMap
                ports={m.visiblePorts} predictions={m.predictions}
                selectedId={m.selectedId} onSelect={(id) => m.selectPort(id)}
                vessels={m.vessels} portsById={m.portsById}
                selectedMmsi={m.selectedMmsi} onSelectVessel={m.selectVessel}
                layers={m.layers} onToggleLayer={(k) => m.setLayers((s) => ({ ...s, [k]: !s[k] }))}
                focusVessel={m.focusVessel}
              />
            </div>
            <aside className="sd-intel-col" aria-label="Port intelligence">
              {m.selectedMmsi ? (
                <VesselPanel vessel={m.selectedVessel} onClose={() => { m.setSelectedMmsi(null); m.setFocusVessel(null) }} portsById={m.portsById} />
              ) : m.selectedPort ? (
                <>
                  {m.portVessels.near === 0 && (m.apiOnline || m.demo) && (
                    <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 font-mono-tech text-[11px] text-slate-400" role="status">NO CURRENT AIS ASSOCIATIONS — no vessels currently associated with this port.</p>
                  )}
                  <PortPanel port={m.selectedPort} detail={m.detail} state={!m.apiOnline && !m.detail ? 'error' : m.detailState} live={m.detailState === 'idle' ? m.portVessels : null} history={m.analytics?.history} />
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><Explain target="traffic_target_next_day" portName={m.selectedPort.name} risk={m.selRisk?.label} /></div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4"><Explain target="congestion_target_next_day" portName={m.selectedPort.name} risk={m.selRisk?.label} /></div>
                </>
              ) : (
                <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">Search or pick a port for full intelligence: live situation, next-day forecast, environment and risk drivers.</p>
              )}
            </aside>
          </div>
          <ForecastTimeline />
        </>
      )}
    </div>
  )
}
