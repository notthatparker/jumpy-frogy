# Jumpy Frogy

A cozy 3D lane-crossing casino mini-game with a pastel, rounded, village look.
Place a bet, hop across traffic and rivers — every hazard lane you survive
multiplies your payout (x1.18 per lane). Cash out before you get unlucky, or
lose the bet.

Demo credits only — no real money.

## Modes

- **Casino (default, RTP 96%)** — chance-based like crash games: each hazard
  lane's outcome is decided by a committed RNG seed (survival chance 81.36%
  per lane, so RTP = 0.8136 x 1.18 = 96%). The seed's SHA-256 hash is shown
  before the round and the seed is revealed after — provably fair. Cash out
  any time between hops.
- **Arcade (skill)** — real dodging: physical car collisions, land on logs to
  cross water, get carried by the current. Cash out only on grass.

## Stack

- Vite + React + TypeScript
- Three.js via @react-three/fiber and @react-three/drei
- zustand for game state

## Run

```bash
npm install
npm run dev
```

## Controls

- Space / Up / W / tap: hop forward
- Left / Right / A / D or swipe: steer sideways
- Down / S or swipe down: hop back

## Future ideas

- Server-driven rounds (move RNG + balance to a backend) for real casino integration
- Auto-cashout at a target multiplier
- Music, more biomes (night, snow), skins and cosmetics
