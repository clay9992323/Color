import { describe, expect, it } from 'vitest'
import { RESTORATION_TARGET_POINTS } from './config'
import { calculateMissingColorCost, getColorValue } from './economy'
import { createGameStore } from './store'
import type { ColorId, UpgradeLaneId } from './types'

const LANES: UpgradeLaneId[] = ['extraction', 'automation', 'diffusion']

function runFirstLoopSimulation(): { seconds: number; prestigeReached: boolean } {
  const store = createGameStore()
  const maxSeconds = 5 * 60 * 60
  const tapCadenceSeconds = 1.2
  let nextTapAt = 0

  for (let elapsed = 0; elapsed < maxSeconds; elapsed += 1) {
    const beforeTick = store.getState()
    if (elapsed >= nextTapAt) {
      beforeTick.extract()
      nextTapAt += tapCadenceSeconds
    }

    store.getState().tick(1)

    for (let pass = 0; pass < 6; pass += 1) {
      let boughtThisPass = false
      const current = store.getState()
      const laneOrder = [...LANES].sort((a, b) => current.upgrades[a] - current.upgrades[b])

      for (let i = 0; i < laneOrder.length; i += 1) {
        const lane = laneOrder[i]
        if (store.getState().purchaseUpgrade(lane)) {
          boughtThisPass = true
          break
        }

        const state = store.getState()
        const upgradeCost = state.getUpgradeColorCost(lane)
        const missing = calculateMissingColorCost(state.inventory, upgradeCost)
        const entries = Object.entries(missing).sort((a, b) => Number(b[1] ?? 0) - Number(a[1] ?? 0))

        for (let j = 0; j < entries.length; j += 1) {
          const [rawTarget, rawAmount] = entries[j]
          const target = rawTarget as ColorId
          const needed = Number(rawAmount ?? 0)
          if (needed <= 0) {
            continue
          }

          const sourceCandidates = (Object.keys(state.inventory) as ColorId[])
            .filter((source) => source !== target)
            .filter((source) => state.inventory[source] > 20)
            .filter((source) => state.quoteSwap(source, target, 5).outputAmount > 0)
            .sort((a, b) => state.inventory[b] - state.inventory[a])

          const source = sourceCandidates[0]
          if (!source) {
            continue
          }

          const input = Math.max(
            1,
            Math.ceil((needed * getColorValue(target) * 1.2) / Math.max(0.0001, getColorValue(source))),
          )
          const clampedInput = Math.min(input, Math.floor(state.inventory[source] * 0.45))
          if (clampedInput > 0) {
            state.executeSwap(source, target, clampedInput)
          }
        }
      }

      if (!boughtThisPass) {
        break
      }
    }

    if (store.getState().restorationPercent >= 100) {
      return { seconds: elapsed + 1, prestigeReached: true }
    }
  }

  return { seconds: maxSeconds, prestigeReached: false }
}

describe('pacing simulation', () => {
  it('starts with red only and unlocks blue/yellow through progression', () => {
    const store = createGameStore()
    const initial = store.getState()
    expect(initial.milestoneFlags.blueUnlocked).toBe(false)
    expect(initial.milestoneFlags.yellowUnlocked).toBe(false)

    store.setState({
      ...initial,
      restorationPoints: RESTORATION_TARGET_POINTS * 0.3,
      restorationPercent: 30,
    })
    store.getState().tick(0)
    expect(store.getState().milestoneFlags.blueUnlocked).toBe(true)

    store.setState((state) => ({
      ...state,
      restorationPoints: RESTORATION_TARGET_POINTS * 0.65,
      restorationPercent: 65,
    }))
    store.getState().tick(0)
    expect(store.getState().milestoneFlags.yellowUnlocked).toBe(true)
  })

  it('lands a typical first loop near 150 minutes without a hard timer gate', () => {
    const simulation = runFirstLoopSimulation()
    expect(simulation.prestigeReached).toBe(true)

    const minutes = simulation.seconds / 60
    expect(minutes).toBeGreaterThanOrEqual(120)
    expect(minutes).toBeLessThanOrEqual(180)
  })
})
