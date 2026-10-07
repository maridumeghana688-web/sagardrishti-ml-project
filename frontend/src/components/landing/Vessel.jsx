import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { VesselContainers } from './Containers.jsx'

export const SHIP = { L: 150, B: 20, deckY: 6.2, castleZ: 48 }

/** Half-breadth factor 0..1 along the hull. t: 0 = stem, 1 = transom. */
export function hullFactor(t) {
  let w = 1
  if (t < 0.24) {
    const f = THREE.MathUtils.clamp(t / 0.24, 0, 1)
    w = 0.04 + 0.96 * Math.pow(f, 0.6)
  }
  if (t > 0.86) {
    const f = (t - 0.86) / 0.14
    w *= 1 - f * 0.2
  }
  return w
}

function deformHull(geo, L, B) {
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i)
    let y = pos.getY(i)
    let z = pos.getZ(i)
    const t = THREE.MathUtils.clamp((z + L / 2) / L, 0, 1)
    let w = hullFactor(t)
    // finer waterline entry below the waterline
    if (y < 0 && t < 0.24) w *= 0.55 + 0.45 * (t / 0.24)
    x *= w
    // raked clipper stem — weather deck reaches further forward up high
    if (t < 0.12 && y > 1) {
      const k = (0.12 - t) / 0.12
      z -= k * 9 * THREE.MathUtils.clamp((y - 1) / 7, 0, 1)
    }
    // sheer — deck line rises toward bow (and slightly to stern)
    if (y > 0.5 && t < 0.32) y += (0.32 - t) * 13
    if (y > 0.5 && t > 0.9) y += (t - 0.9) * 9
    // flat transom stern
    if (t > 0.985) z = L / 2
    pos.setXYZ(i, x, y, z)
  }
  geo.computeVertexNormals()
  return geo
}

function sheerRise(t) {
  let s = 0
  if (t < 0.32) s += (0.32 - t) * 13
  if (t > 0.9) s += (t - 0.9) * 9
  return s
}

/** Bulwark walls that follow the hull taper — 24 segments per side. */
function Bulwark({ L, B, deckY }) {
  const sides = useMemo(() => {
    const segs = []
    const N = 26
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const t0 = i / N
        const t1 = (i + 1) / N
        const tm = (t0 + t1) / 2
        const z0 = -L / 2 + t0 * L
        const z1 = -L / 2 + t1 * L
        const zm = (z0 + z1) / 2
        const x = side * (hullFactor(tm) * (B / 2) - 0.25)
        const x0 = side * (hullFactor(t0) * (B / 2) - 0.25)
        const x1 = side * (hullFactor(t1) * (B / 2) - 0.25)
        const ang = Math.atan2(x1 - x0, z1 - z0)
        const len = Math.hypot(z1 - z0, x1 - x0) + 0.25
        segs.push({ x, z: zm, ang, len, y: deckY + sheerRise(tm) + 1.0 })
      }
    }
    return segs
  }, [L, B, deckY])

  return (
    <group>
      {sides.map((s, i) => (
        <mesh key={i} position={[s.x, s.y, s.z]} rotation={[0, s.ang, 0]} castShadow>
          <boxGeometry args={[0.28, 2.2, s.len]} />
          <meshStandardMaterial color="#1E3D60" roughness={0.45} metalness={0.4} />
        </mesh>
      ))}
      {/* cap rail */}
      {sides.map((s, i) => (
        <mesh key={'c' + i} position={[s.x, s.y + 1.15, s.z]} rotation={[0, s.ang, 0]}>
          <boxGeometry args={[0.42, 0.18, s.len]} />
          <meshStandardMaterial color="#0B1E33" roughness={0.5} metalness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

function DeckFittings() {
  const drum = useMemo(() => new THREE.CylinderGeometry(0.9, 0.9, 2.4, 14), [])
  return (
    <group>
      {/* forecastle mooring winches */}
      {[-2.6, 2.6].map((x, i) => (
        <group key={'f' + i} position={[x, SHIP.deckY + 1.2, -58]}>
          <mesh geometry={drum} rotation={[0, 0, Math.PI / 2]} castShadow>
            <meshStandardMaterial color="#5B6670" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.9, 0]}>
            <boxGeometry args={[2.2, 0.5, 1.6]} />
            <meshStandardMaterial color="#33414D" roughness={0.6} />
          </mesh>
        </group>
      ))}
      {/* anchor windlass + chain */}
      <mesh position={[0, SHIP.deckY + 0.8, -64]} castShadow>
        <boxGeometry args={[4.5, 1.4, 2.5]} />
        <meshStandardMaterial color="#33414D" roughness={0.55} metalness={0.5} />
      </mesh>
      {/* aft mooring deck winches */}
      {[-2.6, 2.6].map((x, i) => (
        <group key={'a' + i} position={[x, SHIP.deckY + 1.0, 68]}>
          <mesh geometry={drum} rotation={[0, 0, Math.PI / 2]} castShadow>
            <meshStandardMaterial color="#5B6670" roughness={0.5} metalness={0.6} />
          </mesh>
        </group>
      ))}
      {/* hatch cover rows under container bays */}
      {[-40, -26, -12, 2, 16, 28].map((z, i) => (
        <mesh key={'h' + i} position={[0, SHIP.deckY + 0.25, z]} receiveShadow>
          <boxGeometry args={[17.5, 0.5, 12.6]} />
          <meshStandardMaterial color="#55606A" roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      {/* lashing bridges between bays */}
      {[-33, -19, -5, 9, 23].map((z, i) => (
        <group key={'l' + i} position={[0, SHIP.deckY + 2.2, z]}>
          <mesh position={[-7.5, 0, 0]}>
            <boxGeometry args={[0.5, 4.4, 0.5]} />
            <meshStandardMaterial color="#7A8794" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position={[7.5, 0, 0]}>
            <boxGeometry args={[0.5, 4.4, 0.5]} />
            <meshStandardMaterial color="#7A8794" roughness={0.5} metalness={0.6} />
          </mesh>
          <mesh position={[0, 2.1, 0]}>
            <boxGeometry args={[15.5, 0.4, 0.5]} />
            <meshStandardMaterial color="#7A8794" roughness={0.5} metalness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Castle() {
  const z = SHIP.castleZ
  const deckY = SHIP.deckY
  const tiers = 5
  return (
    <group position={[0, deckY, z]}>
      {/* accommodation block */}
      {Array.from({ length: tiers }).map((_, i) => (
        <group key={i} position={[0, 1.6 + i * 2.8, 2]}>
          <mesh castShadow>
            <boxGeometry args={[16.5 - (i >= 4 ? 1.5 : 0), 2.7, 8.5]} />
            <meshStandardMaterial color="#E9EEF2" roughness={0.35} metalness={0.08} />
          </mesh>
          {/* window band */}
          <mesh position={[0, 0.3, -4.28]}>
            <boxGeometry args={[15.2, 0.85, 0.12]} />
            <meshStandardMaterial color="#0B1622" roughness={0.08} metalness={0.9} envMapIntensity={1.4} />
          </mesh>
          {/* side windows */}
          <mesh position={[8.28 - (i >= 4 ? 0.75 : 0), 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[7.6, 0.8, 0.12]} />
            <meshStandardMaterial color="#0B1622" roughness={0.08} metalness={0.9} envMapIntensity={1.2} />
          </mesh>
          <mesh position={[-8.28 + (i >= 4 ? 0.75 : 0), 0.3, 0]} rotation={[0, Math.PI / 2, 0]}>
            <boxGeometry args={[7.6, 0.8, 0.12]} />
            <meshStandardMaterial color="#0B1622" roughness={0.08} metalness={0.9} envMapIntensity={1.2} />
          </mesh>
        </group>
      ))}
      {/* bridge deck with full-beam wings */}
      <group position={[0, 1.6 + tiers * 2.8 + 0.4, 2]}>
        <mesh castShadow>
          <boxGeometry args={[26, 2.9, 7.5]} />
          <meshStandardMaterial color="#F2F5F8" roughness={0.3} metalness={0.08} />
        </mesh>
        {/* panoramic bridge glass */}
        <mesh position={[0, 0.35, -3.78]}>
          <boxGeometry args={[24.6, 1.15, 0.14]} />
          <meshStandardMaterial color="#0A141F" roughness={0.05} metalness={0.95} envMapIntensity={1.6} />
        </mesh>
        <mesh position={[13.02, 0.35, -0.5]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[6.2, 1.15, 0.14]} />
          <meshStandardMaterial color="#0A141F" roughness={0.05} metalness={0.95} envMapIntensity={1.6} />
        </mesh>
        <mesh position={[-13.02, 0.35, -0.5]} rotation={[0, Math.PI / 2, 0]}>
          <boxGeometry args={[6.2, 1.15, 0.14]} />
          <meshStandardMaterial color="#0A141F" roughness={0.05} metalness={0.95} envMapIntensity={1.6} />
        </mesh>
        {/* wing nav lights */}
        <mesh position={[13.1, -0.4, 1.5]}>
          <sphereGeometry args={[0.32, 10, 10]} />
          <meshBasicMaterial color="#22C55E" />
        </mesh>
        <mesh position={[-13.1, -0.4, 1.5]}>
          <sphereGeometry args={[0.32, 10, 10]} />
          <meshBasicMaterial color="#EF4444" />
        </mesh>
      </group>
      {/* funnel */}
      <group position={[0, 1.6 + tiers * 2.8 - 1.5, 9.5]}>
        <mesh castShadow>
          <cylinderGeometry args={[2.6, 3.1, 8.5, 20]} />
          <meshStandardMaterial color="#16324F" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0, 2.2, 0]}>
          <cylinderGeometry args={[2.72, 2.78, 1.6, 20]} />
          <meshStandardMaterial color="#0E7C86" roughness={0.4} />
        </mesh>
        <mesh position={[0, 4.35, 0]}>
          <cylinderGeometry args={[2.5, 2.5, 0.5, 20]} />
          <meshStandardMaterial color="#0B1B2A" roughness={0.6} />
        </mesh>
      </group>
      {/* lifeboats on davits */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 9.4, 1.6 + 3 * 2.8, 3.5]}>
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[1.0, 4.2, 6, 12]} />
            <meshStandardMaterial color="#D9622B" roughness={0.45} />
          </mesh>
          <mesh position={[s * 0.5, 1.8, -1.8]}>
            <boxGeometry args={[0.25, 2.4, 0.25]} />
            <meshStandardMaterial color="#5B6670" metalness={0.6} roughness={0.4} />
          </mesh>
          <mesh position={[s * 0.5, 1.8, 1.8]}>
            <boxGeometry args={[0.25, 2.4, 0.25]} />
            <meshStandardMaterial color="#5B6670" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Masts({ radarRef }) {
  return (
    <group>
      {/* foremast on forecastle */}
      <group position={[0, SHIP.deckY + 4.2 + sheerRise(0.06), -62]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.28, 0.42, 9, 10]} />
          <meshStandardMaterial color="#DDE5EB" roughness={0.4} />
        </mesh>
        <mesh position={[0, 2.2, 0]}>
          <boxGeometry args={[4.5, 0.3, 0.3]} />
          <meshStandardMaterial color="#DDE5EB" roughness={0.4} />
        </mesh>
        <mesh position={[0, 4.7, 0]}>
          <sphereGeometry args={[0.35, 10, 10]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
      </group>
      {/* main radar mast above bridge */}
      <group position={[0, SHIP.deckY + 1.6 + 5 * 2.8 + 3.4, SHIP.castleZ + 2]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.35, 0.55, 7.5, 10]} />
          <meshStandardMaterial color="#E6ECF1" roughness={0.35} />
        </mesh>
        {/* rotating scanner */}
        <mesh ref={radarRef} position={[0, 3.2, 0]}>
          <boxGeometry args={[5.2, 0.35, 0.7]} />
          <meshStandardMaterial color="#E8EEF3" roughness={0.3} />
        </mesh>
        <mesh position={[0, 4.3, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 2.6, 6]} />
          <meshStandardMaterial color="#9AA7B2" />
        </mesh>
        {/* satcom domes */}
        {[-2.2, 2.2].map((x) => (
          <mesh key={x} position={[x, 1.2, 0.8]}>
            <sphereGeometry args={[1.05, 16, 16]} />
            <meshStandardMaterial color="#F4F7FA" roughness={0.25} />
          </mesh>
        ))}
        <mesh position={[0, 5.8, 0]}>
          <sphereGeometry args={[0.3, 8, 8]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
      </group>
    </group>
  )
}

export default function Vessel({ vesselZRef }) {
  const group = useRef()
  const radarRef = useRef()
  const { L, B, deckY } = SHIP

  const upperGeo = useMemo(() => deformHull(new THREE.BoxGeometry(B, 7.5, L, 6, 2, 48), L, B), [L, B])
  const lowerGeo = useMemo(() => deformHull(new THREE.BoxGeometry(B * 0.97, 8.5, L * 0.995, 6, 1, 48), L, B), [L, B])
  const deckGeo = useMemo(() => deformHull(new THREE.BoxGeometry(B - 0.5, 0.5, L - 3, 6, 1, 48), L, B), [L, B])

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime()
    if (group.current) {
      // heavy-ship motion — barely-there heave, roll and pitch.
      // Z travels with the journey via the shared ref: no React re-renders.
      group.current.rotation.z = Math.sin(t * 0.42) * 0.0075
      group.current.rotation.x = Math.sin(t * 0.31 + 1.2) * 0.0038
      group.current.position.z = vesselZRef?.current ?? 0
      group.current.position.y = Math.sin(t * 0.5) * 0.22
    }
    if (radarRef.current) radarRef.current.rotation.y += delta * 2.2
  })

  return (
    <group ref={group} position={[0, 0, vesselZRef?.current ?? 0]}>
      {/* lower hull — antifouling red */}
      <mesh geometry={lowerGeo} position={[0, -4.0, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#71201B" roughness={0.62} metalness={0.25} envMapIntensity={0.5} />
      </mesh>
      {/* boot topping */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[B * 0.99, 0.7, L * 0.99]} />
        <meshStandardMaterial color="#0B0F14" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* topsides — deep maritime navy */}
      <mesh geometry={upperGeo} position={[0, 4.1, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#1B3A5C" roughness={0.38} metalness={0.45} envMapIntensity={0.9} />
      </mesh>
      {/* waterline rubbing strake highlight */}
      {/* weather deck */}
      <mesh geometry={deckGeo} position={[0, deckY - 0.4, 0]} receiveShadow>
        <meshStandardMaterial color="#46524C" roughness={0.82} metalness={0.2} />
      </mesh>
      {/* bulbous bow */}
      <mesh position={[0, -4.2, -L / 2 - 2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[1.7, 2.6, 9, 14]} />
        <meshStandardMaterial color="#71201B" roughness={0.55} metalness={0.3} />
      </mesh>
      {/* anchor */}
      <mesh position={[3.2, 2.2, -L / 2 + 7]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.5, 2.6, 1.4]} />
        <meshStandardMaterial color="#1B2530" roughness={0.6} metalness={0.5} />
      </mesh>
      <mesh position={[-3.2, 2.2, -L / 2 + 7]} rotation={[0, 0, -0.2]}>
        <boxGeometry args={[0.5, 2.6, 1.4]} />
        <meshStandardMaterial color="#1B2530" roughness={0.6} metalness={0.5} />
      </mesh>

      <Bulwark L={L} B={B} deckY={deckY} />
      <DeckFittings />
      <VesselContainers castleZ={SHIP.castleZ} />
      <Castle />
      <Masts radarRef={radarRef} />

      {/* stern transom + name board + stern light */}
      <mesh position={[0, 3.4, L / 2 + 0.2]}>
        <boxGeometry args={[13, 3.4, 0.6]} />
        <meshStandardMaterial color="#1B3A5C" roughness={0.4} metalness={0.5} />
      </mesh>
      <mesh position={[0, 5.6, L / 2 + 0.55]}>
        <sphereGeometry args={[0.3, 8, 8]} />
        <meshBasicMaterial color="#FFFFFF" />
      </mesh>
    </group>
  )
}
