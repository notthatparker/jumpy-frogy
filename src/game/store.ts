import { create } from 'zustand'
import { generateRows, mulberry32, P_SURVIVE, STEP_MULT, type Row } from './world'
import { sfx } from './sfx'

export { STEP_MULT }

export type Phase = 'idle' | 'playing' | 'dead' | 'cashed'
export type Mode = 'arcade' | 'casino'
export type DeathKind = 'hit' | 'drown'

export interface Doom {
  row: number
  kind: DeathKind
  at: number // performance.now() / 1000 at roll time
}

async function sha256Hex(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

interface GameState {
  balance: number
  bet: number
  phase: Phase
  mode: Mode
  multiplier: number
  roadsCrossed: number
  seed: number
  rows: Row[]
  frogRow: number
  maxRow: number
  message: string | null
  deathKind: DeathKind
  doom: Doom | null
  rolled: Record<number, boolean>
  fairSeed: number
  fairHash: string
  fairRevealed: boolean
  setBet: (b: number) => void
  setMode: (m: Mode) => void
  start: () => void
  advanceTo: (row: number) => void
  die: (kind?: DeathKind) => void
  cashOut: () => void
  resetBalance: () => void
}

export const useGame = create<GameState>((set, get) => ({
  balance: 1000,
  bet: 10,
  phase: 'idle',
  mode: 'casino',
  multiplier: 1,
  roadsCrossed: 0,
  seed: 1,
  rows: generateRows(1),
  frogRow: 0,
  maxRow: 0,
  message: null,
  deathKind: 'hit',
  doom: null,
  rolled: {},
  fairSeed: 0,
  fairHash: '',
  fairRevealed: false,

  setBet: (b) => set({ bet: Math.max(1, Math.min(500, Math.round(b))) }),

  setMode: (m) => {
    if (get().phase !== 'playing') set({ mode: m })
  },

  start: () => {
    const { balance, bet, phase } = get()
    if (phase === 'playing' || bet > balance) return
    const seed = (Math.random() * 2 ** 31) | 0
    const fairSeed = (Math.random() * 2 ** 31) | 0
    sfx.click()
    set({
      balance: +(balance - bet).toFixed(2),
      phase: 'playing',
      multiplier: 1,
      roadsCrossed: 0,
      seed,
      rows: generateRows(seed),
      frogRow: 0,
      maxRow: 0,
      message: null,
      doom: null,
      rolled: {},
      fairSeed,
      fairHash: '',
      fairRevealed: false,
    })
    // Commit to the outcome seed before the round is played.
    void sha256Hex(String(fairSeed)).then((h) => {
      if (get().fairSeed === fairSeed) set({ fairHash: h })
    })
  },

  advanceTo: (row) => {
    const s = get()
    if (s.phase !== 'playing' || s.doom) return
    let { maxRow, multiplier, roadsCrossed } = s
    let doom: Doom | null = s.doom
    const rolled = { ...s.rolled }

    if (row > maxRow) {
      for (let r = maxRow + 1; r <= row; r++) {
        const kind = s.rows[r]?.kind
        if (s.mode === 'casino') {
          // Chance-based: outcome of each hazard lane is decided by the
          // committed fair seed the moment you land on it.
          if (kind && kind !== 'grass' && rolled[r] === undefined) {
            const roll = mulberry32((s.fairSeed ^ Math.imul(r, 2654435761)) | 0)()
            if (roll < P_SURVIVE) {
              rolled[r] = true
              multiplier = +(multiplier * STEP_MULT).toFixed(4)
              roadsCrossed++
            } else {
              rolled[r] = false
              doom = { row: r, kind: kind === 'water' ? 'drown' : 'hit', at: performance.now() / 1000 }
            }
          }
        } else {
          // Skill-based: credit for each hazard lane you fully crossed
          // (the lane behind you once you land).
          const prev = s.rows[r - 1]
          if (prev && prev.kind !== 'grass') {
            multiplier = +(multiplier * STEP_MULT).toFixed(4)
            roadsCrossed++
          }
        }
      }
      maxRow = row
    }
    if (multiplier > s.multiplier) sfx.ding()
    if (doom && doom !== s.doom) sfx.horn()
    set({ frogRow: row, maxRow, multiplier, roadsCrossed, rolled, doom })
    if (!doom && row >= s.rows.length - 3) get().cashOut()
  },

  die: (kind = 'hit') => {
    const { bet, phase } = get()
    if (phase !== 'playing') return
    if (kind === 'drown') sfx.splash()
    else sfx.splat()
    set({
      phase: 'dead',
      deathKind: kind,
      fairRevealed: true,
      message: `${kind === 'drown' ? 'Splash!' : 'Splat!'} You lost ${bet.toFixed(2)} coins`,
    })
  },

  cashOut: () => {
    const { phase, rows, frogRow, balance, bet, multiplier, mode, doom } = get()
    if (phase !== 'playing' || doom) return
    // Arcade: must be standing on safe grass. Casino: the lane you're on is
    // already resolved, so you can cash out any time.
    if (mode === 'arcade' && rows[frogRow]?.kind !== 'grass') return
    const win = +(bet * multiplier).toFixed(2)
    sfx.cash()
    set({
      phase: 'cashed',
      balance: +(balance + win).toFixed(2),
      fairRevealed: true,
      message: `Cashed out +${win.toFixed(2)} coins (x${multiplier.toFixed(2)})`,
    })
  },

  resetBalance: () => set({ balance: 1000, message: 'Balance refilled (demo credits)' }),
}))

// Dev-only hook for debugging and automated testing.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__game = useGame
}
