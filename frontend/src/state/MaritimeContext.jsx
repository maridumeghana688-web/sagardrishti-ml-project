import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE } from '../api/client.js'
import { maritimeApi, portStatus } from '../api/maritime.js'
import { freshnessOf, useLiveVessels, useMaritimeEvents, useApiStatus, AIS_STATE, API_STATE } from '../api/live.js'
import { buildDemoFleet, advanceDemoFleet, demoTransitionEvents, DEMO_TIME_SCALE } from '../demo/demoFleet.js'

export const REGIONS = [
  { name: 'ALL', test: () => true },
  { name: 'WEST COAST', test: (p) => p.longitude < 74.5 },
  { name: 'EAST COAST', test: (p) => p.longitude >= 78.5 },
  { name: 'SOUTHERN', test: (p) => p.longitude >= 74.5 && p.longitude < 78.5 },
]

export const LAYER_DEFAULTS = { ports: true, vessels: true, trails: false, risk: true, density: false, associations: true, flow: false }

export const AIS_LABEL = {
  CONNECTING: ['AIS CONNECTING', '#94A3B8'],
  CONNECTED_LIVE: ['CONNECTED · LIVE DATA FLOWING', '#34D399'],
  CONNECTED_WAITING: ['CONNECTED · WAITING FOR INDIA AIS DATA', '#F59E0B'],
  CONNECTED_NO_TRAFFIC: ['CONNECTED · WAITING FOR INDIA AIS DATA', '#F59E0B'],
  CONNECTED_NO_RECENT: ['CONNECTED · NO RECENT INDIA POSITION REPORTS', '#F59E0B'],
  DISCONNECTED: ['DISCONNECTED · RECONNECTING', '#EF4444'],
  SUBSCRIPTION_ERROR: ['SUBSCRIPTION ERROR', '#EF4444'],
  AUTH_ERROR: ['AUTHENTICATION ERROR', '#EF4444'],
  STREAM_ERROR: ['STREAM ERROR', '#EF4444'],
  STALE: ['CONNECTED · NO RECENT INDIA POSITION REPORTS', '#F59E0B'],
  connecting: ['AIS CONNECTING', '#94A3B8'],
  live: ['CONNECTED · LIVE DATA FLOWING', '#34D399'],
  empty: ['CONNECTED · WAITING FOR INDIA AIS DATA', '#F59E0B'],
  disconnected: ['DISCONNECTED · RECONNECTING', '#EF4444'],
}

export function fmtIST(d = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(d)
  } catch { return d.toLocaleTimeString() }
}

export function trendOf(history, key) {
  const tail = (history || []).slice(-14).map((h) => h[key]).filter((x) => x != null)
  if (tail.length < 4) return null
  const n = Math.min(7, tail.length)
  const a = tail.slice(0, n).reduce((s, x) => s + x, 0) / n
  const b = tail.slice(-n).reduce((s, x) => s + x, 0) / n
  // A ratio against a near-zero baseline (e.g. congestion proxy ≈ 0.0001)
  // is mathematically meaningless — it produced absurd values like +89900%.
  // Refuse to express it as a percentage instead of clamping the display.
  if (!a || Math.abs(a) < 1e-9) return null
  const pct = ((b - a) / Math.abs(a)) * 100
  if (!Number.isFinite(pct) || Math.abs(pct) > 999) return null
  return pct
}

const MaritimeContext = createContext(null)

export function useMaritime() {
  const ctx = useContext(MaritimeContext)
  if (!ctx) throw new Error('useMaritime must be used within <MaritimeProvider>')
  return ctx
}

/**
 * Single authoritative maritime data layer for all dashboard views.
 * Mounts ONE AIS SSE subscription + ONE event poller + ONE demo ticker.
 */
export function MaritimeProvider({ children }) {
  const { apiState, epoch, retry, apiOnline } = useApiStatus(true)
  const [sources, setSources] = useState(null)
  const [ports, setPorts] = useState([])
  const [predictions, setPredictions] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailState, setDetailState] = useState('idle')
  const [analytics, setAnalytics] = useState(null)
  const [analyticsState, setAnalyticsState] = useState('idle')
  const [layers, setLayers] = useState(LAYER_DEFAULTS)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [region, setRegion] = useState('ALL')
  const [riskSort, setRiskSort] = useState('congestion')
  const [clock, setClock] = useState(() => fmtIST())
  const [statusOpen, setStatusOpen] = useState(false)
  const [trends, setTrends] = useState({})
  const [mode, setMode] = useState('live') // 'live' | 'demo'
  const [demoFleet, setDemoFleet] = useState([])
  const [demoEvents, setDemoEvents] = useState([])
  const demoAssocRef = useRef(new Map())
  const [recent, setRecent] = useState(() => { try { return JSON.parse(localStorage.getItem('sagar_recent_ports') || '[]') } catch { return [] } })
  const [selectedMmsi, setSelectedMmsi] = useState(null)
  const [vesselDetail, setVesselDetail] = useState(null)
  const [focusVessel, setFocusVessel] = useState(null)
  const { vessels: liveVessels, health, state: aisState } = useLiveVessels(apiOnline)
  const { events: liveEvents, loaded: eventsLoaded } = useMaritimeEvents(apiOnline)
  const demo = mode === 'demo'

  useEffect(() => {
    const t = setInterval(() => setClock(fmtIST()), 1000)
    return () => clearInterval(t)
  }, [])

  const portsById = useMemo(() => Object.fromEntries(ports.map((p) => [p.id, p])), [ports])

  const loadAll = useCallback(async () => {
    const s = await maritimeApi.sources()
    setSources(s)
    const [p, preds] = await Promise.all([maritimeApi.ports(), maritimeApi.predictionsByDate(s.latest_prediction_date)])
    setPorts(p.ports)
    setPredictions(preds.predictions)
    setLoadError('')
  }, [])

  useEffect(() => {
    if (!apiOnline) return
    let live = true
    setLoadError('')
    loadAll().catch(() => { if (live) setLoadError('Maritime API reachable but data load failed. Retrying automatically.') })
    return () => { live = false }
  }, [apiOnline, epoch, loadAll])

  useEffect(() => {
    if (!demo || ports.length === 0) { setDemoFleet([]); return }
    const t0 = Date.now()
    setDemoFleet(buildDemoFleet(portsById, t0))
    demoAssocRef.current = new Map()
    setDemoEvents([{ ts: new Date(t0).toISOString(), kind: 'demo', message: 'DEMO MODE enabled — simulated traffic only, not real AIS' }])
  }, [demo, ports.length, portsById])

  useEffect(() => {
    if (!demo) return undefined
    const id = setInterval(() => {
      setDemoFleet((prev) => {
        if (!prev.length) return prev
        const now = Date.now()
        const next = advanceDemoFleet(prev, portsById, now)
        const evts = demoTransitionEvents(demoAssocRef.current, next, now)
        demoAssocRef.current = new Map(next.map((v) => [v.mmsi, v.vessel_status]))
        if (evts.length) setDemoEvents((e) => [...evts.reverse(), ...e].slice(0, 25))
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [demo, portsById])

  const vessels = demo ? demoFleet : liveVessels
  const events = demo ? demoEvents : liveEvents

  useEffect(() => {
    if (selectedId == null || !apiOnline) return
    setDetailState('loading')
    let live = true
    Promise.all([maritimeApi.prediction(selectedId), maritimeApi.environment(selectedId, 30), maritimeApi.vesselActivity(selectedId, 30)])
      .then(([pred, env, ves]) => {
        if (!live) return
        const pts = env.points || []
        const lastEnv = [...pts].reverse().find((pt) => pt.sst != null)
        const lastCm = [...pts].reverse().find((pt) => pt.current_magnitude != null)
        const lastSal = [...pts].reverse().find((pt) => pt.salinity != null)
        const lastObs = [...pts].reverse()[0]
        setDetail({
          prediction: pred.prediction, model: pred.model, freshness: pred.data_status,
          vessel: { latest: [...(ves.points || [])].reverse().find((pt) => pt.activity_count > 0) || null },
          environment: {
            sst: lastEnv?.sst ?? null, sst_date: lastEnv?.date,
            current_magnitude: lastCm?.current_magnitude ?? null,
            salinity: lastSal?.salinity ?? null,
            obs_date: lastObs?.date || null,
            data_age: pred.data_status?.data_age_days != null ? `${pred.data_status.data_age_days} days` : null,
            source: 'CMEMS physics + NOAA SST',
          },
        })
        setDetailState('idle')
      })
      .catch(() => live && setDetailState('error'))
    setAnalyticsState((s) => (analytics ? s : 'loading'))
    maritimeApi.analytics(selectedId).then((a) => { if (live) { setAnalytics(a); setAnalyticsState('idle') } }).catch(() => live && setAnalyticsState('error'))
    setRecent((r) => {
      const next = [selectedId, ...r.filter((x) => x !== selectedId)].slice(0, 5)
      try { localStorage.setItem('sagar_recent_ports', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, apiOnline, epoch])

  useEffect(() => {
    if (!apiOnline || ports.length === 0) return
    let live = true
    const ids = ports.map((p) => p.id)
    const chunks = []
    for (let i = 0; i < ids.length; i += 8) chunks.push(ids.slice(i, i + 8))
    ;(async () => {
      for (const chunk of chunks) {
        if (!live) return
        const results = await Promise.allSettled(chunk.map((id) => maritimeApi.analytics(id)))
        if (!live) return
        setTrends((t) => {
          const next = { ...t }
          results.forEach((r, i) => {
            if (r.status === 'fulfilled') {
              const tp = trendOf(r.value.history, 'traffic')
              const cp = trendOf(r.value.history, 'congestion')
              next[chunk[i]] = { traffic: tp, congestion: cp }
            }
          })
          return next
        })
      }
    })()
    return () => { live = false }
  }, [apiOnline, epoch, ports])

  const visiblePorts = useMemo(() => {
    const reg = REGIONS.find((r) => r.name === region) || REGIONS[0]
    return ports.filter((p) => reg.test(p))
  }, [ports, region])
  const q = query.trim().toLowerCase()
  const portHits = useMemo(() => {
    if (!q || !apiOnline) return []
    return ports.filter((p) => p.name.toLowerCase().includes(q) || String(p.id).includes(q)).slice(0, 8)
  }, [ports, q, apiOnline])
  const vesselHits = useMemo(() => {
    if (!q) return []
    return vessels.filter((v) => (v.ship_name || '').toLowerCase().includes(q) || String(v.mmsi).includes(q)).slice(0, 8)
  }, [vessels, q])
  const selectedPort = portsById[selectedId] || null
  const selectedVessel = useMemo(() => {
    if (selectedMmsi == null) return null
    const fleetVessel = vessels.find((v) => v.mmsi === selectedMmsi) || null
    if (fleetVessel && vesselDetail?.mmsi === selectedMmsi) {
      return { ...vesselDetail, ...fleetVessel }
    }
    return fleetVessel || vesselDetail
  }, [selectedMmsi, vessels, vesselDetail])

  const selectVessel = useCallback((mmsi) => {
    setSelectedMmsi(mmsi)
    setVesselDetail(null)
    if (mmsi == null) { setFocusVessel(null); return }
    const v = vessels.find((x) => x.mmsi === mmsi) || null
    if (v) {
      if (v.demo) {
        setVesselDetail(v)
      } else {
        maritimeApi.vessel(mmsi).then((d) => setVesselDetail(d.vessel)).catch(() => setVesselDetail(v))
      }
      const assocPort = v.associated_port_id ? portsById[v.associated_port_id] : null
      const fitPort = (v.vessel_status === 'APPROACHING' || v.vessel_status === 'WITHIN PORT RADIUS') && assocPort ? assocPort : null
      setFocusVessel({
        mmsi, lat: v.latitude, lon: v.longitude, ts: Date.now(),
        portLat: fitPort ? fitPort.latitude : null, portLon: fitPort ? fitPort.longitude : null,
      })
    }
  }, [vessels, portsById])

  const selectPort = useCallback((id) => {
    setSelectedId(id)
    setSelectedMmsi(null)
  }, [])

  const onEventClick = useCallback((e) => {
    const m = (e.message || '').match(/\b(\d{9})\b/)
    if (m) {
      const mmsi = Number(m[1])
      if (vessels.some((v) => v.mmsi === mmsi)) { selectVessel(mmsi); return }
    }
    const msg = (e.message || '').toUpperCase()
    let best = null
    for (const p of ports) {
      const nm = p.name.toUpperCase()
      if (msg.includes(nm) && (!best || nm.length > best.name.length)) best = p
    }
    if (best) { setSelectedId(best.id); setSelectedMmsi(null) }
  }, [vessels, ports, selectVessel])

  const stats = useMemo(() => {
    const appr = vessels.filter((v) => v.vessel_status === 'APPROACHING').length
    const inRad = vessels.filter((v) => v.vessel_status === 'WITHIN PORT RADIUS').length
    const assoc = vessels.filter((v) => v.associated_port_id).length
    const withDst = vessels.filter((v) => v.ais_destination).length
    const activePorts = new Set(vessels.map((v) => v.associated_port_id).filter(Boolean)).size
    return { total: vessels.length, approaching: appr, inRadius: inRad, assoc, withDst, activePorts, epm: health.events_per_min ?? null, lastAge: health.last_event_age_s }
  }, [vessels, health])

  const portVessels = useMemo(() => {
    const list = vessels.filter((v) => v.associated_port_id === selectedId)
    const appr = list.filter((v) => v.vessel_status === 'APPROACHING').length
    const dep = list.filter((v) => v.vessel_status === 'DEPARTING').length
    const sogs = list.map((v) => v.sog).filter((x) => typeof x === 'number')
    const dists = list.map((v) => v.distance_to_port_km).filter((x) => typeof x === 'number')
    const ages = list.map((v) => v.last_seen).filter(Boolean)
    return {
      near: list.length, appr, dep,
      avgSog: sogs.length ? (sogs.reduce((a, b) => a + b, 0) / sogs.length).toFixed(1) : null,
      avgDist: dists.length ? (dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(1) : null,
      lastUpdate: ages.length ? new Date(Math.max(...ages) * 1000).toLocaleTimeString('en-IN', { hour12: false }) : null,
    }
  }, [vessels, selectedId])

  const riskRows = useMemo(() => {
    const predById = Object.fromEntries(predictions.map((p) => [p.port.id, p.prediction]))
    const liveByPort = {}
    for (const v of vessels) {
      if (v.associated_port_id) liveByPort[v.associated_port_id] = (liveByPort[v.associated_port_id] || 0) + 1
    }
    const rows = ports.map((p) => {
      const pred = predById[p.id]
      return {
        id: p.id, name: p.name,
        traffic: pred ? pred.traffic : null,
        congestion: pred ? pred.congestion : null,
        status: portStatus(pred?.congestion),
        live: liveByPort[p.id] || 0,
        trend: trends[p.id]?.traffic ?? null,
        date: pred?.date || null,
      }
    })
    const sorters = {
      congestion: (a, b) => (b.congestion ?? -1) - (a.congestion ?? -1),
      traffic: (a, b) => (b.traffic ?? -1) - (a.traffic ?? -1),
      activity: (a, b) => b.live - a.live,
      trend: (a, b) => (b.trend ?? -Infinity) - (a.trend ?? -Infinity),
      port: (a, b) => a.name.localeCompare(b.name),
    }
    return rows.sort(sorters[riskSort] || sorters.congestion)
  }, [ports, predictions, vessels, trends, riskSort])

  const highRisk = useMemo(() => riskRows.filter((r) => r.status.label === 'HIGH').length, [riskRows])
  const topRisks = useMemo(() => riskRows.slice(0, 5), [riskRows])

  const groupedPorts = useMemo(() => ([
    { name: 'WEST COAST', list: ports.filter((p) => p.longitude < 74.5) },
    { name: 'EAST COAST', list: ports.filter((p) => p.longitude >= 78.5) },
    { name: 'SOUTHERN', list: ports.filter((p) => p.longitude >= 74.5 && p.longitude < 78.5) },
  ]), [ports])

  const aisConnected = health.connected === true
  const vesselsEmpty = vessels.length === 0
  const sysLabel = !apiOnline ? ['SYSTEM DEGRADED', '#F59E0B'] : ['SYSTEM OPERATIONAL', '#34D399']
  const apiLabel = apiState === API_STATE.ONLINE ? ['API CONNECTED', '#34D399'] : apiState === API_STATE.CONNECTING ? ['API CONNECTING', '#94A3B8'] : ['API OFFLINE', '#EF4444']
  const aisLabel = demo ? ['AIS DEMO MODE', '#C084FC'] : !apiOnline ? ['AIS UNKNOWN · API OFFLINE', '#64748B'] : (AIS_LABEL[aisState] || AIS_LABEL.connecting)
  const dataLabel = !apiOnline ? ['DATA OFFLINE', '#64748B'] : sources ? (sources.sources?.status === 'STALE' ? ['DATA STALE', '#F59E0B'] : ['DATA FRESH', '#34D399']) : ['DATA CONNECTING', '#94A3B8']
  const modelLabel = !apiOnline ? ['MODELS OFFLINE', '#64748B'] : predictions.length ? ['MODELS READY', '#34D399'] : ['MODELS LOADING', '#94A3B8']

  const sourceHealth = useMemo(() => {
    if (!apiOnline) {
      const off = (role) => ({ state: 'OFFLINE', color: '#64748B', role })
      return [
        ['OPEN WATERS', { ...off('Live vessel positions'), detail: 'API unreachable' }],
        ['AISSTREAM', { ...off('Live vessel positions'), detail: 'API unreachable' }],
        ['VESSELAPI', { ...off('Live vessel positions'), detail: 'API unreachable' }],
        ['GFW', { ...off('Vessel activity'), detail: 'API unreachable' }],
        ['CMEMS', { ...off('Ocean physics'), detail: 'API unreachable' }],
        ['NOAA', { ...off('SST'), detail: 'API unreachable' }],
        ['WPI', { ...off('Port metadata'), detail: 'API unreachable' }],
        ['ML MODELS', { ...off('Forecasts'), detail: 'API unreachable' }],
      ]
    }
    // Per-provider cards: the three AIS sources are independent first-class
    // providers — never primary/fallback. Each card derives only from its
    // own backend status + vessel count. Green (HEALTHY/LIVE) requires the
    // backend's timestamp-verified CONNECTED_LIVE — a successful REST poll
    // with only stale positions stays amber, never live.
    const agg = health.aggregation || {}
    const providerCard = (label, h, count) => {
      const st = h?.ais_status || h?.diagnostics?.status
      const card = { role: 'Live vessel positions' }
      if (st === 'NOT_CONFIGURED') return { ...card, state: 'NOT CONFIGURED', color: '#64748B', detail: 'Key missing — other sources unaffected' }
      if (st === 'AUTH_ERROR') return { ...card, state: 'ERROR', color: '#EF4444', detail: 'Authentication error — check server key' }
      if (st === 'RATE_LIMITED') return { ...card, state: 'STALE', color: '#F59E0B', detail: 'Rate limited by provider — backing off' }
      if (st === 'SUBSCRIPTION_ERROR') return { ...card, state: 'ERROR', color: '#EF4444', detail: 'Subscription error — see diagnostics' }
      if (!h || h.connected !== true) return { ...card, state: 'ERROR', color: '#EF4444', detail: 'Disconnected · reconnecting' }
      if (st === 'CONNECTED_LIVE' && (count ?? 0) > 0) return { ...card, state: 'HEALTHY', color: '#34D399', detail: `LIVE · ${count} India vessels` }
      if (st === 'CONNECTED_NO_RECENT' || st === 'STALE') return { ...card, state: 'STALE', color: '#F59E0B', detail: 'Connected · no recent India data' }
      if (st === 'STREAM_ERROR') return { ...card, state: 'ERROR', color: '#EF4444', detail: 'Stream error · reconnecting' }
      if ((count ?? 0) > 0) return { ...card, state: 'STALE', color: '#F59E0B', detail: `Connected · ${count} tracked, none verified live` }
      return { ...card, state: 'HEALTHY', color: '#34D399', detail: 'Connected · waiting for India data' }
    }
    const srcs = health.sources || {}
    const owCount = agg.from_openwaters ?? srcs.openwaters?.vessels_tracked ?? 0
    const asCount = agg.from_aisstream ?? srcs.aisstream?.vessels_tracked ?? 0
    const vaCount = agg.from_vesselapi ?? srcs.vesselapi?.vessels_tracked ?? 0
    const lastAge = health.last_event_age_s
    const diag = health.diagnostics || {}
    const backendStatus = health.ais_status || diag.status
    const errDetail = diag.auth_error || diag.subscription_error || diag.stream_error || diag.last_error
    const msgNote = diag.raw_messages != null
      ? ` · ${diag.raw_messages} frames (${diag.position_report ?? 0} A + ${((diag.class_b_std ?? 0) + (diag.class_b_ext ?? 0))} B)`
      : ''
    const ais = backendStatus === 'AUTH_ERROR'
      ? { state: 'ERROR', color: '#EF4444', detail: 'Authentication error — check server AISSTREAM_API_KEY' }
      : backendStatus === 'SUBSCRIPTION_ERROR'
        ? { state: 'ERROR', color: '#EF4444', detail: `Subscription error${errDetail ? ` — ${String(errDetail).slice(0, 90)}` : ''}` }
        : backendStatus === 'STREAM_ERROR'
          ? { state: 'ERROR', color: '#EF4444', detail: `Stream error${errDetail ? ` — ${String(errDetail).slice(0, 90)}` : ''} · reconnecting` }
          : !aisConnected
            ? { state: 'ERROR', color: '#EF4444', detail: `Stream disconnected · reconnecting (attempts ${diag.connection_attempts ?? '—'}, reconnects ${diag.reconnects ?? '—'})` }
            : vessels.length
              ? { state: 'HEALTHY', color: '#34D399', detail: `LIVE · ${stats.total} vessels${msgNote}` }
              : lastAge != null && lastAge > 180
                ? { state: 'STALE', color: '#F59E0B', detail: `No fix for ${Math.round(lastAge)}s${msgNote}` }
                : { state: 'HEALTHY', color: '#34D399', detail: `Connected, waiting for India position reports${msgNote}` }
    ais.role = 'Live vessel positions'
    const g = sources?.sources || {}
    const mk = (v, role, extra = '') => v === 'CURRENT'
      ? { state: 'HEALTHY', color: '#34D399', role, detail: extra }
      : v === 'HISTORICAL' ? { state: 'STALE', color: '#F59E0B', role, detail: `${extra} (by design)` }
      : { state: 'NO DATA', color: '#EF4444', role, detail: extra || 'No status' }
    return [
      ['OPEN WATERS', providerCard('OPEN WATERS', srcs.openwaters, owCount)],
      ['AISSTREAM', providerCard('AISSTREAM', srcs.aisstream, asCount)],
      ['VESSELAPI', providerCard('VESSELAPI', srcs.vesselapi, vaCount)],
      ['GFW', mk(g.gfw, 'Vessel activity', `DAILY · ${sources?.sources.gfw_latest || '—'}`)],
      ['CMEMS', mk(g.cmems, 'Ocean physics', `MONTHLY · ${sources?.sources.cmems_latest || '—'}`)],
      ['NOAA', mk(g.noaa, 'SST', `HISTORICAL · ${sources?.sources.noaa_latest || '—'}`)],
      ['WPI', { state: 'HEALTHY', color: '#34D399', role: 'Port metadata', detail: 'STATIC · 44 ports' }],
      ['ML MODELS', predictions.length
        ? { state: 'HEALTHY', color: '#34D399', role: 'Forecasts', detail: `READY · ${sources?.latest_prediction_date || ''}` }
        : { state: 'NO DATA', color: '#EF4444', role: 'Forecasts', detail: 'No predictions loaded' }],
    ]
  }, [apiOnline, aisConnected, vessels.length, health, sources, predictions.length, stats.total])

  const freshSub = demo ? 'SIMULATED ×240' : !apiOnline ? 'API OFFLINE' : stats.lastAge != null ? `LIVE · ${Math.round(stats.lastAge)}s ago` : aisConnected ? 'CONNECTED · WAITING FOR DATA' : 'RECONNECTING'
  const selRisk = detail?.prediction ? portStatus(detail.prediction.congestion) : null
  // Independent AIS source summary for the AIS SOURCES display (Phase 14).
  // Counts come from backend aggregation; each source stands on its own.
  const aggregation = health.aggregation || null
  const aisSources = useMemo(() => {
    const agg = health.aggregation || {}
    const srcs = health.sources || {}
    const mk = (id, label, count) => ({
      id, label,
      status: srcs[id]?.ais_status || srcs[id]?.diagnostics?.status || 'DISCONNECTED',
      connected: srcs[id]?.connected === true,
      vessels: count ?? srcs[id]?.vessels_tracked ?? 0,
      lastEventAge: srcs[id]?.last_event_age_s ?? null,
    })
    return [
      mk('openwaters', 'Open Waters', agg.from_openwaters),
      mk('aisstream', 'AISStream', agg.from_aisstream),
      mk('vesselapi', 'VesselAPI', agg.from_vesselapi),
    ]
  }, [health])

  const value = {
    apiState, epoch, retry, apiOnline,
    sources, ports, portsById, predictions,
    selectedId, setSelectedId, selectPort, selectedPort,
    detail, detailState, analytics, analyticsState,
    layers, setLayers, loadError, query, setQuery, q, region, setRegion,
    riskSort, setRiskSort, clock, statusOpen, setStatusOpen, trends,
    mode, setMode, demo, demoFleet, demoEvents,
    recent, selectedMmsi, setSelectedMmsi, vesselDetail, selectedVessel, selectVessel, focusVessel, setFocusVessel,
    vessels, liveVessels, health, aisState, events, liveEvents, eventsLoaded,
    visiblePorts, portHits, vesselHits, portVessels,
    stats, riskRows, highRisk, topRisks, groupedPorts,
    aisConnected, vesselsEmpty, sysLabel, apiLabel, aisLabel, dataLabel, modelLabel,
    sourceHealth, freshSub, selRisk, onEventClick,
    aggregation, aisSources,
  }
  return <MaritimeContext.Provider value={value}>{children}</MaritimeContext.Provider>
}
