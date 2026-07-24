/** Shared casino math — used by both the client renderer and the authoritative server. */

export const STEP_MULT = 1.18
export const RTP = 0.96
export const P_SURVIVE = RTP / STEP_MULT

export const MIN_BET = 1
export const MAX_BET = 500
export const STARTING_BALANCE = 1000
export const ROW_COUNT = 240

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

export type DeathKind = 'hit' | 'drown'

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

export function generateRows(seed: number, count = ROW_COUNT): Row[] {
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
    const carLen = 2.2 + rnd() * 1.1
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

/** Deterministic per-lane survival roll from the committed fair seed. */
export function rollLane(fairSeed: number, row: number): number {
  return mulberry32((fairSeed ^ Math.imul(row, 2654435761)) | 0)()
}

export function resolveHazard(
  fairSeed: number,
  row: number,
  kind: RowKind,
): { survive: boolean; deathKind?: DeathKind } {
  if (kind === 'grass') return { survive: true }
  const survive = rollLane(fairSeed, row) < P_SURVIVE
  if (survive) return { survive: true }
  return { survive: false, deathKind: kind === 'water' ? 'drown' : 'hit' }
}

export function clampBet(bet: number): number {
  return Math.max(MIN_BET, Math.min(MAX_BET, Math.round(bet)))
}
