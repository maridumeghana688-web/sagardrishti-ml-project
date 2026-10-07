export default function StatusCard({ title, value, hint }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      {hint && <p className="mt-1 text-sm text-slate-400">{hint}</p>}
    </div>
  )
}
