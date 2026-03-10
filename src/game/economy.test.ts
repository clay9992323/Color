import { describe, expect, it } from 'vitest'
import { RESTORATION_TARGET_POINTS, UPGRADE_LANES } from './config'
import {
  calculateAutoGainPerSec,
  calculateBuildingUnlockChromaReward,
  calculateDiffusionMultiplier,
  calculateEngagementMultiplier,
  calculateEconomySnapshot,
  calculatePrestigeLaunchChroma,
  calculatePrestigeMultiplier,
  calculatePrestigeReward,
  calculateRestorationPercent,
  calculateUpgradeShardRequirement,
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

  it('applies momentum and surge bonuses to active economy rates', () => {
    const engagementMultiplier = calculateEngagementMultiplier(0.6, 12)
    const boosted = calculateEconomySnapshot({
      extractionTier: 3,
      diffusionTier: 2,
      logicalOperators: 16,
      prestigeMultiplier: 1.4,
      engagementMultiplier,
    })
    const baseline = calculateEconomySnapshot({
      extractionTier: 3,
      diffusionTier: 2,
      logicalOperators: 16,
      prestigeMultiplier: 1.4,
    })

    expect(boosted.engagementMultiplier).toBeGreaterThan(1)
    expect(boosted.tapGain).toBeGreaterThan(baseline.tapGain)
    expect(boosted.autoGainPerSec).toBeGreaterThan(baseline.autoGainPerSec)
  })

  it('awards larger chroma drops for later building unlocks', () => {
    expect(calculateBuildingUnlockChromaReward(1)).toBe(0)
    expect(calculateBuildingUnlockChromaReward(2)).toBeGreaterThan(0)
    expect(calculateBuildingUnlockChromaReward(6)).toBeGreaterThan(
      calculateBuildingUnlockChromaReward(3),
    )
  })

  it('guarantees stronger early prestige rewards for first loops', () => {
    expect(calculatePrestigeReward(RESTORATION_TARGET_POINTS, 0)).toBeGreaterThanOrEqual(5)
    expect(calculatePrestigeReward(RESTORATION_TARGET_POINTS, 6)).toBeGreaterThanOrEqual(4)
    expect(calculatePrestigeReward(RESTORATION_TARGET_POINTS, 12)).toBeGreaterThanOrEqual(3)
  })

  it('rewards overcap pushes above 100 percent recovery', () => {
    const at100 = calculatePrestigeReward(RESTORATION_TARGET_POINTS, 20)
    const at150 = calculatePrestigeReward(RESTORATION_TARGET_POINTS * 1.5, 20)
    expect(at150).toBeGreaterThan(at100)
  })

  it('applies diminishing returns to very large shard totals', () => {
    const at24 = calculatePrestigeMultiplier(24)
    const at72 = calculatePrestigeMultiplier(72)
    const at120 = calculatePrestigeMultiplier(120)
    const earlyGainPerShard = (at24 - 1) / 24
    const lateGainPerShard = (at120 - at72) / 48

    expect(lateGainPerShard).toBeLessThan(earlyGainPerShard)
  })

  it('scales launch chroma from prestige outcome', () => {
    expect(calculatePrestigeLaunchChroma(5, 5)).toBeGreaterThan(0)
    expect(calculatePrestigeLaunchChroma(8, 20)).toBeGreaterThan(
      calculatePrestigeLaunchChroma(3, 8),
    )
  })

  it('enforces shard gates on high upgrade tiers', () => {
    const extractionLane = UPGRADE_LANES.find((lane) => lane.id === 'extraction')
    const diffusionLane = UPGRADE_LANES.find((lane) => lane.id === 'diffusion')
    if (!extractionLane || !diffusionLane) {
      throw new Error('Expected extraction and diffusion lanes to exist')
    }
    const firstExtractionGateTier = extractionLane.prestigeGates[0].tier
    const firstDiffusionGateTier = diffusionLane.prestigeGates[0].tier
    const finalDiffusionGateTier =
      diffusionLane.prestigeGates[diffusionLane.prestigeGates.length - 1].tier

    expect(calculateUpgradeShardRequirement('extraction', firstExtractionGateTier - 1)).toBe(0)
    expect(calculateUpgradeShardRequirement('extraction', firstExtractionGateTier)).toBeGreaterThan(
      0,
    )
    expect(calculateUpgradeShardRequirement('diffusion', finalDiffusionGateTier)).toBeGreaterThan(
      calculateUpgradeShardRequirement('diffusion', firstDiffusionGateTier),
    )
  })
})
