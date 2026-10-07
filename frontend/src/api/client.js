const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export async function fetchHealth(signal) {
  const res = await fetch(`${API_BASE}/api/v1/health`, { signal })
  if (!res.ok) throw new Error(`API responded ${res.status}`)
  return res.json()
}

export { API_BASE }
