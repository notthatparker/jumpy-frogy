import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import { useGame } from './store'
import { sfx } from './sfx'
import { ROW_D, PLAY_HALF, carX, rowRng, type Row } from './world'

const CAR_COLORS = ['#f28b82', '#aecbfa', '#fdd663', '#ccff90', '#d7aefb', '#ffb3c1', '#a7ffeb']
const TREE_GREENS = ['#7ecb6f', '#5fb85a', '#96d98a']

/** Frog world position, shared with non-React helpers like the doom car. */
const frogPos = { x: 0, z: 0 }

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
        <meshStandardMaterial color={i % 2 === 0 ? '#8fd47f' : '#84cc74'} />
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
              <meshStandardMaterial color="#a1795a" />
            </mesh>
            <mesh castShadow position={[0, 0.95, 0]}>
              <sphereGeometry args={[0.55, 12, 12]} />
              <meshStandardMaterial color={TREE_GREENS[(i + k) % TREE_GREENS.length]} />
            </mesh>
            <mesh castShadow position={[0.3, 0.75, 0.1]}>
              <sphereGeometry args={[0.35, 10, 10]} />
              <meshStandardMaterial color={TREE_GREENS[(i + k + 1) % TREE_GREENS.length]} />
            </mesh>
          </group>
        ) : (
          <mesh key={k} castShadow position={[d.x, 0.2, 0]} scale={[d.s, d.s * 0.7, d.s]}>
            <sphereGeometry args={[0.4, 10, 10]} />
            <meshStandardMaterial color={TREE_GREENS[(i + k) % TREE_GREENS.length]} />
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
        <meshStandardMaterial color="#a9b2bd" />
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

  return (
    <group position={[0, 0, i * ROW_D]}>
      <mesh receiveShadow position={[0, -0.14, 0]}>
        <boxGeometry args={[34, 0.2, ROW_D]} />
        <meshStandardMaterial color="#6fc7e8" />
      </mesh>
      {pads.map((x, k) => (
        <mesh key={k} position={[x, -0.02, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.05, 12]} />
          <meshStandardMaterial color="#79d071" />
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
      <meshStandardMaterial color="#a8795a" />
    </RoundedBox>
  )
}

function LaneTraffic({ row, i }: { row: Row; i: number }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const g = group.current
    if (!g) return
    const game = useGame.getState()
    const t = clock.elapsedTime
    // Casino mode: the lane you're standing on is already resolved safe, so
    // cars whimsically leap over the frog instead of hitting it.
    const overFrog =
      row.kind === 'road' && game.mode === 'casino' && game.phase === 'playing' && game.frogRow === i
    for (let k = 0; k < g.children.length; k++) {
      const item = g.children[k]
      const x = carX(row, k, t)
      item.position.x = x
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

// ---------- Doom car (casino mode losing roll) ----------

function DoomCar() {
  const doom = useGame((s) => s.doom)
  const ref = useRef<THREE.Group>(null)
  const anim = useRef<{ fromX: number; targetX: number; impacted: boolean } | null>(null)

  useEffect(() => {
    anim.current = null
  }, [doom])

  useFrame(() => {
    const g = ref.current
    if (!g) return
    if (!doom || doom.kind !== 'hit') {
      g.visible = false
      return
    }
    if (!anim.current) {
      anim.current = { fromX: frogPos.x >= 0 ? -14 : 14, targetX: frogPos.x, impacted: false }
    }
    const a = anim.current
    const now = performance.now() / 1000
    const dir = a.fromX < a.targetX ? 1 : -1
    const x = a.fromX + dir * 30 * (now - doom.at)
    g.visible = now - doom.at < 1.4
    g.position.set(x, 0, doom.row * ROW_D)
    g.rotation.y = dir === 1 ? 0 : Math.PI
    if (!a.impacted && (x - a.targetX) * dir >= -0.45) {
      a.impacted = true
      useGame.getState().die('hit')
    }
  })

  return (
    <group ref={ref} visible={false}>
      <Car len={2} color="#e2695e" />
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
    queue: null as { dx: number; dz: number } | null,
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
      // Casino hops wait for the server; don't stack inputs while a hop is in flight.
      if (game.mode === 'casino' && game.busy) return
      if (s.hop) {
        // Buffer one input so rapid taps feel responsive (arcade).
        if (game.mode === 'arcade') s.queue = { dx, dz }
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

        // Fire a buffered input, if any.
        if (s.queue && !s.dead) {
          const q = s.queue
          s.queue = null
          tryHopRef.current(q.dx, q.dz)
        }
      }
    } else if (!s.dead) {
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

    // Death animation: flatten for hits, sink with bubbles for drowning.
    if (s.dead) {
      if (game.deathKind === 'drown') {
        if (!s.drownFx) {
          s.drownFx = true
          spawnBurst(g.position.x, g.position.z, '#8fd3ef')
        }
        g.position.y = THREE.MathUtils.lerp(g.position.y, -0.65, 0.12)
      } else {
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
          <meshStandardMaterial color="#79c860" />
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
        <meshStandardMaterial color="#7cc46d" />
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
      <DoomCar />
      <Bursts />
      <Frog />
    </>
  )
}
