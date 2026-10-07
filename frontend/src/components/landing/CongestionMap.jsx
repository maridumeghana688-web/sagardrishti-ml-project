import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Congestion — spatially localised pressure zones.
 * blue = normal flow, amber = building pressure, red = congested anchorage.
 * Pure 3D rings + waiting-vessel dots. Fully reversible opacity windows.
 */

function Zone({ x, z, radius, color, opacityRef }) {
  const grp = useRef()
  const pulse = useRef()
  const matRefs = useRef([])
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const opacity = opacityRef.current
    if (grp.current) grp.current.visible = opacity > 0.01
    if (pulse.current) pulse.current.scale.setScalar(1 + Math.sin(t * 1.8 + x) * 0.035)
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
    <group ref={grp} position={[x, 0.3, z]}>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.72, radius, 44]} />
        <meshBasicMaterial ref={reg(0.32)} color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 0.38, radius * 0.7, 36]} />
        <meshBasicMaterial ref={reg(0.4)} color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[radius * 0.36, 28]} />
        <meshBasicMaterial ref={reg(0.42)} color={color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* vertical beacon */}
      <mesh position={[0, 16, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 30, 6]} />
        <meshBasicMaterial ref={reg(0.35)} color={color} transparent opacity={0} />
      </mesh>
      <mesh position={[0, 32, 0]}>
        <sphereGeometry args={[1.4, 10, 10]} />
        <meshBasicMaterial ref={reg(0.95)} color={color} transparent opacity={0} />
      </mesh>
    </group>
  )
}

function WaitingQueue({ opacityRef }) {
  const grp = useRef()
  const matRefs = useRef([])
  useFrame(() => {
    const opacity = opacityRef.current
    if (grp.current) grp.current.visible = opacity > 0.01
    matRefs.current.forEach((m) => {
      if (m) m.opacity = opacity * 0.9
    })
  })
  const reg = (m) => {
    if (m && !matRefs.current.includes(m)) matRefs.current.push(m)
  }
  const dots = [
    [66, -160], [78, -172], [90, -162], [72, -188], [86, -182], [98, -176],
  ]
  return (
    <group ref={grp}>
      {dots.map(([x, z], i) => (
        <mesh key={i} position={[x, 1.5, z]}>
          <sphereGeometry args={[1.1, 8, 8]} />
          <meshBasicMaterial ref={reg} color="#FBBF24" transparent opacity={0} />
        </mesh>
      ))}
    </group>
  )
}

export default function CongestionMap({ progressRef }) {
  // Always mounted; visibility fades reversibly. Previously `return null`
  // below threshold, which disposed/recreated all geometries at the exact
  // moment the user scrolled through — a visible hitch + GPU memory leak.
  const visOp = useRef(0)
  const queueOp = useRef(0)
  useFrame(() => {
    const progress = progressRef.current
    visOp.current = THREE.MathUtils.clamp((progress - 0.6) / 0.07, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.9) / 0.05, 0, 1))
    queueOp.current = THREE.MathUtils.clamp((progress - 0.64) / 0.06, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.9) / 0.05, 0, 1))
  })
  return (
    <group>
      <Zone x={80} z={-172} radius={34} color="#EF4444" opacityRef={visOp} />
      <Zone x={-6} z={-228} radius={22} color="#F59E0B" opacityRef={visOp} />
      <Zone x={-30} z={-282} radius={17} color="#38BDF8" opacityRef={visOp} />
      <WaitingQueue opacityRef={queueOp} />
    </group>
  )
}
