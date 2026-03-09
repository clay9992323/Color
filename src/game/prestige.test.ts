import { describe, expect, it } from 'vitest'
import { calculatePrestigeResult } from './economy'
import { createGameStore } from './store'

describe('prestige flow', () => {
  it('returns positive shard rewards from restoration points', () => {
    const result = calculatePrestigeResult(120000, 0)
    expect(result.earnedShards).toBeGreaterThan(0)
    expect(result.newTotalShards).toBe(result.earnedShards)
  })

  it('hard-resets run progression while retaining permanent shard progression', () => {
    const store = createGameStore()
    const before = store.getState()
    store.setState({
      ...before,
      chroma: 5000,
      restorationPoints: 120000,
      restorationPercent: 100,
      prismShards: 3,
      upgrades: { extraction: 6, automation: 7, diffusion: 5 },
      totalUpgradesPurchased: 18,
    })

    const result = store.getState().prestige()
    const after = store.getState()

    expect(result).not.toBeNull()
    expect(after.chroma).toBe(0)
    expect(after.restorationPoints).toBe(0)
    expect(after.totalUpgradesPurchased).toBe(0)
    expect(after.upgrades).toEqual({ extraction: 0, automation: 0, diffusion: 0 })
    expect(after.prismShards).toBeGreaterThan(3)
  })
})

