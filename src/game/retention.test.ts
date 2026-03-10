import { describe, expect, it } from 'vitest'
import { BUILDINGS, UPGRADE_LANES } from './config'
import { calculateUpgradeCost, calculateUpgradeShardRequirement } from './economy'
import { createGameStore } from './store'

describe('retention economy loop', () => {
  it('builds momentum from active tapping', () => {
    const store = createGameStore()
    const before = store.getState()
    store.setState({
      ...before,
      chroma: 0,
      momentum: 0,
      unlockSurgeSeconds: 0,
    })

    store.getState().extract()
    const after = store.getState()

    expect(after.momentum).toBeGreaterThan(0)
    expect(after.economy.engagementMultiplier).toBeGreaterThan(1)
  })

  it('grants unlock surge and chroma reward when a new building unlocks', () => {
    const store = createGameStore()
    const before = store.getState()
    const tier = BUILDINGS[1].unlockAtTotalTiers - 1
    const cost = calculateUpgradeCost('extraction', tier)
    const startingChroma = cost + 1000
    store.setState({
      ...before,
      chroma: startingChroma,
      prismShards: 20,
      upgrades: { extraction: tier, automation: 0, diffusion: 0 },
      totalUpgradesPurchased: tier,
      unlockedBuildings: 1,
      momentum: 0,
      unlockSurgeSeconds: 0,
    })

    const purchased = store.getState().purchaseUpgrade('extraction')
    const after = store.getState()

    expect(purchased).toBe(true)
    expect(after.unlockedBuildings).toBeGreaterThan(1)
    expect(after.unlockSurgeSeconds).toBeGreaterThan(0)
    expect(after.chroma).toBeGreaterThan(startingChroma - cost)
  })

  it('blocks shard-gated upgrades until required prestige is reached', () => {
    const store = createGameStore()
    const before = store.getState()
    const extractionLane = UPGRADE_LANES.find((lane) => lane.id === 'extraction')
    if (!extractionLane) {
      throw new Error('Expected extraction lane to exist')
    }
    const gateTier = extractionLane.prestigeGates[0].tier
    const requiredShards = calculateUpgradeShardRequirement('extraction', gateTier)
    const cost = calculateUpgradeCost('extraction', gateTier - 1)

    store.setState({
      ...before,
      chroma: cost + 1000,
      prismShards: Math.max(0, requiredShards - 1),
      upgrades: { extraction: gateTier - 1, automation: 0, diffusion: 0 },
      totalUpgradesPurchased: gateTier - 1,
      unlockedBuildings: 1,
    })
    expect(store.getState().purchaseUpgrade('extraction')).toBe(false)

    store.setState((state) => ({
      ...state,
      prismShards: requiredShards,
    }))
    expect(store.getState().purchaseUpgrade('extraction')).toBe(true)
  })
})
