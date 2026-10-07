import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import Ocean from './Ocean.jsx'
import Vessel from './Vessel.jsx'
import Port from './Port.jsx'
import Traffic from './Traffic.jsx'
import AISNetwork from './AISNetwork.jsx'
import CongestionMap from './CongestionMap.jsx'
import IntelligenceCore from './IntelligenceCore.jsx'
import DecisionSupport from './DecisionSupport.jsx'

/**
 * Master scroll timeline. Absolute camera = vessel + offset, so the ship
 * can never be lost and motion stays smooth + fully reversible.
 * Bow faces -Z. Journey: open ocean (z~90) → port roads (z~-170).
 */
const KEYS = [
  { p: 0.0, vz: 90, cam: [0, 205, 55], tgt: [0, 0, -55] },
  { p: 0.07, vz: 82, cam: [28, 125, 62], tgt: [0, 0, -45] },
  { p: 0.16, vz: 70, cam: [86, 96, 42], tgt: [-20, 2, -15] },
  { p: 0.24, vz: 55, cam: [72, 34, -52], tgt: [-16, 6, -8] },
  { p: 0.32, vz: 38, cam: [104, 24, 0], tgt: [-18, 7, 0] },
  { p: 0.4, vz: 20, cam: [82, 11, 30], tgt: [-14, 7, -4] },
  { p: 0.44, vz: 10, cam: [58, 18, 98], tgt: [-8, 7, -12] },
  { p: 0.48, vz: -8, cam: [-52, 26, 112], tgt: [0, 7, -14] },
  { p: 0.56, vz: -25, cam: [70, 42, 66], tgt: [0, 6, -20] },
  { p: 0.64, vz: -55, cam: [36, 34, 112], tgt: [-6, 8, -60] },
  { p: 0.72, vz: -85, cam: [78, 22, 38], tgt: [-10, 10, -40] },
  { p: 0.78, vz: -108, cam: [46, 88, 72], tgt: [10, 0, -60] },
  { p: 0.84, vz: -125, cam: [0, 78, 100], tgt: [0, 20, -60] },
  { p: 0.89, vz: -138, cam: [-55, 110, 130], tgt: [0, 10, -90] },
  { p: 0.94, vz: -150, cam: [-50, 95, 125], tgt: [0, 8, -100] },
  { p: 0.97, vz: -160, cam: [0, 95, 125], tgt: [0, 0, -70] },
  { p: 1.0, vz: -170, cam: [0, 175, 175], tgt: [0, 0, -80] },
]

function sample(p) {
  const c = THREE.MathUtils.clamp(p, 0, 1)
  let i = 0
  while (i < KEYS.length - 2 && c > KEYS[i + 1].p) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const t = THREE.MathUtils.clamp((c - a.p) / (b.p - a.p || 1), 0, 1)
  // smootherstep — soft acceleration and deceleration between waypoints
  const s = t * t * t * (t * (t * 6 - 15) + 10)
  const lerp3 = (u, v) => [u[0] + (v[0] - u[0]) * s, u[1] + (v[1] - u[1]) * s, u[2] + (v[2] - u[2]) * s]
  return {
    vz: a.vz + (b.vz - a.vz) * s,
    camOff: lerp3(a.cam, b.cam),
    tgtOff: lerp3(a.tgt, b.tgt),
  }
}

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color('#54788F') },
          mid: { value: new THREE.Color('#93B4C7') },
          low: { value: new THREE.Color('#E8DCC8') },
        },
        vertexShader: /* glsl */ `
          varying vec3 vP;
          void main() {
            vP = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 mid; uniform vec3 low;
          varying vec3 vP;
          void main() {
            float h = normalize(vP).y;
            vec3 col = h > 0.12
              ? mix(mid, top, smoothstep(0.12, 0.75, h))
              : mix(low, mid, smoothstep(-0.08, 0.12, h));
            // warm glow around the sun azimuth
            vec3 sd = normalize(vec3(0.55, 0.35, 0.35));
            float s = pow(max(dot(normalize(vP), sd), 0.0), 18.0);
            col += vec3(1.0, 0.85, 0.65) * s * 0.35;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    []
  )
  return (
    <mesh material={mat} position={[0, 0, -140]}>
      <sphereGeometry args={[1300, 32, 20]} />
    </mesh>
  )
}

export default function MaritimeWorld({ progressRef, shadowSize = 2048 }) {
  const { camera, scene } = useThree()
  const camPos = useRef(new THREE.Vector3(0, 205, 145))
  const camTgt = useRef(new THREE.Vector3(0, 0, 85))
  // Vessel position lives in a STABLE ref mutated inside useFrame — children
  // read .current in their own useFrame, so the ship travels with zero
  // React re-renders (previously it only moved because the whole scene
  // re-rendered on every scroll tick).
  const vesselZ = useRef(90)
  const sun = useRef()
  const sunTarget = useRef()

  // Scratch vectors: the render loop must not allocate per frame.
  const tmp = useRef({ pos: new THREE.Vector3(), tgt: new THREE.Vector3() })

  const envApi = useThree((s) => s.gl)

  // image-based lighting for believable PBR (offline, no HDR fetch)
  useEffect(() => {
    try {
      const renderer = envApi
      const pmrem = new THREE.PMREMGenerator(renderer)
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.06).texture
      scene.environment = envTex
      scene.environmentIntensity = 0.7
      // Compile all currently-visible programs once, behind the canvas
      // fade-in, instead of hitch-hiking on the first scrolled frames.
      renderer.compile(scene, camera)
    } catch {
      /* non-fatal */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFrame((state, delta) => {
    const s = sample(progressRef.current)
    const vz = vesselZ.current
    // framerate-independent critically-damped follow: tight but fluid.
    // This is the ONLY smoothing left in the chain (raw scroll → camera),
    // so motion is continuous and never teleports or catches up in jumps.
    const k = 1 - Math.exp(-delta * 4.2)
    const nvz = vz + (s.vz - vz) * k
    vesselZ.current = nvz
    const { pos, tgt } = tmp.current
    pos.set(s.camOff[0], s.camOff[1], nvz + s.camOff[2])
    tgt.set(s.tgtOff[0], s.tgtOff[1], nvz + s.tgtOff[2])
    camPos.current.lerp(pos, k)
    camTgt.current.lerp(tgt, k)
    camera.position.copy(camPos.current)
    camera.lookAt(camTgt.current)

    // sun follows the vessel so shadows stay crisp across the whole journey
    if (sun.current) {
      sun.current.position.set(120, 150, nvz + 80)
      sun.current.target.position.set(0, 0, nvz - 40)
      sun.current.target.updateMatrixWorld()
    }
    if (sunTarget.current) sunTarget.current.position.set(0, 0, nvz - 40)
  })

  return (
    <group>
      <fog attach="fog" args={['#9DBCCF', 200, 1150]} />

      {/* cinematographer-grade lighting */}
      <ambientLight intensity={0.42} color="#DCEBF5" />
      <hemisphereLight args={['#C4D9E8', '#12344E', 0.95]} />
      <directionalLight
        ref={sun}
        intensity={2.7}
        color="#FFF1DC"
        castShadow
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-near={20}
        shadow-camera-far={500}
        shadow-camera-left={-130}
        shadow-camera-right={130}
        shadow-camera-top={130}
        shadow-camera-bottom={-130}
        shadow-bias={-0.0004}
      />
      {/* cool maritime fill + rim */}
      <directionalLight position={[-90, 50, -60]} intensity={0.6} color="#8FD0F2" />
      <directionalLight position={[-40, 30, 140]} intensity={0.4} color="#BFE3F5" />
      {/* warm bounce off the water onto shadowed topsides */}
      <directionalLight position={[140, 26, 40]} intensity={0.5} color="#F5E7CE" />

      <SkyDome />
      <Ocean vesselZRef={vesselZ} />
      <Vessel vesselZRef={vesselZ} />
      <Port />
      <Traffic progressRef={progressRef} />
      <AISNetwork vesselZRef={vesselZ} progressRef={progressRef} />
      <CongestionMap progressRef={progressRef} />
      <IntelligenceCore progressRef={progressRef} />
      <DecisionSupport progressRef={progressRef} />
    </group>
  )
}
