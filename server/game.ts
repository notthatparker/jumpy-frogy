import { createHash, randomBytes, randomInt } from 'node:crypto'
import {
  P_SURVIVE,
  STEP_MULT,
  clampBet,
  generateRows,
  resolveHazard,
  type DeathKind,
} from '../shared/casino.ts'
import {
  createPlayer,
  getActiveRound,
  getPlayerByToken,
  getRound,
  getSettings,
  recentRounds,
  refillPlayer,
  saveRound,
  updatePlayer,
  type Round,
} from './db.ts'

function sha256Hex(msg: string): string {
  return createHash('sha256').update(msg).digest('hex')
}

function newId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString('hex')}`
}

function publicRound(round: Round, revealSeed: boolean) {
  return {
    id: round.id,
    bet: round.bet,
    worldSeed: round.worldSeed,
    fairHash: round.fairHash,
    fairSeed: revealSeed ? round.fairSeed : null,
    status: round.status,
    frogRow: round.frogRow,
    maxRow: round.maxRow,
    multiplier: round.multiplier,
    lanesCleared: round.lanesCleared,
    deathKind: round.deathKind ?? null,
    payout: round.payout,
    createdAt: round.createdAt,
    settledAt: round.settledAt ?? null,
  }
}

export function sessionFromToken(token: string | undefined) {
  if (!token) {
    const id = newId('player')
    const newToken = randomBytes(24).toString('hex')
    const player = createPlayer(id, newToken)
    return { player, token: newToken, created: true }
  }
  const existing = getPlayerByToken(token)
  if (existing) return { player: existing, token, created: false }
  const id = newId('player')
  const newToken = randomBytes(24).toString('hex')
  const player = createPlayer(id, newToken)
  return { player, token: newToken, created: true }
}

export function startRound(token: string, betRaw: number) {
  const player = getPlayerByToken(token)
  if (!player) return { error: 'invalid_session', status: 401 as const }

  // A lingering active round (page reload, client-side death that never
  // settled) would block the player forever — forfeit it and move on.
  const active = getActiveRound(player.id)
  if (active) {
    active.status = 'dead'
    active.deathKind = active.deathKind ?? 'hit'
    active.payout = 0
    active.settledAt = new Date().toISOString()
    saveRound(active)
  }

  const settings = getSettings()
  if (!settings.bettingEnabled) return { error: 'betting_disabled', status: 403 as const }

  const bet = clampBet(betRaw, settings.minBet, settings.maxBet)
  if (bet > player.balance) return { error: 'insufficient_balance', status: 400 as const }

  player.balance = +(player.balance - bet).toFixed(2)
  updatePlayer(player)

  const fairSeed = randomInt(1, 2 ** 31)
  const worldSeed = randomInt(1, 2 ** 31)
  const now = new Date().toISOString()
  const round: Round = {
    id: newId('round'),
    playerId: player.id,
    bet,
    worldSeed,
    fairSeed,
    fairHash: sha256Hex(String(fairSeed)),
    status: 'active',
    frogRow: 0,
    maxRow: 0,
    multiplier: 1,
    lanesCleared: 0,
    rolled: {},
    payout: 0,
    createdAt: now,
    // Snapshot economics so live setting changes never touch a round in flight.
    stepMult: settings.stepMult,
    pSurvive: +(settings.rtp / settings.stepMult).toFixed(6),
    maxPayout: settings.maxPayout,
  }
  saveRound(round)

  return {
    player,
    round: publicRound(round, false),
    rows: generateRows(worldSeed),
  }
}

export function advanceRound(token: string, roundId: string, toRow: number) {
  const player = getPlayerByToken(token)
  if (!player) return { error: 'invalid_session', status: 401 as const }

  const round = getRound(roundId)
  if (!round || round.playerId !== player.id) return { error: 'round_not_found', status: 404 as const }
  if (round.status !== 'active') return { error: 'round_not_active', status: 409 as const, round: publicRound(round, true) }

  const target = Math.floor(toRow)
  if (!Number.isFinite(target) || target < 0) return { error: 'invalid_row', status: 400 as const }
  // Only allow hopping forward one row at a time (or same row for sideways).
  if (target > round.frogRow + 1) return { error: 'hop_too_far', status: 400 as const }
  if (target < round.frogRow) {
    // Allow stepping back without re-rolling already-cleared lanes.
    round.frogRow = target
    saveRound(round)
    return { player, round: publicRound(round, false), survived: true as const }
  }

  const rows = generateRows(round.worldSeed)
  if (target >= rows.length) return { error: 'out_of_bounds', status: 400 as const }

  let doom: { row: number; kind: DeathKind } | null = null
  let ding = false

  if (target > round.maxRow) {
    for (let r = round.maxRow + 1; r <= target; r++) {
      const kind = rows[r]?.kind
      if (!kind || kind === 'grass') continue
      if (round.rolled[String(r)] !== undefined) continue

      const result = resolveHazard(round.fairSeed, r, kind, round.pSurvive ?? P_SURVIVE)
      if (result.survive) {
        round.rolled[String(r)] = true
        round.multiplier = +(round.multiplier * (round.stepMult ?? STEP_MULT)).toFixed(4)
        round.lanesCleared++
        ding = true
      } else {
        round.rolled[String(r)] = false
        doom = { row: r, kind: result.deathKind! }
        break
      }
    }
    round.maxRow = doom ? doom.row : target
  }

  round.frogRow = target

  if (doom) {
    round.status = 'dead'
    round.deathKind = doom.kind
    round.payout = 0
    round.settledAt = new Date().toISOString()
    saveRound(round)
    return {
      player,
      round: publicRound(round, true),
      doom,
      ding,
      survived: false as const,
    }
  }

  // Auto-cash at end of world.
  if (target >= rows.length - 3) {
    return cashOutRound(token, roundId)
  }

  saveRound(round)
  return {
    player,
    round: publicRound(round, false),
    doom: null,
    ding,
    survived: true as const,
  }
}

export function cashOutRound(token: string, roundId: string) {
  const player = getPlayerByToken(token)
  if (!player) return { error: 'invalid_session', status: 401 as const }

  const round = getRound(roundId)
  if (!round || round.playerId !== player.id) return { error: 'round_not_found', status: 404 as const }
  if (round.status !== 'active') return { error: 'round_not_active', status: 409 as const, round: publicRound(round, true) }

  const cap = round.maxPayout && round.maxPayout > 0 ? round.maxPayout : Infinity
  const payout = +Math.min(round.bet * round.multiplier, cap).toFixed(2)
  round.status = 'cashed'
  round.payout = payout
  round.settledAt = new Date().toISOString()
  player.balance = +(player.balance + payout).toFixed(2)
  updatePlayer(player)
  saveRound(round)

  return {
    player,
    round: publicRound(round, true),
    payout,
  }
}

/** Client-side hazard (mower / alligator) — settle the round as a loss. */
export function forfeitRound(token: string, roundId: string, deathKind: DeathKind = 'hit') {
  const player = getPlayerByToken(token)
  if (!player) return { error: 'invalid_session', status: 401 as const }

  const round = getRound(roundId)
  if (!round || round.playerId !== player.id) return { error: 'round_not_found', status: 404 as const }
  if (round.status !== 'active') return { error: 'round_not_active', status: 409 as const, round: publicRound(round, true) }

  round.status = 'dead'
  round.deathKind = deathKind
  round.payout = 0
  round.settledAt = new Date().toISOString()
  saveRound(round)

  return {
    player,
    round: publicRound(round, true),
  }
}

export function historyFor(token: string) {
  const player = getPlayerByToken(token)
  if (!player) return { error: 'invalid_session', status: 401 as const }
  return {
    player,
    rounds: recentRounds(player.id).map((r) => publicRound(r, true)),
  }
}

export function refill(token: string) {
  const player = getPlayerByToken(token)
  if (!player) return { error: 'invalid_session', status: 401 as const }
  const active = getActiveRound(player.id)
  if (active) return { error: 'round_already_active', status: 409 as const }
  refillPlayer(player)
  return { player }
}

export function verifyFair(fairSeed: number, fairHash: string) {
  return sha256Hex(String(fairSeed)) === fairHash
}
