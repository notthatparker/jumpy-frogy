/** Thin client for the casino backend. */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || ''

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(typeof body === 'object' && body && 'error' in body ? String((body as { error: string }).error) : `api_${status}`)
    this.status = status
    this.body = body
  }
}

async function req<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  if (init.token) headers.set('authorization', `Bearer ${init.token}`)
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

export interface SessionRes {
  token: string
  created: boolean
  balance: number
  playerId: string
}

export interface RoundPublic {
  id: string
  bet: number
  worldSeed: number
  fairHash: string
  fairSeed: number | null
  status: 'active' | 'cashed' | 'dead'
  frogRow: number
  maxRow: number
  multiplier: number
  lanesCleared: number
  deathKind: 'hit' | 'drown' | null
  payout: number
}

export interface ConfigRes {
  rtp: number
  stepMult: number
  minBet: number
  maxBet: number
  maxPayout: number
  startingBalance: number
  bettingEnabled: boolean
}

export const api = {
  health: () => req<{ ok: boolean }>('/api/health'),
  config: () => req<ConfigRes>('/api/config'),
  session: (token?: string) =>
    req<SessionRes>('/api/session', { method: 'POST', token, body: JSON.stringify({ token }) }),
  start: (token: string, bet: number) =>
    req<{ balance: number; round: RoundPublic; worldSeed: number }>('/api/round/start', {
      method: 'POST',
      token,
      body: JSON.stringify({ bet }),
    }),
  advance: (token: string, roundId: string, toRow: number) =>
    req<{
      balance: number
      round: RoundPublic
      doom: { row: number; kind: 'hit' | 'drown' } | null
      ding: boolean
      survived: boolean
      payout?: number
    }>('/api/round/advance', {
      method: 'POST',
      token,
      body: JSON.stringify({ roundId, toRow }),
    }),
  cashout: (token: string, roundId: string) =>
    req<{ balance: number; round: RoundPublic; payout: number }>('/api/round/cashout', {
      method: 'POST',
      token,
      body: JSON.stringify({ roundId }),
    }),
  forfeit: (token: string, roundId: string, deathKind: 'hit' | 'drown') =>
    req<{ balance: number; round: RoundPublic }>('/api/round/forfeit', {
      method: 'POST',
      token,
      body: JSON.stringify({ roundId, deathKind }),
    }),
  refill: (token: string) =>
    req<{ balance: number; message: string }>('/api/demo/refill', {
      method: 'POST',
      token,
      body: '{}',
    }),
  history: (token: string) =>
    req<{ balance: number; rounds: RoundPublic[] }>('/api/history', { token }),
}
