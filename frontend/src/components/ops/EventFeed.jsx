import { useMaritime } from '../../state/MaritimeContext.jsx'

/** Clickable real-event feed (backend events only; demo events only in demo mode). */
export default function EventFeed() {
  const m = useMaritime()
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-5" role="region" aria-label="Live maritime events">
      <p className="eyebrow text-slate-400">{m.demo ? 'DEMO EVENT FEED · SIMULATED' : 'LIVE MARITIME EVENTS'}</p>
      <div className="mt-3 max-h-56 space-y-1.5 overflow-auto">
        {!m.eventsLoaded && !m.demo && <p className="animate-pulse text-xs text-slate-500">Connecting to event feed…</p>}
        {(m.eventsLoaded || m.demo) && m.events.length === 0 && <p className="text-xs text-slate-500">NO RECENT EVENTS</p>}
        {m.events.map((e, i) => (
          <button
            key={`${e.ts}-${i}`} onClick={() => m.onEventClick(e)} title="Select related vessel/port"
            className="flex w-full gap-2 rounded px-1 py-0.5 text-left font-mono-tech text-[11px] hover:bg-white/5"
          >
            <span className="shrink-0 text-slate-500">{e.ts ? new Date(e.ts).toLocaleTimeString('en-IN', { hour12: false }) : '—'}</span>
            <span className={e.kind === 'demo' ? 'text-violet-200' : 'text-slate-300'}>{e.message}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
