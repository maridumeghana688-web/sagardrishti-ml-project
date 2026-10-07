import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * AIS layer — pure 3D, no DOM overlays.
 * - Dynamic trail + heading vector attached to the hero vessel (group at vesselZ)
 * - Static fairway corridors that fade in as the world opens
 * All opacity is a pure function of scroll progress → fully reversible.
 */

function TrailLine({ points, color, opacityRef, pulse = 1 }) {
  const { curve, geo } = useMemo(() => {
    const c = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)))
    return { curve: c, geo: new THREE.BufferGeometry().setFromPoints(c.getPoints(60)) }
  }, [points])
  const dot = useRef()
  const mat = useRef()
  const grp = useRef()
  useFrame((state) => {
    const opacity = opacityRef.current
    if (grp.current) grp.current.visible = opacity > 0.01
    if (dot.current) {
      const t = (state.clock.getElapsedTime() * 0.12 * pulse) % 1
      dot.current.position.copy(curve.getPointAt(t))
      dot.current.visible = opacity > 0.02
    }
    if (mat.current) mat.current.opacity = opacity
  })
  return (
    <group ref={grp}>
      {/* @ts-ignore */}
      <line geometry={geo}>
        <lineBasicMaterial ref={mat} color={color} transparent opacity={0} />
      </line>
      <mesh ref={dot}>
        <sphereGeometry args={[0.7, 10, 10]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} />
      </mesh>
    </group>
  )
}

function VesselTrail({ vesselZRef, opacityRef }) {
  const group = useRef()
  const mats = useRef([])
  const trail = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 24; i++) pts.push(new THREE.Vector3(Math.sin(i * 0.35) * 2.5, 0.6, 150 - i * 6.5))
    const curve = new THREE.CatmullRomCurve3(pts)
    return { curve, geo: new THREE.BufferGeometry().setFromPoints(curve.getPoints(80)) }
  }, [])
  const pulse = useRef()
  const ring = useRef()

  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const opacity = opacityRef.current
    if (group.current) {
      group.current.position.z = vesselZRef?.current ?? 0
      group.current.visible = opacity > 0.01
    }
    if (pulse.current) {
      const k = (t * 0.25) % 1
      pulse.current.position.copy(trail.curve.getPointAt(k))
    }
    if (ring.current) ring.current.scale.setScalar(1 + ((t * 0.7) % 1) * 2.2)
    mats.current.forEach((m) => {
      if (m) m.opacity = m.userData.base * opacity
    })
  })

  const reg = (base) => (m) => {
    if (m) {
      m.userData.base = base
      if (!mats.current.includes(m)) mats.current.push(m)
    }
  }

  return (
    <group ref={group} position={[0, 0, vesselZRef?.current ?? 0]}>
      {/* historic trail behind stern */}
      {/* @ts-ignore */}
      <line geometry={trail.geo}>
        <lineBasicMaterial ref={reg(0.85)} color="#5EEAD4" transparent opacity={0} />
      </line>
      <mesh ref={pulse}>
        <sphereGeometry args={[0.9, 10, 10]} />
        <meshBasicMaterial ref={reg(1)} color="#A7F3D0" transparent opacity={0} />
      </mesh>
      {/* heading vector ahead of bow */}
      <mesh position={[0, 0.7, -95]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.28, 0.28, 42, 6]} />
        <meshBasicMaterial ref={reg(0.8)} color="#67E8F9" transparent opacity={0} />
      </mesh>
      <mesh position={[0, 0.7, -118]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.6, 5, 10]} />
        <meshBasicMaterial ref={reg(0.9)} color="#67E8F9" transparent opacity={0} />
      </mesh>
      {/* position marker */}
      <mesh ref={ring} position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[6.5, 7.2, 40]} />
        <meshBasicMaterial ref={reg(0.7)} color="#67E8F9" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[0, 10, 0]}>
        <sphereGeometry args={[0.8, 10, 10]} />
        <meshBasicMaterial ref={reg(1)} color="#ECFEFF" transparent opacity={0} />
      </mesh>
      {/* vertical position beam */}
      <mesh position={[0, 14, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 22, 6]} />
        <meshBasicMaterial ref={reg(0.45)} color="#67E8F9" transparent opacity={0} />
      </mesh>
    </group>
  )
}

export default function AISNetwork({ vesselZRef, progressRef }) {
  // Opacity windows live in STABLE ref objects, recomputed in useFrame from
  // continuous progress. Corridors stay mounted (visible=false when idle) so
  // crossing a threshold never allocates/disposes geometry mid-scroll.
  const trailOp = useRef(0)
  const corridorOp = useRef(0)

  useFrame(() => {
    const progress = progressRef.current
    trailOp.current = THREE.MathUtils.clamp((progress - 0.3) / 0.08, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.9) / 0.06, 0, 1))
    corridorOp.current = THREE.MathUtils.clamp((progress - 0.42) / 0.1, 0, 1) * 0.6
  })

  const corridors = useMemo(
    () => [
      {
        points: [
          [40, 0.5, 130], [36, 0.5, 40], [30, 0.5, -60], [22, 0.5, -150], [10, 0.5, -240],
        ],
        color: '#38BDF8',
      },
      {
        points: [
          [-52, 0.5, 80], [-46, 0.5, -10], [-38, 0.5, -110], [-30, 0.5, -200], [-28, 0.5, -260],
        ],
        color: '#2DD4BF',
      },
      {
        points: [
          [80, 0.5, -110], [100, 0.5, -150], [92, 0.5, -200], [66, 0.5, -200], [60, 0.5, -150], [80, 0.5, -110],
        ],
        color: '#F59E0B',
      },
    ],
    []
  )

  return (
    <group>
      <VesselTrail vesselZRef={vesselZRef} opacityRef={trailOp} />
      {corridors.map((c, i) => (
        <TrailLine key={i} points={c.points} color={c.color} opacityRef={corridorOp} pulse={0.8 + i * 0.2} />
      ))}
    </group>
  )
}
