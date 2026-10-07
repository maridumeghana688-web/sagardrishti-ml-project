/**
 * Ship-to-shore gantry cranes at true industrial scale.
 * Real STS: ~85 m tall, boom ~90 m. Hero vessel castle top sits near 30,
 * so these towers genuinely dwarf the ship.
 */
function STS({ position = [0, 0, 0], trolley = 10, accent = '#C96A1B' }) {
  return (
    <group position={position}>
      {/* portal legs — 42 tall */}
      {[
        [-8, 0],
        [8, 0],
        [-8, -14],
        [8, -14],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, 21, z]} castShadow>
          <boxGeometry args={[2.4, 42, 2.4]} />
          <meshStandardMaterial color="#E8EDF1" roughness={0.45} metalness={0.35} />
        </mesh>
      ))}
      {/* sill beams */}
      <mesh position={[0, 41, 0]} castShadow>
        <boxGeometry args={[18.5, 2.2, 2.6]} />
        <meshStandardMaterial color={accent} roughness={0.45} metalness={0.3} />
      </mesh>
      <mesh position={[0, 41, -14]} castShadow>
        <boxGeometry args={[18.5, 2.2, 2.6]} />
        <meshStandardMaterial color={accent} roughness={0.45} metalness={0.3} />
      </mesh>
      {/* portal tie beams low */}
      <mesh position={[-8, 8, -7]}>
        <boxGeometry args={[1.6, 2.0, 15]} />
        <meshStandardMaterial color="#C7D0D8" roughness={0.5} metalness={0.4} />
      </mesh>
      <mesh position={[8, 8, -7]}>
        <boxGeometry args={[1.6, 2.0, 15]} />
        <meshStandardMaterial color="#C7D0D8" roughness={0.5} metalness={0.4} />
      </mesh>

      {/* A-frame tower to apex 85 */}
      <mesh position={[-6.5, 62, -7]} rotation={[0, 0, 0.1]} castShadow>
        <boxGeometry args={[2.0, 46, 2.0]} />
        <meshStandardMaterial color="#E8EDF1" roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[6.5, 62, -7]} rotation={[0, 0, -0.1]} castShadow>
        <boxGeometry args={[2.0, 46, 2.0]} />
        <meshStandardMaterial color="#E8EDF1" roughness={0.4} metalness={0.35} />
      </mesh>
      {/* apex machinery house */}
      <mesh position={[0, 84, -7]} castShadow>
        <boxGeometry args={[15, 4.5, 7]} />
        <meshStandardMaterial color="#16324F" roughness={0.45} metalness={0.3} />
      </mesh>

      {/* boom at height 48: 58 over water (+Z), 34 backreach */}
      <mesh position={[0, 48, 22]} castShadow>
        <boxGeometry args={[3.4, 3.0, 62]} />
        <meshStandardMaterial color="#E8EDF1" roughness={0.4} metalness={0.35} />
      </mesh>
      <mesh position={[0, 48, -24]} castShadow>
        <boxGeometry args={[3.4, 2.6, 20]} />
        <meshStandardMaterial color="#D5DDE3" roughness={0.45} metalness={0.35} />
      </mesh>
      {/* forestay + backstay rods */}
      <mesh position={[0, 66, 16]} rotation={[0.62, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 52, 6]} />
        <meshStandardMaterial color="#2B3742" roughness={0.5} metalness={0.6} />
      </mesh>
      <mesh position={[0, 66, -20]} rotation={[-0.66, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 34, 6]} />
        <meshStandardMaterial color="#2B3742" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* trolley + spreader + suspended box */}
      <group position={[0, 45.6, trolley]}>
        <mesh castShadow>
          <boxGeometry args={[4.4, 1.4, 3.2]} />
          <meshStandardMaterial color="#1B2530" roughness={0.5} metalness={0.5} />
        </mesh>
        <mesh position={[1.9, -1.2, 0]}>
          <boxGeometry args={[1.2, 1.2, 1.6]} />
          <meshStandardMaterial color="#0B1622" roughness={0.15} metalness={0.8} />
        </mesh>
        {[-1.2, 1.2].map((x) =>
          [-0.9, 0.9].map((z, j) => (
            <mesh key={x + '' + j} position={[x, -8, z]}>
              <cylinderGeometry args={[0.07, 0.07, 13, 5]} />
              <meshStandardMaterial color="#2B3742" metalness={0.6} roughness={0.5} />
            </mesh>
          ))
        )}
        <mesh position={[0, -14.8, 0]}>
          <boxGeometry args={[3.4, 0.7, 7]} />
          <meshStandardMaterial color="#C8A018" roughness={0.45} />
        </mesh>
        <mesh position={[0, -17.4, 0]} castShadow>
          <boxGeometry args={[2.6, 2.9, 12.2]} />
          <meshStandardMaterial color="#1F5FA8" roughness={0.55} metalness={0.25} />
        </mesh>
      </group>

      {/* aviation beacon */}
      <mesh position={[0, 87, -7]}>
        <sphereGeometry args={[0.5, 8, 8]} />
        <meshBasicMaterial color="#FF4444" />
      </mesh>
    </group>
  )
}

export default function Cranes({ quayZ = -300, xs = [-120, -72, -24, 24, 72, 120] }) {
  return (
    <group>
      {xs.map((x, i) => (
        <STS
          key={i}
          position={[x, 2, quayZ + 4]}
          trolley={6 + ((i * 37) % 34)}
          accent={i % 3 === 2 ? '#0E7C86' : '#C96A1B'}
        />
      ))}
    </group>
  )
}

/** Small yard RTG crane — spans container rows. */
export function RTG({ position = [0, 0, 0] }) {
  return (
    <group position={position}>
      {[[-11, -6], [11, -6], [-11, 6], [11, 6]].map(([x, z], i) => (
        <mesh key={i} position={[x, 9, z]} castShadow>
          <boxGeometry args={[1.4, 18, 1.4]} />
          <meshStandardMaterial color="#D9E0E6" roughness={0.5} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 18.5, -6]} castShadow>
        <boxGeometry args={[24, 1.8, 1.8]} />
        <meshStandardMaterial color="#16324F" roughness={0.5} />
      </mesh>
      <mesh position={[0, 18.5, 6]} castShadow>
        <boxGeometry args={[24, 1.8, 1.8]} />
        <meshStandardMaterial color="#16324F" roughness={0.5} />
      </mesh>
      <mesh position={[0, 18.5, 0]}>
        <boxGeometry args={[2.2, 1.6, 13.5]} />
        <meshStandardMaterial color="#C7D0D8" roughness={0.5} />
      </mesh>
    </group>
  )
}
