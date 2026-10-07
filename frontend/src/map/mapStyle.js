/**
 * mapStyle — MapLibre + OpenStreetMap-based basemap for SAGARDRISHTI.
 *
 * Source: OpenFreeMap Liberty (OSM-derived vector tiles, no API key).
 * The style JSON is fetched at runtime and recolored into the deep-navy
 * maritime command-center theme. No CARTO, no proprietary SDK, no key.
 *
 * Attribution for OSM data + OpenFreeMap is preserved and always rendered.
 */

export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
export const OPENFREEMAP_ATTRIBUTION =
  '© <a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
export const MAP_SOURCE_LABEL = 'OpenFreeMap · OSM-derived · no key required'

export const NAVY = {
  bg: '#04101c',
  water: '#0d2a41',
  waterLine: '#13405f',
  land: '#0a1a29',
  landAlt: '#0c1f31',
  building: '#143049',
  roadMajor: '#2c4f73',
  roadMinor: '#1b3550',
  roadTrack: '#14293f',
  rail: '#4d6076',
  boundary: 'rgba(125, 211, 252, 0.35)',
  label: '#8ba2b9',
  labelDim: '#5d7488',
  marineLabel: '#8fc6ea',
}

function isWaterFill(l) {
  return l.type === 'fill' && (l['source-layer'] === 'water' || /^(water|glacier)$/.test(l['source-layer'] || ''));
}

function roadClass(id = '') {
  const s = id.toLowerCase()
  if (/(motorway|trunk)/.test(s)) return 'major'
  if (/(primary|secondary|main)/.test(s)) return 'mid'
  if (/railway|rail/.test(s)) return 'rail'
  if (/(road|street|minor|service|track|path|pier|bridge|tunnel)/.test(s)) return 'minor'
  return null
}

/**
 * Pure transform: light Liberty style JSON → deep-navy maritime theme.
 * Unknown/custom layers pass through untouched (never dropped).
 */
export function toNavyStyle(base) {
  const style = JSON.parse(JSON.stringify(base))
  style.layers = (style.layers || []).map((l) => {
    const id = l.id || ''
    if (l.type === 'background') {
      return { ...l, paint: { ...(l.paint || {}), 'background-color': NAVY.bg } }
    }
    if (isWaterFill(l)) {
      return { ...l, paint: { ...(l.paint || {}), 'fill-color': NAVY.water, 'fill-opacity': 1 } }
    }
    if (l.type === 'fill') {
      const sl = l['source-layer'] || ''
      const color = sl === 'building' ? NAVY.building : /aeroway|aerodrome/.test(sl) ? NAVY.landAlt : NAVY.land
      const paint = { ...(l.paint || {}), 'fill-color': color }
      if ('fill-opacity' in (l.paint || {}) && typeof l.paint['fill-opacity'] === 'number') {
        paint['fill-opacity'] = Math.min(l.paint['fill-opacity'], 1)
      }
      return { ...l, paint }
    }
    if (l.type === 'line') {
      const paint = { ...(l.paint || {}) }
      if (/^waterway|^water/.test(id) || (l['source-layer'] || '').startsWith('waterway')) {
        paint['line-color'] = NAVY.waterLine
      } else if (/boundary|border|admin/.test(id)) {
        paint['line-color'] = NAVY.boundary
      } else {
        const rc = roadClass(id)
        if (rc === 'major') paint['line-color'] = NAVY.roadMajor
        else if (rc === 'mid') paint['line-color'] = NAVY.roadMinor
        else if (rc === 'rail') paint['line-color'] = NAVY.rail
        else if (rc === 'minor') paint['line-color'] = NAVY.roadTrack
      }
      return { ...l, paint }
    }
    if (l.type === 'symbol') {
      const paint = { ...(l.paint || {}) }
      const marine = /water|marine|ocean|sea|bay|bay|gulf/.test(id)
      if (paint['text-color'] !== undefined) paint['text-color'] = marine ? NAVY.marineLabel : NAVY.label
      if (paint['text-halo-color'] !== undefined) paint['text-halo-color'] = NAVY.bg
      if (paint['text-halo-width'] !== undefined) paint['text-halo-width'] = Math.max(paint['text-halo-width'], 1)
      if (paint['text-opacity'] === undefined) paint['text-opacity'] = 0.9
      return { ...l, paint }
    }
    if (l.type === 'raster') {
      // Natural-earth shaded relief clashes with the command-center theme
      // (beige terrain over navy). Hide raster hillshade; vector coastlines
      // carry the geography. Pure-vector navy, zero extra tile dependency.
      return { ...l, layout: { ...(l.layout || {}), visibility: 'none' } }
    }
    return l
  })
  return style
}

/** Blank deep-navy style (honest degraded state when tiles are unreachable). */
export function blankNavyStyle() {
  return {
    version: 8,
    name: 'SAGARDRISHTI navy fallback (basemap unavailable)',
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': NAVY.bg } }],
  }
}

/**
 * Load the OSM-based style. Resolves { style, basemap } where basemap is
 * 'openfreemap' or 'unavailable' (data layers still render on navy).
 */
export async function loadMapStyle() {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 15000)
    const res = await fetch(OPENFREEMAP_STYLE_URL, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error(`style HTTP ${res.status}`)
    const base = await res.json()
    if (!base || !Array.isArray(base.layers) || !base.sources) throw new Error('invalid style JSON')
    return { style: toNavyStyle(base), basemap: 'openfreemap' }
  } catch {
    return { style: blankNavyStyle(), basemap: 'unavailable' }
  }
}
