import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import {
  clearToken,
  DEV_AUTH_ONLY,
  fetchCurrentUser,
  getStoredToken,
  loginAccount,
  logoutRemote,
  registerAccount,
  storeToken,
} from '../api/auth.js'

const AuthContext = createContext(null)

/** Session state without any external state-management framework. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [initializing, setInitializing] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!getStoredToken()) {
      setInitializing(false)
      return undefined
    }
    fetchCurrentUser()
      .then((u) => {
        if (!cancelled) setUser(u)
      })
      .catch(() => {
        clearToken()
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setInitializing(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async ({ identifier, password, organization, remember }) => {
    const data = await loginAccount({ identifier, password, organization: organization || undefined })
    storeToken(data.access_token, remember)
    // DEVELOPMENT_AUTH_ONLY: persist dev profile locally so refresh keeps the session.
    if (DEV_AUTH_ONLY && data.user?.dev) {
      try {
        ;(remember ? window.localStorage : window.sessionStorage).setItem('sagardrishti_dev_user', JSON.stringify(data.user))
      } catch { /* ignore */ }
    }
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (payload) => {
    // DEVELOPMENT_AUTH_ONLY: registration signs the user straight in (redirect to /dashboard).
    const data = await registerAccount(payload)
    if (DEV_AUTH_ONLY && data.user?.dev) {
      const token = `dev-${Date.now().toString(36)}`
      storeToken(token, false)
      try {
        window.sessionStorage.setItem('sagardrishti_dev_user', JSON.stringify(data.user))
      } catch { /* ignore */ }
      setUser(data.user)
    }
    return data.user || data
  }, [])

  const logout = useCallback(async () => {
    await logoutRemote()
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({ user, initializing, isAuthenticated: !!user, login, register, logout }),
    [user, initializing, login, register, logout]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

/** Frontend route guard: unauthenticated visits bounce to /login. */
export function RequireAuth({ children }) {
  const { user, initializing } = useAuth()
  const location = useLocation()
  if (initializing) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A1628]">
        <p className="font-mono-tech text-xs tracking-[0.3em] text-slate-400">
          VERIFYING SESSION…
        </p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}
