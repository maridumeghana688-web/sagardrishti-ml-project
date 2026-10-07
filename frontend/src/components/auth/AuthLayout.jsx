import { Link } from 'react-router-dom'

/**
 * Institutional authentication shell.
 * Deep-navy operations-room backdrop (pure CSS: hairline lat/long grid,
 * corner coordinates, hairline rules) with a restrained form panel.
 * No photographs, no fake live statistics.
 */
export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0A1628] text-slate-100">
      {/* backdrop: maritime grid + vignette */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to right, rgba(148,184,205,0.07) 0 1px, transparent 1px 72px),' +
              'repeating-linear-gradient(to bottom, rgba(148,184,205,0.07) 0 1px, transparent 1px 72px)',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 90% 70% at 50% 0%, rgba(21,94,136,0.35), transparent 60%),' +
              'linear-gradient(to bottom, rgba(4,10,20,0.2), transparent 30%, transparent 70%, rgba(2,6,12,0.75))',
          }}
        />
        <span className="font-mono-tech absolute left-[3vw] top-20 hidden text-[10px] tracking-[0.2em] text-slate-500/70 lg:block">
          15.92° N — 80.12° E
        </span>
        <span className="font-mono-tech absolute bottom-8 right-[3vw] hidden text-[10px] tracking-[0.2em] text-slate-500/70 lg:block">
          SECURE INTELLIGENCE ACCESS PORTAL
        </span>
      </div>

      {/* top institutional bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-white/10 px-[4vw] py-4">
        <Link to="/" className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center bg-[#155E88] font-display text-sm font-extrabold text-white">
            S
          </span>
          <span>
            <span className="font-display block text-[13px] font-extrabold tracking-[0.22em] text-slate-50">
              SAGARDRISHTI
            </span>
            <span className="block text-[10px] tracking-[0.14em] text-slate-400">
              Indian Maritime Intelligence &amp; Port Analytics
            </span>
          </span>
        </Link>
        <span className="font-mono-tech hidden items-center gap-2 text-[10px] tracking-[0.22em] text-slate-400 sm:flex">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
          SECURE ACCESS
        </span>
      </header>

      {/* content: brand column + form column */}
      <main className="relative z-10 mx-auto grid w-full max-w-6xl gap-10 px-[4vw] py-10 lg:grid-cols-[1fr_460px] lg:gap-16 lg:py-14">
        <section className="hidden flex-col justify-center lg:flex" aria-label="System information">
          <p className="font-mono-tech text-[11px] tracking-[0.28em] text-cyan-200/80">
            GOVERNMENT &amp; MARITIME INTELLIGENCE SYSTEM
          </p>
          <h1 className="font-display mt-4 text-4xl font-extrabold leading-[1.04] tracking-tight text-slate-50 xl:text-5xl">
            Vision of
            <br />
            the Sea.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-300">
            Secure access for authorized personnel to vessel intelligence, port
            analytics and maritime decision support.
          </p>
          <div className="mt-8 border-t border-white/10 pt-5">
            <p className="font-mono-tech text-[10px] tracking-[0.24em] text-slate-400">
              MARITIME INTELLIGENCE
            </p>
            <p className="font-mono-tech mt-2 text-[11px] tracking-[0.18em] text-cyan-100/80">
              AIS&nbsp;&nbsp;•&nbsp;&nbsp;PORT&nbsp;&nbsp;•&nbsp;&nbsp;OCEAN&nbsp;&nbsp;•&nbsp;&nbsp;WEATHER
            </p>
          </div>
          <div className="mt-8 max-w-md border border-amber-200/20 bg-amber-100/[0.04] p-4">
            <p className="font-mono-tech text-[10px] font-semibold tracking-[0.22em] text-amber-200/90">
              AUTHORIZED ACCESS ONLY
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
              This system is intended for authorized users. Unauthorized access or
              misuse may be subject to applicable institutional policies and
              regulations.
            </p>
          </div>
        </section>

        <section aria-label="Authentication form" className="w-full">
          <div className="border border-white/10 bg-[#0D2138]/95 p-7 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-9">
            <p className="font-mono-tech text-[11px] tracking-[0.28em] text-cyan-200/80">{eyebrow}</p>
            <h2 className="font-display mt-2 text-[26px] font-extrabold tracking-tight text-slate-50">
              {title}
            </h2>
            {description && (
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
            )}
            <div className="mt-6">{children}</div>
          </div>
          {footer}
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/10 px-[4vw] py-5">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono-tech text-[10px] tracking-[0.22em] text-slate-500">
            SAGARDRISHTI · VISION OF THE SEA
          </p>
          <p className="font-mono-tech text-[10px] tracking-[0.22em] text-slate-500">
            SYSTEM ACCESS • AUTHORIZED PERSONNEL
          </p>
        </div>
      </footer>
    </div>
  )
}
