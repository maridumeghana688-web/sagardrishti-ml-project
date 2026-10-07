import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// Explicit worker bundle (robust under Vite dev + production builds:
// the default worker-URL derivation fails in both, killing vector tiles).
try {
  if (mapWorkerUrl && typeof maplibregl.setWorkerUrl === 'function') maplibregl.setWorkerUrl(mapWorkerUrl)
} catch { /* default worker resolution */ }
import { portStatus } from '../../api/maritime.js'
import { useReducedMotion } from '../../hooks/useReducedMotion.js'
import { loadMapStyle, MAP_SOURCE_LABEL, OPENFREEMAP_ATTRIBUTION } from '../../map/mapStyle.js'
import { createShipSprites } from '../../map/sprites.js'
import {
  ASSOC_STATES,
  assocFeatures,
  featureizeVessels,
  headingOf,
  interpolatePos,
  radiusPolygon,
  statusOf,
  trailSegments,
  vesselsKey,
} from '../../map/vesselEngine.js'

const INDIA_CENTER = [79.5, 21.5] // [lon, lat]
const INDIA_ZOOM = 4.4
const MAX_VESSELS = 1500

const STATUS_COLOR = { LIVE: '#e6f7ff', RECENT: '#f2b04e', STALE: '#6f8199' }

function fmtAge(ts) {
  if (!ts) return '—'
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${(s / 3600).toFixed(1)}h ago`
}

function MapChrome({ selected, layers, onToggleLayer, onFitIndia, onFitPort, pitch, onTogglePitch }) {
  const btn = (key, label) => (
    <button
      key={key} type="button" onClick={() => onToggleLayer(key)}
      aria-pressed={!!layers[key]} aria-label={`Toggle ${label} layer`}
      className={`sd-layer-toggle ${layers[key] ? 'on' : ''}`}
    >
      <span className="sd-layer-box" aria-hidden>{layers[key] ? '✓' : ''}</span>{label}
    </button>
  )
  return (
    <>
      <div className="sd-map-panel" role="group" aria-label="Map layers">
        <span className="sd-map-panel-title">LAYERS</span>
        {btn('ports', 'PORTS')}
        {btn('vessels', 'LIVE AIS')}
        {btn('trails', 'AIS TRAILS')}
        {btn('risk', 'PORT RISK')}
        {btn('density', 'ACTIVITY DENSITY')}
        {btn('associations', 'ASSOCIATIONS')}
        {btn('flow', 'TRAFFIC FLOW')}
      </div>
      <div className="sd-map-controls" role="group" aria-label="Map view controls">
        <button type="button" onClick={onFitIndia} aria-label="Fit India view">FIT INDIA</button>
        <button type="button" onClick={onFitPort} disabled={!selected} aria-label="Zoom to selected port">PORT</button>
        <button type="button" onClick={onTogglePitch} aria-label="Toggle 3D pitch" aria-pressed={pitch > 0}>3D</button>
      </div>
    </>
  )
}

/**
 * IndiaMapGL — MapLibre GL JS operations map on an OSM-based basemap.
 * Same props/API as the previous map component; all layers preserved.
 * Vessels render in GPU symbol layers from the aggregated AIS state;
 * animation interpolates BETWEEN real fixes only (see vesselEngine).
 */
export default function IndiaMapGL({
  ports, predictions, selectedId, onSelect, vessels = [], portsById = {},
  selectedMmsi = null, onSelectVessel = () => {},
  layers = { ports: true, vessels: true, trails: false, risk: true, density: false, associations: true, flow: false },
  onToggleLayer = () => {},
  focusVessel = null,
}) {
  const reduced = useReducedMotion()
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const targetsRef = useRef(new Map())
  const hoverRef = useRef({ kind: null, id: null, popup: null })
  const [ready, setReady] = useState(false)
  const [basemap, setBasemap] = useState('loading')
  const [pitch, setPitch] = useState(0)
  const shown = useMemo(() => (vessels || []).slice(0, MAX_VESSELS), [vessels])
  const key = useMemo(() => vesselsKey(shown), [shown])

  // Latest props for the animation loop / map handlers (no re-subscriptions).
  const liveRef = useRef({})
  liveRef.current = { shown, layers, selectedMmsi, reduced, portsById, selectedId, onSelectVessel, onSelect, ports }

  const byId = useMemo(
    () => Object.fromEntries((predictions || []).map((p) => [p.port.id, p.prediction])),
    [predictions],
  )
  const fullById = Object.keys(portsById || {}).length ? portsById : Object.fromEntries((ports || []).map((p) => [p.id, p]))
  const selected = (ports || []).find((p) => p.id === selectedId) || fullById[selectedId] || null
  const byIdRef = useRef(byId)
  byIdRef.current = byId

  const activity = useMemo(() => {
    const counts = {}
    const appr = {}
    for (const v of shown) {
      if (!v.associated_port_id) continue
      counts[v.associated_port_id] = (counts[v.associated_port_id] || 0) + 1
      if (v.vessel_status === 'APPROACHING') appr[v.associated_port_id] = (appr[v.associated_port_id] || 0) + 1
    }
    return { counts, appr }
  }, [shown])
  const activityRef = useRef(activity)
  activityRef.current = activity

  // ---- vessel targets + static data layers (on new AIS data) ----
  const refreshStaticLayers = () => {
    const map = mapRef.current
    if (!map || !map.getSource('sd-vessels')) return
    const st = liveRef.current
    const now = Date.now() / 1000
    // advance targets to the newest REAL fixes
    const seen = new Set()
    for (const v of st.shown) {
      seen.add(v.mmsi)
      const t = targetsRef.current.get(v.mmsi)
      const fix = { lat: v.latitude, lon: v.longitude, ts: v.last_seen || 0 }
      if (!t) {
        const { hdg } = headingOf(v, null)
        targetsRef.current.set(v.mmsi, { prev: fix, next: fix, hdg, static: v })
      } else if (t.next.lat !== fix.lat || t.next.lon !== fix.lon || t.next.ts !== fix.ts) {
        const { hdg } = headingOf(v, t.hdg)
        targetsRef.current.set(v.mmsi, { prev: { ...t.next }, next: fix, hdg, static: v })
      } else {
        t.static = v
        const { hdg } = headingOf(v, t.hdg)
        t.hdg = hdg
      }
    }
    for (const k of [...targetsRef.current.keys()]) if (!seen.has(k)) targetsRef.current.delete(k)
    // trails (observed fixes only) + associations + density
    const trailFeats = []
    if (st.layers.trails) {
      const small = st.shown.length <= 200
      for (const v of st.shown.slice(0, 250)) {
        const tr = v.track
        if (!Array.isArray(tr) || tr.length === 0) continue
        if (v.mmsi !== st.selectedMmsi && !(v.associated_port_id && ASSOC_STATES.has(v.vessel_status)) && !small) continue
        const emph = v.mmsi === st.selectedMmsi
        for (const s of trailSegments(tr, v.latitude, v.longitude, { base: emph ? 0.3 : 0.12, span: emph ? 0.65 : 0.5 })) {
          s.properties.demo = v.demo ? 1 : 0
          s.properties.w = emph ? 2.5 : 1.5
          trailFeats.push(s)
        }
      }
    }
    map.getSource('sd-trails')?.setData({ type: 'FeatureCollection', features: trailFeats })
    const assocs = st.layers.associations || st.layers.flow ? assocFeatures(st.shown, st.portsById) : { type: 'FeatureCollection', features: [] }
    map.getSource('sd-assocs')?.setData(assocs)
    const dens = st.layers.density
      ? { type: 'FeatureCollection', features: st.shown.map((v) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [v.longitude, v.latitude] }, properties: {} })) }
      : { type: 'FeatureCollection', features: [] }
    map.getSource('sd-density')?.setData(dens)
    // selected vessel source
    const sel = st.selectedMmsi != null ? st.shown.find((v) => v.mmsi === st.selectedMmsi) : null
    map.getSource('sd-sel')?.setData(sel
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [sel.longitude, sel.latitude] }, properties: { hdg: headingOf(sel, null).hdg, variant: 'hull', status: statusOf(sel, now), demo: sel.demo ? 1 : 0, mmsi: sel.mmsi } }] }
      : { type: 'FeatureCollection', features: [] })
    void now
  }

  // ---- map init (once) ----
  useEffect(() => {
    let cancelled = false
    let map = null
    let raf = 0
    let lastFrame = 0;
    (async () => {
      const { style, basemap: bm } = await loadMapStyle()
      if (cancelled || !containerRef.current) return
      setBasemap(bm)
      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: INDIA_CENTER,
        zoom: INDIA_ZOOM,
        attributionControl: { compact: true, customAttribution: OPENFREEMAP_ATTRIBUTION },
        maxBounds: [[38, -16], [116, 42]],
        fadeDuration: 0,
      })
      mapRef.current = map
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
      // Build data layers on style.load (style JSON parsed) — never wait for
      // every tile: a single hanging tile must not block ports/vessels.
      map.on('style.load', () => {
        if (cancelled || map.__sdReady) return
        map.__sdReady = true
        try {
        const sprites = createShipSprites()
        const added = []
        for (const { name, image } of sprites) {
          try {
            if (!map.hasImage(name)) {
              map.addImage(name, image, { sdf: true })
              added.push(name)
            } else {
              added.push(name)
            }
          } catch (err) { console.warn(`[IndiaMapGL] sprite ${name} rejected`, err) }
        }
        // Observable diagnostics (harmless data attributes for QA/tests).
        try {
          map.getContainer().dataset.sdSprites = added.join(',')
        } catch { /* ignore */ }
        const empty = { type: 'FeatureCollection', features: [] }
        map.addSource('sd-vessels', { type: 'geojson', data: empty })
        map.addSource('sd-sel', { type: 'geojson', data: empty })
        map.addSource('sd-trails', { type: 'geojson', data: empty })
        map.addSource('sd-assocs', { type: 'geojson', data: empty })
        map.addSource('sd-density', { type: 'geojson', data: empty })
        map.addSource('sd-radius', { type: 'geojson', data: empty })
        map.addLayer({
          id: 'sd-radius-fill', type: 'fill', source: 'sd-radius',
          paint: { 'fill-color': '#22d3ee', 'fill-opacity': 0.05 },
        })
        map.addLayer({
          id: 'sd-radius-line', type: 'line', source: 'sd-radius',
          paint: { 'line-color': '#22d3ee', 'line-width': 1.4, 'line-dasharray': [4, 4], 'line-opacity': 0.7 },
        })
        map.addLayer({
          id: 'sd-density', type: 'circle', source: 'sd-density',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 7, 13],
            'circle-color': '#22d3ee', 'circle-opacity': 0.1, 'circle-stroke-width': 0,
          },
        })
        map.addLayer({
          id: 'sd-assocs', type: 'line', source: 'sd-assocs',
          filter: ['==', ['get', 'approaching'], 0],
          paint: { 'line-color': '#64748b', 'line-width': 1, 'line-opacity': 0.35, 'line-dasharray': [3, 4] },
        })
        map.addLayer({
          id: 'sd-assocs-flow', type: 'line', source: 'sd-assocs',
          filter: ['==', ['get', 'approaching'], 1],
          paint: { 'line-color': '#22d3ee', 'line-width': 1.8, 'line-opacity': 0.7, 'line-dasharray': [3, 3] },
        })
        map.addLayer({
          id: 'sd-trails', type: 'line', source: 'sd-trails',
          paint: {
            'line-color': ['case', ['==', ['get', 'demo'], 1], '#7c3aed', '#22d3ee'],
            'line-width': ['get', 'w'],
            'line-opacity': ['get', 'op'],
          },
        })
        const shipImage = ['concat', 'ship-', ['get', 'variant'], ['case', ['==', ['get', 'wake'], 1], '-wake', '']]
        const shipColor = ['case', ['==', ['get', 'demo'], 1], '#a78bfa',
          ['match', ['get', 'status'], 'LIVE', STATUS_COLOR.LIVE, 'RECENT', STATUS_COLOR.RECENT, 'STALE', STATUS_COLOR.STALE, STATUS_COLOR.LIVE]]
        map.addLayer({
          id: 'sd-vessels', type: 'symbol', source: 'sd-vessels',
          layout: {
            'icon-image': shipImage,
            // Zoom-aware sizing: small clean glyphs far out, full silhouette close in.
            'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.24, 6, 0.34, 9, 0.5, 12, 0.68],
            'icon-rotate': ['get', 'hdg'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-padding': 0,
          },
          paint: {
            'icon-color': shipColor,
            'icon-opacity': ['case', ['==', ['get', 'status'], 'STALE'], 0.55, 1],
          },
        })
        map.addLayer({
          id: 'sd-sel-ring', type: 'symbol', source: 'sd-sel',
          layout: {
            'icon-image': 'sel-ring',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.34, 6, 0.48, 9, 0.7, 12, 0.95],
            'icon-allow-overlap': true, 'icon-ignore-placement': true,
          },
          paint: { 'icon-color': '#67e8f9', 'icon-opacity': 0.9 },
        })
        map.addLayer({
          id: 'sd-sel-ship', type: 'symbol', source: 'sd-sel',
          layout: {
            'icon-image': 'ship-hull',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.32, 6, 0.46, 9, 0.68, 12, 0.92],
            'icon-rotate': ['get', 'hdg'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true, 'icon-ignore-placement': true,
          },
          paint: { 'icon-color': shipColor },
        })
        applyLayerVisibility(map, liveRef.current.layers)
        buildPortMarkers(map)
        wireInteractions(map)
        refreshStaticLayers()
        setReady(true)
        // animation loop: render positions only, no React state per frame
        const loop = (ts) => {
          raf = requestAnimationFrame(loop)
          if (cancelled || document.hidden) return
          if (ts - lastFrame < 110) return
          lastFrame = ts
          renderVessels(map)
        }
        raf = requestAnimationFrame(loop)
        } catch (err) { console.error('[IndiaMapGL load]', err && err.stack ? err.stack : String(err)) }
      })
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      hoverRef.current.popup?.remove()
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      try { map?.remove() } catch { /* ignore */ }
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const renderVessels = (map) => {
    const st = liveRef.current
    const src = map.getSource('sd-vessels')
    if (!src) return
    if (!st.layers.vessels) return
    const now = Date.now() / 1000
    const items = []
    for (const v of st.shown) {
      const t = targetsRef.current.get(v.mmsi)
      const status = statusOf(v, now)
      if (!t || st.reduced) {
        const { hdg } = headingOf(v, t?.hdg ?? null)
        if (t) t.hdg = hdg
        items.push({ v, lat: v.latitude, lon: v.longitude, hdg, status, selected: v.mmsi === st.selectedMmsi, nowS: now })
        continue
      }
      if (status === 'STALE') {
        // frozen at the last REAL fix — no artificial movement
        items.push({ v, lat: t.next.lat, lon: t.next.lon, hdg: t.hdg, status, selected: v.mmsi === st.selectedMmsi, nowS: now })
        continue
      }
      const pos = interpolatePos(t.prev, t.next, now)
      const { hdg } = headingOf(v, t.hdg)
      t.hdg = hdg
      items.push({ v, lat: pos.lat, lon: pos.lon, hdg, status, selected: v.mmsi === st.selectedMmsi, nowS: now })
    }
    try { src.setData(featureizeVessels(items)) } catch { /* ignore */ }
    try { map.getContainer().dataset.sdVessels = String(items.length) } catch { /* ignore */ }
    // keep the selected marker pinned to its interpolated fix
    const sel = st.selectedMmsi != null ? items.find((i) => i.v.mmsi === st.selectedMmsi) : null
    try {
      map.getSource('sd-sel')?.setData(sel
        ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [sel.lon, sel.lat] }, properties: { hdg: sel.hdg, mmsi: sel.v.mmsi } }] }
        : { type: 'FeatureCollection', features: [] })
    } catch { /* ignore */ }
  }

  const applyLayerVisibility = (map, layers) => {
    const vis = (on) => (on ? 'visible' : 'none')
    try {
      map.setLayoutProperty('sd-vessels', 'visibility', vis(layers.vessels))
      map.setLayoutProperty('sd-sel-ring', 'visibility', vis(layers.vessels))
      map.setLayoutProperty('sd-sel-ship', 'visibility', vis(layers.vessels))
      map.setLayoutProperty('sd-trails', 'visibility', vis(layers.trails && layers.vessels))
      map.setLayoutProperty('sd-assocs', 'visibility', vis((layers.associations || layers.flow) && layers.vessels))
      map.setLayoutProperty('sd-assocs-flow', 'visibility', vis(layers.flow && layers.vessels))
      map.setLayoutProperty('sd-density', 'visibility', vis(layers.density && layers.vessels))
      markersRef.current.forEach((m) => {
        try { m.getElement().style.display = layers.ports ? '' : 'none' } catch { /* ignore */ }
      })
    } catch { /* ignore */ }
  }

  const portTooltipHtml = (p, st, live, appr) => `
    <div class="sd-tip"><strong>${p.name}</strong><br/>
    <span>WPI ${p.id} · ${st.label}</span><br/>
    <span>Live: ${live} · Approaching: ${appr}</span></div>`

  const portPopupHtml = (p, pred, st, live, appr) => `
    <div class="sd-tip"><strong>${p.name}</strong><br/>
    <span>WPI ${p.id} · ${st.label}</span><br/>
    <span>Traffic index ${pred ? pred.traffic.toFixed(1) : '—'} · Congestion ${pred ? pred.congestion.toFixed(3) : '—'}</span><br/>
    <span>Live vessels ${live} · Approaching ${appr}</span><br/>
    <button type="button" data-open-port="${p.id}" class="sd-tip-btn">OPEN INTELLIGENCE</button></div>`

  const buildPortMarkers = (map) => {
    const st = liveRef.current
    markersRef.current.forEach((m) => m.remove())
    markersRef.current.clear()
    for (const p of (st.ports || [])) {
      const el = document.createElement('div')
      el.className = 'sd-port-icon'
      el.innerHTML = `<span class="sd-port-marker"><span class="sd-port-halo" hidden></span><span class="sd-port-pulse" hidden></span><span class="sd-port-ring"></span><span class="sd-port-core"></span><span class="sd-port-count" hidden></span></span>`
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.longitude, p.latitude]).addTo(map)
      el.style.cursor = 'pointer'
      el.addEventListener('mouseenter', () => {
        const s = liveRef.current
        const pred = byIdRef.current[p.id]
        const pst = s.layers.risk ? portStatus(pred?.congestion) : { label: 'PORT', color: '#22d3ee' }
        const a = activityRef.current
        hoverRef.current.popup?.remove()
        hoverRef.current.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'sd-pop', offset: 14 })
          .setLngLat([p.longitude, p.latitude])
          .setHTML(portTooltipHtml(p, pst, a.counts[p.id] || 0, a.appr[p.id] || 0))
          .addTo(map)
        hoverRef.current.kind = 'port'
      })
      el.addEventListener('mouseleave', () => {
        if (hoverRef.current.kind === 'port') { hoverRef.current.popup?.remove(); hoverRef.current.kind = null }
      })
      el.addEventListener('click', (e) => {
        e.stopPropagation()
        liveRef.current.onSelect(p.id)
        const s = liveRef.current
        const pred = byIdRef.current[p.id]
        const pst = s.layers.risk ? portStatus(pred?.congestion) : { label: 'PORT', color: '#22d3ee' }
        const a = activityRef.current
        hoverRef.current.popup?.remove()
        const popup = new maplibregl.Popup({ className: 'sd-pop', offset: 14 })
          .setLngLat([p.longitude, p.latitude])
          .setHTML(portPopupHtml(p, pred, pst, a.counts[p.id] || 0, a.appr[p.id] || 0))
          .addTo(map)
        hoverRef.current = { kind: 'port', id: p.id, popup }
        const btn = popup.getElement()?.querySelector('[data-open-port]')
        btn?.addEventListener('click', () => { liveRef.current.onSelect(p.id); popup.remove() })
      })
      markersRef.current.set(p.id, marker)
    }
    refreshPortMarkers()
  }

  const refreshPortMarkers = () => {
    const s = liveRef.current
    const a = activityRef.current
    markersRef.current.forEach((marker, id) => {
      const el = marker.getElement()
      const p = ((s.ports || []).find((x) => x.id === id)) || (s.portsById || {})[id]
      if (!p || !el) return
      const pred = byIdRef.current[id]
      const pst = s.layers.risk ? portStatus(pred?.congestion) : { label: 'PORT', color: '#22d3ee' }
      const live = a.counts[id] || 0
      const appr = a.appr[id] || 0
      const isSel = id === s.selectedId
      const size = isSel ? 34 : 24
      const ring = el.querySelector('.sd-port-ring')
      const core = el.querySelector('.sd-port-core')
      const halo = el.querySelector('.sd-port-halo')
      const pulse = el.querySelector('.sd-port-pulse')
      const count = el.querySelector('.sd-port-count')
      if (ring) {
        ring.style.borderColor = pst.color
        ring.style.width = `${size}px`
        ring.style.height = `${size}px`
        ring.style.boxShadow = (pst.label === 'ELEVATED' || pst.label === 'HIGH')
          ? `0 0 0 3px ${pst.color}44, 0 0 8px ${pst.color}66` : '0 1px 3px rgba(3,25,45,.35)'
      }
      if (core) core.style.background = pst.label === 'UNKNOWN' ? '#64748b' : '#0369a1'
      if (halo) halo.hidden = !isSel
      if (pulse) pulse.hidden = !(live > 0 && !isSel)
      if (pulse) pulse.style.borderColor = pst.color
      if (count) {
        count.hidden = !(live > 0)
        count.textContent = live > 9 ? '9+' : String(live)
      }
      el.title = `${p.name} — ${pst.label}`
      el.style.display = s.layers.ports ? '' : 'none'
      try { marker.setLngLat([p.longitude, p.latitude]) } catch { /* ignore */ }
    })
  }

  const vesselTipHtml = (v, status) => `
    <div class="sd-tip"><strong>${v.ship_name || 'Unknown vessel'}</strong>${v.demo ? ' · DEMO' : ''}<br/>
    <span>MMSI ${v.mmsi}${v.demo ? ' (simulated)' : ''}</span><br/>
    <span>${v.sog != null ? `Speed ${v.sog} kn · ` : ''}${v.cog != null ? `Course ${v.cog}°` : ''}</span><br/>
    <span>${v.demo ? 'SIMULATED' : status} · ${v.vessel_status || ''}</span>
    ${status === 'STALE' && !v.demo ? '<br/><span>LAST OBSERVED — animation stopped</span>' : ''}</div>`

  const wireInteractions = (map) => {
    map.on('mousemove', 'sd-vessels', (e) => {
      const st = liveRef.current
      const f = e.features?.[0]
      if (!f) return
      map.getCanvas().style.cursor = 'pointer'
      const mmsi = f.properties?.mmsi
      if (hoverRef.current.kind === 'vessel' && hoverRef.current.id === mmsi) return
      const v = st.shown.find((x) => x.mmsi === mmsi)
      if (!v) return
      hoverRef.current.popup?.remove()
      const now = Date.now() / 1000
      hoverRef.current.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'sd-pop', offset: 12 })
        .setLngLat(f.geometry.coordinates)
        .setHTML(vesselTipHtml(v, statusOf(v, now)))
        .addTo(map)
      hoverRef.current.kind = 'vessel'
      hoverRef.current.id = mmsi
    })
    map.on('mouseleave', 'sd-vessels', () => {
      map.getCanvas().style.cursor = ''
      if (hoverRef.current.kind === 'vessel') { hoverRef.current.popup?.remove(); hoverRef.current.kind = null; hoverRef.current.id = null }
    })
    map.on('click', 'sd-vessels', (e) => {
      const f = e.features?.[0]
      const mmsi = f?.properties?.mmsi
      if (mmsi != null) liveRef.current.onSelectVessel(Number(mmsi))
    })
  }

  // ---- effects on data/layer/selection changes ----
  const portsSig = useMemo(() => (ports || []).map((p) => p.id).join(','), [ports])
  useEffect(() => {
    if (!ready || !mapRef.current) return
    buildPortMarkers(mapRef.current)
    refreshStaticLayers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, portsSig])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    refreshStaticLayers()
    refreshPortMarkers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    applyLayerVisibility(mapRef.current, layers)
    refreshStaticLayers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, layers.ports, layers.vessels, layers.trails, layers.risk, layers.density, layers.associations, layers.flow])

  useEffect(() => {
    if (!ready || !mapRef.current) return
    refreshPortMarkers()
    const p = selected
    const map = mapRef.current
    if (p) {
      try {
        map.getSource('sd-radius')?.setData(radiusPolygon(p.latitude, p.longitude))
      } catch { /* ignore */ }
    } else {
      try { map.getSource('sd-radius')?.setData({ type: 'FeatureCollection', features: [] }) } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selectedId])

  const prevSelectedRef = useRef(selectedId)
  useEffect(() => {
    if (!ready || !mapRef.current) return
    if (prevSelectedRef.current !== selectedId && selected) {
      mapRef.current.flyTo({ center: [selected.longitude, selected.latitude], zoom: 7, duration: 1200 })
    }
    prevSelectedRef.current = selectedId
  }, [ready, selectedId, selected])

  const focusKey = focusVessel ? `${focusVessel.mmsi}:${focusVessel.ts}` : ''
  useEffect(() => {
    if (!ready || !mapRef.current || !focusVessel) return
    const map = mapRef.current
    if (focusVessel.portLat != null && focusVessel.portLon != null) {
      map.fitBounds([[focusVessel.lon, focusVessel.lat], [focusVessel.portLon, focusVessel.portLat]], { padding: 60, duration: 1200 })
    } else {
      map.flyTo({ center: [focusVessel.lon, focusVessel.lat], zoom: 7, duration: 1200 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, focusKey])

  const fitIndia = () => mapRef.current?.easeTo({ center: INDIA_CENTER, zoom: INDIA_ZOOM, pitch: 0, bearing: 0, duration: 1000 })
  const fitPort = () => { if (selected && mapRef.current) mapRef.current.flyTo({ center: [selected.longitude, selected.latitude], zoom: 7, duration: 1200 }) }
  const togglePitch = () => {
    const next = pitch > 0 ? 0 : 45
    setPitch(next)
    try { mapRef.current?.easeTo({ pitch: next, duration: 800 }) } catch { /* ignore */ }
  }

  return (
    <div className="sd-map-wrap sd-map-dark sd-map-gl">
      <div ref={containerRef} className="sd-gl-canvas" role="application" aria-label="India maritime operations map" />
      <div className="sd-gl-grid" aria-hidden />
      <div className="sd-gl-vignette" aria-hidden />
      {!ready && (
        <div className="sd-gl-loading" role="status">
          <p className="font-mono-tech">LOADING OSM BASEMAP…</p>
          <p className="sd-gl-sub">{MAP_SOURCE_LABEL}</p>
        </div>
      )}
      {ready && (
        <div className={`sd-gl-basemap ${basemap === 'openfreemap' ? 'ok' : 'degraded'}`} role="status">
          {basemap === 'openfreemap' ? 'OSM BASEMAP · LIVE' : 'BASEMAP UNAVAILABLE · DATA LAYERS LIVE'}
        </div>
      )}
      <MapChrome
        selected={selected} layers={layers} onToggleLayer={onToggleLayer}
        onFitIndia={fitIndia} onFitPort={fitPort} pitch={pitch} onTogglePitch={togglePitch}
      />
      {layers.density && (
        <p className="sd-density-note" role="note">
          {shown.length ? 'ACTIVITY DENSITY · LIVE AIS ACTIVITY' : 'ACTIVITY DENSITY · LIVE AIS ACTIVITY — none observed'}
        </p>
      )}
    </div>
  )
}
