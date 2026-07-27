import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from './store'
import { sfx } from './sfx'
import { ROW_D, PLAY_HALF, carX, rowRng, type Row } from './world'
import {
  barkTexture,
  drift,
  foliageTexture,
  frogSkinTexture,
  gatorSkinTexture,
  grassTexture,
  groundTexture,
  paintedMetalTexture,
  roadTexture,
  waterTexture,
} from './textures'

const CAR_COLORS = ['#f28b82', '#aecbfa', '#fdd663', '#ccff90', '#d7aefb', '#ffb3c1', '#a7ffeb']
const TREE_GREENS = ['#7ecb6f', '#5fb85a', '#96d98a']

/** Frog world position, shared with traffic / hazard helpers. */
const frogPos = { x: 0, y: 0, z: 0 }

// ---------- Particle bursts (dust puffs, bubbles) ----------

interface Burst {
  x: number
  z: number
  color: string
  t0: number
}

const BURST_POOL = 8
const bursts: (Burst | null)[] = Array(BURST_POOL).fill(null)
let burstSlot = 0

function spawnBurst(x: number, z: number, color: string) {
  bursts[burstSlot % BURST_POOL] = { x, z, color, t0: performance.now() / 1000 }
  burstSlot++
}

function Bursts() {
  const groups = useRef<(THREE.Group | null)[]>([])
  useFrame(() => {
    const now = performance.now() / 1000
    for (let i = 0; i < BURST_POOL; i++) {
      const g = groups.current[i]
      if (!g) continue
      const b = bursts[i]
      const p = b ? (now - b.t0) / 0.45 : 1
      if (!b || p >= 1) {
        g.visible = false
        continue
      }
      g.visible = true
      g.position.set(b.x, 0.04, b.z)
      g.children.forEach((c, k) => {
        const a = (k / g.children.length) * Math.PI * 2 + i
        const r = 0.14 + p * 0.55
        c.position.set(Math.cos(a) * r, Math.sin(Math.min(1, p) * Math.PI) * 0.24, Math.sin(a) * r * 0.6)
        c.scale.setScalar(Math.max(0.001, 0.1 * (1 - p)))
        const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial
        m.color.set(b.color)
        m.opacity = 0.9 * (1 - p)
      })
    }
  })
  return (
    <>
      {Array.from({ length: BURST_POOL }, (_, i) => (
        <group
          key={i}
          visible={false}
          ref={(el) => {
            groups.current[i] = el
          }}
        >
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k}>
              <sphereGeometry args={[1, 6, 6]} />
              <meshBasicMaterial transparent opacity={0.9} color="#ffffff" />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

// ---------- Static world strips ----------

function GrassRow({ i, seed }: { i: number; seed: number }) {
  const decos = useMemo(() => {
    const rng = rowRng(seed, i)
    const items: { x: number; s: number; kind: 'tree' | 'bush' | 'flower' }[] = []
    const n = Math.floor(rng() * 3)
    for (let k = 0; k < n; k++) {
      const side = rng() < 0.5 ? -1 : 1
      items.push({
        x: side * (PLAY_HALF + 1.2 + rng() * 4),
        s: 0.7 + rng() * 0.6,
        kind: rng() < 0.6 ? 'tree' : 'bush',
      })
    }
    if (rng() < 0.5) {
      items.push({ x: (rng() * 2 - 1) * PLAY_HALF, s: 1, kind: 'flower' })
    }
    return items
  }, [i, seed])

  return (
    <group position={[0, 0, i * ROW_D]}>
      <mesh receiveShadow position={[0, -0.1, 0]}>
        <boxGeometry args={[34, 0.2, ROW_D]} />
        <meshStandardMaterial
          color={i % 2 === 0 ? '#8fd47f' : '#84cc74'}
          map={grassTexture()}
          bumpMap={grassTexture()}
          bumpScale={0.4}
          roughness={0.95}
        />
      </mesh>
      {decos.map((d, k) =>
        d.kind === 'flower' ? (
          <group key={k} position={[d.x, 0.06, 0]}>
            <mesh castShadow>
              <sphereGeometry args={[0.09, 8, 8]} />
              <meshStandardMaterial color="#fff9e6" />
            </mesh>
            <mesh position={[0, 0.02, 0]}>
              <sphereGeometry args={[0.045, 8, 8]} />
              <meshStandardMaterial color="#ffd166" />
            </mesh>
          </group>
        ) : d.kind === 'tree' ? (
          <group key={k} position={[d.x, 0, 0]} scale={d.s}>
            <mesh castShadow position={[0, 0.35, 0]}>
              <cylinderGeometry args={[0.13, 0.18, 0.7, 8]} />
              <meshStandardMaterial color="#a1795a" map={barkTexture()} bumpMap={barkTexture()} bumpScale={0.4} />
            </mesh>
            <mesh castShadow position={[0, 0.95, 0]}>
              <sphereGeometry args={[0.55, 12, 12]} />
              <meshStandardMaterial color={TREE_GREENS[(i + k) % TREE_GREENS.length]} map={foliageTexture()} />
            </mesh>
            <mesh castShadow position={[0.3, 0.75, 0.1]}>
              <sphereGeometry args={[0.35, 10, 10]} />
              <meshStandardMaterial color={TREE_GREENS[(i + k + 1) % TREE_GREENS.length]} map={foliageTexture()} />
            </mesh>
          </group>
        ) : (
          <mesh key={k} castShadow position={[d.x, 0.2, 0]} scale={[d.s, d.s * 0.7, d.s]}>
            <sphereGeometry args={[0.4, 10, 10]} />
            <meshStandardMaterial color={TREE_GREENS[(i + k) % TREE_GREENS.length]} map={foliageTexture()} />
          </mesh>
        ),
      )}
    </group>
  )
}

function RoadRow({ i, hasRoadAhead }: { i: number; hasRoadAhead: boolean }) {
  return (
    <group position={[0, 0, i * ROW_D]}>
      <mesh receiveShadow position={[0, -0.11, 0]}>
        <boxGeometry args={[34, 0.2, ROW_D]} />
        <meshStandardMaterial
          color="#a9b2bd"
          map={roadTexture()}
          bumpMap={roadTexture()}
          bumpScale={0.25}
          roughness={0.9}
        />
      </mesh>
      {hasRoadAhead &&
        [-8, -5, -2, 1, 4, 7].map((x) => (
          <mesh key={x} position={[x, -0.005, ROW_D / 2]}>
            <boxGeometry args={[0.8, 0.02, 0.08]} />
            <meshStandardMaterial color="#e8edf2" />
          </mesh>
        ))}
    </group>
  )
}

function WaterRow({ i, seed }: { i: number; seed: number }) {
  const pads = useMemo(() => {
    const rng = rowRng(seed, i * 31 + 7)
    const items: number[] = []
    if (rng() < 0.6) items.push(PLAY_HALF + 1 + rng() * 5)
    if (rng() < 0.6) items.push(-(PLAY_HALF + 1 + rng() * 5))
    return items
  }, [i, seed])

  // Each lane gets its own caustics offset so currents don't move in lockstep.
  const { tex, flow } = useMemo(() => {
    const rng = rowRng(seed, i * 17 + 3)
    const t = drift(waterTexture())
    t.offset.set(rng(), rng())
    return { tex: t, flow: rng() < 0.5 ? 1 : -1 }
  }, [i, seed])

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05)
    tex.offset.x += d * 0.035 * flow
    tex.offset.y += d * 0.012
  })

  return (
    <group position={[0, 0, i * ROW_D]}>
      <mesh receiveShadow position={[0, -0.14, 0]}>
        <boxGeometry args={[34, 0.2, ROW_D]} />
        <meshStandardMaterial color="#7ed0ef" map={tex} roughness={0.32} metalness={0.06} />
      </mesh>
      {pads.map((x, k) => (
        <mesh key={k} position={[x, -0.02, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 12]} />
          <meshStandardMaterial color="#79d071" map={grassTexture()} />
        </mesh>
      ))}
    </group>
  )
}

// ---------- Traffic and logs ----------

function Car({ len, color }: { len: number; color: string }) {
  return (
    <group>
      <RoundedBox castShadow args={[len, 0.42, 0.72]} radius={0.12} smoothness={3} position={[0, 0.3, 0]}>
        <meshStandardMaterial color={color} />
      </RoundedBox>
      <RoundedBox castShadow args={[len * 0.5, 0.3, 0.6]} radius={0.1} smoothness={3} position={[-len * 0.05, 0.62, 0]}>
        <meshStandardMaterial color="#fdfdfd" />
      </RoundedBox>
      {[-len * 0.3, len * 0.3].map((wx) =>
        [-0.34, 0.34].map((wz) => (
          <mesh key={`${wx}-${wz}`} position={[wx, 0.12, wz]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 0.1, 10]} />
            <meshStandardMaterial color="#3d3d44" />
          </mesh>
        )),
      )}
    </group>
  )
}

function Log({ len }: { len: number }) {
  return (
    <RoundedBox castShadow args={[len * 0.92, 0.26, 0.66]} radius={0.13} smoothness={3} position={[0, 0.04, 0]}>
      <meshStandardMaterial
        color="#a8795a"
        map={barkTexture()}
        bumpMap={barkTexture()}
        bumpScale={0.5}
        roughness={0.85}
      />
    </RoundedBox>
  )
}

function MowerMesh() {
  const blade = useRef<THREE.Mesh>(null)
  useFrame((_, dt) => {
    if (blade.current) blade.current.rotation.y += dt * 22
  })
  return (
    <group>
      {/* cutting deck */}
      <RoundedBox castShadow args={[1.35, 0.18, 0.95]} radius={0.08} smoothness={3} position={[0, 0.22, 0]}>
        <meshStandardMaterial color="#3d9b4a" map={paintedMetalTexture()} roughness={0.55} metalness={0.15} />
      </RoundedBox>
      {/* deck lip / skirt */}
      <RoundedBox args={[1.4, 0.08, 1.0]} radius={0.04} smoothness={2} position={[0, 0.12, 0]}>
        <meshStandardMaterial color="#2e7d38" />
      </RoundedBox>
      {/* engine cowling */}
      <RoundedBox castShadow args={[0.55, 0.38, 0.48]} radius={0.1} smoothness={3} position={[0.05, 0.48, 0]}>
        <meshStandardMaterial color="#ef5350" />
      </RoundedBox>
      {/* air filter / cap */}
      <mesh castShadow position={[0.05, 0.72, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.1, 10]} />
        <meshStandardMaterial color="#f5f5f5" />
      </mesh>
      {/* exhaust */}
      <mesh castShadow position={[0.38, 0.42, 0.28]} rotation={[0.3, 0, 0.4]}>
        <cylinderGeometry args={[0.05, 0.06, 0.22, 8]} />
        <meshStandardMaterial color="#546e7a" metalness={0.5} roughness={0.4} />
      </mesh>
      {/* push handle stems */}
      {[-0.22, 0.22].map((z) => (
        <mesh key={z} castShadow position={[-0.55, 0.55, z]} rotation={[0, 0, 0.55]}>
          <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
          <meshStandardMaterial color="#eceff1" />
        </mesh>
      ))}
      {/* handle bar */}
      <mesh castShadow position={[-0.95, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 0.55, 8]} />
        <meshStandardMaterial color="#37474f" />
      </mesh>
      {/* grip tips */}
      {[-0.26, 0.26].map((z) => (
        <mesh key={z} position={[-0.95, 0.95, z]}>
          <sphereGeometry args={[0.055, 8, 8]} />
          <meshStandardMaterial color="#263238" />
        </mesh>
      ))}
      {/* front wheels (smaller) */}
      {[-0.38, 0.38].map((z) => (
        <mesh key={`f${z}`} castShadow position={[0.42, 0.14, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.14, 0.14, 0.1, 12]} />
          <meshStandardMaterial color="#212121" />
        </mesh>
      ))}
      {/* rear wheels (bigger) */}
      {[-0.4, 0.4].map((z) => (
        <mesh key={`r${z}`} castShadow position={[-0.4, 0.18, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 0.12, 12]} />
          <meshStandardMaterial color="#212121" />
        </mesh>
      ))}
      {/* spinning blade under the deck */}
      <mesh ref={blade} position={[0.1, 0.06, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.03, 6]} />
        <meshStandardMaterial color="#90a4ae" metalness={0.65} roughness={0.3} />
      </mesh>
    </group>
  )
}

/** Proper croc: ridged back, eye bumps, tapering tail, and a hinged snout that snaps. */
function AlligatorMesh({ len, jawRef }: { len: number; jawRef: RefObject<THREE.Group | null> }) {
  const L = Math.max(1.5, len * 1.3)
  const hide = '#4f9e5f'
  const dark = '#3a7d49'
  const belly = '#c4dfa8'
  return (
    <group>
      {/* torso */}
      <RoundedBox castShadow args={[L * 0.5, 0.26, 0.56]} radius={0.1} smoothness={3} position={[0, 0.13, 0]}>
        <meshStandardMaterial
          color={hide}
          map={gatorSkinTexture()}
          bumpMap={gatorSkinTexture()}
          bumpScale={0.6}
          roughness={0.8}
        />
      </RoundedBox>
      {/* two rows of back scutes */}
      {[-0.11, 0.11].map((z) =>
        [-0.18, -0.02, 0.14].map((fx) => (
          <mesh key={`${z}-${fx}`} castShadow position={[L * fx, 0.31, z]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.055, 0.12, 4]} />
            <meshStandardMaterial color={dark} />
          </mesh>
        )),
      )}
      {/* head */}
      <RoundedBox castShadow args={[L * 0.2, 0.2, 0.46]} radius={0.07} smoothness={3} position={[L * 0.3, 0.14, 0]}>
        <meshStandardMaterial color={hide} map={gatorSkinTexture()} roughness={0.8} />
      </RoundedBox>
      {/* eye bumps peeking above the water */}
      {[-0.14, 0.14].map((z) => (
        <group key={z} position={[L * 0.3, 0.28, z]}>
          <mesh castShadow>
            <sphereGeometry args={[0.085, 10, 10]} />
            <meshStandardMaterial color={hide} />
          </mesh>
          <mesh position={[0.035, 0.035, 0]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color="#f6efd3" />
          </mesh>
          <mesh position={[0.06, 0.05, 0]}>
            <sphereGeometry args={[0.024, 6, 6]} />
            <meshStandardMaterial color="#22301f" />
          </mesh>
        </group>
      ))}
      {/* lower jaw + teeth */}
      <RoundedBox args={[L * 0.34, 0.09, 0.34]} radius={0.045} smoothness={2} position={[L * 0.52, 0.06, 0]}>
        <meshStandardMaterial color={belly} />
      </RoundedBox>
      {[-0.11, 0, 0.11].map((z) => (
        <mesh key={z} position={[L * 0.62, 0.115, z]}>
          <coneGeometry args={[0.026, 0.07, 4]} />
          <meshStandardMaterial color="#fffdf2" />
        </mesh>
      ))}
      {/* upper snout — hinges open at the head */}
      <group ref={jawRef} position={[L * 0.38, 0.17, 0]}>
        <RoundedBox castShadow args={[L * 0.36, 0.1, 0.36]} radius={0.05} smoothness={2} position={[L * 0.16, 0, 0]}>
          <meshStandardMaterial color={hide} map={gatorSkinTexture()} roughness={0.8} />
        </RoundedBox>
        {[-0.07, 0.07].map((z) => (
          <mesh key={z} position={[L * 0.32, 0.055, z]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial color={dark} />
          </mesh>
        ))}
      </group>
      {/* tapering tail with a curve */}
      <RoundedBox castShadow args={[L * 0.24, 0.2, 0.42]} radius={0.08} smoothness={2} position={[-L * 0.34, 0.11, 0.02]} rotation={[0, 0.12, 0]}>
        <meshStandardMaterial color={hide} map={gatorSkinTexture()} roughness={0.8} />
      </RoundedBox>
      <RoundedBox castShadow args={[L * 0.2, 0.14, 0.28]} radius={0.06} smoothness={2} position={[-L * 0.5, 0.09, 0.07]} rotation={[0, 0.3, 0]}>
        <meshStandardMaterial color={dark} map={gatorSkinTexture()} roughness={0.8} />
      </RoundedBox>
      <mesh castShadow position={[-L * 0.64, 0.08, 0.13]} rotation={[0, 0.45, Math.PI / 2]}>
        <coneGeometry args={[0.08, L * 0.2, 6]} />
        <meshStandardMaterial color={dark} />
      </mesh>
      {/* stubby legs */}
      {([
        [-0.12, -0.31],
        [-0.12, 0.31],
        [0.22, -0.29],
        [0.22, 0.29],
      ] as const).map(([fx, z]) => (
        <mesh key={`${fx}${z}`} castShadow position={[L * fx, 0.05, z]}>
          <sphereGeometry args={[0.09, 8, 8]} />
          <meshStandardMaterial color={dark} />
        </mesh>
      ))}
    </group>
  )
}

/** Timed lawn mower: arms when the frog lands on this grass, then sweeps. */
function GrassMower({ row, i }: { row: Row; i: number }) {
  const group = useRef<THREE.Group>(null)
  const st = useRef({
    watching: false,
    t0: 0,
    active: false,
    x: 0,
    hit: false,
    buzzed: false,
    clipT: 0,
  })

  useFrame((_, dt) => {
    const g = group.current
    if (!g || !row.mowerDelay) return
    const game = useGame.getState()
    const s = st.current
    const now = performance.now() / 1000
    const onMe = game.phase === 'playing' && game.frogRow === i && !game.doom

    if (!s.active) {
      // Still counting down: only while the frog is camping this lane.
      if (!onMe) {
        s.watching = false
        g.visible = false
        return
      }
      if (!s.watching) {
        s.watching = true
        s.t0 = now
        s.buzzed = false
        s.hit = false
        s.x = row.dir * -(PLAY_HALF + 3)
        g.visible = false
      }
      if (now - s.t0 < (row.mowerDelay || 2)) return
      s.active = true
      g.visible = true
      if (!s.buzzed) {
        s.buzzed = true
        sfx.mower()
      }
    }

    // Sweeping: finish the pass even if the frog hops away mid-run.
    s.x += row.dir * row.speed * Math.min(dt, 0.05)
    g.position.x = s.x
    g.rotation.y = row.dir === 1 ? 0 : Math.PI
    // Engine rattle + a trail of grass clippings.
    g.position.y = Math.abs(Math.sin(now * 24)) * 0.02
    g.rotation.z = Math.sin(now * 31) * 0.015
    s.clipT += Math.min(dt, 0.05)
    if (s.clipT > 0.14 && Math.abs(s.x) < PLAY_HALF + 1.5) {
      s.clipT = 0
      spawnBurst(s.x - row.dir * 0.85, i * ROW_D, '#a5d6a7')
    }

    if (!s.hit && onMe && frogPos.y < 0.35 && Math.abs(s.x - frogPos.x) < row.carLen / 2 + 0.35) {
      s.hit = true
      useGame.getState().die('hit')
    }

    if (Math.abs(s.x) > PLAY_HALF + 6) {
      if (onMe && !s.hit) {
        // Frog is still camping — come back for another pass.
        s.x = row.dir * -(PLAY_HALF + 3)
        sfx.mower()
      } else {
        s.active = false
        s.watching = false
        s.hit = false
        g.visible = false
      }
    }
  })

  if (!row.mowerDelay) return null
  return (
    <group ref={group} position={[0, 0, i * ROW_D]} visible={false}>
      <MowerMesh />
    </group>
  )
}

/**
 * Ambush gator: invisible while the frog is elsewhere. When the frog lingers
 * on this water lane, it surfaces near the frog — eyes and ripples first as a
 * warning — then lunges with a jaw snap. Hop away during the warning to live.
 */
function WaterGators({ row, i }: { row: Row; i: number }) {
  const group = useRef<THREE.Group>(null)
  const jaw = useRef<THREE.Group>(null)
  const st = useRef({
    phase: 'idle' as 'idle' | 'wait' | 'warn' | 'lunge' | 'sink',
    t0: 0,
    x: 0,
    face: 1,
    delay: 0,
    rippleT: 0,
    killed: false,
    splashed: false,
  })
  const seed = useGame((s) => s.seed)

  useEffect(() => {
    st.current.phase = 'idle'
    st.current.killed = false
    if (group.current) group.current.visible = false
  }, [seed])

  const WARN = 0.75
  const LUNGE = 0.3
  const SINK = 0.55

  useFrame((_, dtRaw) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(dtRaw, 0.05)
    const game = useGame.getState()
    const s = st.current
    const now = performance.now() / 1000
    const frogHere =
      game.phase === 'playing' && game.frogRow === i && !game.doom && Math.abs(frogPos.z - i * ROW_D) < ROW_D * 0.55

    // Frog moved on before we struck — slip back under.
    if (!frogHere && (s.phase === 'wait' || s.phase === 'warn')) {
      if (s.phase === 'warn') {
        s.phase = 'sink'
        s.t0 = now
      } else {
        s.phase = 'idle'
        g.visible = false
      }
    }

    if (s.phase === 'idle') {
      g.visible = false
      if (frogHere) {
        s.phase = 'wait'
        s.t0 = now
        s.delay = 1.0 + Math.random() * 1.7
        s.killed = false
      }
      return
    }

    if (s.phase === 'wait') {
      if (now - s.t0 >= s.delay) {
        s.phase = 'warn'
        s.t0 = now
        s.rippleT = 0
        s.splashed = false
        s.x = THREE.MathUtils.clamp(frogPos.x, -PLAY_HALF, PLAY_HALF)
        s.face = frogPos.x >= s.x ? 1 : -1
        g.visible = true
        g.position.y = -0.75
        sfx.gator()
      }
      return
    }

    g.position.z = i * ROW_D

    if (s.phase === 'warn') {
      const p = Math.min(1, (now - s.t0) / WARN)
      const ease = p * p * (3 - 2 * p) // smoothstep rise, not a linear pop
      // Track the frog slowly while only the eyes are out — dodging matters.
      s.x = THREE.MathUtils.lerp(s.x, THREE.MathUtils.clamp(frogPos.x, -PLAY_HALF, PLAY_HALF), dt * 2.4)
      s.face = frogPos.x >= s.x ? 1 : -1
      g.position.x = s.x
      g.position.y = -0.75 + ease * 0.42 + Math.sin(now * 6) * 0.012 // breach with a bob
      g.rotation.y = s.face === 1 ? 0 : Math.PI
      g.rotation.z = 0.1 * (1 - ease) // nose tilts level as it rises
      if (jaw.current) jaw.current.rotation.z = 0
      // One splash the moment the eyes break the surface, then ripples.
      if (!s.splashed && ease > 0.55) {
        s.splashed = true
        spawnBurst(s.x, i * ROW_D, '#d9f2fb')
      }
      s.rippleT += dt
      if (s.rippleT > 0.16) {
        s.rippleT = 0
        spawnBurst(s.x, i * ROW_D, '#9fdcef')
      }
      if (p >= 1) {
        s.phase = 'lunge'
        s.t0 = now
        spawnBurst(s.x, i * ROW_D, '#d9f2fb')
      }
      return
    }

    if (s.phase === 'lunge') {
      const p = Math.min(1, (now - s.t0) / LUNGE)
      g.position.x = s.x
      g.position.y = -0.33 + Math.sin(p * Math.PI) * 0.34 // breach, then settle
      g.rotation.z = Math.sin(p * Math.PI) * 0.28 // rears up, then slams down
      if (jaw.current) jaw.current.rotation.z = Math.sin(Math.min(1, p * 1.25) * Math.PI) * 0.6
      if (
        !s.killed &&
        p >= 0.35 &&
        p <= 0.8 &&
        frogHere &&
        frogPos.y < 0.35 &&
        Math.abs(s.x - frogPos.x) < 1.05
      ) {
        s.killed = true
        sfx.chomp()
        spawnBurst(s.x, i * ROW_D, '#bfe9f7')
        game.die('drown')
      }
      if (p >= 1) {
        s.phase = 'sink'
        s.t0 = now
      }
      return
    }

    // sink — nose dips first, trailing bubbles
    const p = Math.min(1, (now - s.t0) / SINK)
    g.position.y = THREE.MathUtils.lerp(g.position.y, -0.8, p * 0.35 + 0.06)
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, -0.15, 0.12)
    if (jaw.current) jaw.current.rotation.z = THREE.MathUtils.lerp(jaw.current.rotation.z, 0, 0.2)
    s.rippleT += dt
    if (s.rippleT > 0.22 && p < 0.7) {
      s.rippleT = 0
      spawnBurst(s.x, i * ROW_D, '#bfe9f7')
    }
    if (p >= 1) {
      s.phase = 'idle'
      g.visible = false
    }
  })

  return (
    <group ref={group} position={[0, -0.8, i * ROW_D]} visible={false}>
      <AlligatorMesh len={row.gatorLen ?? 1.2} jawRef={jaw} />
    </group>
  )
}

function LaneTraffic({ row, i }: { row: Row; i: number }) {
  const group = useRef<THREE.Group>(null)
  // When a casino "hit" doom lands on this road, one existing car peels out toward the frog.
  const doomRun = useRef<{
    k: number
    x: number
    dir: number
    speed: number
    impacted: boolean
    horned: boolean
    doomAt: number
  } | null>(null)

  useFrame(({ clock }, dt) => {
    const g = group.current
    if (!g) return
    const game = useGame.getState()
    const t = clock.elapsedTime
    const doom = game.doom
    const isDoomLane = row.kind === 'road' && doom && doom.kind === 'hit' && doom.row === i

    if (isDoomLane && doom) {
      if (!doomRun.current || doomRun.current.doomAt !== doom.at) {
        // Pick the car already approaching the frog (behind it in traffic direction).
        let bestK = 0
        let bestScore = -Infinity
        for (let k = 0; k < row.count; k++) {
          const x = carX(row, k, t)
          const behind = row.dir === 1 ? frogPos.x - x : x - frogPos.x
          const score = behind > 0.15 ? 100 - behind : -Math.abs(x - frogPos.x)
          if (score > bestScore) {
            bestScore = score
            bestK = k
          }
        }
        const startX = carX(row, bestK, t)
        doomRun.current = {
          k: bestK,
          x: startX,
          // Lock the charge direction now — recomputing it every frame makes
          // the car jitter back and forth over the frog after impact.
          dir: Math.sign(frogPos.x - startX) || row.dir,
          speed: row.speed * 1.15,
          impacted: false,
          horned: false,
          doomAt: doom.at,
        }
      }
    } else {
      doomRun.current = null
    }

    // Casino mode: the lane you're standing on is already resolved safe, so
    // cars whimsically leap over the frog instead of hitting it.
    const overFrog =
      row.kind === 'road' &&
      game.mode === 'casino' &&
      game.phase === 'playing' &&
      game.frogRow === i &&
      !isDoomLane

    for (let k = 0; k < g.children.length; k++) {
      const item = g.children[k]
      const run = doomRun.current
      if (run && k === run.k) {
        if (!run.horned) {
          run.horned = true
          sfx.horn()
        }
        run.speed += 28 * Math.min(dt, 0.05)
        run.x += run.dir * run.speed * Math.min(dt, 0.05)
        item.position.x = run.x
        item.position.y = 0
        item.rotation.y = run.dir === 1 ? 0 : Math.PI
        // Nose-down lean while flooring it; relax once it has driven past.
        item.rotation.z = run.impacted
          ? THREE.MathUtils.lerp(item.rotation.z, 0, 0.1)
          : run.dir * -0.08
        if (!run.impacted && Math.abs(run.x - frogPos.x) < row.carLen / 2 + 0.35) {
          run.impacted = true
          spawnBurst(frogPos.x, frogPos.z, '#ffd9a0')
          spawnBurst(frogPos.x + run.dir * 0.3, frogPos.z, '#f2f7ea')
          useGame.getState().die('hit')
        }
        continue
      }

      const x = carX(row, k, t)
      item.position.x = x
      item.rotation.z = 0
      let targetY = 0
      if (overFrog) {
        const d = Math.abs(x - frogPos.x)
        if (d < 1.6) targetY = (1 - (d / 1.6) ** 2) * 1.1
      }
      item.position.y = THREE.MathUtils.lerp(item.position.y, targetY, 0.35)
      if (row.kind === 'road') item.rotation.y = row.dir === 1 ? 0 : Math.PI
    }
  })
  return (
    <group ref={group} position={[0, 0, i * ROW_D]}>
      {Array.from({ length: row.count }, (_, k) =>
        row.kind === 'road' ? (
          <Car key={k} len={row.carLen} color={CAR_COLORS[(i * 3 + k) % CAR_COLORS.length]} />
        ) : (
          <Log key={k} len={row.carLen} />
        ),
      )}
    </group>
  )
}

// ---------- Frog ----------

interface Hop {
  fx: number
  fz: number
  tx: number
  tz: number
  t0: number
  dur: number
  toRow: number
}

function Frog() {
  const group = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const eyeL = useRef<THREE.Group>(null)
  const eyeR = useRef<THREE.Group>(null)
  const st = useRef({
    x: 0,
    row: 0,
    hop: null as Hop | null,
    dead: false,
    landT: 0,
    attach: null as { row: number; k: number; dx: number } | null,
    queue: null as { dx: number; dz: number; at: number } | null,
    drownFx: false,
  })
  const tryHopRef = useRef<(dx: number, dz: number) => void>(() => {})
  const { camera } = useThree()
  const seed = useGame((s) => s.seed)

  // New run: put the frog back at the start and snap the camera home.
  useEffect(() => {
    st.current = { x: 0, row: 0, hop: null, dead: false, landT: 0, attach: null, queue: null, drownFx: false }
    if (group.current) {
      group.current.position.set(0, 0, 0)
      group.current.rotation.set(0, 0, 0)
    }
    camera.position.set(0, 8.8, -7.5)
    camera.lookAt(0, 0, 2.6)
  }, [seed, camera])

  useEffect(() => {
    const tryHop = (dx: number, dz: number) => {
      const s = st.current
      const game = useGame.getState()
      if (game.phase !== 'playing' || s.dead || game.doom) return
      // Mid-hop, or waiting on the server: buffer the input instead of
      // dropping it, so rapid taps never lose hops or desync from the server.
      if (s.hop || (game.mode === 'casino' && game.busy)) {
        s.queue = { dx, dz, at: performance.now() / 1000 }
        return
      }
      const tx = THREE.MathUtils.clamp(s.x + dx, -PLAY_HALF, PLAY_HALF)
      const toRow = Math.max(0, s.row + dz)
      if (tx === s.x && toRow === s.row) return
      const g = group.current
      s.attach = null
      s.hop = {
        fx: g ? g.position.x : s.x,
        fz: g ? g.position.z : s.row * ROW_D,
        tx,
        tz: toRow * ROW_D,
        t0: performance.now() / 1000,
        dur: 0.17,
        toRow,
      }
      sfx.hop()
    }
    tryHopRef.current = tryHop

    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'].includes(e.key)) e.preventDefault()
      if (e.repeat) return
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === ' ') tryHop(0, 1)
      else if (e.key === 'ArrowDown' || e.key === 's') tryHop(0, -1)
      else if (e.key === 'ArrowLeft' || e.key === 'a') tryHop(1, 0)
      else if (e.key === 'ArrowRight' || e.key === 'd') tryHop(-1, 0)
    }

    // Tap = hop forward; swipe = hop in swipe direction.
    let swipeStart: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'CANVAS') swipeStart = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      if (!swipeStart) return
      const dx = e.clientX - swipeStart.x
      const dy = e.clientY - swipeStart.y
      swipeStart = null
      if (Math.hypot(dx, dy) < 14) tryHop(0, 1)
      else if (Math.abs(dy) >= Math.abs(dx)) tryHop(0, dy < 0 ? 1 : -1)
      else tryHop(dx < 0 ? 1 : -1, 0)
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  useFrame(({ clock }) => {
    const g = group.current
    const b = body.current
    if (!g || !b) return
    const s = st.current
    const now = performance.now() / 1000
    const t = clock.elapsedTime
    const game = useGame.getState()

    // Deaths triggered outside this component (doom car, drown roll).
    if (game.phase === 'dead' && !s.dead) s.dead = true

    // Hop animation: parabolic arc with squash and stretch.
    if (s.hop) {
      const h = s.hop
      const p = Math.min(1, (now - h.t0) / h.dur)
      g.position.x = THREE.MathUtils.lerp(h.fx, h.tx, p)
      g.position.z = THREE.MathUtils.lerp(h.fz, h.tz, p)
      g.position.y = Math.sin(Math.PI * p) * 0.55
      b.scale.set(1, 1 + Math.sin(Math.PI * p) * 0.25, 1)
      b.rotation.x = Math.sin(Math.PI * p) * 0.3 // lean into the jump
      const dx = h.tx - h.fx
      const dz = h.tz - h.fz
      if (dx !== 0 || dz !== 0) g.rotation.y = Math.atan2(dx, dz)
      if (p >= 1) {
        s.x = h.tx
        const rowChanged = h.toRow !== s.row
        s.row = h.toRow
        s.hop = null
        s.landT = now

        // Landing on water: grab a log (or miss it, in arcade mode).
        const rowObj = game.rows[s.row]
        if (rowObj?.kind === 'water' && !s.dead) {
          let bestK = 0
          let bestD = Infinity
          for (let k = 0; k < rowObj.count; k++) {
            const d = Math.abs(carX(rowObj, k, t) - s.x)
            if (d < bestD) {
              bestD = d
              bestK = k
            }
          }
          if (game.mode === 'arcade' && bestD > rowObj.carLen / 2 + 0.25) {
            s.dead = true
            game.die('drown')
          } else {
            // Ride the log where you landed on it; clamp to its edge so the
            // frog slides smoothly instead of teleporting to the center.
            const lx = carX(rowObj, bestK, t)
            const edge = Math.max(0.1, rowObj.carLen / 2 - 0.25)
            const dxOff = THREE.MathUtils.clamp(s.x - lx, -edge, edge)
            s.attach = { row: s.row, k: bestK, dx: dxOff }
            spawnBurst(g.position.x, g.position.z, '#bfe9f7')
          }
        } else {
          s.attach = null
          if (!s.dead) spawnBurst(g.position.x, g.position.z, '#f2f7ea')
        }
        if (!s.dead) sfx.land()

        if (rowChanged && !s.dead) game.advanceTo(s.row)
      }
    } else if (!s.dead) {
      // Fire a buffered input once we're grounded and the server is free.
      if (s.queue && game.phase === 'playing' && !game.doom && !(game.mode === 'casino' && game.busy)) {
        const q = s.queue
        s.queue = null
        if (now - q.at < 0.4) tryHopRef.current(q.dx, q.dz)
      }
      b.rotation.x = THREE.MathUtils.lerp(b.rotation.x, 0, 0.3)
      // Riding a log: drift with it.
      if (s.attach) {
        const rowObj = game.rows[s.attach.row]
        let lx = carX(rowObj, s.attach.k, t) + s.attach.dx
        if (Math.abs(lx) > PLAY_HALF + 1.3) {
          if (game.mode === 'arcade' && game.phase === 'playing') {
            s.dead = true
            game.die('drown')
          } else {
            // Casino mode: hop to the nearest log still in bounds.
            let bestK = s.attach.k
            let bestD = Infinity
            for (let k = 0; k < rowObj.count; k++) {
              const cx = carX(rowObj, k, t)
              if (Math.abs(cx) > PLAY_HALF) continue
              const d = Math.abs(cx - lx)
              if (d < bestD) {
                bestD = d
                bestK = k
              }
            }
            s.attach = { row: s.attach.row, k: bestK, dx: 0 }
            lx = carX(rowObj, bestK, t)
          }
        }
        if (!s.dead) {
          g.position.x = THREE.MathUtils.lerp(g.position.x, lx, 0.5)
          s.x = g.position.x
          g.position.y = 0.12 + Math.sin(t * 2.2 + s.attach.k) * 0.015 // gentle bob
        }
      } else if (game.phase !== 'cashed') {
        g.position.y = 0
      }
      // Landing squash, then relax into idle breathing.
      const dt = now - s.landT
      const squash = dt < 0.12 ? 1 - 0.2 * (1 - dt / 0.12) : 1
      const breath = 1 + Math.sin(t * 3) * 0.025
      b.scale.set(1, squash * breath, 1)

      // Cash-out celebration: happy bounces with a spin.
      if (game.phase === 'cashed') {
        g.position.y = Math.abs(Math.sin(t * 7)) * 0.35
        g.rotation.y += 0.12
      }
    }

    // Blink every few seconds.
    const blinkPhase = t % 3.4
    const blink = !s.dead && blinkPhase > 3.25 ? 0.12 : 1
    if (eyeL.current) eyeL.current.scale.y = blink
    if (eyeR.current) eyeR.current.scale.y = blink

    // Casino drown roll resolves shortly after landing on a losing water lane.
    if (game.doom && game.doom.kind === 'drown' && game.phase === 'playing' && now - game.doom.at > 0.45) {
      game.die('drown')
    }
    // Safety net: if the doom car somehow never connects, settle the round
    // anyway so the player is never left frozen mid-run.
    if (game.doom && game.doom.kind === 'hit' && game.phase === 'playing' && now - game.doom.at > 2.5) {
      game.die('hit')
    }

    // Death animation: flatten for hits, sink with bubbles for drowning.
    if (s.dead) {
      if (game.deathKind === 'drown') {
        if (!s.drownFx) {
          s.drownFx = true
          spawnBurst(g.position.x, g.position.z, '#8fd3ef')
        }
        g.position.y = THREE.MathUtils.lerp(g.position.y, -0.65, 0.12)
      } else {
        if (!s.drownFx) {
          s.drownFx = true
          spawnBurst(g.position.x, g.position.z, '#cdea9f')
        }
        b.scale.y = THREE.MathUtils.lerp(b.scale.y, 0.12, 0.25)
        b.scale.x = THREE.MathUtils.lerp(b.scale.x, 1.35, 0.25)
        b.scale.z = THREE.MathUtils.lerp(b.scale.z, 1.35, 0.25)
        g.position.y = 0
      }
    }

    // Physical collision with traffic (arcade mode only).
    if (game.mode === 'arcade' && game.phase === 'playing' && !s.dead) {
      const frogZ = g.position.z
      const frogX = g.position.x
      if (g.position.y < 0.3) {
        const nearRow = Math.round(frogZ / ROW_D)
        for (let r = nearRow - 1; r <= nearRow + 1; r++) {
          const row = game.rows[r]
          if (!row || row.kind !== 'road') continue
          if (Math.abs(frogZ - r * ROW_D) > ROW_D * 0.45) continue
          for (let k = 0; k < row.count; k++) {
            if (Math.abs(carX(row, k, t) - frogX) < row.carLen / 2 + 0.28) {
              s.dead = true
              game.die('hit')
              break
            }
          }
          if (s.dead) break
        }
      }
    }

    frogPos.x = g.position.x
    frogPos.y = g.position.y
    frogPos.z = g.position.z

    // Camera follows the frog.
    const cx = g.position.x * 0.45
    const cz = g.position.z - 7.5
    camera.position.lerp(new THREE.Vector3(cx, 8.8, cz), 0.08)
    camera.lookAt(cx, 0, g.position.z + 2.6)
  })

  return (
    <group ref={group}>
      <group ref={body}>
        {/* body */}
        <mesh castShadow position={[0, 0.32, 0]} scale={[1, 0.82, 1.1]}>
          <sphereGeometry args={[0.34, 16, 16]} />
          <meshStandardMaterial
            color="#79c860"
            map={frogSkinTexture()}
            bumpMap={frogSkinTexture()}
            bumpScale={0.25}
            roughness={0.7}
          />
        </mesh>
        {/* belly */}
        <mesh position={[0, 0.24, 0.12]} scale={[0.8, 0.6, 0.8]}>
          <sphereGeometry args={[0.3, 12, 12]} />
          <meshStandardMaterial color="#d9f2c4" />
        </mesh>
        {/* eyes */}
        {([
          [-0.16, eyeL],
          [0.16, eyeR],
        ] as const).map(([x, ref]) => (
          <group key={x} ref={ref} position={[x, 0.62, 0.14]}>
            <mesh castShadow>
              <sphereGeometry args={[0.11, 12, 12]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0, 0.015, 0.075]}>
              <sphereGeometry args={[0.05, 10, 10]} />
              <meshStandardMaterial color="#2d2a26" />
            </mesh>
          </group>
        ))}
        {/* front feet */}
        {[-0.2, 0.2].map((x) => (
          <mesh key={x} castShadow position={[x, 0.06, 0.24]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color="#6ab84f" />
          </mesh>
        ))}
      </group>
    </group>
  )
}

// ---------- Scene root ----------

export function Scene() {
  const rows = useGame((s) => s.rows)
  const frogRow = useGame((s) => s.frogRow)
  const seed = useGame((s) => s.seed)

  const lo = Math.max(0, frogRow - 6)
  const hi = Math.min(rows.length - 1, frogRow + 18)
  const visible: { row: Row; i: number }[] = []
  for (let i = lo; i <= hi; i++) visible.push({ row: rows[i], i })

  return (
    <>
      <color attach="background" args={['#bfe6ff']} />
      <fog attach="fog" args={['#bfe6ff', 14, 30]} />
      <ambientLight intensity={0.75} />
      <directionalLight
        castShadow
        position={[6, 12, -4]}
        intensity={1.4}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={20}
        shadow-camera-bottom={-8}
      />
      {/* base plane under everything */}
      <mesh position={[0, -0.25, frogRow * ROW_D]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#7cc46d" map={groundTexture()} roughness={0.95} />
      </mesh>

      {visible.map(({ row, i }) =>
        row.kind === 'grass' ? (
          <GrassRow key={`${seed}-${i}`} i={i} seed={seed} />
        ) : row.kind === 'road' ? (
          <RoadRow key={`${seed}-${i}`} i={i} hasRoadAhead={rows[i + 1]?.kind === 'road'} />
        ) : (
          <WaterRow key={`${seed}-${i}`} i={i} seed={seed} />
        ),
      )}
      {visible
        .filter(({ row }) => row.kind !== 'grass')
        .map(({ row, i }) => (
          <LaneTraffic key={`t-${seed}-${i}`} row={row} i={i} />
        ))}
      {visible
        .filter(({ row }) => row.kind === 'grass' && row.mowerDelay)
        .map(({ row, i }) => (
          <GrassMower key={`m-${seed}-${i}`} row={row} i={i} />
        ))}
      {visible
        .filter(({ row }) => row.kind === 'water' && (row.gatorCount ?? 0) > 0)
        .map(({ row, i }) => (
          <WaterGators key={`g-${seed}-${i}`} row={row} i={i} />
        ))}
      <Bursts />
      <Frog />
    </>
  )
}
