import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SETTINGS, type CasinoSettings } from '../shared/casino.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data')
const DB_PATH = join(DATA_DIR, 'casino.json')

export interface Player {
  id: string
  token: string
  balance: number
  createdAt: string
  updatedAt: string
}

export type RoundStatus = 'active' | 'cashed' | 'dead'

export interface Round {
  id: string
  playerId: string
  bet: number
  worldSeed: number
  fairSeed: number
  fairHash: string
  status: RoundStatus
  frogRow: number
  maxRow: number
  multiplier: number
  lanesCleared: number
  rolled: Record<string, boolean>
  deathKind?: 'hit' | 'drown'
  payout: number
  createdAt: string
  settledAt?: string
  /** Economics snapshotted at round start so live setting changes never
      alter a round already in flight. Absent on legacy rounds. */
  stepMult?: number
  pSurvive?: number
  maxPayout?: number
}

interface DbShape {
  players: Record<string, Player>
  rounds: Record<string, Round>
  history: string[] // recent round ids, newest first
  settings: CasinoSettings
}

function empty(): DbShape {
  return { players: {}, rounds: {}, history: [], settings: { ...DEFAULT_SETTINGS } }
}

function load(): DbShape {
  try {
    if (!existsSync(DB_PATH)) return empty()
    const parsed = JSON.parse(readFileSync(DB_PATH, 'utf8')) as Partial<DbShape>
    return {
      ...empty(),
      ...parsed,
      // New settings keys get defaults even on older data files.
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
    }
  } catch {
    return empty()
  }
}

let db = load()
let dirty = false
let flushTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave() {
  dirty = true
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    if (!dirty) return
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
    dirty = false
  }, 200)
}

export function saveNow() {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
  dirty = false
}

export function getPlayerByToken(token: string): Player | null {
  return Object.values(db.players).find((p) => p.token === token) ?? null
}

export function getSettings(): CasinoSettings {
  return { ...db.settings }
}

export function saveSettings(patch: Partial<CasinoSettings>): CasinoSettings {
  db.settings = { ...db.settings, ...patch }
  scheduleSave()
  return { ...db.settings }
}

export function createPlayer(id: string, token: string): Player {
  const now = new Date().toISOString()
  const player: Player = {
    id,
    token,
    balance: db.settings.startingBalance,
    createdAt: now,
    updatedAt: now,
  }
  db.players[id] = player
  scheduleSave()
  return player
}

export function updatePlayer(player: Player) {
  player.updatedAt = new Date().toISOString()
  db.players[player.id] = player
  scheduleSave()
}

export function getRound(id: string): Round | null {
  return db.rounds[id] ?? null
}

export function getActiveRound(playerId: string): Round | null {
  return (
    Object.values(db.rounds).find((r) => r.playerId === playerId && r.status === 'active') ?? null
  )
}

export function saveRound(round: Round) {
  db.rounds[round.id] = round
  if (round.status !== 'active') {
    db.history = [round.id, ...db.history.filter((id) => id !== round.id)].slice(0, 200)
  }
  scheduleSave()
}

export function recentRounds(playerId: string, limit = 20): Round[] {
  return db.history
    .map((id) => db.rounds[id])
    .filter((r): r is Round => !!r && r.playerId === playerId)
    .slice(0, limit)
}

/** Full data snapshot for the operator dashboard (demo scale — no pagination). */
export function adminData() {
  return {
    players: Object.values(db.players),
    rounds: Object.values(db.rounds),
  }
}

export function refillPlayer(player: Player) {
  player.balance = db.settings.startingBalance
  updatePlayer(player)
}
