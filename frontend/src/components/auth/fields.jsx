import { useState } from 'react'

const inputCls =
  'w-full border border-white/15 bg-[#0A1C31] px-3.5 py-2.5 text-[15px] text-slate-50 placeholder:text-slate-500 ' +
  'outline-none transition focus:border-cyan-300/70 focus:bg-[#0C2238] focus:shadow-[0_0_0_3px_rgba(109,231,255,0.12)]'

export function Field({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="font-mono-tech mb-1.5 block text-[11px] font-medium tracking-[0.16em] text-slate-300">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-medium leading-relaxed text-red-300">
          {error}
        </p>
      )}
    </div>
  )
}

export function TextInput(props) {
  return <input {...props} className={inputCls} />
}

export function SelectInput(props) {
  return (
    <select
      {...props}
      className={`${inputCls} appearance-none bg-no-repeat pr-9 [&>option]:bg-[#0D2138]`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238FD8E8' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",
        backgroundPosition: 'right 0.9rem center',
      }}
    />
  )
}

export function PasswordInput({ id, ...props }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        {...props}
        type={visible ? 'text' : 'password'}
        className={`${inputCls} pr-20`}
        autoComplete={props.autoComplete || 'current-password'}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="font-mono-tech absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] tracking-[0.18em] text-cyan-200/80 transition hover:text-cyan-100"
      >
        {visible ? 'HIDE' : 'SHOW'}
      </button>
    </div>
  )
}

export function FormError({ message }) {
  if (!message) return null
  return (
    <div role="alert" className="border border-red-300/30 bg-red-400/10 px-4 py-3 text-[13px] leading-relaxed text-red-200">
      {message}
    </div>
  )
}

export function SubmitButton({ loading, loadingLabel, children }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="font-mono-tech h-12 w-full bg-slate-50 text-[12px] font-semibold tracking-[0.24em] text-[#0A1628] transition hover:bg-[#6DE7FF] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <span className="inline-flex items-center gap-2.5">
          <span aria-hidden className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#0A1628]/30 border-t-[#0A1628]" />
          {loadingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
