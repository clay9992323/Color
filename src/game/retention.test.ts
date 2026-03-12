import { describe, expect, it } from 'vitest'
import { RESTORATION_TARGET_POINTS } from './config'
import { createDefaultMetaTree } from './economy'
import { createGameStore, parseSave, toBaseState } from './store'

describe('retention economy loop', () => {
  it('supports extract -> craft -> refine -> swap -> spend -> prestige flow', () => {
    const store = createGameStore()
    const before = store.getState()

    store.setState({
      ...before,
      inventory: {
        ...before.inventory,
        red: 2_000,
        blue: 2_000,
        yellow: 2_000,
        orange: 1_000,
        violet: 1_000,
      },
      restorationPoints: RESTORATION_TARGET_POINTS * 2,
      restorationPercent: 100,
      prismShards: 30,
      unspentShards: 10,
      prestigeCount: 1,
      milestoneFlags: { blueUnlocked: true, yellowUnlocked: true, neonUnlocked: true },
    })

    expect(store.getState().craftColor('craft_green', 2)).toBe(true)
    store.getState().tick(8)
    expect(store.getState().inventory.green).toBeGreaterThan(0)

    expect(store.getState().refineToNeon('red', 40)).toBe(true)
    store.getState().tick(40)
    expect(store.getState().inventory.neon_red).toBeGreaterThan(0)

    const quote = store.getState().quoteSwap('red', 'blue', 100)
    expect(quote.outputAmount).toBeGreaterThan(0)
    expect(store.getState().executeSwap('red', 'blue', 100)).toBe(true)

    const bought = store.getState().purchaseUpgrade('extraction')
    expect(bought).toBe(true)

    const result = store.getState().prestige()
    expect(result).not.toBeNull()
    expect(store.getState().prismShards).toBeGreaterThan(30)
    expect(store.getState().unspentShards).toBeGreaterThan(10)
    expect(store.getState().upgrades).toEqual({ extraction: 0, automation: 0, diffusion: 0 })
  })

  it('migrates save v1 chroma into red inventory in v2 base state', () => {
    const parsed = parseSave(
      JSON.stringify({
        version: 1,
        chroma: 777,
        restorationPoints: 12_000,
        prismShards: 4,
        upgrades: { extraction: 1, automation: 2, diffusion: 3 },
        totalUpgradesPurchased: 6,
        lifetimeRestorationPoints: 22_000,
        lastActiveAt: Date.now() - 1000,
      }),
    )

    if (!parsed || parsed.version !== 1) {
      throw new Error('Expected v1 save data to parse')
    }

    const base = toBaseState(parsed, Date.now())
    expect(base.inventory.red).toBe(777)
    expect(base.inventory.blue).toBe(0)
    expect(base.prismShards).toBe(4)
  })

  it('retains purchased meta ranks across prestige resets', () => {
    const store = createGameStore()
    const before = store.getState()
    const metaTree = createDefaultMetaTree()
    metaTree.exchange_protocols = 1

    store.setState({
      ...before,
      restorationPoints: RESTORATION_TARGET_POINTS * 2,
      restorationPercent: 100,
      unspentShards: 50,
      metaTree,
    })

    const result = store.getState().prestige()
    expect(result).not.toBeNull()
    expect(store.getState().metaTree.exchange_protocols).toBe(1)
  })
})
