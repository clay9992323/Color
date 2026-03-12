import { describe, expect, it } from 'vitest'
import { OFFLINE_CAP_SECONDS } from './config'
import { calculateOfflineGain, createDefaultMetaTree } from './economy'

describe('offline gains', () => {
  it('caps elapsed time at 3 hours per away period', () => {
    const result = calculateOfflineGain({
      elapsedSeconds: OFFLINE_CAP_SECONDS + 3_600,
      autoGainPerSec: 15,
      diffusionTier: 2,
      metaTree: createDefaultMetaTree(),
      milestoneFlags: { blueUnlocked: true, yellowUnlocked: true, neonUnlocked: false },
    })

    expect(result.cappedSeconds).toBe(OFFLINE_CAP_SECONDS)
    expect(result.extractionSecondsAwarded).toBe(OFFLINE_CAP_SECONDS)
  })

  it('awards base-color inventory and restoration while away', () => {
    const result = calculateOfflineGain({
      elapsedSeconds: 3_600,
      autoGainPerSec: 10,
      diffusionTier: 3,
      metaTree: createDefaultMetaTree(),
      milestoneFlags: { blueUnlocked: true, yellowUnlocked: true, neonUnlocked: false },
    })

    expect(result.inventoryAwarded.red).toBeGreaterThan(0)
    expect(result.inventoryAwarded.blue).toBeGreaterThan(0)
    expect(result.inventoryAwarded.yellow).toBeGreaterThan(0)
    expect(result.restorationAwarded).toBeGreaterThan(0)
  })
})
