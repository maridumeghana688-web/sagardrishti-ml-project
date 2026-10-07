import { useEffect, useState } from 'react'

function queryReduced() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function queryMobile() {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
}

/** Reduced-motion flag (live-updates if the OS setting changes). */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(queryReduced)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/**
 * useDeviceProfile — { reduced, isMobile }.
 * The 3D scene uses this to serve a simplified cinematic variant
 * on small screens (fewer particles, lower geometry, same story).
 */
export function useDeviceProfile() {
  const reduced = useReducedMotion()
  const [isMobile, setIsMobile] = useState(queryMobile)

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { reduced, isMobile }
}
