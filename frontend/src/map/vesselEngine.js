/**
 * vesselEngine — pure, dependency-free AIS visualization logic for the
 * MapLibre operations map. No DOM, no map instance, no React: every export
 * is a pure function, unit-testable under plain node.
 *
 * Data-truth rules enforced here (and only here):
 * - interpolation is bounded BETWEEN two real AIS fixes, never extrapolated;
 * - stale vessels freeze at their last real position (done=true, no motion);
 * - heading prefers true heading, then COG, then the previous valid value;
 * - wake/scale encode real SOG only; SOG is never modified;
 * - ship silhouettes map ONLY from backend ship_type codes, else neutral.
 */

export const FRESH_LIVE_S = 60
export const FRESH_RECENT_S = 180
export const STALE_TTL_S = 900

/** Freshness from an age in seconds. */
export function statusOfAge(ageS) {
  const a = Number(ageS)
  if (!Number.isFinite(a) || a < 0) return 'STALE'
  if (a < FRESH_LIVE_S) return 'LIVE'
  if (a < FRESH_RECENT_S) return 'RECENT'
  return 'STALE'
}

/** Freshness of a vessel record at nowS (epoch seconds). */
export function statusOf(vessel, nowS = Date.now() / 1000) {
  if (!vessel) return 'STALE'
  const ls = Number(vessel.last_seen)
  if (Number.isFinite(ls) && ls > 0) return statusOfAge(nowS - ls)
  const f = vessel.freshness
  return f === 'LIVE' || f === 'RECENT' || f === 'STALE' ? f : 'STALE'
}

/**
 * Orientation for a vessel. True heading first, then COG, then the last
 * valid orientation (never random, never spinning).
 * Returns { hdg, oriented } — oriented=false means "kept previous".
 */
export function headingOf(vessel, prevHdg) {
  // Note: Number(null)/Number('') is 0 — missing values must NOT become
  // a 0° (north) orientation. Treat null/undefined/'' as absent.
  const clean = (x) => (x === null || x === undefined || x === '' ? NaN : Number(x))
  const h = clean(vessel?.heading)
  if (Number.isFinite(h) && h >= 0 && h <= 360) return { hdg: h, oriented: true }
  const c = clean(vessel?.cog)
  if (Number.isFinite(c) && c >= 0 && c <= 360) return { hdg: c, oriented: true }
  const p = clean(prevHdg)
  if (Number.isFinite(p) && p >= 0 && p <= 360) return { hdg: p, oriented: false }
  return { hdg: 0, oriented: false }
}

/**
 * Bounded interpolation between two REAL fixes.
 * prev/next: { lat, lon, ts }. Returns { lat, lon, done }.
 * done=true → render exactly at next (frozen); the caller must stop moving.
 * The result always lies on the prev→next segment (k clamped to [0,1]).
 */
export function interpolatePos(prev, next, nowS) {
  if (!next || !Number.isFinite(Number(next.lat)) || !Number.isFinite(Number(next.lon))) {
    if (prev && Number.isFinite(Number(prev.lat))) return { lat: prev.lat, lon: prev.lon, done: true }
    return { lat: 0, lon: 0, done: true }
  }
  if (!prev || !Number.isFinite(Number(prev.lat)) || !Number.isFinite(Number(prev.lon))) {
    return { lat: next.lat, lon: next.lon, done: true }
  }
  const prevTs = Number(prev.ts) || 0
  const nextTs = Number(next.ts) || 0
  const span = nextTs - prevTs
  if (!(span > 1)) return { lat: next.lat, lon: next.lon, done: true }
  const elapsed = Math.min(Math.max(0, nowS - prevTs), span)
  const k = elapsed / span
  return {
    lat: prev.lat + (next.lat - prev.lat) * k,
    lon: prev.lon + (next.lon - prev.lon) * k,
    done: k >= 1,
  }
}

/** Wake is purely a visualization of real movement: SOG>0, fresh, not demo. */
export function wakeVisible(vessel, nowS = Date.now() / 1000) {
  if (!vessel || vessel.demo) return false
  const sog = Number(vessel.sog)
  if (!Number.isFinite(sog) || sog < 0.5) return false
  return statusOf(vessel, nowS) !== 'STALE'
}

/**
 * Ship silhouette variant from the backend numeric AIS ship-type code.
 * Only confident category mappings; everything else → neutral 'hull'.
 * AIS types: 30 fishing · 31/32/52 tow/tug · 50-55 service · 60-69 passenger
 * · 70-79 cargo · 80-89 tanker.
 */
export function shipVariant(vessel) {
  const raw = vessel?.ship_type
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10)
  if (!Number.isFinite(n)) return 'hull'
  if (n >= 70 && n <= 79) return 'cargo'
  if (n >= 80 && n <= 89) return 'tanker'
  if (n >= 60 && n <= 69) return 'passenger'
  if (n === 30) return 'fishing'
  if (n === 31 || n === 32 || n === 52) return 'tug'
  if (n === 33 || n === 34 || n === 50 || n === 51 || n === 53 || n === 54 || n === 55 || n === 58) return 'service'
  return 'hull'
}

/** Stable render key for a vessel list (change detection without re-render). */
export function vesselsKey(vessels) {
  if (!Array.isArray(vessels)) return ''
  return vessels
    .map((v) => `${v.mmsi}:${Number(v.latitude).toFixed(5)},${Number(v.longitude).toFixed(5)},${Math.round(Number(v.last_seen) || 0)}`)
    .join('|')
}

/**
 * Build a vessel point FeatureCollection for a MapLibre symbol layer.
 * renderItems: [{ v, lat, lon, hdg, status, selected }] — positions already
 * resolved by the animation loop. Provenance preserved in properties.
 */
export function featureizeVessels(renderItems) {
  return {
    type: 'FeatureCollection',
    features: (renderItems || []).map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: {
        mmsi: r.v.mmsi,
        hdg: Math.round(((Number(r.hdg) % 360) + 360) % 360),
        variant: shipVariant(r.v),
        status: r.status,
        demo: r.v.demo ? 1 : 0,
        wake: wakeVisible(r.v, r.nowS) ? 1 : 0,
        selected: r.selected ? 1 : 0,
        sog: typeof r.v.sog === 'number' ? r.v.sog : -1,
        srcs: Array.isArray(r.v.sources) ? r.v.sources.join('+') : String(r.v.source || ''),
      },
    })),
  }
}

/**
 * Observed-track segments with fading opacity (older = fainter).
 * Uses ONLY the backend-provided track fixes plus the current render fix.
 */
export function trailSegments(track, curLat, curLon, opts = {}) {
  const fixes = [...(Array.isArray(track) ? track.slice(-(opts.maxFixes ?? 6)) : []), { lat: curLat, lon: curLon }]
  if (fixes.length < 2) return []
  const segs = []
  for (let i = 1; i < fixes.length; i += 1) {
    const a = fixes[i - 1]
    const b = fixes[i]
    if (!Number.isFinite(Number(a?.lat)) || !Number.isFinite(Number(b?.lat))) continue
    segs.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
      properties: { op: (opts.base ?? 0.12) + ((opts.span ?? 0.5) * i) / fixes.length },
    })
  }
  return segs
}

/** Association states that draw a vessel→port line. */
export const ASSOC_STATES = new Set(['NEAR PORT', 'APPROACHING', 'WITHIN PORT RADIUS'])

/** Vessel→port association line features (backend states only). */
export function assocFeatures(vessels, portsById) {
  const out = []
  for (const v of vessels || []) {
    if (!v.associated_port_id || !ASSOC_STATES.has(v.vessel_status)) continue
    const p = (portsById || {})[v.associated_port_id]
    if (!p) continue
    out.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[v.longitude, v.latitude], [p.longitude, p.latitude]] },
      properties: { mmsi: v.mmsi, approaching: v.vessel_status === 'APPROACHING' ? 1 : 0 },
    })
  }
  return { type: 'FeatureCollection', features: out }
}

/** 50 km radius polygon around a port (association reference circle). */
export function radiusPolygon(lat, lon, radiusKm = 50, steps = 64) {
  const coords = []
  const R = 6371
  const latR = (lat * Math.PI) / 180
  for (let i = 0; i <= steps; i += 1) {
    const brg = (i / steps) * 2 * Math.PI
    const ang = radiusKm / R
    const nLat = Math.asin(Math.sin(latR) * Math.cos(ang) + Math.cos(latR) * Math.sin(ang) * Math.cos(brg))
    const nLon = ((lon * Math.PI) / 180) + Math.atan2(Math.sin(brg) * Math.sin(ang) * Math.cos(latR), Math.cos(ang) - Math.sin(latR) * Math.sin(nLat))
    coords.push([(nLon * 180) / Math.PI, (nLat * 180) / Math.PI])
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: {} }] }
}
