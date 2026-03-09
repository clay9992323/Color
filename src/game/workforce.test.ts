import { describe, expect, it } from 'vitest'
import { calculateWorkforce } from './workforce'
import { calculateUnlockedBuildingCount } from './store'

describe('workforce model', () => {
  it('applies the logical operator formula from automation tier', () => {
    const workforce = calculateWorkforce(5, 2)
    expect(workforce.logicalOperators).toBe(Math.floor(2 + 3 * 5 + 0.4 * 25))
  })

  it('caps visible operators based on unlocked building count', () => {
    const unlockedBuildings = calculateUnlockedBuildingCount(26)
    const workforce = calculateWorkforce(12, unlockedBuildings)
    expect(workforce.visibleCap).toBe(48)
    expect(workforce.visibleOperators).toBeLessThanOrEqual(48)
  })

  it('converts overflow into squads', () => {
    const workforce = calculateWorkforce(12, 1)
    expect(workforce.overflowOperators).toBeGreaterThan(0)
    expect(workforce.squads).toBe(Math.ceil(workforce.overflowOperators / 8))
  })
})

