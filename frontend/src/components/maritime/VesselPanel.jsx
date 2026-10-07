import { freshnessOf } from '../../api/live.js'

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <p className="text-slate-400">{k}</p>
      <p className="font-mono-tech text-right text-xs text-slate-100">{v ?? 'NO RECENT READING'}</p>
    </div>
  )
}

function fmtAge(lastSeen) {
  if (!lastSeen) return null
  const age = Math.max(0, Math.round(Date.now() / 1000 - lastSeen))
  if (age < 60) return `${age} sec ago`
  if (age < 3600) return `${Math.round(age / 60)} min ago`
  return `${(age / 3600).toFixed(1)} h ago`
}

/** Vessel intelligence panel — real AIS fields only; missing → NO RECENT READING. */
export default function VesselPanel({ vessel, onClose, portsById = {} }) {
  if (!vessel) return null
  const demo = !!vessel.demo
  const fresh = demo ? 'SIMULATED' : freshnessOf(vessel)
  const age = demo ? 'demo clock ×240' : fmtAge(vessel.last_seen)
  const color = demo ? '#C084FC' : fresh === 'LIVE' ? '#22D3EE' : fresh === 'RECENT' ? '#F59E0B' : '#64748B'
  const assocPort = vessel.associated_port_id ? portsById[vessel.associated_port_id] : null
  const track = Array.isArray(vessel.track) ? vessel.track : []
  const trackQuality = demo ? 'SIMULATED' : track.length >= 4 ? 'FRESH' : track.length >= 1 ? 'SPARSE' : 'SINGLE FIX'

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="eyebrow text-cyan-200/80">VESSEL INTELLIGENCE</p>
          <h3 className="font-display text-xl font-bold text-white">{vessel.ship_name || 'Unknown vessel'}</h3>
          <p className="font-mono-tech text-xs text-slate-400">
            MMSI {vessel.mmsi}{vessel.imo ? ` · IMO ${vessel.imo}` : ''}{vessel.ship_type ? ` · ${vessel.ship_type}` : ''}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close vessel panel" className="rounded-lg border border-white/10 px-2.5 py-1 text-slate-300 hover:bg-white/5">✕</button>
      </div>
      {demo && (
        <p className="sd-demo-badge mt-2" role="status">DEMO · SIMULATED VESSEL — NOT REAL AIS</p>
      )}
      <p className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-semibold" style={{ background: `${color}22`, color, border: `1px solid ${color}55` }} role="status">
        {fresh}{age ? ` · ${age}` : ''}{!demo && fresh === 'STALE' ? ' · LAST OBSERVED' : ''}
      </p>
      <div className="mt-3 divide-y divide-white/5">
        <Row k="Latitude" v={typeof vessel.latitude === 'number' ? vessel.latitude.toFixed(4) : null} />
        <Row k="Longitude" v={typeof vessel.longitude === 'number' ? vessel.longitude.toFixed(4) : null} />
        <Row k="Speed" v={vessel.sog != null ? `${vessel.sog} kn` : null} />
        <Row k="Course (COG)" v={vessel.cog != null ? `${vessel.cog}°` : null} />
        <Row k="Heading" v={vessel.heading != null ? `${vessel.heading}°` : null} />
        <Row k="Nav status" v={vessel.nav_status} />
        <Row k="Last AIS fix" v={demo ? 'simulated clock' : vessel.timestamp || (vessel.last_seen ? new Date(vessel.last_seen * 1000).toISOString() : null)} />
        <Row k="Track quality" v={trackQuality} />
      </div>
      <p className="eyebrow mt-3 text-slate-400">PORT ASSOCIATION</p>
      <div className="divide-y divide-white/5">
        <Row k="State" v={vessel.vessel_status} />
        <Row k="Associated port" v={assocPort ? `${assocPort.name} (WPI ${assocPort.id})` : (vessel.associated_port_name || null)} />
        <Row k="Nearest monitored port" v={vessel.nearest_port_name} />
        <Row k="Distance to port" v={vessel.distance_to_port_km != null ? `${vessel.distance_to_port_km} km` : null} />
        <Row k="ETA" v="NOT ESTIMATED (no AIS ETA broadcast)" />
        <Row k="AIS destination" v={vessel.ais_destination || 'NO RECENT READING (self-reported only)'} />
        <Row k="Source" v={demo ? 'DEMO simulation (not live AIS)' : (vessel.sources || [vessel.source]).filter(Boolean).join(' + ') || 'AIS (server-fed)'} />
        {!demo && Array.isArray(vessel.sources) && vessel.sources.length > 1 && (
          <Row k={`Seen by ${vessel.sources.length} sources`} v="YES · freshest position shown" />
        )}
        {!demo && vessel.source_station && (
          <Row k="Receiving station" v={`${vessel.source_station}${vessel.upstream_source ? ` · via ${vessel.upstream_source}` : ''}`} />
        )}
      </div>
      <p className="eyebrow mt-3 text-slate-400">OBSERVED TRACK</p>
      {track.length ? (
        <p className="mt-1 text-xs text-slate-300">
          {track.length} {demo ? 'simulated' : 'observed'} fix{track.length === 1 ? '' : 'es'} · latest {track[track.length - 1].lat.toFixed(3)}°N {track[track.length - 1].lon.toFixed(3)}°E
          <br /><span className="text-slate-500">{demo ? 'SIMULATED TRACK — demonstration only.' : 'OBSERVED AIS TRACK — interpolated display only, never a predicted route.'}</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-500">No prior fixes in the current window — trail appears as real positions accumulate.</p>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Association is inferred proximity — distinct from any AIS self-reported destination.</p>
    </div>
  )
}
