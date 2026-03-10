import {
  BASE_OPERATOR_RATE,
  BASE_TAP_GAIN,
  DIFFUSION_PER_TIER,
  EXTRACTION_PER_TIER,
  MOMENTUM_MAX_BONUS,
  OFFLINE_CAP_SECONDS,
  OFFLINE_EFFICIENCY,
  OPERATOR_STRENGTH_PER_EXTRACTION_TIER,
  PRISM_SHARD_MULTIPLIER,
  RESTORATION_TARGET_POINTS,
  UNLOCK_SURGE_SECONDS,
  UNLOCK_SURGE_BONUS,
  UPGRADE_LANES,
} from './config'
import type {
  EconomySnapshot,
  OfflineGainResult,
  PrestigeResult,
  UpgradeLaneId,
  UpgradeLaneDefinition,
} from './types'

const UPGRADE_LOOKUP: Record<UpgradeLaneId, UpgradeLaneDefinition> = {
  extraction: UPGRADE_LANES[0],
  automation: UPGRADE_LANES[1],
  diffusion: UPGRADE_LANES[2],
}

export function calculateUpgradeCost(lane: UpgradeLaneId, currentTier: number): number {
  const def = UPGRADE_LOOKUP[lane]
  return Math.round(def.baseCost * Math.pow(def.growth, currentTier))
}

export function calculateUpgradeShardRequirement(lane: UpgradeLaneId, nextTier: number): number {
  const def = UPGRADE_LOOKUP[lane]
  let requiredShards = 0
  for (let i = 0; i < def.prestigeGates.length; i += 1) {
    const gate = def.prestigeGates[i]
    if (nextTier >= gate.tier) {
      requiredShards = Math.max(requiredShards, gate.minShards)
    }
  }
  return requiredShards
}

export function calculatePrestigeMultiplier(totalPrismShards: number): number {
  const earlyShards = Math.min(totalPrismShards, 24)
  const midShards = Math.min(Math.max(totalPrismShards - 24, 0), 48)
  const lateShards = Math.max(totalPrismShards - 72, 0)
  return 1 + earlyShards * PRISM_SHARD_MULTIPLIER + midShards * 0.075 + lateShards * 0.04
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function calculateEngagementMultiplier(
  momentum: number,
  unlockSurgeSeconds: number,
): number {
  const momentumBonus = clamp01(momentum) * MOMENTUM_MAX_BONUS
  const surgeBonus = unlockSurgeSeconds > 0 ? UNLOCK_SURGE_BONUS : 0
  return 1 + momentumBonus + surgeBonus
}

export function calculateBuildingUnlockChromaReward(unlockedBuildingCount: number): number {
  const unlockIndex = Math.max(0, unlockedBuildingCount - 1)
  if (unlockIndex === 0) {
    return 0
  }
  return Math.round(120 * Math.pow(unlockIndex, 1.35))
}

export function calculateTapGain(
  extractionTier: number,
  prestigeMultiplier: number,
  engagementMultiplier = 1,
): number {
  return (
    BASE_TAP_GAIN *
    (1 + EXTRACTION_PER_TIER * extractionTier) *
    prestigeMultiplier *
    engagementMultiplier
  )
}

export function calculatePerOperatorRate(
  extractionTier: number,
  prestigeMultiplier: number,
  engagementMultiplier = 1,
): number {
  return (
    BASE_OPERATOR_RATE *
    (1 + OPERATOR_STRENGTH_PER_EXTRACTION_TIER * extractionTier) *
    prestigeMultiplier *
    engagementMultiplier
  )
}

export function calculateDiffusionMultiplier(diffusionTier: number): number {
  return 1 + DIFFUSION_PER_TIER * diffusionTier
}

export function calculateAutoGainPerSec(
  logicalOperators: number,
  extractionTier: number,
  prestigeMultiplier: number,
  engagementMultiplier = 1,
): number {
  return logicalOperators * calculatePerOperatorRate(
    extractionTier,
    prestigeMultiplier,
    engagementMultiplier,
  )
}

export function calculateRestorationPercent(restorationPoints: number): number {
  return Math.min(100, (restorationPoints / RESTORATION_TARGET_POINTS) * 100)
}

export function calculateEconomySnapshot(params: {
  extractionTier: number
  diffusionTier: number
  logicalOperators: number
  prestigeMultiplier: number
  engagementMultiplier?: number
}): EconomySnapshot {
  const engagementMultiplier = params.engagementMultiplier ?? 1
  const tapGain = calculateTapGain(
    params.extractionTier,
    params.prestigeMultiplier,
    engagementMultiplier,
  )
  const autoGainPerSec = calculateAutoGainPerSec(
    params.logicalOperators,
    params.extractionTier,
    params.prestigeMultiplier,
    engagementMultiplier,
  )
  const restorationGainPerSec = autoGainPerSec * calculateDiffusionMultiplier(params.diffusionTier)

  return {
    tapGain,
    autoGainPerSec,
    restorationGainPerSec,
    engagementMultiplier,
    prestigeMultiplier: params.prestigeMultiplier,
  }
}

function minimumPrestigeReward(currentShards: number): number {
  if (currentShards < 5) {
    return 5
  }
  if (currentShards < 11) {
    return 4
  }
  if (currentShards < 17) {
    return 3
  }
  return 1
}

export function calculatePrestigeReward(
  restorationPoints: number,
  currentShards: number,
): number {
  const normalized = Math.max(0, restorationPoints / RESTORATION_TARGET_POINTS)
  const baseReward = Math.floor(Math.pow(normalized, 0.72) * 4.2)
  const overcapBonus = normalized > 1 ? Math.floor((normalized - 1) * 4) : 0
  const rawReward = Math.max(1, baseReward + overcapBonus)
  return Math.max(rawReward, minimumPrestigeReward(currentShards))
}

export function calculatePrestigeLaunchChroma(
  earnedShards: number,
  newTotalShards: number,
): number {
  return Math.round(28 + earnedShards * 18 + newTotalShards * 6)
}

export function calculatePrestigeLaunchMomentum(earnedShards: number): number {
  return Math.min(0.45, 0.12 + earnedShards * 0.04)
}

export function calculatePrestigeLaunchSurgeSeconds(earnedShards: number): number {
  return Math.min(UNLOCK_SURGE_SECONDS, 6 + earnedShards)
}

export function calculatePrestigeResult(
  restorationPoints: number,
  currentShards: number,
): PrestigeResult {
  const earnedShards = calculatePrestigeReward(restorationPoints, currentShards)
  const newTotalShards = currentShards + earnedShards
  const launchChroma = calculatePrestigeLaunchChroma(earnedShards, newTotalShards)
  const launchMomentum = calculatePrestigeLaunchMomentum(earnedShards)
  const launchSurgeSeconds = calculatePrestigeLaunchSurgeSeconds(earnedShards)
  return {
    earnedShards,
    newTotalShards,
    launchChroma,
    launchMomentum,
    launchSurgeSeconds,
    newMultiplier: calculatePrestigeMultiplier(newTotalShards),
  }
}

export function calculateOfflineGain(params: {
  elapsedSeconds: number
  autoGainPerSec: number
  diffusionMultiplier: number
}): OfflineGainResult {
  const cappedSeconds = Math.min(params.elapsedSeconds, OFFLINE_CAP_SECONDS)
  const chromaAwarded = params.autoGainPerSec * cappedSeconds * OFFLINE_EFFICIENCY
  const restorationAwarded = chromaAwarded * params.diffusionMultiplier

  return {
    elapsedSeconds: params.elapsedSeconds,
    cappedSeconds,
    chromaAwarded,
    restorationAwarded,
  }
}
