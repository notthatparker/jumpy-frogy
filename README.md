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

| Path | What |
|------|------|
| `/` | Game (casino + arcade) |
| `/admin` | Operator dashboard — live stats, RTP, bet limits, kill-switch |

## Share a live demo with a partner

Only a real deploy gives a link that works when your laptop is closed. The
game and the dashboard both need the Node server, so they must be hosted
together on one origin.

| Option | Laptop off? | Game | `/admin` | Stable URL |
|--------|-------------|------|----------|------------|
| **Render** (recommended) | yes | yes | yes | yes |
| GitHub Pages | yes | static build only, no backend | no | yes |
| Cloudflare quick tunnel | **no** | yes | yes | **no** |

Do not share a `trycloudflare.com` link. It proxies to `localhost`, so it dies
with your laptop, and the hostname is randomised on every restart — a stale one
fails with `NXDOMAIN`.

### Deploy to Render

1. Open: [Deploy to Render](https://render.com/deploy?repo=https://github.com/notthatparker/jumpy-frogy)
2. Sign in with GitHub → create the `jumpy-frogy` Blueprint service
3. Wait for the first build (~2–3 min)
4. Copy the service URL from the dashboard, then share `<url>/` and `<url>/admin`

Render appends a suffix when the name is taken, so the hostname is only known
once the service exists — read it off the dashboard rather than assuming it.

**Notes for the free plan**

- First visit after idle can take ~30s (cold start)
- Demo data lives on the instance disk and resets on redeploy — fine for demos
- `/admin` has no login yet — only share the URL with people you trust
- `buildCommand` must keep `--include=dev`: `NODE_ENV=production` makes a bare
  `npm ci` drop `vite` and `typescript`, and the build fails with `tsc: not found`

## Casino API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness |
| GET | `/api/config` | Live RTP, bet limits, kill-switch |
| POST | `/api/session` | Create / resume demo player |
| POST | `/api/round/start` | Debit bet, return `fairHash` + `worldSeed` |
| POST | `/api/round/advance` | Authoritative hop / lane roll |
| POST | `/api/round/cashout` | Pay win, reveal seed |
| POST | `/api/round/forfeit` | Settle client-side hazard death |
| GET | `/api/history` | Recent settled rounds |
| POST | `/api/demo/refill` | Refill demo balance |
| POST | `/api/fair/verify` | Check seed matches hash |
| GET | `/api/admin/stats` | Operator dashboard data |
| GET/PUT | `/api/admin/settings` | Operator economics (RTP, bets, etc.) |

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
