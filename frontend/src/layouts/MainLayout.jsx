import Navbar from '../components/Navbar.jsx'

/** Shared shell: header + constrained content + footer. */
export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <footer className="border-t border-white/10 py-6 text-center text-xs text-slate-500">
        SAGARDRISHTI · National Maritime Intelligence — data: GFW · CMEMS · NOAA · WPI.
      </footer>
    </div>
  )
}
