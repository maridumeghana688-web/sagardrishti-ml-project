import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Prediction + decision overlays on the physical port.
 * - Predicted congestion washes (translucent zones)
 * - Vertical risk beacons at the three pressure points
 * - Emerald recommended-window corridor (decision support, advisory only)
 * Pure 3D + reversible.
 */

function Wash({ x, z, w, d, color, opacityRef }) {
  const m = useRef()
  useFrame((state) => {
    const opacity = opacityRef.current
    if (m.current) {
      m.current.visible = opacity > 0.01
      m.current.material.opacity = opacity * (0.16 + Math.sin(state.clock.getElapsedTime() * 1.5 + x) * 0.03)
    }
  })
  return (
    <mesh ref={m} position={[x, 1.2, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[w, d]} />
      <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function Beacon({ x, z, h, color, opacityRef }) {
  const s = useRef()
  const grp = useRef()
  const matRefs = useRef([])
  useFrame((state) => {
    const opacity = opacityRef.current
    if (grp.current) grp.current.visible = opacity > 0.01
    if (s.current) s.current.position.y = h + Math.sin(state.clock.getElapsedTime() * 2 + x) * 1.5
    matRefs.current.forEach((m) => {
      if (m) m.opacity = m.userData.base * opacity
    })
  })
  const reg = (base) => (m) => {
    if (m) {
      m.userData.base = base
      if (!matRefs.current.includes(m)) matRefs.current.push(m)
    }
  }
  return (
    <group ref={grp}>
      <mesh position={[x, h / 2, z]}>
        <cylinderGeometry args={[0.5, 0.5, h, 8]} />
        <meshBasicMaterial ref={reg(0.5)} color={color} transparent opacity={0} />
      </mesh>
      <mesh ref={s} position={[x, h, z]}>
        <sphereGeometry args={[2, 12, 12]} />
        <meshBasicMaterial ref={reg(1)} color={color} transparent opacity={0} />
      </mesh>
      <mesh position={[x, 0.6, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4, 6.5, 28]} />
        <meshBasicMaterial ref={reg(0.7)} color={color} transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

export default function DecisionSupport({ progressRef }) {
  // Always mounted; corridor fades reversibly instead of mounting mid-scroll.
  const predOp = useRef(0)
  const adviseOp = useRef(0)
  const corridor = useRef()
  const corridorMats = useRef([])
  useFrame(() => {
    const progress = progressRef.current
    predOp.current = THREE.MathUtils.clamp((progress - 0.82) / 0.05, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.97) / 0.03, 0, 1))
    adviseOp.current = THREE.MathUtils.clamp((progress - 0.87) / 0.05, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.975) / 0.015, 0, 1))
    const a = adviseOp.current
    if (corridor.current) corridor.current.visible = a > 0.01
    corridorMats.current.forEach((m) => {
      if (m) m.opacity = m.userData.base * a
    })
  })
  const reg = (base) => (m) => {
    if (m) {
      m.userData.base = base
      if (!corridorMats.current.includes(m)) corridorMats.current.push(m)
    }
  }

  return (
    <group>
      {/* predicted congestion washes */}
      <Wash x={80} z={-172} w={90} d={80} color="#EF4444" opacityRef={predOp} />
      <Wash x={-6} z={-228} w={60} d={60} color="#F59E0B" opacityRef={predOp} />
      <Wash x={-30} z={-282} w={50} d={44} color="#F59E0B" opacityRef={predOp} />
      {/* risk beacons */}
      <Beacon x={80} z={-172} h={44} color="#EF4444" opacityRef={predOp} />
      <Beacon x={-6} z={-228} h={34} color="#F59E0B" opacityRef={predOp} />
      <Beacon x={-30} z={-282} h={28} color="#FBBF24" opacityRef={predOp} />
      {/* recommended operational corridor — emerald, advisory */}
      <group ref={corridor}>
        <mesh position={[-46, 1.0, -160]} rotation={[0, 0.35, 0]}>
          <boxGeometry args={[10, 0.5, 170]} />
          <meshBasicMaterial ref={reg(0.55)} color="#34D399" transparent opacity={0} />
        </mesh>
        {[-90, -160, -230].map((z, i) => (
          <mesh key={i} position={[-46 - (z + 160) * 0.0, 8, z]}>
            <sphereGeometry args={[1.6, 8, 8]} />
            <meshBasicMaterial ref={reg(1)} color="#A7F3D0" transparent opacity={0} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
