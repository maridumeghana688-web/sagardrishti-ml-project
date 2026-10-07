import { useMemo, useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'

/**
 * Realistic container system.
 * Instanced 40ft boxes with a procedural corrugation texture (luminance-based
 * so per-instance line colours multiply correctly), subtle per-instance
 * roughness variation, and baked edge shading that reads as corner castings.
 */

export const LINE_COLORS = [
  '#A64933', // muted rust red
  '#2A5F9E', // shipping blue
  '#2E7D5B', // evergreen
  '#B26A24', // dusty hapag ochre
  '#A8891F', // weathered yellow
  '#4E6E7A', // grey teal
  '#6E7A85', // steel grey
  '#D8DDE1', // reefer white
  '#2E6E64', // muted cosco teal
  '#2E4A68', // deep sea blue
]

function makeContainerTexture() {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const g = c.getContext('2d')
  // base light grey (multiplied by instance colour)
  g.fillStyle = '#EDEFF1'
  g.fillRect(0, 0, 256, 256)
  // vertical corrugation ribs along length (u axis)
  for (let x = 0; x < 256; x += 16) {
    const grad = g.createLinearGradient(x, 0, x + 16, 0)
    grad.addColorStop(0, 'rgba(0,0,0,0.28)')
    grad.addColorStop(0.25, 'rgba(255,255,255,0.14)')
    grad.addColorStop(0.55, 'rgba(0,0,0,0.05)')
    grad.addColorStop(0.8, 'rgba(255,255,255,0.10)')
    grad.addColorStop(1, 'rgba(0,0,0,0.30)')
    g.fillStyle = grad
    g.fillRect(x, 0, 16, 256)
  }
  // top + bottom rails
  g.fillStyle = 'rgba(0,0,0,0.35)'
  g.fillRect(0, 0, 256, 14)
  g.fillRect(0, 242, 256, 14)
  // corner posts
  g.fillStyle = 'rgba(0,0,0,0.45)'
  g.fillRect(0, 0, 12, 256)
  g.fillRect(244, 0, 12, 256)
  // door end bars (right edge reads as door locking rods)
  g.fillStyle = 'rgba(0,0,0,0.30)'
  for (let i = 0; i < 4; i++) g.fillRect(228 + i * 6, 18, 2, 220)
  // subtle grime streaks
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    g.fillStyle = `rgba(60,50,40,${Math.random() * 0.08})`
    g.fillRect(x, y, 2 + Math.random() * 3, 8 + Math.random() * 30)
  }
  // faint top highlight
  g.fillStyle = 'rgba(255,255,255,0.10)'
  g.fillRect(0, 14, 256, 6)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 4
  return tex
}

let cachedTex = null
function getContainerTexture() {
  if (!cachedTex) cachedTex = makeContainerTexture()
  return cachedTex
}

function mulberry(seed) {
  let s = seed
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Deck stow: bays forward + aft of the castle.
 * 40ft box: 12.2 long (z), 2.6 wide (x), 2.9 high (y).
 */
export function VesselContainers({ castleZ = 48 }) {
  const meshRef = useRef()
  const map = useMemo(() => getContainerTexture(), [])

  const { count, matrices, colors } = useMemo(() => {
    const rnd = mulberry(20260924)
    const W = 2.6
    const H = 2.9
    const L = 12.2
    const gapX = 0.28
    const gapZ = 1.4
    const deckY = 5.4 // top of deck/hatch covers

    const mats = []
    const cols = []
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3(1, 1, 1)
    const v = new THREE.Vector3()

    const pushRow = (zCenter, tiers, rows = 7) => {
      const startX = -((rows - 1) * (W + gapX)) / 2
      for (let r = 0; r < rows; r++) {
        // outer rows stow one tier lower (lashing + visibility rules)
        const edge = r === 0 || r === rows - 1
        const tMax = Math.max(1, tiers - (edge ? 1 : 0) - (rnd() < 0.18 ? 1 : 0))
        for (let t = 0; t < tMax; t++) {
          if (rnd() < 0.04) continue // occasional empty slot
          const x = startX + r * (W + gapX)
          const y = deckY + H / 2 + t * (H + 0.12)
          e.set(0, 0, 0)
          q.setFromEuler(e)
          v.set(x, y, zCenter)
          m.compose(v, q, s)
          mats.push(m.clone())
          const col = new THREE.Color(LINE_COLORS[Math.floor(rnd() * LINE_COLORS.length)])
          // tonal variation per box
          col.offsetHSL((rnd() - 0.5) * 0.015, (rnd() - 0.5) * 0.06, (rnd() - 0.5) * 0.07)
          cols.push(col)
        }
      }
    }

    // Forward bays (bow -> castle). Bow taper: fewer rows near stem.
    const bayPitch = L + gapZ
    let z = castleZ - 14
    const bayTiers = [5, 6, 6, 6, 5, 5, 4, 3]
    const bayRows = [7, 7, 7, 7, 7, 6, 5, 4]
    for (let b = 0; b < bayTiers.length; b++) {
      pushRow(z - bayPitch / 2, bayTiers[b], bayRows[b])
      z -= bayPitch
    }
    // Aft bays (behind castle, small)
    pushRow(castleZ + 16, 3, 6)
    pushRow(castleZ + 30, 2, 5)

    return { count: mats.length, matrices: mats, colors: cols }
  }, [castleZ])

  const geom = useMemo(() => new THREE.BoxGeometry(2.6, 2.9, 12.2), [])

  useLayoutEffect(() => {
    const inst = meshRef.current
    if (!inst) return
    for (let i = 0; i < count; i++) {
      inst.setMatrixAt(i, matrices[i])
      inst.setColorAt(i, colors[i])
    }
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  }, [count, matrices, colors])

  return (
    <instancedMesh ref={meshRef} args={[geom, null, count]} castShadow receiveShadow>
      <meshStandardMaterial map={map} roughness={0.55} metalness={0.28} envMapIntensity={0.7} />
    </instancedMesh>
  )
}

/**
 * Yard blocks for the terminal — denser, taller stacks receding inland.
 */
export function YardBlock({ position = [0, 0, 0], rows = 10, cols = 14, maxTiers = 5, seed = 7 }) {
  const meshRef = useRef()
  const map = useMemo(() => getContainerTexture(), [])

  const { count, matrices, colors } = useMemo(() => {
    const rnd = mulberry(seed * 7919 + 13)
    const mats = []
    const colArr = []
    const m = new THREE.Matrix4()
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tiers = 1 + Math.floor(rnd() * maxTiers)
        for (let t = 0; t < tiers; t++) {
          if (rnd() < 0.06) continue
          m.setPosition((r - rows / 2) * 3.1, 1.55 + t * 3.0, (c - cols / 2) * 13.2)
          mats.push(m.clone())
          const col = new THREE.Color(LINE_COLORS[Math.floor(rnd() * LINE_COLORS.length)])
          col.offsetHSL(0, 0, (rnd() - 0.5) * 0.06)
          colArr.push(col)
        }
      }
    }
    return { count: mats.length, matrices: mats, colors: colArr }
  }, [rows, cols, maxTiers, seed])

  const geom = useMemo(() => new THREE.BoxGeometry(2.6, 2.9, 12.2), [])

  useLayoutEffect(() => {
    const inst = meshRef.current
    if (!inst) return
    for (let i = 0; i < count; i++) {
      inst.setMatrixAt(i, matrices[i])
      inst.setColorAt(i, colors[i])
    }
    inst.instanceMatrix.needsUpdate = true
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true
  }, [count, matrices, colors])

  return (
    <group position={position}>
      <instancedMesh ref={meshRef} args={[geom, null, count]} castShadow receiveShadow>
        <meshStandardMaterial map={map} roughness={0.6} metalness={0.22} envMapIntensity={0.5} />
      </instancedMesh>
    </group>
  )
}
