import { API_BASE } from './client.js'

async function get(path) {
  const res = await fetch(`${API_BASE}/api/v1${path}`)
  if (!res.ok) throw new Error(`API ${res.status} on ${path}`)
  return res.json()
}

export const maritimeApi = {
  sources: () => get('/sources/status'),
  ports: () => get('/ports'),
  port: (id) => get(`/ports/${id}`),
  prediction: (id, date) => get(`/predictions/${id}${date ? `?date=${date}` : ''}`),
  predictionsByDate: (date) => get(`/predictions?date=${date}`),
  environment: (id, days = 30) => get(`/environment/${id}?days=${days}`),
  vesselActivity: (id, days = 30) => get(`/vessel-activity/${id}?days=${days}`),
  analytics: (id) => get(`/analytics/${id}`),
  vessel: (mmsi) => get(`/vessels/${mmsi}`),
  portVessels: (id) => get(`/ports/${id}/vessels`),
  systemStatus: () => get('/system/status'),
}

// Status derived from actual model-output tertiles (target_definition.json q33/q66).
export const CONGESTION_TIERS = { elevated: 0.0824, high: 0.2060 }

export function portStatus(congestion) {
  if (congestion == null) return { label: 'UNKNOWN', color: '#94A3B8' }
  if (congestion >= CONGESTION_TIERS.high) return { label: 'HIGH', color: '#EF4444' }
  if (congestion >= CONGESTION_TIERS.elevated) return { label: 'ELEVATED', color: '#F59E0B' }
  return { label: 'NORMAL', color: '#22C55E' }
}
