import { describe, expect, it } from 'vitest'
import { OFFLINE_CAP_SECONDS } from './config'
import { calculateOfflineGain } from './economy'

describe('offline gains', () => {
  it('caps elapsed time at configured limit', () => {
    const result = calculateOfflineGain({
      elapsedSeconds: OFFLINE_CAP_SECONDS + 2000,
      autoGainPerSec: 15,
      diffusionMultiplier: 1.6,
    })

    expect(result.cappedSeconds).toBe(OFFLINE_CAP_SECONDS)
  })

  it('awards chroma and restoration from passive gain only', () => {
    const result = calculateOfflineGain({
      elapsedSeconds: 3600,
      autoGainPerSec: 10,
      diffusionMultiplier: 2,
    })

    expect(result.chromaAwarded).toBeGreaterThan(0)
    expect(result.restorationAwarded).toBeCloseTo(result.chromaAwarded * 2, 6)
  })
})

