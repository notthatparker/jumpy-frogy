import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import { type CasinoSettings } from '../shared/casino.ts'
import { adminData, getSettings, saveNow, saveSettings } from './db.ts'
import {
  advanceRound,
  cashOutRound,
  forfeitRound,
  historyFor,
  refill,
  sessionFromToken,
  startRound,
  verifyFair,
} from './game.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 8787)
const DIST = join(__dirname, '..', 'dist')

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '32kb' }))

function tokenOf(req: express.Request): string | undefined {
  const h = req.header('authorization')
  if (h?.startsWith('Bearer ')) return h.slice(7)
  const body = req.body as { token?: string } | undefined
  return body?.token || (req.query.token as string | undefined)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'jumpy-frogy-casino', rtp: getSettings().rtp })
})

app.get('/api/config', (_req, res) => {
  const s = getSettings()
  res.json({
    rtp: s.rtp,
    stepMult: s.stepMult,
    minBet: s.minBet,
    maxBet: s.maxBet,
    maxPayout: s.maxPayout,
    startingBalance: s.startingBalance,
    bettingEnabled: s.bettingEnabled,
    modes: {
      casino: 'Server-authoritative chance game. Provably fair. Suitable for operator demos.',
      arcade: 'Client-side skill mode. Not for real-money play.',
    },
  })
})

app.post('/api/session', (req, res) => {
  const { player, token, created } = sessionFromToken(tokenOf(req))
  res.json({
    token,
    created,
    balance: player.balance,
    playerId: player.id,
  })
})

app.post('/api/round/start', (req, res) => {
  const token = tokenOf(req)
  if (!token) return res.status(401).json({ error: 'missing_token' })
  const bet = Number(req.body?.bet ?? 10)
  const result = startRound(token, bet)
  if ('error' in result) return res.status(result.status).json(result)
  res.json({
    balance: result.player.balance,
    round: result.round,
    // World layout is public (visual only). Outcomes come from fairSeed, not worldSeed.
    worldSeed: result.round.worldSeed,
  })
})

app.post('/api/round/advance', (req, res) => {
  const token = tokenOf(req)
  if (!token) return res.status(401).json({ error: 'missing_token' })
  const roundId = String(req.body?.roundId || '')
  const toRow = Number(req.body?.toRow)
  const result = advanceRound(token, roundId, toRow)
  if ('error' in result) return res.status(result.status).json(result)
  res.json({
    balance: result.player.balance,
    round: result.round,
    doom: 'doom' in result ? result.doom : null,
    ding: 'ding' in result ? result.ding : false,
    survived: 'survived' in result ? result.survived : true,
    payout: 'payout' in result ? result.payout : undefined,
  })
})

app.post('/api/round/cashout', (req, res) => {
  const token = tokenOf(req)
  if (!token) return res.status(401).json({ error: 'missing_token' })
  const roundId = String(req.body?.roundId || '')
  const result = cashOutRound(token, roundId)
  if ('error' in result) return res.status(result.status).json(result)
  res.json({
    balance: result.player.balance,
    round: result.round,
    payout: result.payout,
  })
})

app.post('/api/round/forfeit', (req, res) => {
  const token = tokenOf(req)
  if (!token) return res.status(401).json({ error: 'missing_token' })
  const roundId = String(req.body?.roundId || '')
  const deathKind = req.body?.deathKind === 'drown' ? 'drown' : 'hit'
  const result = forfeitRound(token, roundId, deathKind)
  if ('error' in result) return res.status(result.status).json(result)
  res.json({
    balance: result.player.balance,
    round: result.round,
  })
})

app.get('/api/history', (req, res) => {
  const token = tokenOf(req)
  if (!token) return res.status(401).json({ error: 'missing_token' })
  const result = historyFor(token)
  if ('error' in result) return res.status(result.status).json(result)
  res.json({ balance: result.player.balance, rounds: result.rounds })
})

app.post('/api/demo/refill', (req, res) => {
  const token = tokenOf(req)
  if (!token) return res.status(401).json({ error: 'missing_token' })
  const result = refill(token)
  if ('error' in result) return res.status(result.status).json(result)
  res.json({ balance: result.player.balance, message: 'Balance refilled (demo credits)' })
})

// ---------- Operator dashboard (demo — no auth) ----------

app.get('/api/admin/settings', (_req, res) => {
  res.json({ settings: getSettings() })
})

app.put('/api/admin/settings', (req, res) => {
  const b = (req.body ?? {}) as Partial<CasinoSettings>
  const cur = getSettings()
  const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback)

  const next: CasinoSettings = {
    rtp: num(b.rtp, cur.rtp),
    stepMult: num(b.stepMult, cur.stepMult),
    minBet: Math.round(num(b.minBet, cur.minBet)),
    maxBet: Math.round(num(b.maxBet, cur.maxBet)),
    maxPayout: Math.round(num(b.maxPayout, cur.maxPayout)),
    startingBalance: Math.round(num(b.startingBalance, cur.startingBalance)),
    bettingEnabled: typeof b.bettingEnabled === 'boolean' ? b.bettingEnabled : cur.bettingEnabled,
  }

  const errors: string[] = []
  if (next.rtp < 0.5 || next.rtp > 0.99) errors.push('rtp must be between 0.50 and 0.99')
  if (next.stepMult < 1.01 || next.stepMult > 3) errors.push('stepMult must be between 1.01 and 3.00')
  if (next.rtp / next.stepMult >= 1) errors.push('rtp must be lower than stepMult (survival odds must be < 100%)')
  if (next.minBet < 1) errors.push('minBet must be at least 1')
  if (next.maxBet < next.minBet || next.maxBet > 1_000_000) errors.push('maxBet must be between minBet and 1,000,000')
  if (next.maxPayout !== 0 && next.maxPayout < next.maxBet) errors.push('maxPayout must be 0 (uncapped) or at least maxBet')
  if (next.startingBalance < 1 || next.startingBalance > 1_000_000) errors.push('startingBalance must be between 1 and 1,000,000')
  if (errors.length) return res.status(400).json({ error: 'invalid_settings', details: errors })

  const saved = saveSettings(next)
  res.json({ settings: saved, pSurvive: +(saved.rtp / saved.stepMult).toFixed(4) })
})

app.get('/api/admin/stats', (_req, res) => {
  const { players, rounds } = adminData()
  const settled = rounds
    .filter((r) => r.status !== 'active')
    .sort((a, b) => (b.settledAt || '').localeCompare(a.settledAt || ''))
  const active = rounds.filter((r) => r.status === 'active')

  const wagered = settled.reduce((s, r) => s + r.bet, 0)
  const paidOut = settled.reduce((s, r) => s + r.payout, 0)
  const cashed = settled.filter((r) => r.status === 'cashed')
  const deaths = settled.filter((r) => r.status === 'dead')
  const biggest = cashed.reduce((best, r) => (r.payout > (best?.payout ?? 0) ? r : best), null as (typeof cashed)[number] | null)

  const s = getSettings()
  res.json({
    now: new Date().toISOString(),
    config: {
      rtpTarget: s.rtp,
      stepMult: s.stepMult,
      minBet: s.minBet,
      maxBet: s.maxBet,
      maxPayout: s.maxPayout,
      startingBalance: s.startingBalance,
      bettingEnabled: s.bettingEnabled,
    },
    totals: {
      players: players.length,
      playerBalance: +players.reduce((s, p) => s + p.balance, 0).toFixed(2),
      roundsSettled: settled.length,
      roundsActive: active.length,
      wagered: +wagered.toFixed(2),
      paidOut: +paidOut.toFixed(2),
      houseProfit: +(wagered - paidOut).toFixed(2),
      realizedRtp: wagered > 0 ? +(paidOut / wagered).toFixed(4) : null,
      winRate: settled.length > 0 ? +(cashed.length / settled.length).toFixed(4) : null,
      avgCashoutMult: cashed.length > 0 ? +(cashed.reduce((s, r) => s + r.multiplier, 0) / cashed.length).toFixed(3) : null,
      biggestWin: biggest ? { payout: biggest.payout, multiplier: biggest.multiplier, bet: biggest.bet } : null,
      deathsByKind: {
        hit: deaths.filter((r) => r.deathKind !== 'drown').length,
        drown: deaths.filter((r) => r.deathKind === 'drown').length,
      },
    },
    // Oldest-first net results for the chart.
    chart: settled
      .slice(0, 60)
      .reverse()
      .map((r) => ({ bet: r.bet, net: +(r.payout - r.bet).toFixed(2), status: r.status })),
    recent: settled.slice(0, 25).map((r) => ({
      id: r.id.slice(-6),
      player: r.playerId.slice(-6),
      bet: r.bet,
      status: r.status,
      deathKind: r.deathKind ?? null,
      multiplier: r.multiplier,
      lanesCleared: r.lanesCleared,
      payout: r.payout,
      settledAt: r.settledAt ?? null,
      fairHash: r.fairHash.slice(0, 10),
    })),
  })
})

app.get('/admin', (_req, res) => {
  res.sendFile(join(__dirname, 'admin.html'))
})

app.post('/api/fair/verify', (req, res) => {
  const fairSeed = Number(req.body?.fairSeed)
  const fairHash = String(req.body?.fairHash || '')
  if (!Number.isFinite(fairSeed) || !fairHash) return res.status(400).json({ error: 'bad_request' })
  res.json({ ok: verifyFair(fairSeed, fairHash) })
})

// Production: serve the Vite build from the same origin (one shareable URL).
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(DIST, 'index.html'))
  })
}

const server = createServer(app)
server.listen(PORT, () => {
  console.log(`Jumpy Frogy casino API on http://localhost:${PORT}`)
  if (existsSync(DIST)) console.log(`Serving frontend from ${DIST}`)
})

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    saveNow()
    server.close(() => process.exit(0))
  })
}
