/**
 * DEMO fleet engine — DEVELOPMENT/DEMONSTRATION ONLY.
 *
 * Deterministic synthetic vessels sailing fixed waypoint routes toward real
 * WPI ports. Every vessel is indelibly marked demo:true / source:'DEMO' with
 * MMSIs from the reserved 9990001xx block, names prefixed 'DEMO MV', and a
 * visible DEMO TIME ×N clock. Nothing here touches the backend, the AISStream
 * service, or live vessel state. Disable demo mode and zero residue remains.
 */

export const DEMO_TIME_SCALE = 240 // 1 real second = 4 simulated minutes
export const DEMO_MMSI_BLOCK = '9990001xx (SAGARDRISHTI demo-reserved, never real AIS)'

// Offshore start + mid waypoints (real geography); final leg resolves to the
// REAL port coordinates at runtime. [lat, lon].
// Phase = fraction of the ping-pong cycle at fleet build. Phases just under 0.5
// place vessels on their OUTBOUND leg within ~2–12% of the destination port,
// so demonstrations open with live NEAR/APPROACHING/WITHIN associations that
// converge visibly within a minute or two, then turn around (DEPARTING).
const SCENARIOS = [
  { id: 'demo-arabian-star', name: 'DEMO MV ARABIAN STAR', portMatch: 'MUMBAI', speedKn: 12, phase: 0.47, waypoints: [[15.5, 66.0], [17.4, 69.2]] },
  { id: 'demo-gulf-pride', name: 'DEMO MV GULF PRIDE', portMatch: 'MUNDRA', speedKn: 11, phase: 0.44, waypoints: [[20.6, 63.6], [21.8, 66.4]] },
  { id: 'demo-malabar-runner', name: 'DEMO MV MALABAR RUNNER', portMatch: 'KOCHI', speedKn: 13, phase: 0.485, waypoints: [[5.2, 69.6], [7.4, 73.2]] },
  { id: 'demo-coromandel', name: 'DEMO MV COROMANDEL', portMatch: 'CHENNAI', speedKn: 12, phase: 0.455, waypoints: [[10.2, 84.6], [11.8, 82.4]] },
  { id: 'demo-kalinga', name: 'DEMO MV KALINGA', portMatch: 'PARADIP', speedKn: 10, phase: 0.42, waypoints: [[16.4, 88.2], [18.4, 87.4]] },
]

const PORT_RADIUS_KM = 50
let mmsiSeq = 999000101

function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.radians || ((d) => (d * Math.PI) / 180)
  const a = Math.sin(r((lat2 - lat1) / 2)) ** 2
    + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r((lon2 - lon1) / 2)) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))))
}

function bearing(lat1, lon1, lat2, lon2) {
  const r = (d) => (d * Math.PI) / 180
  const dlon = r(lon2 - lon1)
  const y = Math.sin(dlon) * Math.cos(r(lat2))
  const x = Math.cos(r(lat1)) * Math.sin(r(lat2)) - Math.sin(r(lat1)) * Math.cos(r(lat2)) * Math.cos(dlon)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

function routeLength(pts) {
  let total = 0
  for (let i = 1; i < pts.length; i += 1) total += haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
  return total
}

function pointAt(pts, distKm) {
  let acc = 0
  for (let i = 1; i < pts.length; i += 1) {
    const seg = haversine(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])
    if (acc + seg >= distKm) {
      const k = seg === 0 ? 0 : (distKm - acc) / seg
      return {
        lat: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k,
        lon: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k,
        cog: bearing(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]),
      }
    }
    acc += seg
  }
  const last = pts[pts.length - 1]
  const prev = pts[pts.length - 2]
  return { lat: last[0], lon: last[1], cog: bearing(prev[0], prev[1], last[0], last[1]) }
}

function findPort(portsById, match) {
  const list = Object.values(portsById || {})
  return list.find((p) => (p.name || '').toUpperCase().includes(match)) || null
}

function associate(lat, lon, cog, sog, portsById) {
  let best = null
  let bestD = Infinity
  for (const p of Object.values(portsById || {})) {
    const d = haversine(lat, lon, p.latitude, p.longitude)
    if (d < bestD) { bestD = d; best = p }
  }
  if (!best) return { status: 'UNKNOWN', port: null, dist: null }
  let base
  if (bestD <= PORT_RADIUS_KM) base = 'WITHIN PORT RADIUS'
  else if (bestD <= PORT_RADIUS_KM * 3) base = 'NEAR PORT'
  else return { status: 'OFFSHORE', port: null, dist: Math.round(bestD * 10) / 10, nearest: best }
  const brg = bearing(lat, lon, best.latitude, best.longitude)
  const diff = Math.abs(((cog - brg + 180) % 360 + 360) % 360 - 180)
  if (sog >= 0.5 && diff <= 30) return { status: 'APPROACHING', port: best, dist: Math.round(bestD * 10) / 10, nearest: best }
  if (sog >= 0.5 && diff >= 150) return { status: 'DEPARTING', port: null, dist: Math.round(bestD * 10) / 10, nearest: best }
  return { status: base, port: base === 'WITHIN PORT RADIUS' ? best : null, dist: Math.round(bestD * 10) / 10, nearest: best }
}

/** Build the fleet once (routes resolve against REAL port coordinates).
 *
 * Timing model (all explicit):
 *   legMs      — simulated milliseconds to sail one leg (length / speed)
 *   legRealMs  — real milliseconds per leg = legMs / DEMO_TIME_SCALE
 *   cycleRealMs— real ms per ping-pong cycle = 2 × legRealMs
 *   startRealMs— real timestamp anchoring `phase` (fraction of cycle at t0)
 * Position is a pure deterministic function of nowMs — no drift, no randomness.
 */
export function buildDemoFleet(portsById, t0 = Date.now()) {
  mmsiSeq = 999000101
  const fleet = []
  for (const s of SCENARIOS) {
    const port = findPort(portsById, s.portMatch)
    if (!port) continue
    const route = [...s.waypoints, [port.latitude, port.longitude]]
    const lengthKm = routeLength(route)
    const speedKmh = s.speedKn * 1.852
    const legMs = (lengthKm / speedKmh) * 3600000 // simulated ms per leg
    const legRealMs = legMs / DEMO_TIME_SCALE
    fleet.push({
      mmsi: mmsiSeq++,
      ship_name: s.name,
      demo: true,
      source: 'DEMO',
      sog: s.speedKn,
      heading: null,
      nav_status: 'Underway (simulated)',
      ais_destination: `${port.name} (simulated destination)`,
      ship_type: 'Demo cargo (simulated)',
      imo: null,
      flag: 'DEMO',
      route,
      lengthKm,
      legRealMs,
      startRealMs: t0 - s.phase * 2 * legRealMs,
      track: [],
      lastTrackSample: 0,
      assoc: 'UNKNOWN',
      associated_port_id: null,
      associated_port_name: null,
      distance_to_port_km: null,
      nearest_port_name: null,
      latitude: route[0][0],
      longitude: route[0][1],
      cog: 0,
      last_seen: t0 / 1000,
      freshness: 'LIVE',
      timestamp: new Date(t0).toISOString(),
    })
  }
  return fleet
}

/**
 * Advance all vessels to nowMs. Ping-pong routing: vessels sail to port, then
 * return — return legs read as DEPARTING via the same bearing logic the backend
 * uses. Pure deterministic function of time; track sampled at most every 2s.
 */
export function advanceDemoFleet(fleet, portsById, nowMs) {
  return fleet.map((v) => {
    const cycle = 2 * v.legRealMs
    const c = (((nowMs - v.startRealMs) % cycle) + cycle) % cycle
    const outbound = c < v.legRealMs
    const distAlong = outbound ? (c / v.legRealMs) * v.lengthKm : ((cycle - c) / v.legRealMs) * v.lengthKm
    const pts = outbound ? v.route : [...v.route].reverse()
    const span = outbound ? distAlong : v.lengthKm - distAlong
    const fix = pointAt(pts, Math.min(Math.max(0, span), v.lengthKm))
    const next = { ...v, latitude: fix.lat, longitude: fix.lon, cog: Math.round(fix.cog), last_seen: nowMs / 1000, freshness: 'LIVE', timestamp: new Date(nowMs).toISOString() }
    if (nowMs - v.lastTrackSample > 2000) {
      next.track = [...v.track, { lat: fix.lat, lon: fix.lon, ts: nowMs / 1000 }].slice(-11)
      next.lastTrackSample = nowMs
    }
    const a = associate(fix.lat, fix.lon, fix.cog, v.sog, portsById)
    next.assoc = a.status
    next.vessel_status = a.status
    next.associated_port_id = a.port ? a.port.id : null
    next.associated_port_name = a.port ? a.port.name : null
    next.distance_to_port_km = a.dist
    next.nearest_port_name = (a.nearest && a.nearest.name) || (a.port && a.port.name) || null
    next.nearest_port_id = (a.nearest && a.nearest.id) || (a.port && a.port.id) || null
    return next
  })
}

/** Demo transition events — always prefixed, never confused with backend events. */
export function demoTransitionEvents(prevByMmsi, fleet, nowMs) {
  const out = []
  for (const v of fleet) {
    const prev = prevByMmsi.get(v.mmsi)
    if (!prev) {
      out.push({ ts: new Date(nowMs).toISOString(), kind: 'demo', message: `DEMO · simulated vessel detected — ${v.ship_name} (MMSI ${v.mmsi})`, mmsi: v.mmsi })
    } else if (prev !== v.vessel_status && ['APPROACHING', 'WITHIN PORT RADIUS', 'DEPARTING'].includes(v.vessel_status)) {
      const where = v.associated_port_name || v.nearest_port_name || 'port'
      out.push({ ts: new Date(nowMs).toISOString(), kind: 'demo', message: `DEMO · ${v.ship_name} ${v.vessel_status.toLowerCase()} — ${where} association radius`, mmsi: v.mmsi, port: where })
    }
  }
  return out
}
