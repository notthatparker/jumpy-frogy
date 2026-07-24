import type { MouseEvent } from 'react'
import { useGame, STEP_MULT } from '../game/store'
import { RTP } from '../game/world'

const BET_PRESETS = [5, 10, 25, 50, 100]

/** Blur after click so Space (hop key) doesn't re-trigger the button. */
function blurring(fn: () => void) {
  return (e: MouseEvent<HTMLButtonElement>) => {
    fn()
    e.currentTarget.blur()
  }
}

export function HUD() {
  const balance = useGame((s) => s.balance)
  const bet = useGame((s) => s.bet)
  const phase = useGame((s) => s.phase)
  const mode = useGame((s) => s.mode)
  const multiplier = useGame((s) => s.multiplier)
  const roadsCrossed = useGame((s) => s.roadsCrossed)
  const rows = useGame((s) => s.rows)
  const frogRow = useGame((s) => s.frogRow)
  const doom = useGame((s) => s.doom)
  const message = useGame((s) => s.message)
  const fairHash = useGame((s) => s.fairHash)
  const fairSeed = useGame((s) => s.fairSeed)
  const fairRevealed = useGame((s) => s.fairRevealed)
  const setBet = useGame((s) => s.setBet)
  const setMode = useGame((s) => s.setMode)
  const start = useGame((s) => s.start)
  const cashOut = useGame((s) => s.cashOut)
  const resetBalance = useGame((s) => s.resetBalance)

  const onGrass = rows[frogRow]?.kind === 'grass'
  const win = bet * multiplier
  const canStart = bet <= balance
  const playing = phase === 'playing'
  const canCash = playing && !doom && (mode === 'casino' || onGrass)

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="pill">
          <span className="coin" />
          <span className="pill-value">{balance.toFixed(2)}</span>
        </div>

        <div className="mult-box">
          <div className="mult-now">x{multiplier.toFixed(2)}</div>
          <div className="mult-next">next lane x{(multiplier * STEP_MULT).toFixed(2)}</div>
        </div>

        <div className="pill">
          <span className="pill-label">lanes</span>
          <span className="pill-value">{roadsCrossed}</span>
        </div>
      </div>

      {message && <div className={`toast ${phase === 'dead' ? 'toast-bad' : 'toast-good'}`}>{message}</div>}

      <div className="hud-bottom">
        {!playing && (
          <div className="mode-row">
            <button className={`chip ${mode === 'casino' ? 'chip-on' : ''}`} onClick={blurring(() => setMode('casino'))}>
              Casino &middot; RTP {(RTP * 100).toFixed(0)}%
            </button>
            <button className={`chip ${mode === 'arcade' ? 'chip-on' : ''}`} onClick={blurring(() => setMode('arcade'))}>
              Arcade &middot; skill
            </button>
          </div>
        )}

        {!playing && (
          <div className="bet-row">
            <button className="bet-btn" onClick={blurring(() => setBet(bet - 5))}>-</button>
            <div className="bet-amount">
              <span className="pill-label">bet</span> {bet}
            </div>
            <button className="bet-btn" onClick={blurring(() => setBet(bet + 5))}>+</button>
            <div className="bet-presets">
              {BET_PRESETS.map((p) => (
                <button key={p} className={`chip ${bet === p ? 'chip-on' : ''}`} onClick={blurring(() => setBet(p))}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {playing ? (
          <button className="main-btn cashout" disabled={!canCash} onClick={blurring(cashOut)}>
            {canCash ? `CASH OUT +${win.toFixed(2)}` : doom ? '...' : 'REACH GRASS TO CASH OUT'}
          </button>
        ) : (
          <button className="main-btn start" disabled={!canStart} onClick={blurring(start)}>
            {phase === 'idle' ? `HOP IN (bet ${bet})` : `PLAY AGAIN (bet ${bet})`}
          </button>
        )}

        {!canStart && !playing && (
          <button className="refill" onClick={resetBalance}>
            Out of coins — refill demo balance
          </button>
        )}

        <div className="help">
          Space / tap: hop forward &middot; swipe or WASD: steer &middot; demo credits only
          {mode === 'casino' && fairHash && (
            <span className="fair">
              {' '}
              &middot; {fairRevealed ? `seed ${fairSeed}` : `fair hash ${fairHash.slice(0, 12)}…`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
