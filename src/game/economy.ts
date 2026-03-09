import {
  BASE_OPERATOR_RATE,
  BASE_TAP_GAIN,
  DIFFUSION_PER_TIER,
  EXTRACTION_PER_TIER,
  OFFLINE_CAP_SECONDS,
  OFFLINE_EFFICIENCY,
  OPERATOR_STRENGTH_PER_EXTRACTION_TIER,
  PRISM_SHARD_MULTIPLIER,
  RESTORATION_TARGET_POINTS,
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

export function calculatePrestigeMultiplier(totalPrismShards: number): number {
  return 1 + totalPrismShards * PRISM_SHARD_MULTIPLIER
}

export function calculateTapGain(extractionTier: number, prestigeMultiplier: number): number {
  return BASE_TAP_GAIN * (1 + EXTRACTION_PER_TIER * extractionTier) * prestigeMultiplier
}

export function calculatePerOperatorRate(
  extractionTier: number,
  prestigeMultiplier: number,
): number {
  return (
    BASE_OPERATOR_RATE *
    (1 + OPERATOR_STRENGTH_PER_EXTRACTION_TIER * extractionTier) *
    prestigeMultiplier
  )
}

export function calculateDiffusionMultiplier(diffusionTier: number): number {
  return 1 + DIFFUSION_PER_TIER * diffusionTier
}

export function calculateAutoGainPerSec(
  logicalOperators: number,
  extractionTier: number,
  prestigeMultiplier: number,
): number {
  return logicalOperators * calculatePerOperatorRate(extractionTier, prestigeMultiplier)
}

export function calculateRestorationPercent(restorationPoints: number): number {
  return Math.min(100, (restorationPoints / RESTORATION_TARGET_POINTS) * 100)
}

export function calculateEconomySnapshot(params: {
  extractionTier: number
  diffusionTier: number
  logicalOperators: number
  prestigeMultiplier: number
}): EconomySnapshot {
  const tapGain = calculateTapGain(params.extractionTier, params.prestigeMultiplier)
  const autoGainPerSec = calculateAutoGainPerSec(
    params.logicalOperators,
    params.extractionTier,
    params.prestigeMultiplier,
  )
  const restorationGainPerSec = autoGainPerSec * calculateDiffusionMultiplier(params.diffusionTier)

  return {
    tapGain,
    autoGainPerSec,
    restorationGainPerSec,
    prestigeMultiplier: params.prestigeMultiplier,
  }
}

export function calculatePrestigeReward(restorationPoints: number): number {
  return Math.max(1, Math.floor(Math.sqrt(restorationPoints / 5000)))
}

export function calculatePrestigeResult(
  restorationPoints: number,
  currentShards: number,
): PrestigeResult {
  const earnedShards = calculatePrestigeReward(restorationPoints)
  const newTotalShards = currentShards + earnedShards
  return {
    earnedShards,
    newTotalShards,
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

