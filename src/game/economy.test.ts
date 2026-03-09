import { describe, expect, it } from 'vitest'
import {
  calculateAutoGainPerSec,
  calculateDiffusionMultiplier,
  calculateEconomySnapshot,
  calculateRestorationPercent,
  calculateTapGain,
} from './economy'

describe('economy calculations', () => {
  it('scales tap and auto gains from upgrades and prestige multiplier', () => {
    const tapGain = calculateTapGain(4, 2.2)
    const auto = calculateAutoGainPerSec(25, 4, 2.2)

    expect(tapGain).toBeGreaterThan(1)
    expect(auto).toBeGreaterThan(tapGain)
  })

  it('derives restoration gain from diffusion multiplier', () => {
    const snapshot = calculateEconomySnapshot({
      extractionTier: 3,
      diffusionTier: 4,
      logicalOperators: 18,
      prestigeMultiplier: 1.8,
    })

    expect(snapshot.restorationGainPerSec).toBeCloseTo(
      snapshot.autoGainPerSec * calculateDiffusionMultiplier(4),
      5,
    )
  })

  it('clamps restoration to 100 percent', () => {
    expect(calculateRestorationPercent(999999)).toBe(100)
  })
})

