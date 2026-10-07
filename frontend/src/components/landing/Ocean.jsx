import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Ocean — cinematic open-ocean surface.
 * Gerstner-style swells, sun glitter, fresnel sky reflection,
 * hull-adjacent foam + Kelvin V-wake + bow wave, all driven by
 * the hero vessel position so the ship genuinely travels through water.
 *
 * Convention: vessel bow faces -Z. Wake trails toward +Z.
 */
export default function Ocean({ vesselZRef }) {
  const matRef = useRef()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.55, 0.62, 0.35).normalize() },
      uDeep: { value: new THREE.Color('#082E4B') },
      uMid: { value: new THREE.Color('#0E5480') },
      uShallow: { value: new THREE.Color('#14709E') },
      uSky: { value: new THREE.Color('#BFD9E8') },
      uSunColor: { value: new THREE.Color('#FFF3DD') },
      uVesselZ: { value: vesselZRef?.current ?? 80 },
      uVesselLen: { value: 150 },
      uVesselBeam: { value: 20 },
    }),
    []
  )

  const vertexShader = useMemo(
    () => /* glsl */ `
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vHeight;

      // single directional wave: returns height, and accumulates normal gradient
      void wave(vec2 p, vec2 dir, float freq, float amp, float speed, inout float h, inout vec2 grad) {
        float phase = dot(p, dir) * freq + uTime * speed;
        h += sin(phase) * amp;
        grad += dir * (cos(phase) * amp * freq);
      }

      void main() {
        vec3 pos = position;
        // plane is rotated -PI/2, so local xy maps to world xz
        vec4 wp0 = modelMatrix * vec4(pos, 1.0);
        vec2 p = wp0.xz;

        float h = 0.0;
        vec2 grad = vec2(0.0);
        wave(p, normalize(vec2(0.28, -0.96)), 0.055, 0.95, 0.9, h, grad);
        wave(p, normalize(vec2(-0.62, -0.78)), 0.11, 0.5, 1.25, h, grad);
        wave(p, normalize(vec2(0.86, -0.5)), 0.23, 0.22, 1.8, h, grad);
        wave(p, normalize(vec2(-0.2, -0.98)), 0.45, 0.09, 2.6, h, grad);

        pos.z += h;
        vHeight = h;

        // world-space normal from the analytic gradient (local +Z is up)
        vec3 nLocal = normalize(vec3(-grad.x, -grad.y, 1.0));
        vNormalW = normalize(mat3(modelMatrix) * nLocal);

        vec4 wp = modelMatrix * vec4(pos, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    []
  )

  const fragmentShader = useMemo(
    () => /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uDeep;
      uniform vec3 uMid;
      uniform vec3 uShallow;
      uniform vec3 uSky;
      uniform vec3 uSunColor;
      uniform float uVesselZ;
      uniform float uVesselLen;
      uniform float uVesselBeam;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vHeight;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        v += noise(p) * 0.55;
        v += noise(p * 2.13) * 0.28;
        v += noise(p * 4.41) * 0.17;
        return v;
      }

      void main() {
        vec3 Vw = normalize(cameraPosition - vWorld);

        // Base water gradient by wave height
        float hf = clamp((vHeight + 1.6) / 3.2, 0.0, 1.0);
        vec3 base = mix(uDeep, uMid, smoothstep(0.0, 0.55, hf));
        base = mix(base, uShallow, smoothstep(0.55, 1.0, hf) * 0.55);

        // World-space micro normal detail
        vec3 N = normalize(vNormalW);
        float n1 = fbm(vWorld.xz * 0.35 + vec2(uTime * 0.35, uTime * 0.22));
        float n2 = fbm(vWorld.xz * 0.9 - vec2(uTime * 0.28, uTime * 0.4));
        N = normalize(N + vec3((n1 - 0.5) * 0.35, 0.0, (n2 - 0.5) * 0.35));

        // Fresnel to sky — restrained so low camera angles stay maritime blue
        float fres = pow(1.0 - max(dot(Vw, N), 0.0), 3.0);
        vec3 skyRefl = uSky * 0.6 + vec3(0.03, 0.07, 0.10);
        vec3 col = mix(base, skyRefl, clamp(fres * 0.42 + 0.05, 0.0, 1.0));

        // Sun specular — tight glitter + faint sheen, true world-space N·H
        vec3 L = normalize(uSunDir);
        vec3 H = normalize(L + Vw);
        float ndh = max(dot(N, H), 0.0);
        float spec = pow(ndh, 240.0) * 1.5;
        float sheen = pow(ndh, 36.0) * 0.16;
        float glitter = step(0.994, noise(vWorld.xz * 3.0 + uTime * 1.5)) * 0.5 * ndh;
        col += uSunColor * (spec + sheen + glitter);

        // ---- Vessel-coupled foam & wake (tight corridor, noise-gated) ----
        float stern = uVesselZ + uVesselLen * 0.5;
        float bow = uVesselZ - uVesselLen * 0.5;
        float dx = vWorld.x - 0.0;
        float adx = abs(dx);
        float foamRaw = 0.0;

        // narrow wash hugging the hull
        float hullBand = (1.0 - smoothstep(uVesselBeam * 0.5, uVesselBeam * 0.5 + 3.5, adx))
          * (1.0 - smoothstep(uVesselLen * 0.5 - 4.0, uVesselLen * 0.5 + 8.0, abs(vWorld.z - uVesselZ)));
        foamRaw += hullBand * 0.4;

        // bow crescent
        float bowD = length(vec2(dx * 1.5, (vWorld.z - bow) * 0.9));
        foamRaw += (1.0 - smoothstep(1.5, 8.0, bowD)) * 0.8;

        // Kelvin wake — corridor widening aft of the stern, fast decay
        float behind = vWorld.z - stern;
        if (behind > 0.0) {
          float halfW = 9.0 + behind * 0.11;
          float lat = adx / halfW;
          float decay = exp(-behind / 60.0);
          float body = (1.0 - smoothstep(0.5, 1.0, lat)) * decay;
          float arm = (1.0 - smoothstep(0.0, 0.10, abs(lat - 0.88))) * exp(-behind / 120.0);
          float turb = fbm(vec2(vWorld.x * 0.6, vWorld.z * 0.25 - uTime * 1.2));
          foamRaw += body * (0.15 + 0.4 * turb) + arm * 0.45 * (0.35 + 0.65 * turb);
          // prop wash just behind the stern
          foamRaw += (1.0 - smoothstep(0.0, 22.0, behind)) * (1.0 - smoothstep(2.0, 8.0, adx)) * 0.7;
        }

        // gate with animated noise so foam reads as churn, never paint
        float breakup = fbm(vWorld.xz * 0.8 + vec2(0.0, -uTime * 0.9));
        float foam = smoothstep(0.32, 0.72, foamRaw + (breakup - 0.5) * 0.45);
        foam = clamp(foam, 0.0, 1.0);

        vec3 foamCol = vec3(0.93, 0.97, 0.99);
        col = mix(col, foamCol, foam * 0.85);

        // Atmospheric distance haze to horizon
        float dist = length(vWorld.xz - cameraPosition.xz);
        float haze = smoothstep(140.0, 900.0, dist);
        col = mix(col, vec3(0.74, 0.84, 0.90), haze * 0.7);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
    []
  )

  useFrame((state, delta) => {
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = state.clock.getElapsedTime()
      // framerate-independent follow (was a fixed 0.12/frame lerp)
      const u = matRef.current.uniforms.uVesselZ
      u.value += ((vesselZRef?.current ?? u.value) - u.value) * (1 - Math.exp(-delta * 7))
    }
  })

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, -140]} receiveShadow>
        <planeGeometry args={[2400, 2400, 190, 190]} />
        <shaderMaterial
          ref={matRef}
          args={[{ uniforms, vertexShader, fragmentShader }]}
        />
      </mesh>
    </group>
  )
}
