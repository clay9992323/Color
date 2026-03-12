import { describe, expect, it } from 'vitest'
import { RESTORATION_TARGET_POINTS } from './config'
import { createDefaultMetaTree } from './economy'
import { createGameStore } from './store'

describe('prestige flow', () => {
  it('hard-resets run state while retaining permanent progression', () => {
    const store = createGameStore()
    const before = store.getState()
    const metaTree = createDefaultMetaTree()
    metaTree.tap_mastery = 2

    store.setState({
      ...before,
      inventory: {
        ...before.inventory,
        red: 300,
        blue: 220,
        yellow: 180,
        orange: 40,
      },
      restorationPoints: RESTORATION_TARGET_POINTS * 2,
      restorationPercent: 100,
      prismShards: 9,
      unspentShards: 4,
      upgrades: { extraction: 6, automation: 7, diffusion: 5 },
      totalUpgradesPurchased: 18,
      recipeQueue: [
        {
          id: 'q1',
          recipeId: 'craft_green',
          remainingUnits: 2,
          totalUnits: 2,
          progressSeconds: 1,
        },
      ],
      refineryQueue: [
        {
          id: 'r1',
          colorId: 'red',
          neonColorId: 'neon_red',
          remainingBatches: 1,
          totalBatches: 1,
          progressSeconds: 5,
          inputPerBatch: 20,
          outputPerBatch: 5,
          unitDurationSeconds: 20,
        },
      ],
      runExtractionSeconds: 8_000,
      prestigeCount: 1,
      worldVisualTier: 1,
      metaTree,
      milestoneFlags: { blueUnlocked: true, yellowUnlocked: true, neonUnlocked: true },
    })

    const result = store.getState().prestige()
    const after = store.getState()

    expect(result).not.toBeNull()
    expect(after.restorationPoints).toBe(0)
    expect(after.totalUpgradesPurchased).toBe(0)
    expect(after.upgrades).toEqual({ extraction: 0, automation: 0, diffusion: 0 })
    expect(after.recipeQueue).toEqual([])
    expect(after.refineryQueue).toEqual([])
    expect(after.runExtractionSeconds).toBe(0)
    expect(after.prestigeCount).toBe(2)
    expect(after.worldVisualTier).toBeGreaterThanOrEqual(2)
    expect(after.metaTree.tap_mastery).toBe(2)
    expect(after.prismShards).toBeGreaterThan(9)
    expect(after.unspentShards).toBeGreaterThan(4)
    expect(after.inventory.red).toBe(0)
    expect(after.inventory.blue).toBe(0)
  })

  it('marks campaign complete at prestige 5', () => {
    const store = createGameStore()
    const before = store.getState()

    store.setState({
      ...before,
      restorationPoints: RESTORATION_TARGET_POINTS * 2,
      restorationPercent: 100,
      prestigeCount: 4,
      campaignComplete: false,
    })

    const result = store.getState().prestige()
    expect(result?.campaignComplete).toBe(true)
    expect(store.getState().campaignComplete).toBe(true)
    expect(store.getState().prestigeCount).toBe(5)
  })
})
