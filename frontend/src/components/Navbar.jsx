import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'

const linkCls = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-ocean-500/20 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
  }`

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function onSignOut() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="border-b border-white/10 bg-slate-900/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ocean-500 font-bold text-white">
            S
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide">SAGARDRISHTI</p>
            <p className="text-xs text-slate-400">Ocean Intelligence · Phase 1 Foundation</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <NavLink to="/" className={linkCls}>
            Dashboard
          </NavLink>
          <NavLink to="/status" className={linkCls}>
            API Status
          </NavLink>
          {user && (
            <>
              <span className="hidden px-2 text-xs text-slate-400 sm:inline">
                {user.full_name} · {user.role}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                Sign Out
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
