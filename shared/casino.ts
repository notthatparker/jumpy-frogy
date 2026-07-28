/** Shared casino math — used by both the client renderer and the authoritative server. */

/** Operator-tunable economics. Defaults below; live values come from the server. */
export interface CasinoSettings {
  /** Target return-to-player, e.g. 0.96 = 96% (house edge 4%). */
  rtp: number
  /** Multiplier growth per hazard lane cleared. Survival odds derive from rtp/stepMult. */
  stepMult: number
  minBet: number
  maxBet: number
  /** Per-round payout cap (operator exposure limit). 0 = uncapped. */
  maxPayout: number
  /** Demo credits granted to new players and on refill. */
  startingBalance: number
  /** Kill-switch: refuse new rounds while off (maintenance / compliance). */
  bettingEnabled: boolean
}

export const DEFAULT_SETTINGS: CasinoSettings = {
  rtp: 0.96,
  stepMult: 1.18,
  minBet: 1,
  maxBet: 500,
  maxPayout: 10000,
  startingBalance: 1000,
  bettingEnabled: true,
}

export const STEP_MULT = DEFAULT_SETTINGS.stepMult
export const RTP = DEFAULT_SETTINGS.rtp
export const P_SURVIVE = RTP / STEP_MULT

export const MIN_BET = DEFAULT_SETTINGS.minBet
export const MAX_BET = DEFAULT_SETTINGS.maxBet
export const STARTING_BALANCE = DEFAULT_SETTINGS.startingBalance
export const ROW_COUNT = 240

/**
 * Traffic loops around within this many world units. It must be at least as
 * wide as the visible road strip (34) or cars visibly pop in and out of
 * existence mid-lane as they wrap. Lane counts round *up* to this so the wrap
 * point never lands back inside the strip.
 */
const LANE_SPAN = 34

/** Cars per lane, rounded up so `count * period >= LANE_SPAN`. */
function laneCount(period: number): number {
  return Math.max(2, Math.ceil(LANE_SPAN / period))
}

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
  /** Seconds after the frog lands before a mower sweeps (grass only). 0 = none. */
  mowerDelay?: number
  /** Ambush alligators lurking in water lanes (0 = safe lane). */
  gatorCount?: number
  gatorLen?: number
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

function grass(i: number, rnd: () => number): Row {
  // Starting strip stays safe; every later grass strip gets a timed mower.
  const hasMower = i > 1
  return {
    kind: 'grass',
    dir: rnd() < 0.5 ? 1 : -1,
    speed: hasMower ? 5.5 + rnd() * 2.5 : 0,
    carLen: hasMower ? 1.55 : 0,
    period: 0,
    count: hasMower ? 1 : 0,
    offset: rnd(),
    span: 0,
    mowerDelay: hasMower ? 1.3 + rnd() * 2.7 : 0,
  }
}

export function generateRows(seed: number, count = ROW_COUNT): Row[] {
  const rnd = mulberry32(seed)
  const rows: Row[] = [grass(0, rnd), grass(1, rnd)]

  const road = (i: number): Row => {
    const speed = 1.6 + rnd() * 1.6 + Math.min(2.4, i * 0.014)
    const carLen = 1.5 + rnd() * 0.8
    const gap = Math.max(1.8, 3.6 - i * 0.012 + rnd() * 1.4)
    const period = carLen + gap
    const n = laneCount(period)
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
    const n = laneCount(period)
    // Most water lanes hide an ambush gator; some are safe to linger on.
    const gatorCount = rnd() < 0.8 ? 1 : 0
    return {
      kind: 'water',
      dir: rnd() < 0.5 ? 1 : -1,
      speed,
      carLen,
      period,
      count: n,
      offset: rnd(),
      span: n * period,
      gatorCount,
      gatorLen: 1.15 + rnd() * 0.35,
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
    rows.push(grass(rows.length, rnd))
    if (rnd() < 0.3) rows.push(grass(rows.length, rnd))
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
  pSurvive: number = P_SURVIVE,
): { survive: boolean; deathKind?: DeathKind } {
  if (kind === 'grass') return { survive: true }
  const survive = rollLane(fairSeed, row) < pSurvive
  if (survive) return { survive: true }
  return { survive: false, deathKind: kind === 'water' ? 'drown' : 'hit' }
}

export function clampBet(bet: number, min: number = MIN_BET, max: number = MAX_BET): number {
  return Math.max(min, Math.min(max, Math.round(bet)))
}
