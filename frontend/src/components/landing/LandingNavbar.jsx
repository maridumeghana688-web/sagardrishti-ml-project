import { Link } from 'react-router-dom'

export default function LandingNavbar({ onNavigateChapter }) {
  return (
    <header className="pointer-events-auto fixed inset-x-0 top-0 z-50 flex items-center justify-between px-[4vw] py-5">
      <button onClick={() => onNavigateChapter?.(0)} className="flex items-center gap-3 text-left">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-200" />
        </span>
        <span
          className="font-mono-tech text-[13px] font-semibold tracking-[0.28em] text-slate-50"
          style={{ textShadow: '0 1px 10px rgba(3,10,20,.85)' }}
        >
          SAGARDRISHTI
        </span>
      </button>

      <nav className="hidden items-center gap-9 font-mono-tech text-[11px] tracking-[0.24em] md:flex">
        {[
          ['STORY', 0.0],
          ['VESSEL', 0.33],
          ['PORT', 0.67],
          ['INTELLIGENCE', 0.86],
        ].map(([label, pos]) => (
          <button
            key={label}
            onClick={() => onNavigateChapter?.(pos)}
            className="text-slate-200/80 transition-colors hover:text-cyan-200"
            style={{ textShadow: '0 1px 8px rgba(3,10,20,.85)' }}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <Link
          to="/dashboard"
          className="hidden font-mono-tech text-[11px] tracking-[0.2em] text-slate-200/80 transition-colors hover:text-white sm:inline-block"
          style={{ textShadow: '0 1px 8px rgba(3,10,20,.85)' }}
        >
          SYSTEM
        </Link>
        <Link
          to="/login"
          className="bg-slate-50/95 px-5 py-2.5 font-mono-tech text-[11px] font-semibold tracking-[0.2em] text-[#0A1628] transition-all hover:bg-cyan-200"
        >
          ENTER
        </Link>
      </div>
    </header>
  )
}
