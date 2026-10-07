import { useMaritime } from '../../state/MaritimeContext.jsx'
import { OfflineBanner } from '../../components/ops/StatusBar.jsx'
import IndiaMap from '../../components/maritime/IndiaMapGL.jsx'
import VesselPanel from '../../components/maritime/VesselPanel.jsx'
import { Stat } from '../../components/ops/shared.jsx'
import { freshnessOf } from '../../api/live.js'

function fmtAge(ts) {
  if (!ts) return '—'
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts))
  return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`
}

/** /dashboard/ais — dedicated AIS monitoring: status, map, synchronized table. */
export default function AisView() {
  const m = useMaritime()
  const rows = [...m.vessels].sort((a, b) => (b.last_seen || 0) - (a.last_seen || 0))
  return (
    <div className="sd-dash space-y-4">
      <div>
        <p className="eyebrow text-cyan-200/80">LIVE AIS MONITORING</p>
        <h1 className="font-display text-2xl font-extrabold text-white">AIS Vessel Traffic</h1>
        <p className="mt-1 text-xs text-slate-400">Three independent AIS sources, one deduplicated picture. Map and table stay synchronized.</p>
      </div>
      <OfflineBanner />

      {/* AIS SOURCES — two independent first-class providers, never primary/fallback */}
      <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4" role="region" aria-label="AIS sources">
        <p className="eyebrow text-slate-400">AIS SOURCES · INDEPENDENT · {m.demo ? 'SIMULATED' : `COMBINED ${m.aggregation?.unique_vessels ?? m.stats.total} UNIQUE VESSELS`}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {m.aisSources.map((s) => {
            // Green only for timestamp-verified live data (backend CONNECTED_LIVE).
            // A successful REST poll with only stale positions stays amber —
            // never presented as live.
            const live = s.status === 'CONNECTED_LIVE' && (s.vessels ?? 0) > 0
            const dot = !m.apiOnline ? '#64748B' : s.status === 'NOT_CONFIGURED' ? '#64748B'
              : s.status === 'AUTH_ERROR' ? '#EF4444'
              : live ? '#34D399' : s.connected ? '#F59E0B' : '#EF4444'
            const state = !m.apiOnline ? 'API OFFLINE'
              : s.status === 'NOT_CONFIGURED' ? 'NOT CONFIGURED · key missing'
              : s.status === 'AUTH_ERROR' ? 'AUTH ERROR · check server key'
              : s.status === 'RATE_LIMITED' ? 'RATE LIMITED · backing off'
              : !s.connected ? 'DISCONNECTED · RECONNECTING'
              : live ? `LIVE · ${s.vessels} INDIA VESSELS` : 'CONNECTED · NO RECENT INDIA DATA'
            return (
              <div key={s.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} aria-hidden />{s.label}
                </p>
                <p className="font-mono-tech mt-1 text-[11px] text-slate-400">{m.demo ? 'SIMULATED FEED' : state}</p>
              </div>
            )
          })}
          <div className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.04] px-3 py-2.5">
            <p className="text-sm font-semibold text-cyan-100">Combined</p>
            <p className="font-mono-tech mt-1 text-[11px] text-slate-400">
              {m.demo ? 'SIMULATED FEED' : `${m.aggregation?.unique_vessels ?? m.stats.total} unique · multi-source ${m.aggregation?.from_both ?? 0} · all three ${m.aggregation?.from_all_three ?? 0}`}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="region" aria-label="AIS connection">
        <Stat value={m.apiOnline ? m.aisLabel[0].replace('AIS ', '') : '—'} label="CONNECTION STATUS" sub={m.demo ? 'SIMULATED' : m.apiOnline ? `connected=${String(m.aisConnected)}` : 'API OFFLINE'} demo={m.demo} />
        <Stat value={m.apiOnline || m.demo ? m.stats.total : '—'} label={m.demo ? 'DEMO VESSELS' : 'LIVE VESSELS'} sub={m.freshSub} demo={m.demo} />
        <Stat value={m.demo ? '—' : m.stats.epm ?? '—'} label="AIS EVENTS/MIN" sub={m.demo ? 'SIMULATED FEED' : 'backend 1-min window'} demo={m.demo} />
        <Stat value={m.demo ? '—' : m.stats.lastAge != null ? `${Math.round(m.stats.lastAge)}s` : '—'} label="LAST AIS UPDATE" sub={m.demo ? 'SIMULATED FEED' : m.health.last_event ? new Date(m.health.last_event).toLocaleTimeString('en-IN', { hour12: false }) : 'NO FIX YET'} demo={m.demo} />
      </div>

      {!m.apiOnline && !m.demo ? (
        <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">Backend unavailable — AIS state unknown.</p>
      ) : rows.length === 0 ? (
        <div role="status" className="rounded-2xl border border-amber-300/30 bg-amber-400/5 p-6 text-center">
          <p className="font-mono-tech text-sm tracking-[0.12em] text-amber-200">{m.aisLabel[0]}</p>
          <p className="mx-auto mt-2 max-w-xl text-xs text-slate-400">No qualifying India AIS position reports have been received recently from any source. This means no qualifying Indian AIS messages are currently available to the application — not that Indian waters are empty. Map, table and KPIs update automatically when traffic arrives.</p>
          <p className="font-mono-tech mx-auto mt-3 max-w-xl text-[11px] text-slate-500">
            {(() => {
              const d = m.health?.diagnostics || {}
              const parts = [
                `connected=${String(m.aisConnected)}`,
                `frames=${d.raw_messages ?? '—'}`,
                `posA=${d.position_report ?? '—'}`,
                `classB=${((d.class_b_std ?? 0) + (d.class_b_ext ?? 0))}`,
                `reconnects=${d.reconnects ?? '—'}`,
                `lastMsg=${d.last_message ? `${d.last_message_age_s ?? '?'}s ago` : 'never'}`,
                `boxes=${Array.isArray(d.bounding_boxes) ? d.bounding_boxes.length : '—'}`,
              ]
              if (d.last_error) parts.push(`lastError=${String(d.last_error).slice(0, 80)}`)
              return parts.join(' · ')
            })()}
          </p>
        </div>
      ) : (
        <>
          <IndiaMap
            ports={m.visiblePorts} predictions={m.predictions}
            selectedId={m.selectedId} onSelect={(id) => m.selectPort(id)}
            vessels={m.vessels} portsById={m.portsById}
            selectedMmsi={m.selectedMmsi} onSelectVessel={m.selectVessel}
            layers={{ ...m.layers, trails: true }} onToggleLayer={(k) => m.setLayers((s) => ({ ...s, [k]: !s[k] }))}
            focusVessel={m.focusVessel}
          />
          <div className="grid gap-4 xl:grid-cols-3">
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-950/60 xl:col-span-2" role="region" aria-label="Vessel table">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="sticky top-0 bg-slate-950">
                  <tr className="font-mono-tech text-[10px] text-slate-500">
                    <th className="px-2 py-2 text-left">MMSI</th>
                    <th className="px-2 text-left">VESSEL</th>
                    <th className="px-2 text-right">LATITUDE</th>
                    <th className="px-2 text-right">LONGITUDE</th>
                    <th className="px-2 text-right">SOG</th>
                    <th className="px-2 text-right">COG</th>
                    <th className="px-2 text-right">HEADING</th>
                    <th className="px-2 text-right">LAST UPDATE</th>
                    <th className="px-2 text-left">STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((v) => (
                    <tr key={v.mmsi} onClick={() => m.selectVessel(v.mmsi)}
                      className={`cursor-pointer border-t border-white/5 hover:bg-white/5 ${v.mmsi === m.selectedMmsi ? 'bg-cyan-300/5' : ''}`}
                      tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') m.selectVessel(v.mmsi) }}
                      aria-label={`Select vessel ${v.mmsi}`}>
                      <td className="px-2 py-1.5 font-mono-tech text-xs text-cyan-200">{v.mmsi}</td>
                      <td className="px-2 text-slate-200">{v.ship_name || 'Unknown vessel'}{v.demo ? ' · DEMO' : ''}</td>
                      <td className="px-2 text-right font-mono-tech text-xs text-slate-300">{v.latitude?.toFixed(3)}</td>
                      <td className="px-2 text-right font-mono-tech text-xs text-slate-300">{v.longitude?.toFixed(3)}</td>
                      <td className="px-2 text-right font-mono-tech text-xs text-slate-300">{v.sog ?? '—'}</td>
                      <td className="px-2 text-right font-mono-tech text-xs text-slate-300">{v.cog ?? '—'}</td>
                      <td className="px-2 text-right font-mono-tech text-xs text-slate-300">{v.heading ?? '—'}</td>
                      <td className="px-2 text-right font-mono-tech text-xs text-slate-400">{v.demo ? 'SIM' : fmtAge(v.last_seen)}</td>
                      <td className="px-2 text-slate-300">{v.demo ? 'SIMULATED' : `${freshnessOf(v)}${v.vessel_status ? ` · ${v.vessel_status}` : ''}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              {m.selectedVessel
                ? <VesselPanel vessel={m.selectedVessel} onClose={() => { m.setSelectedMmsi(null); m.setFocusVessel(null) }} portsById={m.portsById} />
                : <p className="rounded-2xl border border-white/10 p-4 text-sm text-slate-400">Select a vessel marker or table row for details.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
