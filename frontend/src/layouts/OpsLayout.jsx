import { useCallback, useEffect, useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import { useAuth } from '../auth/AuthContext.jsx'
import { useMaritime } from '../state/MaritimeContext.jsx'

function SlimStrip({ onMenu }) {
  const m = useMaritime()
  return (
    <div className="sd-slimstrip" role="status" aria-label="Connection summary">
      <button type="button" className="sd-menu-btn" onClick={onMenu} aria-label="Open navigation">☰</button>
      <span className="sd-dot" style={{ background: m.apiOnline ? '#34D399' : '#EF4444' }} aria-hidden />
      <span className="font-mono-tech">{m.apiOnline ? m.aisLabel[0] : 'API OFFLINE'}</span>
      <span className="sd-slim-right font-mono-tech">{m.clock} IST</span>
    </div>
  )
}

/** Operations shell: collapsible rail (desktop) / drawer (mobile) + routed views. */
export default function OpsLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sagar_sidebar') === 'collapsed' } catch { return false }
  })
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    try { localStorage.setItem('sagar_sidebar', collapsed ? 'collapsed' : 'open') } catch { /* ignore */ }
  }, [collapsed])

  // Escape closes the mobile drawer.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSignOut = useCallback(async () => {
    await logout()
    navigate('/login', { replace: true })
  }, [logout, navigate])

  return (
    <div className={`sd-ops${collapsed ? ' is-collapsed' : ''}`}>
      <Sidebar
        open={drawer}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onClose={() => setDrawer(false)}
        onSignOut={onSignOut}
        userName={user ? `${user.full_name || ''}`.trim().toUpperCase() : ''}
      />
      <div className="sd-main">
        <SlimStrip onMenu={() => setDrawer(true)} />
        <main className="sd-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
