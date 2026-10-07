import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Intelligence — data fusion → warehouse → ML, one continuous 3D object.
 * - Six curved streams converge from the physical world into a core above the port
 * - Warehouse: translucent lattice of FACT blocks ringed by DIM pillars
 * - ML: classification plane, regression line, clustering blobs
 * Pure 3D. All windows reversible.
 */

function Stream({ from, to, color, opacityRef }) {
  const { curve, geo } = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const mid = a.clone().lerp(b, 0.5)
    mid.y = Math.max(a.y, b.y) + 26
    const c = new THREE.QuadraticBezierCurve3(a, mid, b)
    return { curve: c, geo: new THREE.BufferGeometry().setFromPoints(c.getPoints(48)) }
  }, [from, to])
  const grp = useRef()
  const pkt = useRef()
  const line = useRef()
  const pktMat = useRef()
  const orgMat = useRef()
  useFrame((state) => {
    const opacity = opacityRef.current
    if (grp.current) grp.current.visible = opacity > 0.01
    const t = (state.clock.getElapsedTime() * 0.22 + from[0] * 0.05) % 1
    if (pkt.current) pkt.current.position.copy(curve.getPointAt(t))
    if (line.current) line.current.opacity = opacity * 0.7
    if (pktMat.current) pktMat.current.opacity = opacity
    if (orgMat.current) orgMat.current.opacity = opacity
  })
  return (
    <group ref={grp}>
      {/* @ts-ignore */}
      <line geometry={geo}>
        <lineBasicMaterial ref={line} color={color} transparent opacity={0} />
      </line>
      <mesh ref={pkt}>
        <sphereGeometry args={[0.8, 8, 8]} />
        <meshBasicMaterial ref={pktMat} color="#FFFFFF" transparent opacity={0} />
      </mesh>
      {/* origin beacon */}
      <mesh position={from}>
        <sphereGeometry args={[1.2, 8, 8]} />
        <meshBasicMaterial ref={orgMat} color={color} transparent opacity={0} />
      </mesh>
    </group>
  )
}

function Core({ position, opacityRef }) {
  const r1 = useRef()
  const r2 = useRef()
  const r3 = useRef()
  const g = useRef()
  const matRefs = useRef([])
  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime()
    const opacity = opacityRef.current
    if (r1.current) r1.current.rotation.z += delta * 0.5
    if (r2.current) r2.current.rotation.x += delta * 0.35
    if (r3.current) r3.current.rotation.y += delta * 0.4
    if (g.current) {
      g.current.position.y = position[1] + Math.sin(t * 1.4) * 1.2
      g.current.visible = opacity > 0.01
      g.current.scale.setScalar(Math.max(0.0001, opacity))
    }
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
    <group ref={g} position={position}>
      <mesh>
        <sphereGeometry args={[7, 28, 28]} />
        <meshStandardMaterial ref={reg(1)} color="#12344E" metalness={0.6} roughness={0.3} transparent opacity={0} emissive="#0A3A52" emissiveIntensity={0.55} />
      </mesh>
      <mesh>
        <sphereGeometry args={[7.9, 28, 28]} />
        <meshStandardMaterial ref={reg(0.3)} color="#22D3EE" transparent opacity={0} roughness={0.1} depthWrite={false} />
      </mesh>
      <mesh ref={r1}>
        <ringGeometry args={[10.5, 11.1, 56]} />
        <meshBasicMaterial ref={reg(0.8)} color="#67E8F9" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={r2} rotation={[Math.PI / 3, 0, 0]}>
        <ringGeometry args={[13.4, 13.9, 56]} />
        <meshBasicMaterial ref={reg(0.55)} color="#38BDF8" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={r3} rotation={[0, Math.PI / 4, 0]}>
        <ringGeometry args={[16.2, 16.6, 56]} />
        <meshBasicMaterial ref={reg(0.4)} color="#818CF8" transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function Warehouse({ position, opacityRef }) {
  const grp = useRef()
  const matRefs = useRef([])
  useFrame(() => {
    const opacity = opacityRef.current
    if (grp.current) grp.current.visible = opacity > 0.01
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
  const facts = ['MOVEMENT', 'PORT', 'DELAY', 'TRAFFIC']
  return (
    <group ref={grp} position={position}>
      {/* FACT blocks */}
      {facts.map((f, i) => (
        <mesh key={i} position={[(i - 1.5) * 9, 0, 0]}>
          <boxGeometry args={[7, 7, 7]} />
          <meshStandardMaterial ref={reg(0.92)} color="#16456B" metalness={0.5} roughness={0.35} transparent opacity={0} emissive="#0E3A55" emissiveIntensity={0.35} />
        </mesh>
      ))}
      {facts.map((f, i) => (
        <mesh key={'e' + i} position={[(i - 1.5) * 9, 0, 0]}>
          <boxGeometry args={[7.3, 7.3, 7.3]} />
          <meshBasicMaterial ref={reg(0.5)} color="#22D3EE" wireframe transparent opacity={0} />
        </mesh>
      ))}
      {/* DIM pillars */}
      {[-22, -11, 0, 11, 22].map((x, i) => (
        <mesh key={'d' + i} position={[x, -12, 10]}>
          <cylinderGeometry args={[1.1, 1.1, 12, 10]} />
          <meshStandardMaterial ref={reg(0.9)} color="#134E6A" metalness={0.5} roughness={0.4} transparent opacity={0} />
        </mesh>
      ))}
    </group>
  )
}

function MLField({ position, opacityRef }) {
  const group = useRef()
  const matRefs = useRef([])
  const pts = useMemo(() => {
    const arr = []
    const rnd = (s) => {
      let x = s
      return () => {
        x = (x * 16807) % 2147483647
        return (x - 1) / 2147483646
      }
    }
    const r = rnd(42)
    for (let i = 0; i < 90; i++) {
      const cluster = i % 3
      arr.push({
        x: (cluster - 1) * 16 + (r() - 0.5) * 9,
        y: (r() - 0.5) * 7,
        z: (r() - 0.5) * 9,
        c: cluster === 0 ? '#F59E0B' : cluster === 1 ? '#22D3EE' : '#818CF8',
      })
    }
    return arr
  }, [])
  useFrame((state) => {
    const opacity = opacityRef.current
    if (group.current) {
      group.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.15) * 0.25
      group.current.visible = opacity > 0.01
    }
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
    <group ref={group} position={position}>
      {pts.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.55, 6, 6]} />
          <meshBasicMaterial ref={reg(0.95)} color={p.c} transparent opacity={0} />
        </mesh>
      ))}
      {/* regression axis through the cloud */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0.35]}>
        <cylinderGeometry args={[0.22, 0.22, 46, 6]} />
        <meshBasicMaterial ref={reg(0.85)} color="#ECFEFF" transparent opacity={0} />
      </mesh>
      {/* classification boundary plane */}
      <mesh position={[0, -5.5, 0]} rotation={[-Math.PI / 2, 0, 0.2]}>
        <planeGeometry args={[52, 22]} />
        <meshBasicMaterial ref={reg(0.14)} color="#F59E0B" transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

const CORE_POS = [0, 64, -260]

export default function IntelligenceCore({ progressRef }) {
  // Always mounted; windows fade reversibly via refs (see CongestionMap note).
  const fusionOp = useRef(0)
  const wareOp = useRef(0)
  const mlOp = useRef(0)
  useFrame(() => {
    const progress = progressRef.current
    fusionOp.current = THREE.MathUtils.clamp((progress - 0.68) / 0.06, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.93) / 0.04, 0, 1))
    wareOp.current = THREE.MathUtils.clamp((progress - 0.74) / 0.05, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.92) / 0.04, 0, 1))
    mlOp.current = THREE.MathUtils.clamp((progress - 0.79) / 0.05, 0, 1) * (1 - THREE.MathUtils.clamp((progress - 0.94) / 0.03, 0, 1))
  })

  const streams = [
    { from: [0, 8, 60], color: '#5EEAD4' },
    { from: [-60, 6, -295], color: '#38BDF8' },
    { from: [70, 60, -140], color: '#93C5FD' },
    { from: [-50, 1, -120], color: '#22D3EE' },
    { from: [60, 1, -60], color: '#2DD4BF' },
    { from: [95, 3, -175], color: '#A5B4FC' },
  ]

  return (
    <group>
      {streams.map((s, i) => (
        <Stream key={i} from={s.from} to={CORE_POS} color={s.color} opacityRef={fusionOp} />
      ))}
      <Core position={CORE_POS} opacityRef={fusionOp} />
      <Warehouse position={[0, 40, -260]} opacityRef={wareOp} />
      <MLField position={[0, 46, -250]} opacityRef={mlOp} />
    </group>
  )
}
