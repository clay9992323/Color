type ToneOptions = {
  frequency: number
  durationMs: number
  type?: OscillatorType
  gain?: number
}

function playTone(context: AudioContext, options: ToneOptions): void {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = options.type ?? 'triangle'
  osc.frequency.value = options.frequency
  gain.gain.value = options.gain ?? 0.03
  osc.connect(gain)
  gain.connect(context.destination)
  const now = context.currentTime
  const durationSec = options.durationMs / 1000
  gain.gain.setValueAtTime(gain.gain.value, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec)
  osc.start(now)
  osc.stop(now + durationSec)
}

export interface AudioBus {
  tap: () => void
  buy: () => void
  unlock: () => void
  prestige: () => void
}

export function createAudioBus(): AudioBus {
  let context: AudioContext | null = null
  const ensureContext = () => {
    if (typeof window === 'undefined') return null
    if (!context) {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return null
      context = new Ctx()
    }
    if (context.state === 'suspended') {
      void context.resume()
    }
    return context
  }

  return {
    tap: () => {
      const ctx = ensureContext()
      if (!ctx) return
      playTone(ctx, { frequency: 700, durationMs: 35, type: 'triangle', gain: 0.018 })
    },
    buy: () => {
      const ctx = ensureContext()
      if (!ctx) return
      playTone(ctx, { frequency: 440, durationMs: 55, type: 'square', gain: 0.03 })
    },
    unlock: () => {
      const ctx = ensureContext()
      if (!ctx) return
      playTone(ctx, { frequency: 520, durationMs: 70, type: 'sine', gain: 0.04 })
      playTone(ctx, { frequency: 760, durationMs: 90, type: 'sine', gain: 0.03 })
    },
    prestige: () => {
      const ctx = ensureContext()
      if (!ctx) return
      playTone(ctx, { frequency: 360, durationMs: 120, type: 'sawtooth', gain: 0.05 })
      playTone(ctx, { frequency: 920, durationMs: 180, type: 'triangle', gain: 0.035 })
    },
  }
}

