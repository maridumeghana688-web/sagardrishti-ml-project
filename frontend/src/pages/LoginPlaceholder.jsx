import { Link } from 'react-router-dom'

/**
 * LoginPlaceholder — route target for the landing ENTER CTA.
 * Authentication / command-center access ships in a later phase;
 * this screen only reserves the route and sets expectations.
 */
export default function LoginPlaceholder() {
  return (
    <div
      className="cine-root flex min-h-screen items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, #8FC3E4 0%, #5E9CCB 55%, #166FA9 100%)' }}
    >
      <div className="cine-frame w-full max-w-md rounded-2xl p-8 text-center">
        <p className="cine-eyebrow">SAGARDRISHTI</p>
        <h1 className="cine-display cine-ink mt-4 text-2xl font-extrabold">
          Command Center Access
        </h1>
        <p className="cine-ink-soft mt-3 text-sm leading-relaxed">
          Authentication and the live operations command center arrive in a later phase.
          This page reserves the <code className="font-semibold text-maritime">/login</code> route
          so the landing experience can link forward without dead ends.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            to="/"
            className="cine-cta rounded-xl bg-maritime px-5 py-3 text-sm font-bold text-white"
          >
            RETURN TO THE STORY
          </Link>
          <Link
            to="/dashboard"
            className="rounded-xl border border-[#0A2E4A]/20 bg-white/60 px-5 py-3 text-sm font-semibold text-[#0A2E4A] transition hover:border-maritime hover:text-maritime"
          >
            Preview system shell
          </Link>
        </div>
      </div>
    </div>
  )
}
