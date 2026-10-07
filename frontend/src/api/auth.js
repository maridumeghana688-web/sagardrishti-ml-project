import { API_BASE } from './client.js'

/**
 * Authentication API client (application-level JWT).
 * Token lives in localStorage ("remember this session") or sessionStorage.
 */
const AUTH_URL = `${API_BASE}/api/v1/auth`
const TOKEN_KEY = 'sagardrishti_token'

/**
 * DEVELOPMENT_AUTH_ONLY: temporary local auth for dashboard testing.
 * When VITE_DEV_AUTH !== 'false', any non-empty credentials sign in locally
 * without contacting the backend. Replace with real auth by setting
 * VITE_DEV_AUTH=false (backend JWT flow below is preserved).
 */
export const DEV_AUTH_ONLY = import.meta.env.VITE_DEV_AUTH !== 'false'

function devSession(payload) {
  return {
    access_token: `dev-${Date.now().toString(36)}`,
    user: {
      full_name: payload.full_name || payload.identifier || payload.user_id || 'Maritime Analyst',
      organization: payload.organization || 'Ministry of Ports, Shipping and Waterways',
      department: payload.department || 'Data & Analytics',
      role: payload.role || 'analyst',
      dev: true,
    },
  }
}

export class AuthApiError extends Error {
  constructor(message, status = 0, fields = {}) {
    super(message)
    this.name = 'AuthApiError'
    this.status = status
    this.fields = fields
  }
}

function fieldErrorsFromDetail(detail) {
  const fields = {}
  const parts = []
  const items = Array.isArray(detail) ? detail : [{ msg: detail }]
  for (const item of items) {
    const msg = typeof item === 'string' ? item : item?.msg || 'Invalid value.'
    const loc = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null
    if (loc && typeof loc === 'string' && !['body'].includes(loc)) {
      fields[loc] = msg
    }
    parts.push(msg)
  }
  return { fields, message: parts.join(' ') }
}

async function request(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(`${AUTH_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new AuthApiError(
      'The authentication service is currently unavailable. Please try again later.',
      0
    )
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  if (!res.ok) {
    if (res.status === 401) {
      const detail = data?.detail || 'Unable to sign in. Please verify your credentials and try again.'
      throw new AuthApiError(detail, 401)
    }
    if (res.status === 409) {
      throw new AuthApiError(
        data?.detail || 'An account with these credentials already exists.',
        409
      )
    }
    if (res.status === 422) {
      const { fields, message } = fieldErrorsFromDetail(data?.detail)
      throw new AuthApiError(message || 'Please correct the highlighted fields.', 422, fields)
    }
    throw new AuthApiError(
      (data && data.detail) || 'Something went wrong. Please try again.',
      res.status
    )
  }
  return data
}

export function getStoredToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY) || null
  } catch {
    return null
  }
}

export function storeToken(token, remember) {
  try {
    if (remember) {
      window.localStorage.setItem(TOKEN_KEY, token)
      window.sessionStorage.removeItem(TOKEN_KEY)
    } else {
      window.sessionStorage.setItem(TOKEN_KEY, token)
      window.localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    /* storage unavailable — session lasts for this page only */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY)
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.localStorage.removeItem('sagardrishti_dev_user')
    window.sessionStorage.removeItem('sagardrishti_dev_user')
  } catch {
    /* ignore */
  }
}

export function registerAccount(payload) {
  if (DEV_AUTH_ONLY) return Promise.resolve({ user: devSession(payload).user })
  return request('/register', { method: 'POST', body: payload })
}

export function loginAccount(payload) {
  if (DEV_AUTH_ONLY) {
    if (!payload?.identifier?.trim() || !payload?.password) {
      return Promise.reject(new AuthApiError('Enter your User ID and password.', 422))
    }
    return Promise.resolve(devSession({ identifier: payload.identifier.trim(), organization: payload.organization }))
  }
  return request('/login', { method: 'POST', body: payload })
}

export function fetchCurrentUser() {
  const token = getStoredToken()
  if (!token) return Promise.reject(new AuthApiError('Not authenticated.', 401))
  if (DEV_AUTH_ONLY && token.startsWith('dev-')) {
    try {
      return Promise.resolve(JSON.parse(window.sessionStorage.getItem('sagardrishti_dev_user') || window.localStorage.getItem('sagardrishti_dev_user')))
    } catch {
      return Promise.reject(new AuthApiError('Not authenticated.', 401))
    }
  }
  return request('/me', { token })
}

export async function logoutRemote() {
  const token = getStoredToken()
  try {
    if (token) await request('/logout', { method: 'POST', token })
  } catch {
    /* logout must succeed locally even if the service is unreachable */
  } finally {
    clearToken()
  }
}
