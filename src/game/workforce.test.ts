import { describe, expect, it } from 'vitest'
import { BUILDINGS } from './config'
import { calculateWorkforce } from './workforce'
import { calculateUnlockedBuildingCount } from './store'

describe('workforce model', () => {
  it('starts with exactly one unlocked building, then unlocks progressively', () => {
    const secondUnlockTier = BUILDINGS[1].unlockAtTotalTiers
    expect(calculateUnlockedBuildingCount(0, 0)).toBe(1)
    expect(calculateUnlockedBuildingCount(secondUnlockTier - 1, 0)).toBe(1)
    expect(calculateUnlockedBuildingCount(secondUnlockTier, 0)).toBe(2)
  })

  it('applies the logical operator formula from automation tier', () => {
    const workforce = calculateWorkforce(5, 2)
    expect(workforce.logicalOperators).toBe(Math.floor(2 + 3 * 5 + 0.4 * 25))
  })

  it('caps visible operators based on unlocked building count', () => {
    const unlockedBuildings = calculateUnlockedBuildingCount(999, 999)
    const workforce = calculateWorkforce(12, unlockedBuildings)
    expect(workforce.visibleCap).toBe(48)
    expect(workforce.visibleOperators).toBeLessThanOrEqual(48)
  })

  it('holds late buildings behind shard requirements', () => {
    const lateTier = BUILDINGS[3].unlockAtTotalTiers
    const requiredShards = BUILDINGS[3].unlockAtPrismShards
    expect(calculateUnlockedBuildingCount(lateTier, requiredShards - 1)).toBe(3)
    expect(calculateUnlockedBuildingCount(lateTier, requiredShards)).toBeGreaterThanOrEqual(4)
  })

  it('converts overflow into squads', () => {
    const workforce = calculateWorkforce(12, 1)
    expect(workforce.overflowOperators).toBeGreaterThan(0)
    expect(workforce.squads).toBe(Math.ceil(workforce.overflowOperators / 8))
  })
})
