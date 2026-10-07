import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import Cranes, { RTG } from './Cranes.jsx'
import { YardBlock } from './Containers.jsx'

export const PORT = { quayZ: -300, groundY: 2 }

/** Channel buoys marking the approach fairway. */
function Buoys() {
  const group = useRef()
  const spots = []
  for (let i = 0; i < 7; i++) {
    const z = -40 - i * 38
    spots.push({ x: -22, z, color: '#1FA34A' })
    spots.push({ x: 22, z: z - 19, color: '#D33A2C' })
  }
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    if (!group.current) return
    group.current.children.forEach((b, i) => {
      b.position.y = Math.sin(t * 1.6 + i * 1.7) * 0.28
      b.rotation.z = Math.sin(t * 1.2 + i) * 0.06
    })
  })
  return (
    <group ref={group}>
      {spots.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[1.1, 1.5, 2.0, 12]} />
            <meshStandardMaterial color={b.color} roughness={0.4} />
          </mesh>
          <mesh position={[0, 2.0, 0]}>
            <cylinderGeometry args={[0.3, 0.5, 1.6, 8]} />
            <meshStandardMaterial color="#1B2530" roughness={0.6} />
          </mesh>
          <mesh position={[0, 3.0, 0]}>
            <sphereGeometry args={[0.32, 8, 8]} />
            <meshBasicMaterial color={b.color} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function LightPoles() {
  const xs = [-150, -110, -70, -30, 10, 50, 90, 130]
  // NOTE: no per-pole pointLights. 24 dynamic lights forced the forward
  // renderer to evaluate all of them in EVERY standard-material shader
  // (hull, containers, cranes…), the dominant GPU cost on this page.
  // Daylight bulbs read as glowing via unlit bright materials instead.
  return (
    <group>
      {xs.map((x, i) =>
        [-360, -430, -500].map((z, j) => (
          <group key={i + '-' + j} position={[x, PORT.groundY, z]}>
            <mesh position={[0, 14, 0]}>
              <cylinderGeometry args={[0.35, 0.5, 28, 8]} />
              <meshStandardMaterial color="#3A4653" roughness={0.6} />
            </mesh>
            <mesh position={[0, 28.2, 0]}>
              <sphereGeometry args={[0.9, 8, 8]} />
              <meshBasicMaterial color="#FFF6DE" />
            </mesh>
            {/* soft halo card, always faces the journey camera */}
            <mesh position={[0, 28.2, 0]}>
              <sphereGeometry args={[2.1, 8, 8]} />
              <meshBasicMaterial color="#FFEFC4" transparent opacity={0.22} depthWrite={false} />
            </mesh>
          </group>
        ))
      )}
    </group>
  )
}

export default function Port() {
  const radar = useRef()
  useFrame((state, delta) => {
    if (radar.current) radar.current.rotation.y += delta * 1.6
  })

  return (
    <group>
      {/* reclaimed land mass — extends far inland + sideways */}
      <mesh position={[-20, 0.4, -470]} receiveShadow>
        <boxGeometry args={[640, 4, 360]} />
        <meshStandardMaterial color="#8E9AA4" roughness={0.85} />
      </mesh>
      {/* paved apron near quay */}
      <mesh position={[-20, 2.2, -340]} receiveShadow>
        <boxGeometry args={[640, 0.6, 110]} />
        <meshStandardMaterial color="#93A0AB" roughness={0.85} />
      </mesh>
      {/* quay wall face */}
      <mesh position={[0, 0.2, PORT.quayZ]}>
        <boxGeometry args={[640, 5, 2]} />
        <meshStandardMaterial color="#4B5864" roughness={0.8} />
      </mesh>
      {/* fenders + bollards */}
      {Array.from({ length: 30 }).map((_, i) => (
        <mesh key={'f' + i} position={[-290 + i * 20, 1.2, PORT.quayZ + 1.4]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.9, 0.9, 2.2, 10]} />
          <meshStandardMaterial color="#141C24" roughness={0.9} />
        </mesh>
      ))}
      {Array.from({ length: 22 }).map((_, i) => (
        <mesh key={'b' + i} position={[-280 + i * 26, 2.9, PORT.quayZ - 4]}>
          <cylinderGeometry args={[0.5, 0.65, 1.1, 8]} />
          <meshStandardMaterial color="#141C24" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      {/* crane rails */}
      {[-2, -12].map((dz, i) => (
        <mesh key={i} position={[0, 2.55, PORT.quayZ + dz]}>
          <boxGeometry args={[560, 0.3, 1.2]} />
          <meshStandardMaterial color="#5B6670" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}

      <Cranes quayZ={PORT.quayZ} />

      {/* berthed vessel under cranes */}
      <group position={[30, 0, PORT.quayZ + 26]} rotation={[0, 0, 0]}>
        <mesh position={[0, 1.5, 0]} castShadow>
          <boxGeometry args={[17, 7, 190]} />
          <meshStandardMaterial color="#14304D" roughness={0.45} metalness={0.4} />
        </mesh>
        <mesh position={[0, -2.2, 0]}>
          <boxGeometry args={[16.4, 2.4, 188]} />
          <meshStandardMaterial color="#71201B" roughness={0.6} />
        </mesh>
        <mesh position={[0, 9.5, 60]} castShadow>
          <boxGeometry args={[16, 9, 12]} />
          <meshStandardMaterial color="#E9EEF2" roughness={0.4} />
        </mesh>
        <mesh position={[0, 7.6, -20]} castShadow>
          <boxGeometry args={[14, 6, 110]} />
          <meshStandardMaterial color="#8A4A22" roughness={0.6} />
        </mesh>
        <mesh position={[0, 7.6, -20]}>
          <boxGeometry args={[14.2, 2, 110]} />
          <meshStandardMaterial color="#1F5FA8" roughness={0.6} />
        </mesh>
      </group>

      {/* container yards receding inland */}
      <YardBlock position={[-120, PORT.groundY, -400]} rows={12} cols={10} maxTiers={5} seed={11} />
      <YardBlock position={[-30, PORT.groundY, -410]} rows={12} cols={10} maxTiers={4} seed={23} />
      <YardBlock position={[60, PORT.groundY, -400]} rows={12} cols={10} maxTiers={5} seed={37} />
      <YardBlock position={[-120, PORT.groundY, -500]} rows={12} cols={12} maxTiers={4} seed={51} />
      <YardBlock position={[-20, PORT.groundY, -510]} rows={12} cols={12} maxTiers={5} seed={67} />
      <YardBlock position={[80, PORT.groundY, -510]} rows={10} cols={12} maxTiers={4} seed={83} />
      <YardBlock position={[-220, PORT.groundY, -430]} rows={10} cols={8} maxTiers={4} seed={97} />

      {/* yard RTGs */}
      {[
        [-120, -450],
        [-30, -460],
        [60, -450],
        [-75, -540],
        [35, -545],
      ].map(([x, z], i) => (
        <RTG key={i} position={[x, PORT.groundY, z]} />
      ))}

      {/* warehouses */}
      {[
        [-190, -560, 60, '#B9C2CA'],
        [-60, -580, 80, '#A7B1BA'],
        [90, -575, 70, '#B9C2CA'],
      ].map(([x, z, w, c], i) => (
        <mesh key={i} position={[x, PORT.groundY + 7, z]} castShadow receiveShadow>
          <boxGeometry args={[46, 14, w]} />
          <meshStandardMaterial color={c} roughness={0.6} />
        </mesh>
      ))}

      {/* VTS tower */}
      <group position={[170, PORT.groundY, -330]}>
        <mesh position={[0, 22, 0]} castShadow>
          <cylinderGeometry args={[3.2, 4.6, 44, 12]} />
          <meshStandardMaterial color="#E8EDF1" roughness={0.4} />
        </mesh>
        <mesh position={[0, 45, 0]} castShadow>
          <cylinderGeometry args={[7.5, 6.5, 6, 14]} />
          <meshStandardMaterial color="#16324F" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 45, 0]}>
          <cylinderGeometry args={[7.55, 6.55, 2.2, 14]} />
          <meshStandardMaterial color="#0B1622" metalness={0.8} roughness={0.15} />
        </mesh>
        <group ref={radar} position={[0, 50, 0]}>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[5.5, 0.5, 0.8]} />
            <meshStandardMaterial color="#C7D0D8" />
          </mesh>
        </group>
      </group>

      {/* breakwaters forming the harbour mouth */}
      <group position={[-140, 0, -230]} rotation={[0, 0.5, 0]}>
        <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[18, 3.2, 150]} />
          <meshStandardMaterial color="#3F4A54" roughness={0.95} />
        </mesh>
      </group>
      <group position={[150, 0, -230]} rotation={[0, -0.5, 0]}>
        <mesh position={[0, 0.8, 0]} castShadow receiveShadow>
          <boxGeometry args={[18, 3.2, 150]} />
          <meshStandardMaterial color="#3F4A54" roughness={0.95} />
        </mesh>
      </group>
      {/* lighthouse on west head */}
      <group position={[-108, 0, -168]}>
        <mesh position={[0, 6, 0]} castShadow>
          <cylinderGeometry args={[2.2, 3.0, 12, 12]} />
          <meshStandardMaterial color="#E8EDF1" roughness={0.5} />
        </mesh>
        <mesh position={[0, 6, 0]}>
          <cylinderGeometry args={[2.35, 2.35, 2.0, 12]} />
          <meshStandardMaterial color="#C0392B" roughness={0.5} />
        </mesh>
        <mesh position={[0, 13, 0]}>
          <sphereGeometry args={[0.9, 10, 10]} />
          <meshBasicMaterial color="#7CFFB2" />
        </mesh>
      </group>

      <Buoys />
      <LightPoles />
    </group>
  )
}
