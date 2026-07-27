/**
 * Procedural canvas textures — no image assets, no extra dependencies.
 *
 * Every map is drawn near-white with darker detail only, so it multiplies
 * against each material's existing `color` and preserves the pastel palette
 * instead of fighting it. The same canvas doubles as a bump map (three.js
 * reads luminance), which gets surface relief for free.
 */
import * as THREE from 'three'
import { mulberry32 } from './world'

/** Row strips are 34 wide x ROW_D deep; repeat is derived from a tile size. */
const ROW_W = 34
const ROW_DEPTH = 1.15

type DrawFn = (ctx: CanvasRenderingContext2D, rnd: () => number, size: number) => void

function lazy<T>(make: () => T): () => T {
  let cached: T | undefined
  return () => (cached === undefined ? (cached = make()) : cached)
}

/** Draw the same element 9x around the edges so the tile always seams cleanly. */
function wrapped(ctx: CanvasRenderingContext2D, size: number, draw: () => void) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      ctx.save()
      ctx.translate(dx, dy)
      draw()
      ctx.restore()
    }
  }
}

function makeTexture(
  size: number,
  seed: number,
  repeat: [number, number],
  draw: DrawFn,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)
  draw(ctx, mulberry32(seed), size)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat[0], repeat[1])
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/** Repeat counts that make one texture tile cover `tile` world units. */
function rowRepeat(tile: number): [number, number] {
  return [ROW_W / tile, ROW_DEPTH / tile]
}

const ink = (a: number) => `rgba(0,0,0,${a})`

// ---------- Ground ----------

/** Mown lawn: soft tonal patches plus thousands of short blade strokes. */
export const grassTexture = lazy(() =>
  makeTexture(256, 1337, rowRepeat(1.6), (ctx, rnd, size) => {
    for (let i = 0; i < 26; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 22 + rnd() * 52
      const shade = ink(0.05 + rnd() * 0.04)
      wrapped(ctx, size, () => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, shade)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    ctx.lineCap = 'round'
    for (let i = 0; i < 620; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const lean = (rnd() - 0.5) * 3
      const len = 3.5 + rnd() * 5.5
      ctx.strokeStyle = ink(0.05 + rnd() * 0.13)
      ctx.lineWidth = rnd() < 0.25 ? 1.6 : 1
      wrapped(ctx, size, () => {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + lean, y - len)
        ctx.stroke()
      })
    }
  }),
)

/** Asphalt: fine aggregate speckle, a few pebbles and hairline cracks. */
export const roadTexture = lazy(() =>
  makeTexture(256, 4242, rowRepeat(1.2), (ctx, rnd, size) => {
    for (let i = 0; i < 5200; i++) {
      ctx.fillStyle = ink(0.03 + rnd() * 0.1)
      const s = rnd() < 0.15 ? 2 : 1
      ctx.fillRect(rnd() * size, rnd() * size, s, s)
    }
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 1 + rnd() * 2.2
      ctx.fillStyle = ink(0.1 + rnd() * 0.1)
      wrapped(ctx, size, () => {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    // Hairline cracks wander but stay faint. Summed integer-frequency sines
    // keep the ends matching so the crack continues across the tile edge.
    for (let i = 0; i < 3; i++) {
      const y0 = rnd() * size
      const phase = rnd() * Math.PI * 2
      wrapped(ctx, size, () => {
        ctx.strokeStyle = ink(0.08)
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x <= size; x += 8) {
          const u = (x / size) * Math.PI * 2
          const y = y0 + Math.sin(u + phase) * 6 + Math.sin(u * 3 + phase * 2) * 2.5
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      })
    }
  }),
)

/**
 * Water caustics: wavy bands at integer frequencies so the tile wraps, giving
 * a shimmer once the offset is animated.
 */
export const waterTexture = lazy(() =>
  makeTexture(256, 909, rowRepeat(3), (ctx, rnd, size) => {
    ctx.lineCap = 'round'
    for (let i = 0; i < 30; i++) {
      const y0 = rnd() * size
      const freq = 1 + Math.floor(rnd() * 3) // integer -> seamless across x
      const amp = 4 + rnd() * 12
      const alpha = ink(0.04 + rnd() * 0.07)
      const width = 2 + rnd() * 6
      wrapped(ctx, size, () => {
        ctx.strokeStyle = alpha
        ctx.lineWidth = width
        ctx.beginPath()
        for (let x = 0; x <= size; x += 4) {
          const y = y0 + Math.sin((x / size) * Math.PI * 2 * freq + i) * amp
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      })
    }
    for (let i = 0; i < 18; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 14 + rnd() * 30
      wrapped(ctx, size, () => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, ink(0.05))
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })
    }
  }),
)

// ---------- Props and creatures ----------

/** Bark: lengthwise striations with a couple of knots. */
export const barkTexture = lazy(() =>
  makeTexture(256, 77, [3, 1], (ctx, rnd, size) => {
    for (let i = 0; i < 70; i++) {
      const y0 = rnd() * size
      const freq = 1 + Math.floor(rnd() * 2)
      const amp = 1.5 + rnd() * 2
      const alpha = ink(0.05 + rnd() * 0.15)
      const width = 1 + rnd() * 3
      wrapped(ctx, size, () => {
        ctx.strokeStyle = alpha
        ctx.lineWidth = width
        ctx.beginPath()
        for (let x = 0; x <= size; x += 6) {
          const y = y0 + Math.sin((x / size) * Math.PI * 2 * freq + i) * amp
          if (x === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
      })
    }
    for (let i = 0; i < 3; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const rx = 5 + rnd() * 4
      const ry = 3 + rnd() * 3
      wrapped(ctx, size, () => {
        ctx.strokeStyle = ink(0.16)
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
        ctx.stroke()
      })
    }
  }),
)

/** Frog hide: soft mottled blotches and fine speckles. */
export const frogSkinTexture = lazy(() =>
  makeTexture(128, 5150, [2, 1], (ctx, rnd, size) => {
    for (let i = 0; i < 14; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 8 + rnd() * 16
      wrapped(ctx, size, () => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, ink(0.1))
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    for (let i = 0; i < 150; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 0.8 + rnd() * 2
      ctx.fillStyle = ink(0.06 + rnd() * 0.1)
      wrapped(ctx, size, () => {
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })
    }
  }),
)

/** Canopy: clustered leaf dabs so tree blobs read as foliage, not plastic. */
export const foliageTexture = lazy(() =>
  makeTexture(128, 2468, [3, 2], (ctx, rnd, size) => {
    for (let i = 0; i < 260; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 2 + rnd() * 4.5
      const rot = rnd() * Math.PI
      ctx.fillStyle = ink(0.05 + rnd() * 0.12)
      wrapped(ctx, size, () => {
        ctx.beginPath()
        ctx.ellipse(x, y, r, r * 0.55, rot, 0, Math.PI * 2)
        ctx.fill()
      })
    }
    // A few deeper gaps read as shadow between leaf clusters.
    for (let i = 0; i < 20; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const r = 5 + rnd() * 11
      wrapped(ctx, size, () => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, ink(0.14))
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
      })
    }
  }),
)

/** Gator hide: overlapping scale scallops in offset rows, plus grit. */
export const gatorSkinTexture = lazy(() =>
  makeTexture(256, 8080, [4, 2], (ctx, rnd, size) => {
    const rows = 12
    const cols = 13
    const stepY = size / rows
    const stepX = size / cols
    ctx.lineWidth = 1.4
    for (let r = 0; r < rows; r++) {
      const y = r * stepY
      const shift = r % 2 === 0 ? 0 : stepX / 2
      for (let c = 0; c < cols; c++) {
        const x = c * stepX + shift
        ctx.strokeStyle = ink(0.12 + rnd() * 0.1)
        wrapped(ctx, size, () => {
          ctx.beginPath()
          ctx.arc(x, y, stepX * 0.52, Math.PI * 0.12, Math.PI * 0.88)
          ctx.stroke()
        })
      }
    }
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = ink(0.04 + rnd() * 0.08)
      ctx.fillRect(rnd() * size, rnd() * size, 1, 1)
    }
  }),
)

/** Painted sheet metal: faint brushed lines and a few scuffs. */
export const paintedMetalTexture = lazy(() =>
  makeTexture(128, 6161, [2, 1], (ctx, rnd, size) => {
    for (let i = 0; i < 90; i++) {
      const y = rnd() * size
      ctx.strokeStyle = ink(0.02 + rnd() * 0.05)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
      ctx.stroke()
    }
    for (let i = 0; i < 16; i++) {
      const x = rnd() * size
      const y = rnd() * size
      const len = 4 + rnd() * 12
      const tilt = (rnd() - 0.5) * 4
      ctx.strokeStyle = ink(0.09 + rnd() * 0.08)
      ctx.lineWidth = 1 + rnd()
      wrapped(ctx, size, () => {
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + len, y + tilt)
        ctx.stroke()
      })
    }
  }),
)

/**
 * Independent copy of a shared texture — clones share the GPU upload but get
 * their own offset, so each water lane can drift on its own.
 */
export function drift(source: THREE.Texture): THREE.Texture {
  const tex = source.clone()
  tex.needsUpdate = true
  return tex
}

/** Same image at a different UV scale, for surfaces that aren't row strips. */
export function withRepeat(source: THREE.Texture, x: number, y: number): THREE.Texture {
  const tex = drift(source)
  tex.repeat.set(x, y)
  return tex
}

/** Ground plane behind the lanes needs a much coarser tiling than a strip. */
export const groundTexture = lazy(() => withRepeat(grassTexture(), 46, 46))
