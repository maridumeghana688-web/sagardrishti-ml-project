import { useMaritime } from '../../state/MaritimeContext.jsx'
import StatusBar, { OfflineBanner, DemoBanner } from '../../components/ops/StatusBar.jsx'
import SearchBar from '../../components/ops/SearchBar.jsx'
import EventFeed from '../../components/ops/EventFeed.jsx'
import { Stat } from '../../components/ops/shared.jsx'
import IndiaMap from '../../components/maritime/IndiaMapGL.jsx'
import PortPanel from '../../components/maritime/PortPanel.jsx'
import VesselPanel from '../../components/maritime/VesselPanel.jsx'

/** /dashboard — primary India Maritime Operations Center. */
export default function OperationsView() {
  const m = useMaritime()
  return (
    <div className="sd-dash space-y-4">
      <StatusBar />
      <OfflineBanner />
      {m.loadError && m.apiOnline && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">{m.loadError}</p>}
      <DemoBanner />

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="region" aria-label="Key indicators">
        <Stat demo={m.demo} value={m.apiOnline || m.demo ? m.stats.total : '—'} label={m.demo ? 'DEMO VESSELS' : 'LIVE VESSELS'} sub={m.demo ? `SIMULATED · ${m.stats.total} tracks` : !m.apiOnline ? 'API OFFLINE' : m.vesselsEmpty ? (m.aisConnected ? 'none in operating boxes' : 'feed unavailable') : 'in operating boxes'} />
        <Stat demo={m.demo} value={m.apiOnline || m.demo ? m.stats.approaching : '—'} label="APPROACHING" sub={m.freshSub} />
        <Stat demo={m.demo} value={m.apiOnline || m.demo ? m.stats.inRadius : '—'} label="IN PORT RADIUS" sub={m.demo ? `SIMULATED · ${m.stats.assoc} associated` : `ACTIVE ASSOCIATIONS ${m.apiOnline ? m.stats.assoc : '—'}`} />
        <Stat demo={m.demo} value={m.apiOnline ? m.stats.activePorts : '—'} label="ACTIVE PORTS" sub="of 44 monitored" />
        <Stat demo={m.demo} value={m.apiOnline ? m.highRisk : '—'} label="HIGH RISK PORTS" sub={m.sources?.latest_prediction_date ? `MODEL · ${m.sources.latest_prediction_date}` : 'forecast unavailable'} />
        <Stat demo={m.demo} value={m.demo ? '240×' : m.stats.epm ?? '—'} label={m.demo ? 'DEMO TIME SCALE' : 'AIS EVENTS/MIN'} sub={m.demo ? '1 real sec = 4 sim-min' : m.stats.lastAge != null ? `LAST AIS ${Math.round(m.stats.lastAge)}s ago` : (m.health.events_total > 0 ? `${m.health.events_total} frames received total` : 'NO RECENT READING')} />
      </div>

      <div className="sd-ops-grid">
        <div className="sd-map-col space-y-2">
          <SearchBar />
          {m.recent.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
              Recent:
              {m.recent.map((id) => m.portsById[id] && (
                <button key={id} onClick={() => m.selectPort(id)} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-slate-300 hover:bg-white/10">{m.portsById[id].name}</button>
              ))}
            </div>
          )}
          <IndiaMap
            ports={m.visiblePorts} predictions={m.predictions}
            selectedId={m.selectedId} onSelect={(id) => m.selectPort(id)}
            vessels={m.vessels} portsById={m.portsById}
            selectedMmsi={m.selectedMmsi} onSelectVessel={m.selectVessel}
            layers={m.layers} onToggleLayer={(k) => m.setLayers((s) => ({ ...s, [k]: !s[k] }))}
            focusVessel={m.focusVessel}
          />
          <p className="text-[11px] text-slate-500">
            {!m.apiOnline && !m.demo
              ? 'MARITIME API OFFLINE — map shows port infrastructure from cache only; live and forecast layers suspended.'
              : m.demo
                ? 'DEMO MODE — violet markers sailing fixed simulated routes. No real AIS displayed. Switch to LIVE DATA for the real picture.'
                : m.vesselsEmpty
                  ? `${m.aisLabel[0]} — 44 ports, forecasts and history remain available.`
                  : 'Real WPI ports · live ship silhouettes oriented by AIS heading (COG fallback, dimmed when stale) · dashed lines only for NEAR/APPROACHING/WITHIN-RADIUS associations · no fabricated routes or tracks.'}
          </p>
          <div className="sd-legend flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-3 text-[11px] text-slate-300" aria-label="Map legend">
            <span className="eyebrow text-slate-400">MAP LEGEND</span>
            {[['#22C55E', 'Normal'], ['#F59E0B', 'Elevated'], ['#EF4444', 'High']].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{l} (model tertiles)</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="sd-legend-ship" />Live vessel (heading-oriented)</span>
            {m.demo && <span className="flex items-center gap-1.5"><span className="sd-legend-ship demo" />Demo vessel (simulated)</span>}
            <span className="flex items-center gap-1.5"><span className="sd-legend-dash" />Valid association only</span>
            <span className="flex items-center gap-1.5"><span className="sd-legend-pulse" />Active port pulse</span>
          </div>
        </div>

        <aside className="sd-intel-col" aria-label="Intelligence panel">
          {m.selectedMmsi ? (
            <VesselPanel vessel={m.selectedVessel} onClose={() => { m.setSelectedMmsi(null); m.setFocusVessel(null) }} portsById={m.portsById} />
          ) : m.selectedPort ? (
            <>
              {m.portVessels.near === 0 && (m.apiOnline || m.demo) && (
                <p className="rounded-xl border border-white/10 bg-white/[0.02] p-3 font-mono-tech text-[11px] text-slate-400" role="status">NO CURRENT AIS ASSOCIATIONS — no vessels currently associated with this port.</p>
              )}
              <PortPanel port={m.selectedPort} detail={m.detail} state={!m.apiOnline && !m.detail ? 'error' : m.detailState} live={m.detailState === 'idle' ? m.portVessels : null} history={m.analytics?.history} />
            </>
          ) : (
            <div className="space-y-3">
              <div className="rounded-2xl border border-cyan-300/20 bg-slate-950/70 p-5">
                <p className="eyebrow text-cyan-200/80">INDIA MARITIME OVERVIEW</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-white/[0.03] p-3"><p className="font-display text-2xl font-extrabold text-white">44</p><p className="eyebrow mt-1 text-slate-400" style={{ fontSize: 9 }}>MONITORED PORTS</p></div>
                  <div className="rounded-lg bg-white/[0.03] p-3"><p className="font-display text-2xl font-extrabold text-white">{m.apiOnline || m.demo ? m.stats.total : '—'}</p><p className="eyebrow mt-1 text-slate-400" style={{ fontSize: 9 }}>{m.demo ? 'DEMO VESSELS' : 'LIVE AIS'}</p></div>
                  <div className="rounded-lg bg-white/[0.03] p-3"><p className="font-display text-2xl font-extrabold text-white">{m.apiOnline ? m.stats.activePorts : '—'}</p><p className="eyebrow mt-1 text-slate-400" style={{ fontSize: 9 }}>ACTIVE PORTS</p></div>
                  <div className="rounded-lg bg-white/[0.03] p-3"><p className="font-display text-2xl font-extrabold" style={{ color: m.highRisk ? '#EF4444' : '#22C55E' }}>{m.apiOnline ? m.highRisk : '—'}</p><p className="eyebrow mt-1 text-slate-400" style={{ fontSize: 9 }}>HIGH RISK</p></div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                   {!m.apiOnline && !m.demo ? 'Backend offline — values suspended until reconnect.' : m.demo ? 'Demo fleet sailing fixed simulated routes to Mumbai, Mundra, Kochi, Chennai and Paradip.' : m.aisState === 'CONNECTED_WAITING' || m.aisState === 'CONNECTED_NO_TRAFFIC' || m.aisState === 'CONNECTED_NO_RECENT' ? 'AIS connections are healthy, but no qualifying India AIS position reports have been received recently. Forecasts and history below remain available.' : `Approaching ${m.stats.approaching} · In radius ${m.stats.inRadius} · Select a port or vessel for detail.`}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
                <p className="eyebrow text-slate-400">TOP PORT RISKS · {m.sources?.latest_prediction_date || 'forecast unavailable'}</p>
                <div className="mt-2 space-y-1.5">
                  {m.topRisks.map((r) => (
                    <button key={r.id} onClick={() => m.selectPort(r.id)} className="flex w-full items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2 text-left hover:bg-white/5">
                      <span className="text-sm text-slate-200">{r.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono-tech text-[11px] text-slate-400">{r.congestion != null ? r.congestion.toFixed(3) : '—'}</span>
                        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: `${r.status.color}22`, color: r.status.color }}>{r.status.label}</span>
                      </span>
                    </button>
                  ))}
                  {!m.topRisks.length && <p className="text-xs text-slate-500">Forecast data unavailable.</p>}
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      <EventFeed />
    </div>
  )
}
