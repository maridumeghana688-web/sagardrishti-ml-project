import { useEffect, useRef } from 'react'

/**
 * Shared scroll-progress plumbing for the landing journey.
 *
 * ROOT-CAUSE FIX: ScrollTrigger used to call React setState on every scroll
 * tick, re-rendering the whole page — including the entire react-three-fiber
 * scene graph — up to 120×/s. That reconciliation storm on the main thread is
 * what made scrolling freeze/jump while WebGL was also trying to render.
 *
 * New architecture (one motion system):
 *   native scroll (Lenis-smoothed input only)
 *     → ScrollTrigger writes progressRef.current (a MUTABLE ref, zero renders)
 *     → useFrame (3D) and a single rAF loop (DOM) read the ref directly
 *
 * Nothing React-renders per scroll tick anymore. All motion stays a pure,
 * reversible function of continuous progress 0 → 1.
 */

export function createProgressRef() {
  return { current: 0 }
}

export const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** smoothstep 0..1 */
export function smooth(t) {
  const k = clamp01(t)
  return k * k * (3 - 2 * k)
}

/** staged entrance: eased 0..1 for interval [a,b] of local progress */
export const stage = (w, a, b) => smooth((w - a) / (b - a))

/**
 * Chapter window: opacity cross-dissolve at the edges + local 0..1 progress.
 * Never unmounts callers (use visibility, not display) so chapters cross-fade
 * instead of popping.
 */
export function windowOf(p, s, e) {
  if (p < s || p > e) return { opacity: 0, visible: false, w: 0 }
  const w = (p - s) / (e - s)
  const edge = (e - s) * 0.18
  let o = 1
  if (p < s + edge) o = (p - s) / edge
  else if (p > e - edge) o = 1 - (p - (e - edge)) / edge
  return { opacity: clamp01(o), visible: o > 0.01, w }
}

/**
 * Run `update(p)` on every animation frame with the latest progress.
 * Single rAF loop per component — cheap math + direct style writes only,
 * no React state, no re-renders.
 */
export function useProgressLoop(progressRef, update) {
  const updateRef = useRef(update)
  updateRef.current = update
  useEffect(() => {
    let raf = 0
    const loop = () => {
      updateRef.current(progressRef.current)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [progressRef])
}
