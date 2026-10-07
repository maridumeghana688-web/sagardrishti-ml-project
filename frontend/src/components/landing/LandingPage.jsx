import { useEffect, useMemo, useRef, useCallback, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import MaritimeWorld from './MaritimeWorld.jsx'
import LandingNavbar from './LandingNavbar.jsx'
import ScrollIndicator from './ScrollIndicator.jsx'
import CinematicText from './CinematicText.jsx'
import { useReducedMotion } from '../../hooks/useReducedMotion.js'
import { createProgressRef } from './scrollProgress.js'

gsap.registerPlugin(ScrollTrigger)

export default function LandingPage() {
  const reducedMotion = useReducedMotion()
  // Single source of truth: MUTABLE ref, written by ScrollTrigger, read by
  // the R3F render loop + one rAF DOM loop. Zero React renders per scroll tick.
  const progressRef = useMemo(() => createProgressRef(), [])
  const trackRef = useRef(null)
  const lenisRef = useRef(null)
  const [sceneReady, setSceneReady] = useState(false)

  // Coarse-pointer / small-screen profile, evaluated once per mount.
  const profile = useMemo(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
    const small = window.innerWidth < 768
    const mobile = coarse || small
    return {
      mobile,
      dprMax: mobile ? 1.25 : 1.75,
      shadow: mobile ? 1024 : 2048,
    }
  }, [])

  useEffect(() => {
    if (reducedMotion) return undefined
    const track = trackRef.current
    if (!track) return undefined

    const lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.0,
    })
    lenisRef.current = lenis
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    // No `scrub`: ScrollTrigger used to lag progress 0.35s behind the real
    // scroll position (on top of Lenis smoothing), producing the
    // scroll → wait → catch-up jump. Raw 1:1 progress now; the 3D camera keeps
    // its own critically-damped follow for cinematic softness.
    const trigger = ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        progressRef.current = self.progress
      },
    })
    progressRef.current = 0
    let resizeT = 0
    const onResize = () => {
      // Debounced: ScrollTrigger.refresh() forces layout; never per-event.
      window.clearTimeout(resizeT)
      resizeT = window.setTimeout(() => ScrollTrigger.refresh(), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.clearTimeout(resizeT)
      gsap.ticker.remove(tick)
      trigger.kill()
      lenis.destroy()
      lenisRef.current = null
    }
  }, [reducedMotion, progressRef])

  const goTo = useCallback((p) => {
    const total = document.documentElement.scrollHeight - window.innerHeight
    if (lenisRef.current) lenisRef.current.scrollTo(p * total, { duration: 2.0 })
    else window.scrollTo({ top: p * total, behavior: 'smooth' })
  }, [])

  if (reducedMotion) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A1628] px-6 py-20 text-center">
        <div className="max-w-2xl">
          <p className="eyebrow text-cyan-300">Indian Maritime Intelligence</p>
          <h1 className="headline-massive mt-4 text-6xl text-slate-50">SAGARDRISHTI</h1>
          <p className="body-editorial mx-auto mt-5 text-center">
            One continuous journey from open waters to intelligent decision support —
            turning fragmented maritime signals into structured intelligence.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <a href="/login" className="bg-cyan-300 px-8 py-3 font-mono-tech text-xs font-semibold tracking-widest text-[#04101D]">ENTER SAGARDRISHTI</a>
            <a href="/dashboard" className="border border-slate-500 px-8 py-3 font-mono-tech text-xs tracking-widest text-white">EXPLORE SYSTEM</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="film-grain cine-vignette relative select-none bg-[#0A1628]">
      <LandingNavbar onNavigateChapter={goTo} />
      <ScrollIndicator progressRef={progressRef} onNavigate={goTo} />
      <CinematicText progressRef={progressRef} onNavigate={goTo} />

      {/* persistent cinematic viewport — mounted once, never re-created */}
      <div className={`fixed inset-0 z-0 sd-canvas-fade${sceneReady ? ' is-ready' : ''}`}>
        <Canvas
          shadows
          camera={{ fov: 38, near: 0.5, far: 4000, position: [0, 205, 145] }}
          gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
          dpr={[1, Math.min(window.devicePixelRatio || 1, profile.dprMax)]}
          onCreated={({ gl, scene }) => {
            gl.toneMapping = THREE.ACESFilmicToneMapping
            gl.toneMappingExposure = 1.06
            gl.shadowMap.enabled = true
            gl.shadowMap.type = THREE.PCFSoftShadowMap
            scene.background = new THREE.Color('#9DBCCF')
            // Reveal only once the first frame can actually render.
            requestAnimationFrame(() => setSceneReady(true))
          }}
        >
          <MaritimeWorld progressRef={progressRef} shadowSize={profile.shadow} />
        </Canvas>
      </div>

      {/* desktop composition guard */}
      <div className="pointer-events-none fixed left-[4vw] top-20 z-40 hidden xl:block">
        <p className="font-mono-tech text-[9px] tracking-[0.3em] text-slate-100/50" style={{ textShadow: '0 1px 8px rgba(3,10,20,.8)' }}>
          DESKTOP CINEMATIC EXPERIENCE · 1440–1920
        </p>
      </div>

      {/* master scroll spine */}
      <div ref={trackRef} className="relative z-10 w-full" style={{ height: '1400vh' }} />
    </div>
  )
}
