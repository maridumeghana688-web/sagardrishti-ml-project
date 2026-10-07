import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Traffic — secondary vessels that join the world progressively.
 * Pure 3D mini-ships (cheap boxes, no textures) + harbour tugs.
 * Visibility is staged: 1 → 3 → 5+ as progress grows. Fully reversible.
 */

function MiniShip({ position, rotation = 0, hull = '#14304D', boxes = '#8A4A22', scale = 1 }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={[scale, scale, scale]}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[9, 3.4, 52]} />
        <meshStandardMaterial color={hull} roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, -0.8, 0]}>
        <boxGeometry args={[8.6, 1.4, 50]} />
        <meshStandardMaterial color="#71201B" roughness={0.6} />
      </mesh>
      <mesh position={[0, 4.2, -8]} castShadow>
        <boxGeometry args={[7.4, 3.4, 26]} />
        <meshStandardMaterial color={boxes} roughness={0.6} />
      </mesh>
      <mesh position={[0, 5.2, 16]} castShadow>
        <boxGeometry args={[8, 4.6, 7]} />
        <meshStandardMaterial color="#E9EEF2" roughness={0.4} />
      </mesh>
      <mesh position={[0, 8.4, 16]}>
        <boxGeometry args={[6, 0.7, 0.2]} />
        <meshStandardMaterial color="#0B1622" metalness={0.8} roughness={0.2} />
      </mesh>
    </group>
  )
}

function Tug({ position, rotation = 0 }) {
  const ref = useRef()
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (ref.current) {
      ref.current.position.y = Math.sin(t * 1.7 + position[0]) * 0.15
      ref.current.rotation.z = Math.sin(t * 1.3) * 0.02
    }
  })
  return (
    <group ref={ref} position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <boxGeometry args={[5.5, 2.0, 13]} />
        <meshStandardMaterial color="#0F2A44" roughness={0.45} />
      </mesh>
      <mesh position={[0, 2.6, 0.5]} castShadow>
        <boxGeometry args={[3.6, 2.0, 4.4]} />
        <meshStandardMaterial color="#EDF1F4" roughness={0.4} />
      </mesh>
      <mesh position={[0, 2.7, -2.0]}>
        <boxGeometry args={[3.0, 0.7, 0.15]} />
        <meshStandardMaterial color="#0B1622" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0, 3.9, 1.6]}>
        <cylinderGeometry args={[0.35, 0.45, 2.0, 8]} />
        <meshStandardMaterial color="#C96A1B" roughness={0.5} />
      </mesh>
      <mesh position={[1.9, 2.8, 0]}>
        <sphereGeometry args={[0.16, 6, 6]} />
        <meshBasicMaterial color="#22C55E" />
      </mesh>
      <mesh position={[-1.9, 2.8, 0]}>
        <sphereGeometry args={[0.16, 6, 6]} />
        <meshBasicMaterial color="#EF4444" />
      </mesh>
    </group>
  )
}

const FLEET = [
  { p: 0.36, node: <MiniShip position={[58, 0, -40]} rotation={0.25} scale={0.9} boxes="#1B7A4D" /> },
  { p: 0.44, node: <MiniShip position={[-64, 0, -120]} rotation={-0.15} scale={0.85} boxes="#1F5FA8" /> },
  { p: 0.5, node: <MiniShip position={[88, 0, -190]} rotation={0.5} scale={0.8} hull="#1B2A3A" boxes="#C8A018" /> },
  { p: 0.58, node: <MiniShip position={[-72, 0, -235]} rotation={0.1} scale={0.9} boxes="#B3402A" /> },
  { p: 0.62, node: <Tug position={[26, 0, -120]} rotation={-0.2} /> },
  { p: 0.66, node: <Tug position={[-30, 0, -230]} rotation={0.5} /> },
  { p: 0.7, node: <MiniShip position={[60, 0, -300]} rotation={2.9} scale={0.85} boxes="#3E6B7A" /> },
]

export default function Traffic({ progressRef }) {
  const group = useRef()
  const lastP = useRef(-1)

  useFrame(() => {
    if (!group.current) return
    const progress = progressRef.current
    // Skip the whole traverse when scroll hasn't moved: materials keep
    // their last opacity, costing nothing on idle frames.
    if (Math.abs(progress - lastP.current) < 0.0004) return
    lastP.current = progress
    group.current.children.forEach((child) => {
      const appear = Number(child.userData.appear || 0)
      const k = THREE.MathUtils.clamp((progress - appear) / 0.05, 0, 1)
      child.visible = k > 0.01
      if (!child.visible) return
      child.traverse((o) => {
        if (o.isMesh && o.material) {
          o.material.transparent = true
          o.material.opacity = k
        }
      })
    })
  })

  return (
    <group ref={group}>
      {FLEET.map((f, i) => (
        <group key={i} userData={{ appear: f.p }}>
          {f.node}
        </group>
      ))}
    </group>
  )
}
