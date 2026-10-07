import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.jsx'
import { AuthApiError } from '../api/auth.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import {
  Field,
  FormError,
  PasswordInput,
  SelectInput,
  SubmitButton,
  TextInput,
} from '../components/auth/fields.jsx'

const ORGANIZATIONS = [
  'Ministry of Ports, Shipping and Waterways',
  'Indian Ports Association',
  'Indian Coast Guard',
  'Directorate General of Shipping',
  'Port Authority',
  'Maritime Board',
  'State Government',
  'Central Government Department',
  'Research Institution',
  'Logistics Organization',
  'Other',
]

const DEPARTMENTS = [
  'Port Operations',
  'Maritime Operations',
  'Logistics',
  'Vessel Traffic Management',
  'Marine Safety',
  'Coastal Security',
  'Disaster Management',
  'Environment & Ocean Monitoring',
  'Administration',
  'Data & Analytics',
  'Research & Development',
  'Other',
]

const ROLES = [
  { value: '', label: 'Select a role' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'operations', label: 'Operations Officer' },
  { value: 'logistics', label: 'Logistics Analyst' },
  { value: 'viewer', label: 'Viewer' },
]

const EMPTY = {
  full_name: '',
  organization: '',
  department: '',
  user_id: '',
  email: '',
  password: '',
  confirm_password: '',
  role: '',
}

/** Institutional account request. Success → confirmation → /login. */
export default function Register() {
  const { isAuthenticated, initializing, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [loading, setLoading] = useState(false)
  const [created, setCreated] = useState(false)

  if (!initializing && isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setFieldErrors((errs) => ({ ...errs, [key]: undefined }))
  }

  async function onSubmit(e) {
    e.preventDefault()
    const errs = {}
    if (!form.full_name.trim()) errs.full_name = 'Enter your full name.'
    if (!form.organization) errs.organization = 'Select your organization.'
    if (!form.department) errs.department = 'Select your department.'
    if (!form.user_id.trim()) errs.user_id = 'Choose a User ID.'
    if (!form.password) errs.password = 'Create a secure password.'
    if (form.password && form.password !== form.confirm_password) {
      errs.confirm_password = 'Passwords do not match.'
    }
    setFieldErrors(errs)
    setFormError('')
    if (Object.keys(errs).length > 0) return
    setLoading(true)
    try {
      // DEVELOPMENT_AUTH_ONLY: register signs straight in → /dashboard.
      await register({
        full_name: form.full_name.trim(),
        organization: form.organization,
        department: form.department,
        user_id: form.user_id.trim(),
        email: form.email.trim() || undefined,
        password: form.password,
        role: form.role || 'analyst',
      })
      navigate('/dashboard', { replace: true })
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
      eyebrow="ACCOUNT REQUEST"
      title="Create Access Account"
      description="Request an authorized SAGARDRISHTI account for maritime intelligence and analytics."
      footer={
        !created && (
          <p className="mt-5 text-center text-[13px] text-slate-400">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-cyan-200 transition hover:text-cyan-100">
              Sign In
            </Link>
          </p>
        )
      }
    >
      {created ? (
        <div className="py-2 text-center">
          <span
            aria-hidden
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-400/10 text-xl text-emerald-300"
          >
            ✓
          </span>
          <h3 className="font-display mt-4 text-xl font-bold text-slate-50">
            Account Created Successfully
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-300">
            Your SAGARDRISHTI account has been created. Please sign in to continue.
          </p>
          <button type="button" onClick={() => navigate('/login')} className="btn-primary pointer-events-auto mt-6">
            SIGN IN <span aria-hidden>→</span>
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          <FormError message={formError} />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="full_name" label="FULL NAME" error={fieldErrors.full_name}>
              <TextInput id="full_name" placeholder="Enter your full name" autoComplete="name" value={form.full_name} onChange={set('full_name')} />
            </Field>
            <Field id="user_id" label="USER ID" error={fieldErrors.user_id} hint="3–32 characters: letters, digits, . _ -">
              <TextInput id="user_id" placeholder="Choose a User ID" autoComplete="username" value={form.user_id} onChange={set('user_id')} />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="organization" label="ORGANIZATION" error={fieldErrors.organization}>
              <SelectInput id="organization" value={form.organization} onChange={set('organization')}>
                <option value="">Select organization</option>
                {ORGANIZATIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field id="department" label="DEPARTMENT" error={fieldErrors.department}>
              <SelectInput id="department" value={form.department} onChange={set('department')}>
                <option value="">Select department</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <Field id="email" label="OFFICIAL EMAIL" error={fieldErrors.email}>
            <TextInput id="email" type="email" placeholder="Enter official email address" autoComplete="email" value={form.email} onChange={set('email')} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="reg-password" label="PASSWORD" error={fieldErrors.password} hint="Minimum 10 characters, at least one letter and one digit.">
              <PasswordInput id="reg-password" placeholder="Create a secure password" autoComplete="new-password" value={form.password} onChange={set('password')} />
            </Field>
            <Field id="confirm_password" label="CONFIRM PASSWORD" error={fieldErrors.confirm_password}>
              <PasswordInput id="confirm_password" placeholder="Confirm your password" autoComplete="new-password" value={form.confirm_password} onChange={set('confirm_password')} />
            </Field>
          </div>
          <Field id="role" label="ROLE" error={fieldErrors.role}>
            <SelectInput id="role" value={form.role} onChange={set('role')}>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <div className="border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="font-mono-tech text-[10px] font-semibold tracking-[0.22em] text-slate-300">
              ACCOUNT ACCESS NOTICE
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
              Access to maritime intelligence and analytical resources may be subject to
              organizational authorization. Administrator accounts cannot be self-registered.
            </p>
          </div>
          <SubmitButton loading={loading} loadingLabel="CREATING ACCOUNT…">
            CREATE ACCOUNT
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  )
}
