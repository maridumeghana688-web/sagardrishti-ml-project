import { useEffect, useRef, useState } from 'react'
import { API_BASE } from './client.js'

/**
 * Live AIS hook: initial snapshot + SSE updates. Event-driven backend -> batched UI state.
 * Never contacts AISStream directly; key stays server-side.
 *
 * Canonical AIS states (Section 30):
 *   CONNECTING | CONNECTED_LIVE | CONNECTED_NO_TRAFFIC | DISCONNECTED | STALE
 * Legacy aliases kept for existing consumers: connecting/live/disconnected/empty.
 */

export const AIS_STATE = {
  CONNECTING: 'CONNECTING',
  CONNECTED_LIVE: 'CONNECTED_LIVE',
  CONNECTED_WAITING: 'CONNECTED_WAITING',
  CONNECTED_NO_TRAFFIC: 'CONNECTED_NO_TRAFFIC',
  CONNECTED_NO_RECENT: 'CONNECTED_NO_RECENT',
  DISCONNECTED: 'DISCONNECTED',
  SUBSCRIPTION_ERROR: 'SUBSCRIPTION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  STREAM_ERROR: 'STREAM_ERROR',
  STALE: 'STALE',
}

// Back-compat aliases used by older UI code.
export const AIS_STATE_ALIAS = {
  connecting: 'CONNECTING',
  live: 'CONNECTED_LIVE',
  empty: 'CONNECTED_NO_TRAFFIC',
  disconnected: 'DISCONNECTED',
}

/** Expand a compact SSE frame (n/lat/lon/...) into the full vessel shape. */
export function normalizeVessel(v) {
  if (!v || v.mmsi == null) return null
  const mmsi = Number(v.mmsi)
  if (!Number.isFinite(mmsi)) return null
  const lat = v.latitude ?? v.lat
  const lon = v.longitude ?? v.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  const freshness = v.freshness || (v.f === 'L' ? 'LIVE' : v.f === 'R' ? 'RECENT' : v.f === 'S' ? 'STALE' : undefined)
  return {
    mmsi,
    ship_name: v.ship_name ?? v.n ?? null,
    latitude: lat,
    longitude: lon,
    sog: v.sog ?? null,
    cog: v.cog ?? null,
    heading: v.heading ?? v.hdg ?? null,
    nav_status: v.nav_status ?? v.ns ?? null,
    timestamp: v.timestamp ?? v.ts ?? null,
    last_seen: v.last_seen ?? null,
    freshness,
    source: v.source ?? v.src ?? 'UNKNOWN',
    sources: Array.isArray(v.sources) ? v.sources : (Array.isArray(v.srcs) ? v.srcs : [(v.source ?? v.src ?? 'UNKNOWN')]),
    source_last_seen: v.source_last_seen ?? null,
    source_station: v.source_station ?? null,
    upstream_source: v.upstream_source ?? null,
    ais_class: v.ais_class ?? null,
    associated_port_id: v.associated_port_id ?? v.p ?? null,
    associated_port_name: v.associated_port_name ?? v.pn ?? null,
    distance_to_port_km: v.distance_to_port_km ?? v.d ?? null,
    nearest_port_id: v.nearest_port_id ?? null,
    nearest_port_name: v.nearest_port_name ?? v.np ?? null,
    vessel_status: v.vessel_status ?? v.st ?? 'UNKNOWN',
    ais_destination: v.ais_destination ?? v.dst ?? null,
    ship_type: v.ship_type ?? null,
    imo: v.imo ?? null,
    flag: v.flag ?? null,
    track: Array.isArray(v.track) ? v.track : (Array.isArray(v.trk) ? v.trk : []),
  }
}

/** Normalized frontend view (Section 29). Only populated from real data. */
export function vesselView(v) {
  if (!v) return null
  const fresh = freshnessOf(v)
  return {
    mmsi: v.mmsi,
    name: v.ship_name || null,
    lat: v.latitude,
    lon: v.longitude,
    cog: typeof v.cog === 'number' ? v.cog : null,
    sog: typeof v.sog === 'number' ? v.sog : null,
    heading: typeof v.heading === 'number' ? v.heading : null,
    vesselType: v.ship_type ?? null,
    flag: v.flag ?? null,
    lastUpdate: v.last_seen ?? null,
    associationState: v.vessel_status ?? 'UNKNOWN',
    associatedPort: v.associated_port_id ?? null,
    associatedPortName: v.associated_port_name ?? null,
    distanceToPort: typeof v.distance_to_port_km === 'number' ? v.distance_to_port_km : null,
    isStale: fresh === 'STALE',
    freshness: fresh,
    track: v.track || [],
  }
}

function deriveState(map, health) {
  // Prefer the backend's precise stream classification when available: it
  // distinguishes connection success from data availability (auth / subscription
  // / stream errors are backend-determined, never guessed in the UI).
  const backend = health?.ais_status || health?.diagnostics?.status
  if (backend && AIS_STATE[backend]) return backend
  if (!health || health.connected !== true) return AIS_STATE.DISCONNECTED
  if (map.size === 0) {
    // Connected but nothing cached yet: waiting (recent connect) vs no-recent.
    const age = health.last_event_age_s
    if (age == null) {
      const diagAge = health.diagnostics?.last_message_age_s
      if (diagAge == null) return AIS_STATE.CONNECTED_WAITING
      return diagAge < 180 ? AIS_STATE.CONNECTED_WAITING : AIS_STATE.CONNECTED_NO_RECENT
    }
    return age < 180 ? AIS_STATE.CONNECTED_WAITING : AIS_STATE.CONNECTED_NO_RECENT
  }
  const now = Date.now() / 1000
  let liveCount = 0
  for (const v of map.values()) {
    if (freshnessOf(v, now) !== 'STALE') { liveCount += 1; break }
  }
  if (liveCount === 0) return AIS_STATE.CONNECTED_NO_RECENT
  return AIS_STATE.CONNECTED_LIVE
}

export function useLiveVessels(enabled = true) {
  const [vessels, setVessels] = useState([])
  const [health, setHealth] = useState({ connected: false })
  const [state, setState] = useState(AIS_STATE.CONNECTING) // canonical
  const esRef = useRef(null)
  const vesselsRef = useRef(new Map())

  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    let retries = 0
    let es = null
    let sweepTimer = null

    const emit = () => {
      if (stopped) return
      const arr = [...vesselsRef.current.values()]
      setVessels(arr)
      setHealth((h) => {
        const next = deriveState(vesselsRef.current, h)
        setState(next)
        return h
      })
    }

    const applyList = (list) => {
      if (!Array.isArray(list)) return
      const map = vesselsRef.current
      for (const raw of list) {
        const v = normalizeVessel(raw)
        if (!v) continue
        const prev = map.get(v.mmsi)
        // Preserve observed track across frames that omit it; merge forward only.
        if (prev && (!v.track || v.track.length === 0) && prev.track?.length) {
          v.track = prev.track
        }
        if (prev && v.track?.length && prev.track?.length) {
          // Append-only merge: keep prior fixes, add genuinely new ones.
          const seen = new Set(prev.track.map((p) => `${p.lat},${p.lon}`))
          const merged = [...prev.track]
          for (const p of v.track) {
            const k = `${p.lat},${p.lon}`
            if (!seen.has(k)) { merged.push(p); seen.add(k) }
          }
          v.track = merged.slice(-11)
        }
        // Carry over static fields the slim frame omits.
        if (prev) {
          for (const k of ['ship_name', 'ais_destination', 'ship_type', 'imo', 'nav_status', 'heading']) {
            if (v[k] == null && prev[k] != null) v[k] = prev[k]
          }
        }
        map.set(v.mmsi, v)
      }
      emit()
    }

    const connect = () => {
      if (stopped) return
      setState(AIS_STATE.CONNECTING)
      // initial snapshot (full shape)
      fetch(`${API_BASE}/api/v1/vessels?limit=2000`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((j) => {
          if (stopped) return
          if (j.health) setHealth(j.health)
          applyList(j.vessels || [])
          // Re-derive once health is known
          setState(deriveState(vesselsRef.current, j.health || { connected: false }))
        })
        .catch(() => { if (!stopped) setState(AIS_STATE.DISCONNECTED) })
      es = new EventSource(`${API_BASE}/api/v1/live/ais/stream`)
      esRef.current = es
      es.onmessage = (ev) => {
        if (stopped) return
        try {
          const data = JSON.parse(ev.data)
          retries = 0
          const h = data.health || {}
          setHealth(h)
          applyList(data.vessels || [])
          setState(deriveState(vesselsRef.current, h))
        } catch { /* malformed frame: ignore, keep last state */ }
      }
      es.onerror = () => {
        try { es.close() } catch { /* ignore */ }
        if (stopped) return
        setState(AIS_STATE.DISCONNECTED)
        retries += 1
        const backoff = Math.min(5000 * 2 ** retries, 120000) * (0.8 + Math.random() * 0.4)
        setTimeout(connect, backoff)
      }
    }
    connect()
    // stale sweep every 20s (TTL 15min server-side; UI hides >15min unseen)
    sweepTimer = setInterval(() => {
      const map = vesselsRef.current
      const now = Date.now() / 1000
      let changed = false
      for (const [k, v] of map) {
        if (v.last_seen && now - v.last_seen > 900) { map.delete(k); changed = true }
      }
      if (changed) emit()
    }, 20000)
    return () => { stopped = true; try { es?.close() } catch { /* ignore */ } clearInterval(sweepTimer) }
  }, [enabled])

  return { vessels, health, state }
}

/** Real backend event feed (polls /events). Empty = no recent events, never synthesized. */
export function useMaritimeEvents(enabled = true, limit = 12, intervalMs = 10000) {
  const [events, setEvents] = useState([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    const load = () => {
      fetch(`${API_BASE}/api/v1/events?limit=${limit}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((j) => { if (!stopped) { setEvents(j.events || []); setLoaded(true) } })
        .catch(() => { if (!stopped) setLoaded(true) })
    }
    load()
    const t = setInterval(load, intervalMs)
    return () => { stopped = true; clearInterval(t) }
  }, [enabled, limit, intervalMs])
  return { events, loaded }
}

export function freshnessOf(vessel, nowS = Date.now() / 1000) {
  if (!vessel) return 'STALE'
  if (vessel.freshness === 'LIVE' || vessel.freshness === 'RECENT' || vessel.freshness === 'STALE') {
    // Trust explicit backend freshness when last_seen is missing (e.g. slim frames).
    if (!vessel.last_seen) return vessel.freshness
  }
  const age = nowS - (vessel.last_seen || 0)
  if (age < 60) return 'LIVE'
  if (age < 180) return 'RECENT'
  return 'STALE'
}

export const API_STATE = { CONNECTING: 'CONNECTING', ONLINE: 'ONLINE', OFFLINE: 'OFFLINE' }

/**
 * Backend connectivity probe: ONLINE / CONNECTING / OFFLINE with auto-recovery.
 * Polls /api/v1/health (fast when offline, slow heartbeat when online).
 * Recovery requires no page refresh — consumers reload on the OFFLINE→ONLINE edge.
 */
export function useApiStatus(enabled = true) {
  const [apiState, setApiState] = useState(API_STATE.CONNECTING)
  const [failCount, setFailCount] = useState(0)
  const [lastOk, setLastOk] = useState(null)
  const [epoch, setEpoch] = useState(0) // increments on every OFFLINE→ONLINE recovery
  const stateRef = useRef(apiState)
  stateRef.current = apiState

  const probe = async (markConnecting = true) => {
    if (markConnecting && stateRef.current === API_STATE.OFFLINE) setApiState(API_STATE.CONNECTING)
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 8000)
      const r = await fetch(`${API_BASE}/api/v1/health`, { signal: ctrl.signal })
      clearTimeout(t)
      if (!r.ok) throw new Error(String(r.status))
      setLastOk(Date.now())
      setFailCount(0)
      setApiState((prev) => {
        if (prev === API_STATE.OFFLINE || prev === API_STATE.CONNECTING) setEpoch((e) => e + 1)
        return API_STATE.ONLINE
      })
      return true
    } catch {
      setFailCount((c) => c + 1)
      setApiState(API_STATE.OFFLINE)
      return false
    }
  }

  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    probe(false)
    const id = setInterval(() => {
      if (stopped) return
      // Slow heartbeat while online (SSE errors already surface fast disconnects).
      if (stateRef.current === API_STATE.ONLINE) {
        fetch(`${API_BASE}/api/v1/health`).then((r) => {
          if (!stopped && r.ok) setLastOk(Date.now())
          else if (!stopped) setApiState(API_STATE.OFFLINE)
        }).catch(() => { if (!stopped) setApiState(API_STATE.OFFLINE) })
      } else {
        probe(true)
      }
    }, 10000)
    const onVis = () => { if (!stopped && document.visibilityState === 'visible' && stateRef.current !== API_STATE.ONLINE) probe(true) }
    document.addEventListener('visibilitychange', onVis)
    return () => { stopped = true; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [enabled])

  return { apiState, failCount, lastOk, epoch, retry: () => probe(true), apiOnline: apiState === API_STATE.ONLINE }
}
