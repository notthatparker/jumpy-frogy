// World generation and shared math for lanes, traffic, and logs.

export const ROW_D = 1.15 // depth of one lane strip in world units
export const PLAY_HALF = 4 // playable x range is [-PLAY_HALF, PLAY_HALF]

/** Payout multiplier gained for each hazard lane safely crossed. */
export const STEP_MULT = 1.18
/** Target return-to-player for casino mode. */
export const RTP = 0.96
/** Per-hazard-lane survival probability in casino mode: p * mult = RTP. */
export const P_SURVIVE = RTP / STEP_MULT

export type RowKind = 'grass' | 'road' | 'water'

export interface Row {
  kind: RowKind
  dir: 1 | -1
  speed: number
  carLen: number
  period: number
  count: number
  offset: number
  span: number
}

export function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GRASS: Row = { kind: 'grass', dir: 1, speed: 0, carLen: 0, period: 0, count: 0, offset: 0, span: 0 }

export function generateRows(seed: number, count = 240): Row[] {
  const rnd = mulberry32(seed)
  const rows: Row[] = [GRASS, GRASS]

  const road = (i: number): Row => {
    const speed = 1.6 + rnd() * 1.6 + Math.min(2.4, i * 0.014)
    const carLen = 1.5 + rnd() * 0.8
    const gap = Math.max(1.8, 3.6 - i * 0.012 + rnd() * 1.4)
    const period = carLen + gap
    const n = Math.max(2, Math.round(20 / period))
    return {
      kind: 'road',
      dir: rnd() < 0.5 ? 1 : -1,
      speed,
      carLen,
      period,
      count: n,
      offset: rnd(),
      span: n * period,
    }
  }

  const water = (): Row => {
    const speed = 0.7 + rnd() * 0.9
    const carLen = 2.2 + rnd() * 1.1 // log length
    const gap = 1.5 + rnd() * 1.1
    const period = carLen + gap
    const n = Math.max(2, Math.round(20 / period))
    return {
      kind: 'water',
      dir: rnd() < 0.5 ? 1 : -1,
      speed,
      carLen,
      period,
      count: n,
      offset: rnd(),
      span: n * period,
    }
  }

  while (rows.length < count) {
    const useWater = rows.length > 8 && rnd() < 0.35
    if (useWater) {
      const run = 1 + (rnd() < 0.4 ? 1 : 0)
      for (let k = 0; k < run && rows.length < count; k++) rows.push(water())
    } else {
      const run = 1 + Math.floor(rnd() * 3)
      for (let k = 0; k < run && rows.length < count; k++) rows.push(road(rows.length))
    }
    rows.push(GRASS)
    if (rnd() < 0.3) rows.push(GRASS)
  }
  return rows
}

/** X position of car/log k in a lane at time t (they loop across the lane's span). */
export function carX(row: Row, k: number, t: number): number {
  const raw = (((row.offset * row.span + k * row.period + t * row.speed) % row.span) + row.span) % row.span
  const x = raw - row.span / 2
  return row.dir === 1 ? x : -x
}

/** Deterministic per-row decoration randomness, stable across frames. */
export function rowRng(seed: number, i: number) {
  return mulberry32((seed ^ (i * 2654435761)) | 0)
}
