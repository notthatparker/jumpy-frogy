// Client-side world helpers. Casino math lives in shared/ so the server owns it too.
export {
  STEP_MULT,
  RTP,
  P_SURVIVE,
  generateRows,
  mulberry32,
  type Row,
  type RowKind,
  type DeathKind,
} from '../../shared/casino'

import { mulberry32, type Row } from '../../shared/casino'

export const ROW_D = 1.15
export const PLAY_HALF = 4

/** X position of car/log k in a lane at time t (they loop across the lane's span). */
export function carX(row: Row, k: number, t: number): number {
  const raw = (((row.offset * row.span + k * row.period + t * row.speed) % row.span) + row.span) % row.span
  const x = raw - row.span / 2
  return row.dir === 1 ? x : -x
}

/** Deterministic per-row decoration randomness, stable across frames. */
export function rowRng(seed: number, i: number) {
  return mulberry32((seed ^ (i * 2654435761)) | 0)
}
