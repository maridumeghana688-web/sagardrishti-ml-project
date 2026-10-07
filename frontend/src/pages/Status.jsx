import { useEffect, useState } from 'react'
import { API_BASE, fetchHealth } from '../api/client.js'

/** Simple liveness view proving the UI can reach the API. No analytics here. */
export default function Status() {
  const [state, setState] = useState({ loading: true, data: null, error: null })

  useEffect(() => {
    const ctrl = new AbortController()
    fetchHealth(ctrl.signal)
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((err) => {
        if (err.name !== 'AbortError') setState({ loading: false, data: null, error: err.message })
      })
    return () => ctrl.abort()
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">API status</h1>
      <p className="text-sm text-slate-400">
        Target: <code className="text-slate-200">{API_BASE}/api/v1/health</code>
      </p>
      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 font-mono text-sm">
        {state.loading && <p className="text-slate-300">Checking backend…</p>}
        {state.error && <p className="text-red-300">Unreachable: {state.error}</p>}
        {state.data && <pre className="text-emerald-200">{JSON.stringify(state.data, null, 2)}</pre>}
      </div>
      <p className="text-xs text-slate-500">
        Start the API first (see README) — this page only reports connectivity.
      </p>
    </div>
  )
}
