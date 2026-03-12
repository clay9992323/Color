import { describe, expect, it } from 'vitest'
import { RESTORATION_TARGET_POINTS } from './config'
import {
  calculateEstimatedSecondsToPrestige,
  calculateEffectiveUpgradeScalar,
  calculateExchangeFeeRate,
  calculateLaneUpgradeColorCost,
  calculateMissingColorCost,
  calculateSwapQuote,
  canAffordColorCost,
  createDefaultMetaTree,
  createEmptyInventory,
} from './economy'

describe('economy calculations', () => {
  it('derives stage A mixed-color upgrade costs', () => {
    const cost = calculateLaneUpgradeColorCost({
      lane: 'extraction',
      nextTier: 10,
      scalarCost: 100,
      prestigeCount: 0,
    })

    expect(cost.red).toBe(70)
    expect(cost.orange).toBe(30)
  })

  it('derives stage B mixed-color costs with neon requirements', () => {
    const cost = calculateLaneUpgradeColorCost({
      lane: 'automation',
      nextTier: 22,
      scalarCost: 100,
      prestigeCount: 1,
    })

    expect(cost.blue).toBe(55)
    expect(cost.violet).toBe(25)
    expect(cost.neon_blue).toBe(20)
  })

  it('derives stage C mixed-color costs with cross-lane pressure', () => {
    const cost = calculateLaneUpgradeColorCost({
      lane: 'diffusion',
      nextTier: 34,
      scalarCost: 100,
      prestigeCount: 3,
    })

    expect(cost.yellow).toBe(55)
    expect(cost.neon_yellow).toBe(25)
    expect(cost.red).toBe(20)
  })

  it('applies the fixed swap formula with fee', () => {
    const quote = calculateSwapQuote({
      from: 'red',
      to: 'blue',
      inputAmount: 100,
      feeRate: 0.15,
    })

    expect(quote.outputAmount).toBe(77)
  })

  it('reduces exchange fee with meta rank', () => {
    const meta = createDefaultMetaTree()
    meta.exchange_protocols = 2
    expect(calculateExchangeFeeRate(meta)).toBeCloseTo(0.11, 8)
  })

  it('derives prestige ETA from current restoration scaling', () => {
    const etaA = calculateEstimatedSecondsToPrestige(10_000, 40)
    const etaB = calculateEstimatedSecondsToPrestige(10_000, 80)
    const etaComplete = calculateEstimatedSecondsToPrestige(RESTORATION_TARGET_POINTS + 1, 10)

    expect(etaA).not.toBeNull()
    expect(etaB).not.toBeNull()
    expect((etaB ?? 0)).toBeLessThan(etaA ?? 0)
    expect(etaComplete).toBe(0)
  })

  it('applies extraction efficiency discount to scalar upgrade costs', () => {
    const meta = createDefaultMetaTree()
    meta.extract_efficiency = 2
    const discounted = calculateEffectiveUpgradeScalar('extraction', 3, meta)
    const baseline = calculateEffectiveUpgradeScalar('extraction', 3, createDefaultMetaTree())
    expect(discounted).toBeLessThan(baseline)
  })

  it('detects affordability and color-specific blockers', () => {
    const inventory = createEmptyInventory()
    inventory.red = 50
    inventory.orange = 12
    const cost = { red: 40, orange: 16 }

    expect(canAffordColorCost(inventory, cost)).toBe(false)
    expect(calculateMissingColorCost(inventory, cost)).toEqual({ orange: 4 })
  })
})
