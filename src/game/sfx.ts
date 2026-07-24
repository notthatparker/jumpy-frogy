// Tiny WebAudio synth for game feedback sounds. No assets needed.

let ctx: AudioContext | null = null

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo = 0) {
  try {
    const c = ac()
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, c.currentTime)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), c.currentTime + dur)
    g.gain.setValueAtTime(vol, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
    o.connect(g).connect(c.destination)
    o.start()
    o.stop(c.currentTime + dur)
  } catch {
    // Audio is a nice-to-have; never break the game over it.
  }
}

function noise(dur: number, vol: number, cutoff: number) {
  try {
    const c = ac()
    const len = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = c.createBufferSource()
    src.buffer = buf
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = cutoff
    const g = c.createGain()
    g.gain.value = vol
    src.connect(f).connect(g).connect(c.destination)
    src.start()
  } catch {
    // ignore
  }
}

export const sfx = {
  hop: () => tone(420, 0.12, 'square', 0.06, 680),
  splat: () => {
    noise(0.25, 0.35, 350)
    tone(150, 0.28, 'sawtooth', 0.12, 60)
  },
  splash: () => {
    noise(0.4, 0.3, 900)
    tone(300, 0.3, 'sine', 0.08, 90)
  },
  cash: () => {
    tone(523, 0.14, 'triangle', 0.14)
    setTimeout(() => tone(659, 0.14, 'triangle', 0.14), 100)
    setTimeout(() => tone(784, 0.24, 'triangle', 0.16), 200)
  },
  click: () => tone(600, 0.07, 'sine', 0.07),
  land: () => tone(190, 0.07, 'sine', 0.05, 120),
  ding: () => tone(880, 0.12, 'triangle', 0.09, 1240),
  horn: () => {
    tone(370, 0.2, 'sawtooth', 0.12)
    setTimeout(() => tone(311, 0.26, 'sawtooth', 0.12), 70)
    noise(0.5, 0.1, 700)
  },
}
