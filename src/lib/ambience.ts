/**
 * Soft ambient sounds, synthesised live with the Web Audio API — no audio files are
 * downloaded, and nothing plays until you press a button.
 */
export type SoundId = 'rain' | 'fire' | 'ocean' | 'night' | 'cafe'

export const SOUNDS: { id: SoundId; label: string; emoji: string }[] = [
  { id: 'rain', label: 'Rain', emoji: '🌧️' },
  { id: 'fire', label: 'Fireplace', emoji: '🔥' },
  { id: 'ocean', label: 'Ocean', emoji: '🌊' },
  { id: 'night', label: 'Night', emoji: '🌙' },
  { id: 'cafe', label: 'Café', emoji: '☕' },
]

function noiseBuffer(ctx: AudioContext, kind: 'white' | 'pink' | 'brown', seconds = 4): AudioBuffer {
  const len = ctx.sampleRate * seconds
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (kind === 'white') d[i] = w * 0.5
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      }
    }
  }
  return buf
}

function loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  src.start()
  return src
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, Q = 0.7): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = Q
  return f
}

function lfo(ctx: AudioContext, rate: number, depth: number, target: AudioParam) {
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.frequency.value = rate
  g.gain.value = depth
  osc.connect(g).connect(target)
  osc.start()
  return osc
}

type Stop = () => void

/** Short random events (crackles, drips, cup clinks, crickets) scheduled on a timer. */
function sprinkle(ctx: AudioContext, everyMs: [number, number], fire: (t: number) => void): Stop {
  let timer: ReturnType<typeof setTimeout>
  const tick = () => {
    fire(ctx.currentTime + 0.05)
    timer = setTimeout(tick, everyMs[0] + Math.random() * (everyMs[1] - everyMs[0]))
  }
  timer = setTimeout(tick, everyMs[0])
  return () => clearTimeout(timer)
}

function blip(ctx: AudioContext, out: AudioNode, t: number, freq: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(vol, t + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(out)
  o.start(t)
  o.stop(t + dur + 0.05)
}

function burst(ctx: AudioContext, out: AudioNode, noise: AudioBuffer, t: number, dur: number, vol: number, hp: number) {
  const src = ctx.createBufferSource()
  src.buffer = noise
  const f = filter(ctx, 'highpass', hp)
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(out)
  src.start(t, Math.random() * 2)
  src.stop(t + dur + 0.05)
}

function build(ctx: AudioContext, id: SoundId, out: AudioNode): Stop {
  const stops: Stop[] = []
  const white = noiseBuffer(ctx, 'white')
  const pink = noiseBuffer(ctx, 'pink')
  const brown = noiseBuffer(ctx, 'brown')

  const bed = (buf: AudioBuffer, chain: AudioNode[], gain: number) => {
    const src = loop(ctx, buf)
    const g = ctx.createGain()
    g.gain.value = gain
    let node: AudioNode = src
    for (const c of chain) node = node.connect(c)
    node.connect(g).connect(out)
    stops.push(() => src.stop())
    return g
  }

  switch (id) {
    case 'rain': {
      bed(pink, [filter(ctx, 'highpass', 400), filter(ctx, 'lowpass', 7000)], 0.55)
      bed(brown, [filter(ctx, 'lowpass', 500)], 0.35)
      stops.push(sprinkle(ctx, [40, 180], (t) => burst(ctx, out, white, t, 0.03, 0.06 + Math.random() * 0.06, 2500)))
      break
    }
    case 'fire': {
      const g = bed(brown, [filter(ctx, 'lowpass', 900)], 0.7)
      const o = lfo(ctx, 0.2, 0.15, g.gain)
      stops.push(() => o.stop())
      stops.push(sprinkle(ctx, [60, 420], (t) => burst(ctx, out, white, t, 0.015 + Math.random() * 0.04, 0.1 + Math.random() * 0.25, 1800)))
      break
    }
    case 'ocean': {
      const f = filter(ctx, 'lowpass', 900)
      const g = bed(pink, [f], 0.25)
      const o1 = lfo(ctx, 0.08, 0.22, g.gain)
      const o2 = lfo(ctx, 0.08, 500, f.frequency)
      bed(brown, [filter(ctx, 'lowpass', 300)], 0.3)
      stops.push(() => {
        o1.stop()
        o2.stop()
      })
      break
    }
    case 'night': {
      bed(brown, [filter(ctx, 'lowpass', 350)], 0.25)
      stops.push(
        sprinkle(ctx, [700, 2600], (t) => {
          const pitch = 4200 + Math.random() * 600
          const vol = 0.012 + Math.random() * 0.014
          for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) blip(ctx, out, t + i * 0.07, pitch, 0.045, vol)
        }),
      )
      break
    }
    case 'cafe': {
      const f = filter(ctx, 'bandpass', 500, 0.6)
      const g = bed(pink, [f], 0.55)
      const o = lfo(ctx, 0.35, 0.12, g.gain)
      const o2 = lfo(ctx, 0.13, 120, f.frequency)
      bed(brown, [filter(ctx, 'lowpass', 250)], 0.2)
      stops.push(() => {
        o.stop()
        o2.stop()
      })
      stops.push(sprinkle(ctx, [1800, 6500], (t) => blip(ctx, out, t, 2600 + Math.random() * 1400, 0.35, 0.01, 'triangle')))
      break
    }
  }
  return () => stops.forEach((s) => s())
}

export class Ambience {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private stopCurrent: ((fade?: number) => void) | null = null
  current: SoundId | null = null

  /** Must be called from a click/tap: browsers don't allow sound without one. */
  play(id: SoundId, volume: number) {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.connect(this.ctx.destination)
    }
    void this.ctx.resume()
    this.stop(0.4)
    const voice = this.ctx.createGain()
    voice.gain.value = 0
    voice.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5)
    voice.connect(this.master!)
    const stopVoice = build(this.ctx, id, voice)
    const ctx = this.ctx
    this.stopCurrent = (fade = 0.8) => {
      voice.gain.cancelScheduledValues(ctx.currentTime)
      voice.gain.setValueAtTime(voice.gain.value, ctx.currentTime)
      voice.gain.linearRampToValueAtTime(0, ctx.currentTime + fade)
      setTimeout(() => {
        stopVoice()
        voice.disconnect()
      }, fade * 1000 + 100)
    }
    this.setVolume(volume)
    this.current = id
  }

  setVolume(v: number) {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v * v * 0.9, this.ctx.currentTime, 0.1)
  }

  stop(fade = 0.8) {
    this.stopCurrent?.(fade)
    this.stopCurrent = null
    this.current = null
  }
}
