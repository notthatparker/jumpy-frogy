# Jumpy Frogy

A cozy 3D lane-crossing casino mini-game with a pastel, rounded, village look.
Place a bet, hop across traffic and rivers — every hazard lane you survive
multiplies your payout (×1.18 per lane). Cash out before you get unlucky, or
lose the bet.

Demo credits only — no real money.

## Modes

- **Casino (default, RTP 96%)** — **server-authoritative**. Balance, bets, RNG,
  and payouts live on the backend. Each round commits a SHA-256 hash of the
  outcome seed before play; the seed is revealed after settle (provably fair).
- **Arcade (skill)** — client-side dodging for fun. Not for real-money play.

## Run locally (API + game)

```bash
npm install
npm run dev
```

- Web: http://localhost:5173 (proxies `/api` → backend)
- API: http://localhost:8787

## Production (one shareable URL)

```bash
npm run build
npm start
```

Opens the API and serves the built frontend from the same origin on port 8787
(or `$PORT`).

## Casino API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness |
| GET | `/api/config` | RTP, bet limits |
| POST | `/api/session` | Create / resume demo player |
| POST | `/api/round/start` | Debit bet, return `fairHash` + `worldSeed` |
| POST | `/api/round/advance` | Authoritative hop / lane roll |
| POST | `/api/round/cashout` | Pay win, reveal seed |
| GET | `/api/history` | Recent settled rounds |
| POST | `/api/demo/refill` | Refill demo balance |
| POST | `/api/fair/verify` | Check seed matches hash |

Auth: `Authorization: Bearer <session-token>` (issued by `/api/session`).

## Controls

- Space / Up / W / tap: hop forward
- Left / Right / A / D or swipe: steer
- Down / S or swipe down: hop back

## What operators still need for real money

This backend is the **demo / integrator shape**. A licensed launch also needs:

- Certified RNG (e.g. GLI-19) instead of `crypto.randomInt`
- Real wallet / operator wallet adapter (not demo balance file)
- Jurisdictional bet limits & configurable RTP per market
- Aggregator integration (SoftSwiss / Slotegrator / etc.)
- KYC, responsible gaming, audit logs, and hosting in an approved DC
