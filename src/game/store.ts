import { create } from 'zustand'
import { generateRows, STEP_MULT, type DeathKind, type Row } from './world'
import { sfx } from './sfx'
import { api, ApiError } from './api'

export { STEP_MULT }

export type Phase = 'idle' | 'playing' | 'dead' | 'cashed'
export type Mode = 'arcade' | 'casino'

export interface Doom {
  row: number
  kind: DeathKind
  at: number
}

const TOKEN_KEY = 'jf_session_token'

/** Live operator settings; defaults match the server until boot fetches them. */
export interface LiveConfig {
  rtp: number
  stepMult: number
  minBet: number
  maxBet: number
  bettingEnabled: boolean
}

interface GameState {
  config: LiveConfig
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
  token: string | null
  roundId: string | null
  backend: 'online' | 'offline' | 'connecting'
  busy: boolean
  setBet: (b: number) => void
  setMode: (m: Mode) => void
  boot: () => Promise<void>
  start: () => void
  advanceTo: (row: number) => void
  die: (kind?: DeathKind) => void
  cashOut: () => void
  resetBalance: () => void
}

function errMsg(err: unknown, fallback: string) {
  if (err instanceof ApiError) return String((err.body as { error?: string })?.error || err.message)
  return fallback
}

function applyServerRound(
  set: (p: Partial<GameState>) => void,
  get: () => GameState,
  data: {
    balance: number
    round: {
      id: string
      worldSeed: number
      fairHash: string
      fairSeed: number | null
      status: string
      frogRow: number
      maxRow: number
      multiplier: number
      lanesCleared: number
      deathKind: DeathKind | null
      payout: number
    }
    doom?: { row: number; kind: DeathKind } | null
    ding?: boolean
  },
) {
  const r = data.round
  const prev = get()
  if (data.ding && r.multiplier > prev.multiplier) sfx.ding()

  const patch: Partial<GameState> = {
    balance: data.balance,
    roundId: r.id,
    seed: r.worldSeed,
    rows: r.worldSeed === prev.seed ? prev.rows : generateRows(r.worldSeed),
    frogRow: r.frogRow,
    maxRow: r.maxRow,
    multiplier: r.multiplier,
    roadsCrossed: r.lanesCleared,
    fairHash: r.fairHash,
    fairSeed: r.fairSeed ?? prev.fairSeed,
    fairRevealed: r.fairSeed != null,
  }

  if (data.doom) {
    patch.doom = { row: data.doom.row, kind: data.doom.kind, at: performance.now() / 1000 }
  }

  if (r.status === 'cashed') {
    sfx.cash()
    patch.phase = 'cashed'
    patch.message = `Cashed out +${r.payout.toFixed(2)} coins (x${r.multiplier.toFixed(2)})`
    patch.doom = null
  } else if (r.status === 'dead') {
    // Keep playing until the doom animation calls die().
    patch.phase = 'playing'
  } else {
    patch.phase = 'playing'
  }

  set(patch)
}

export const useGame = create<GameState>((set, get) => ({
  config: { rtp: 0.96, stepMult: STEP_MULT, minBet: 1, maxBet: 500, bettingEnabled: true },
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
  token: typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null,
  roundId: null,
  backend: 'connecting',
  busy: false,

  setBet: (b) => {
    const c = get().config
    set({ bet: Math.max(c.minBet, Math.min(c.maxBet, Math.round(b))) })
  },

  setMode: (m) => {
    if (get().phase !== 'playing') set({ mode: m })
  },

  boot: async () => {
    set({ backend: 'connecting' })
    let lastErr: unknown
    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        const session = await api.session(get().token || undefined)
        localStorage.setItem(TOKEN_KEY, session.token)
        set({
          token: session.token,
          balance: session.balance,
          backend: 'online',
          message: null,
        })
        // Pull live operator settings (bet limits, multiplier growth).
        void api.config().then((c) => {
          set({
            config: {
              rtp: c.rtp,
              stepMult: c.stepMult,
              minBet: c.minBet,
              maxBet: c.maxBet,
              bettingEnabled: c.bettingEnabled,
            },
            bet: Math.max(c.minBet, Math.min(c.maxBet, get().bet)),
          })
        }).catch(() => {})
        return
      } catch (err) {
        lastErr = err
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)))
      }
    }
    console.warn('casino boot failed', lastErr)
    set({
      backend: 'offline',
      message: 'Casino server offline — use Arcade, or run npm run dev',
    })
  },

  start: () => {
    const s = get()
    if (s.phase === 'playing' || s.busy || s.bet > s.balance) return

    if (s.mode === 'casino') {
      if (s.backend !== 'online' || !s.token) {
        set({ message: 'Casino server offline — start with npm run dev, or switch to Arcade' })
        return
      }
      set({ busy: true, message: null })
      sfx.click()
      void api
        .start(s.token, s.bet)
        .then((res) => {
          applyServerRound(set, get, res)
          set({ busy: false, doom: null, rolled: {}, deathKind: 'hit', message: null, phase: 'playing' })
        })
        .catch((err: unknown) => {
          set({ busy: false, message: `Could not start round: ${errMsg(err, 'start_failed')}` })
        })
      return
    }

    const seed = (Math.random() * 2 ** 31) | 0
    sfx.click()
    set({
      balance: +(s.balance - s.bet).toFixed(2),
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
      fairSeed: 0,
      fairHash: '',
      fairRevealed: false,
      roundId: null,
    })
  },

  advanceTo: (row) => {
    const s = get()
    if (s.phase !== 'playing' || s.doom || s.busy) return

    if (s.mode === 'casino' && s.token && s.roundId) {
      set({ busy: true })
      void api
        .advance(s.token, s.roundId, row)
        .then((res) => {
          applyServerRound(set, get, res)
          set({ busy: false })
        })
        .catch((err: unknown) => {
          set({ busy: false, message: `Server rejected hop: ${errMsg(err, 'advance_failed')}` })
        })
      return
    }

    let { maxRow, multiplier, roadsCrossed } = s
    if (row > maxRow) {
      for (let r = maxRow + 1; r <= row; r++) {
        const prev = s.rows[r - 1]
        if (prev && prev.kind !== 'grass') {
          multiplier = +(multiplier * s.config.stepMult).toFixed(4)
          roadsCrossed++
        }
      }
      maxRow = row
    }
    if (multiplier > s.multiplier) sfx.ding()
    set({ frogRow: row, maxRow, multiplier, roadsCrossed })
    if (row >= s.rows.length - 3) get().cashOut()
  },

  die: (kind = 'hit') => {
    const s = get()
    if (s.phase === 'dead' || s.phase === 'cashed') return
    if (kind === 'drown') sfx.splash()
    else sfx.splat()
    set({
      phase: 'dead',
      deathKind: kind,
      fairRevealed: s.mode === 'casino' ? true : s.fairRevealed,
      message: `${kind === 'drown' ? 'Chomp!' : 'Splat!'} You lost ${s.bet.toFixed(2)} coins`,
      busy: false,
    })
    // Settle server round so the next bet isn't blocked by an active round.
    if (s.mode === 'casino' && s.token && s.roundId) {
      void api
        .forfeit(s.token, s.roundId, kind)
        .then((res) => {
          set({
            balance: res.balance,
            fairSeed: res.round.fairSeed ?? get().fairSeed,
            fairHash: res.round.fairHash,
            fairRevealed: true,
            roundId: null,
          })
        })
        .catch(() => {
          // Server already settled it (doom roll) — just release the round.
          set({ roundId: null })
        })
    }
  },

  cashOut: () => {
    const s = get()
    if (s.phase !== 'playing' || s.doom || s.busy) return

    if (s.mode === 'casino' && s.token && s.roundId) {
      set({ busy: true })
      void api
        .cashout(s.token, s.roundId)
        .then((res) => {
          applyServerRound(set, get, res)
          set({ busy: false })
        })
        .catch((err: unknown) => {
          set({ busy: false, message: `Cash out failed: ${errMsg(err, 'cashout_failed')}` })
        })
      return
    }

    if (s.rows[s.frogRow]?.kind !== 'grass') return
    const win = +(s.bet * s.multiplier).toFixed(2)
    sfx.cash()
    set({
      phase: 'cashed',
      balance: +(s.balance + win).toFixed(2),
      fairRevealed: true,
      message: `Cashed out +${win.toFixed(2)} coins (x${s.multiplier.toFixed(2)})`,
    })
  },

  resetBalance: () => {
    const s = get()
    if (s.mode === 'casino' && s.backend === 'online' && s.token) {
      void api
        .refill(s.token)
        .then((res) => set({ balance: res.balance, message: res.message }))
        .catch(() => set({ message: 'Refill failed' }))
      return
    }
    set({ balance: 1000, message: 'Balance refilled (demo credits)' })
  },
}))

if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__game = useGame
}
