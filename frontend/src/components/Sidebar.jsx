import { NavLink } from 'react-router-dom'

const ITEMS = [
  { to: '/dashboard', end: true, label: 'Operations', icon: 'MAP', svg: (<svg viewBox="0 0 24 24" aria-hidden><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 2.2 6 2v9.6l-6-2V6.2Z" /></svg>) },
  { to: '/dashboard/ais', end: false, label: 'Live AIS', icon: 'AIS', svg: (<svg viewBox="0 0 24 24" aria-hidden><path d="M12 2 5 20h14L12 2Zm0 5.2L16.4 18h-8.8L12 7.2Z" /></svg>) },
  { to: '/dashboard/ports', end: false, label: 'Ports', icon: 'PRT', svg: (<svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="10" r="3.2" /><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z" fillRule="evenodd" /></svg>) },
  { to: '/dashboard/risk', end: false, label: 'Risk Center', icon: 'RSK', svg: (<svg viewBox="0 0 24 24" aria-hidden><path d="M12 2 1 21h22L12 2Zm0 4.2L19.4 19H4.6L12 6.2Zm-1 4v4h2v-4h-2Zm0 5v2h2v-2h-2Z" fillRule="evenodd" /></svg>) },
  { to: '/dashboard/analytics', end: false, label: 'Analytics', icon: 'ANL', svg: (<svg viewBox="0 0 24 24" aria-hidden><path d="M4 20V10h3v10H4Zm6.5 0V4h3v16h-3ZM17 20v-7h3v7h-3Z" /></svg>) },
  { to: '/dashboard/environment', end: false, label: 'Environment', icon: 'ENV', svg: (<svg viewBox="0 0 24 24" aria-hidden><path d="M12 2c3.5 4.5 6 8 6 11.5a6 6 0 0 1-12 0C6 10 8.5 6.5 12 2Zm0 5.2C10.6 9 9.5 10.6 9.5 12.5a2.5 2.5 0 0 0 5 0c0-1.9-1.1-3.5-2.5-5.3Z" fillRule="evenodd" /></svg>) },
  { to: '/dashboard/system', end: false, label: 'System Status', icon: 'SYS', svg: (<svg viewBox="0 0 24 24" aria-hidden><path d="M12 8a4 4 0 1 0 4 4M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10-2.1 2.1" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>) },
]

/**
 * ChatGPT-inspired collapsible icon rail (interaction pattern only — no
 * third-party branding). Collapsed: icon rail. Expanded: icon + label.
 * Mobile: slide-over drawer controlled by the layout.
 */
export default function Sidebar({ open, collapsed, onToggleCollapse, onClose, onSignOut, userName }) {
  return (
    <>
      {open && (
        <button aria-label="Close navigation" className="sd-scrim" onClick={onClose} tabIndex={-1} />
      )}
      <nav
        aria-label="Primary"
        className={`sd-sidebar${collapsed ? ' is-collapsed' : ''}${open ? ' is-open' : ''}`}
      >
        <div className="sd-side-head">
          <span className="sd-side-logo" aria-hidden>S</span>
          {!collapsed && (
            <span className="sd-side-title">
              <strong>SAGARDRISHTI</strong>
              <small>Maritime Intelligence</small>
            </span>
          )}
          <button
            type="button" onClick={onToggleCollapse} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed} title={collapsed ? 'Expand' : 'Collapse'}
            className="sd-side-collapse"
          >
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <ul className="sd-side-list">
          {ITEMS.map((it) => (
            <li key={it.to}>
              <NavLink
                to={it.to} end={it.end} onClick={onClose}
                title={it.label} aria-label={it.label}
                className={({ isActive }) => `sd-side-item${isActive ? ' is-active' : ''}`}
              >
                <span className="sd-side-icon" aria-hidden>{it.svg}</span>
                {!collapsed && <span className="sd-side-label">{it.label}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="sd-side-foot">
          {!collapsed && userName && <p className="sd-side-user">{userName}</p>}
          <button type="button" onClick={onSignOut} className="sd-side-item sd-side-signout" title="Sign out" aria-label="Sign out">
            <span className="sd-side-icon" aria-hidden>
              <svg viewBox="0 0 24 24"><path d="M9 21H4V3h5m6 14 5-5-5-5m5 5H9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
            </span>
            {!collapsed && <span className="sd-side-label">Sign out</span>}
          </button>
        </div>
      </nav>
    </>
  )
}
