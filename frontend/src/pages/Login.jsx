import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { AuthApiError } from '../api/auth.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { Field, FormError, PasswordInput, SubmitButton, TextInput } from '../components/auth/fields.jsx'

/** Institutional sign-in. Renders fully offline; API is hit only on submit. */
export default function Login() {
  const { isAuthenticated, initializing, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ organization: '', identifier: '', password: '', remember: false })
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)

  if (!initializing && isAuthenticated) {
    return <Navigate to={location.state?.from || '/dashboard'} replace />
  }

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setFieldErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.identifier.trim()) errs.identifier = 'Enter your User ID or official email.'
    if (!form.password) errs.password = 'Enter your password.'
    setFieldErrors(errs)
    setFormError('')
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    try {
      await login({
        identifier: form.identifier.trim(),
        password: form.password,
        organization: form.organization.trim() || undefined,
        remember: form.remember,
      })
      navigate(location.state?.from || '/dashboard', { replace: true })
    } catch (err) {
      if (err instanceof AuthApiError) {
        setFieldErrors(err.fields || {})
        setFormError(err.message)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      eyebrow="SECURE ACCESS"
      title="Sign in"
      description="Sign in with your authorized SAGARDRISHTI account to reach the maritime operations dashboard."
      footer={
        <p className="mt-5 text-center text-[13px] text-slate-400">
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-cyan-200 transition hover:text-cyan-100">
            Register
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <FormError message={formError} />
        <Field
          id="organization"
          label="ORGANIZATION / AGENCY"
          error={fieldErrors.organization}
          hint="Optional — if provided it must match your account's organization."
        >
          <TextInput
            id="organization"
            name="organization"
            autoComplete="organization"
            placeholder="Enter organization or agency"
            value={form.organization}
            onChange={set('organization')}
          />
        </Field>
        <Field id="identifier" label="USER ID / OFFICIAL EMAIL" error={fieldErrors.identifier}>
          <TextInput
            id="identifier"
            name="identifier"
            autoComplete="username"
            placeholder="Enter User ID or official email"
            value={form.identifier}
            onChange={set('identifier')}
          />
        </Field>
        <Field id="password" label="PASSWORD" error={fieldErrors.password}>
          <PasswordInput
            id="password"
            name="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={set('password')}
          />
        </Field>
        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-slate-300">
            <input
              type="checkbox"
              checked={form.remember}
              onChange={set('remember')}
              className="h-4 w-4 accent-cyan-300"
            />
            Remember this session
          </label>
          <button
            type="button"
            onClick={() => setShowRecovery((v) => !v)}
            className="text-[13px] font-medium text-cyan-200 transition hover:text-cyan-100"
          >
            Forgot Password?
          </button>
        </div>
        {showRecovery && (
          <p className="border border-white/10 bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-slate-300">
            Password recovery is not configured in this development environment.
            Contact your system administrator.
          </p>
        )}
        <SubmitButton loading={loading} loadingLabel="SIGNING IN…">
          SIGN IN
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
