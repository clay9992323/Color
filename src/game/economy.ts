import {
  BASE_EXTRACTION_SPLIT,
  BASE_OPERATOR_RATE,
  BASE_TAP_GAIN,
  COLOR_VALUES,
  DIFFUSION_PER_TIER,
  EXCHANGE_BASE_FEE,
  EXCHANGE_FEE_REDUCTION_PER_RANK,
  EXTRACTION_PER_TIER,
  MOMENTUM_MAX_BONUS,
  OFFLINE_CAP_SECONDS,
  OFFLINE_EFFICIENCY,
  OPERATOR_STRENGTH_PER_EXTRACTION_TIER,
  PRESTIGE_READINESS_THRESHOLDS,
  PRISM_SHARD_MULTIPLIER,
  REFINERY_OUTPUT_PER_BATCH,
  RESTORATION_TARGET_POINTS,
  UNLOCK_SURGE_BONUS,
  UNLOCK_SURGE_SECONDS,
  UPGRADE_LANES,
} from './config'
import type {
  ColorCost,
  ColorId,
  ColorInventory,
  EconomySnapshot,
  ExchangeQuote,
  MilestoneFlags,
  MetaNodeId,
  MetaTreeState,
  OfflineGainResult,
  PrestigeReadiness,
  PrestigeResult,
  UpgradeLaneDefinition,
  UpgradeLaneId,
} from './types'

const UPGRADE_LOOKUP: Record<UpgradeLaneId, UpgradeLaneDefinition> = {
  extraction: UPGRADE_LANES[0],
  automation: UPGRADE_LANES[1],
  diffusion: UPGRADE_LANES[2],
}

const ALL_COLORS: ColorId[] = [
  'red',
  'blue',
  'yellow',
  'green',
  'orange',
  'violet',
  'neon_red',
  'neon_blue',
  'neon_yellow',
  'neon_green',
  'neon_orange',
  'neon_violet',
]

const LANE_COLOR_PRIORITY: Record<
  UpgradeLaneId,
  { primary: ColorId; secondary: ColorId; neon: ColorId; cross: ColorId }
> = {
  extraction: {
    primary: 'red',
    secondary: 'orange',
    neon: 'neon_red',
    cross: 'blue',
  },
  automation: {
    primary: 'blue',
    secondary: 'violet',
    neon: 'neon_blue',
    cross: 'yellow',
  },
  diffusion: {
    primary: 'yellow',
    secondary: 'green',
    neon: 'neon_yellow',
    cross: 'red',
  },
}

const FULL_COLOR_SET = new Set<ColorId>(ALL_COLORS)

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function createEmptyInventory(): ColorInventory {
  return {
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
    orange: 0,
    violet: 0,
    neon_red: 0,
    neon_blue: 0,
    neon_yellow: 0,
    neon_green: 0,
    neon_orange: 0,
    neon_violet: 0,
  }
}

export function cloneInventory(inventory: ColorInventory): ColorInventory {
  return { ...inventory }
}

export function addInventory(target: ColorInventory, source: Partial<ColorInventory>): ColorInventory {
  const updated = cloneInventory(target)
  for (let i = 0; i < ALL_COLORS.length; i += 1) {
    const color = ALL_COLORS[i]
    const amount = source[color]
    if (amount) {
      updated[color] += amount
    }
  }
  return updated
}

export function getColorLabel(color: ColorId): string {
  if (color.startsWith('neon_')) {
    return `Neon ${color.replace('neon_', '').replace('_', ' ')}`
  }
  return `${color.charAt(0).toUpperCase()}${color.slice(1)}`
}

export function getColorValue(color: ColorId): number {
  return COLOR_VALUES[color]
}

export function createDefaultMetaTree(): MetaTreeState {
  return {
    tap_mastery: 0,
    extract_efficiency: 0,
    operator_protocols: 0,
    exchange_protocols: 0,
    restore_flux: 0,
    refinery_mastery: 0,
  }
}

export function isColorAvailable(color: ColorId, milestoneFlags: MilestoneFlags): boolean {
  if (color === 'red') return true
  if (color === 'blue') return milestoneFlags.blueUnlocked
  if (color === 'yellow') return milestoneFlags.yellowUnlocked
  if (color === 'orange') return milestoneFlags.yellowUnlocked
  if (color === 'violet') return milestoneFlags.blueUnlocked
  if (color === 'green') return milestoneFlags.blueUnlocked && milestoneFlags.yellowUnlocked
  if (color === 'neon_red') return milestoneFlags.neonUnlocked
  if (color === 'neon_blue') return milestoneFlags.neonUnlocked && milestoneFlags.blueUnlocked
  if (color === 'neon_yellow') return milestoneFlags.neonUnlocked && milestoneFlags.yellowUnlocked
  if (color === 'neon_orange') return milestoneFlags.neonUnlocked && milestoneFlags.yellowUnlocked
  if (color === 'neon_violet') return milestoneFlags.neonUnlocked && milestoneFlags.blueUnlocked
  return milestoneFlags.neonUnlocked && milestoneFlags.blueUnlocked && milestoneFlags.yellowUnlocked
}

export function getAvailableColors(milestoneFlags: MilestoneFlags): ColorId[] {
  return ALL_COLORS.filter((color) => isColorAvailable(color, milestoneFlags))
}

export function calculateExtractionDistribution(
  extractedAmount: number,
  milestoneFlags: MilestoneFlags,
): Pick<ColorInventory, 'red' | 'blue' | 'yellow'> {
  const weights = {
    red: BASE_EXTRACTION_SPLIT.red,
    blue: milestoneFlags.blueUnlocked ? BASE_EXTRACTION_SPLIT.blue : 0,
    yellow: milestoneFlags.yellowUnlocked ? BASE_EXTRACTION_SPLIT.yellow : 0,
  }
  const weightTotal = weights.red + weights.blue + weights.yellow
  const normalized = {
    red: weightTotal > 0 ? weights.red / weightTotal : 1,
    blue: weightTotal > 0 ? weights.blue / weightTotal : 0,
    yellow: weightTotal > 0 ? weights.yellow / weightTotal : 0,
  }
  return {
    red: extractedAmount * normalized.red,
    blue: extractedAmount * normalized.blue,
    yellow: extractedAmount * normalized.yellow,
  }
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

export function calculateEffectiveUpgradeScalar(
  lane: UpgradeLaneId,
  currentTier: number,
  metaTree: MetaTreeState,
): number {
  const base = calculateUpgradeCost(lane, currentTier)
  if (lane !== 'extraction') {
    return base
  }
  const discount = 0.04 * metaTree.extract_efficiency
  return Math.max(1, Math.round(base * (1 - discount)))
}

function allocateColorCost(
  scalar: number,
  allocations: Array<{ color: ColorId; weight: number }>,
): ColorCost {
  if (scalar <= 0) {
    return {}
  }

  const raw = allocations.map((entry) => ({
    color: entry.color,
    raw: scalar * entry.weight,
  }))

  const result: ColorCost = {}
  let assigned = 0
  for (let i = 0; i < raw.length; i += 1) {
    const entry = raw[i]
    const value = Math.floor(entry.raw)
    result[entry.color] = value
    assigned += value
  }

  let remainder = scalar - assigned
  while (remainder > 0) {
    raw.sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)))
    for (let i = 0; i < raw.length && remainder > 0; i += 1) {
      const color = raw[i].color
      result[color] = (result[color] ?? 0) + 1
      remainder -= 1
    }
  }

  if (scalar >= allocations.length) {
    for (let i = 0; i < allocations.length; i += 1) {
      const color = allocations[i].color
      if ((result[color] ?? 0) <= 0) {
        result[color] = 1
        const fallbackColor = allocations[0].color
        if (fallbackColor !== color && (result[fallbackColor] ?? 0) > 1) {
          result[fallbackColor] = (result[fallbackColor] ?? 0) - 1
        }
      }
    }
  }

  return result
}

function fallbackColorForLane(lane: UpgradeLaneId, available: Set<ColorId>): ColorId {
  const candidates: Record<UpgradeLaneId, ColorId[]> = {
    extraction: ['red', 'blue', 'yellow'],
    automation: ['blue', 'red', 'yellow'],
    diffusion: ['yellow', 'red', 'blue'],
  }
  const laneCandidates = candidates[lane]
  for (let i = 0; i < laneCandidates.length; i += 1) {
    if (available.has(laneCandidates[i])) {
      return laneCandidates[i]
    }
  }
  return 'red'
}

function normalizeLaneCostAllocations(params: {
  lane: UpgradeLaneId
  allocations: Array<{ color: ColorId; weight: number }>
  available: Set<ColorId>
}): Array<{ color: ColorId; weight: number }> {
  const resolved = new Map<ColorId, number>()
  const fallback = fallbackColorForLane(params.lane, params.available)

  for (let i = 0; i < params.allocations.length; i += 1) {
    const entry = params.allocations[i]
    let color = entry.color
    if (!params.available.has(color)) {
      if (color.startsWith('neon_')) {
        const baseColor = color.replace('neon_', '') as ColorId
        if (params.available.has(baseColor)) {
          color = baseColor
        } else {
          color = fallback
        }
      } else {
        color = fallback
      }
    }
    resolved.set(color, (resolved.get(color) ?? 0) + entry.weight)
  }

  return Array.from(resolved.entries()).map(([color, weight]) => ({ color, weight }))
}

export function calculateLaneUpgradeColorCost(params: {
  lane: UpgradeLaneId
  nextTier: number
  scalarCost: number
  prestigeCount: number
  availableColors?: Iterable<ColorId>
}): ColorCost {
  const profile = LANE_COLOR_PRIORITY[params.lane]
  const available = params.availableColors
    ? new Set<ColorId>(params.availableColors)
    : FULL_COLOR_SET
  const withFallback = (allocations: Array<{ color: ColorId; weight: number }>) =>
    normalizeLaneCostAllocations({
      lane: params.lane,
      allocations,
      available,
    })

  if (params.nextTier < 18 || (params.nextTier < 30 && params.prestigeCount < 1)) {
    return allocateColorCost(params.scalarCost, withFallback([
      { color: profile.primary, weight: 0.7 },
      { color: profile.secondary, weight: 0.3 },
    ]))
  }

  if (params.nextTier < 30) {
    return allocateColorCost(params.scalarCost, withFallback([
      { color: profile.primary, weight: 0.55 },
      { color: profile.secondary, weight: 0.25 },
      { color: profile.neon, weight: 0.2 },
    ]))
  }

  return allocateColorCost(params.scalarCost, withFallback([
    { color: profile.primary, weight: 0.55 },
    { color: profile.neon, weight: 0.25 },
    { color: profile.cross, weight: 0.2 },
  ]))
}

export function canAffordColorCost(inventory: ColorInventory, cost: ColorCost): boolean {
  return Object.entries(cost).every(([color, amount]) => {
    const needed = Number(amount ?? 0)
    if (needed <= 0) return true
    return inventory[color as ColorId] >= needed
  })
}

export function calculateMissingColorCost(
  inventory: ColorInventory,
  cost: ColorCost,
): ColorCost {
  const missing: ColorCost = {}
  const entries = Object.entries(cost)
  for (let i = 0; i < entries.length; i += 1) {
    const [rawColor, rawAmount] = entries[i]
    const color = rawColor as ColorId
    const needed = Number(rawAmount ?? 0)
    if (needed <= 0) continue
    const remaining = Math.max(0, needed - inventory[color])
    if (remaining > 0) {
      missing[color] = remaining
    }
  }
  return missing
}

export function calculatePrestigeMultiplier(totalPrismShards: number): number {
  const earlyShards = Math.min(totalPrismShards, 24)
  const midShards = Math.min(Math.max(totalPrismShards - 24, 0), 48)
  const lateShards = Math.max(totalPrismShards - 72, 0)
  return 1 + earlyShards * PRISM_SHARD_MULTIPLIER + midShards * 0.075 + lateShards * 0.04
}

export function calculateEngagementMultiplier(
  momentum: number,
  unlockSurgeSeconds: number,
): number {
  const momentumBonus = clamp01(momentum) * MOMENTUM_MAX_BONUS
  const surgeBonus = unlockSurgeSeconds > 0 ? UNLOCK_SURGE_BONUS : 0
  return 1 + momentumBonus + surgeBonus
}

export function calculateTapGain(
  extractionTier: number,
  prestigeMultiplier: number,
  engagementMultiplier = 1,
  metaTree?: MetaTreeState,
): number {
  const tapMasteryMultiplier = 1 + (metaTree?.tap_mastery ?? 0) * 0.06
  return (
    BASE_TAP_GAIN *
    (1 + EXTRACTION_PER_TIER * extractionTier) *
    prestigeMultiplier *
    engagementMultiplier *
    tapMasteryMultiplier
  )
}

export function calculatePerOperatorRate(
  extractionTier: number,
  prestigeMultiplier: number,
  engagementMultiplier = 1,
  metaTree?: MetaTreeState,
): number {
  const operatorProtocolMultiplier = 1 + (metaTree?.operator_protocols ?? 0) * 0.05
  return (
    BASE_OPERATOR_RATE *
    (1 + OPERATOR_STRENGTH_PER_EXTRACTION_TIER * extractionTier) *
    prestigeMultiplier *
    engagementMultiplier *
    operatorProtocolMultiplier
  )
}

export function calculateDiffusionMultiplier(diffusionTier: number, metaTree?: MetaTreeState): number {
  const restoreFluxMultiplier = 1 + (metaTree?.restore_flux ?? 0) * 0.05
  return (1 + DIFFUSION_PER_TIER * diffusionTier) * restoreFluxMultiplier
}

export function calculateAutoGainPerSec(
  logicalOperators: number,
  extractionTier: number,
  prestigeMultiplier: number,
  engagementMultiplier = 1,
  metaTree?: MetaTreeState,
): number {
  return (
    logicalOperators *
    calculatePerOperatorRate(
      extractionTier,
      prestigeMultiplier,
      engagementMultiplier,
      metaTree,
    )
  )
}

export function calculateRestorationFromExtraction(
  extractedAmount: number,
  diffusionTier: number,
  metaTree?: MetaTreeState,
): number {
  return extractedAmount * calculateDiffusionMultiplier(diffusionTier, metaTree)
}

export function calculateRestorationPercent(restorationPoints: number): number {
  return Math.min(100, (restorationPoints / RESTORATION_TARGET_POINTS) * 100)
}

export function calculatePrestigeReadiness(restorationPercent: number): PrestigeReadiness {
  if (restorationPercent >= PRESTIGE_READINESS_THRESHOLDS.ready) {
    return 'ready'
  }
  if (restorationPercent >= PRESTIGE_READINESS_THRESHOLDS.critical) {
    return 'critical'
  }
  if (restorationPercent >= PRESTIGE_READINESS_THRESHOLDS.charged) {
    return 'charged'
  }
  return 'calm'
}

export function calculateEconomySnapshot(params: {
  extractionTier: number
  diffusionTier: number
  logicalOperators: number
  prestigeMultiplier: number
  engagementMultiplier?: number
  metaTree?: MetaTreeState
}): EconomySnapshot {
  const engagementMultiplier = params.engagementMultiplier ?? 1
  const tapGain = calculateTapGain(
    params.extractionTier,
    params.prestigeMultiplier,
    engagementMultiplier,
    params.metaTree,
  )
  const autoGainPerSec = calculateAutoGainPerSec(
    params.logicalOperators,
    params.extractionTier,
    params.prestigeMultiplier,
    engagementMultiplier,
    params.metaTree,
  )
  const restorationGainPerSec = calculateRestorationFromExtraction(
    autoGainPerSec,
    params.diffusionTier,
    params.metaTree,
  )

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

export function calculatePrestigeLaunchMomentum(earnedShards: number): number {
  return Math.min(0.45, 0.12 + earnedShards * 0.04)
}

export function calculatePrestigeLaunchSurgeSeconds(earnedShards: number): number {
  return Math.min(UNLOCK_SURGE_SECONDS, 6 + earnedShards)
}

export function calculateEstimatedSecondsToPrestige(
  restorationPoints: number,
  restorationGainPerSec: number,
): number | null {
  if (restorationPoints >= RESTORATION_TARGET_POINTS) {
    return 0
  }
  if (!Number.isFinite(restorationGainPerSec) || restorationGainPerSec <= 0) {
    return null
  }
  return Math.max(0, (RESTORATION_TARGET_POINTS - restorationPoints) / restorationGainPerSec)
}

export function calculatePrestigeResult(
  restorationPoints: number,
  currentShards: number,
  currentPrestigeCount: number,
): PrestigeResult {
  const earnedShards = calculatePrestigeReward(restorationPoints, currentShards)
  const newTotalShards = currentShards + earnedShards
  const newPrestigeCount = currentPrestigeCount + 1
  return {
    earnedShards,
    newTotalShards,
    launchMomentum: calculatePrestigeLaunchMomentum(earnedShards),
    launchSurgeSeconds: calculatePrestigeLaunchSurgeSeconds(earnedShards),
    newMultiplier: calculatePrestigeMultiplier(newTotalShards),
    newPrestigeCount,
    campaignComplete: newPrestigeCount >= 5,
  }
}

export function calculateOfflineGain(params: {
  elapsedSeconds: number
  autoGainPerSec: number
  diffusionTier: number
  metaTree: MetaTreeState
  milestoneFlags: MilestoneFlags
}): OfflineGainResult {
  const cappedSeconds = Math.min(params.elapsedSeconds, OFFLINE_CAP_SECONDS)
  const extracted = params.autoGainPerSec * cappedSeconds * OFFLINE_EFFICIENCY
  const inventoryAwarded = createEmptyInventory()
  const distribution = calculateExtractionDistribution(extracted, params.milestoneFlags)
  inventoryAwarded.red = distribution.red
  inventoryAwarded.blue = distribution.blue
  inventoryAwarded.yellow = distribution.yellow

  return {
    elapsedSeconds: params.elapsedSeconds,
    cappedSeconds,
    extractionSecondsAwarded: cappedSeconds,
    restorationAwarded: calculateRestorationFromExtraction(
      extracted,
      params.diffusionTier,
      params.metaTree,
    ),
    inventoryAwarded,
  }
}

export function calculateExchangeFeeRate(metaTree: MetaTreeState): number {
  const reduction = metaTree.exchange_protocols * EXCHANGE_FEE_REDUCTION_PER_RANK
  return Math.max(0, EXCHANGE_BASE_FEE - reduction)
}

export function calculateRefineryOutputPerBatch(metaTree: MetaTreeState): number {
  return REFINERY_OUTPUT_PER_BATCH * (1 + metaTree.refinery_mastery * 0.08)
}

export function calculateSwapQuote(params: {
  from: ColorId
  to: ColorId
  inputAmount: number
  feeRate: number
}): ExchangeQuote {
  const inputAmount = Math.max(0, Math.floor(params.inputAmount))
  const valueIn = getColorValue(params.from)
  const valueOut = getColorValue(params.to)

  if (inputAmount <= 0 || params.from === params.to || valueOut <= 0) {
    return {
      from: params.from,
      to: params.to,
      inputAmount,
      outputAmount: 0,
      feeRate: params.feeRate,
      valueIn,
      valueOut,
    }
  }

  const outputAmount = Math.floor(
    inputAmount * (valueIn / valueOut) * (1 - Math.max(0, params.feeRate)),
  )

  return {
    from: params.from,
    to: params.to,
    inputAmount,
    outputAmount: Math.max(0, outputAmount),
    feeRate: params.feeRate,
    valueIn,
    valueOut,
  }
}

export function clampInventoryNonNegative(inventory: ColorInventory): ColorInventory {
  const next = cloneInventory(inventory)
  for (let i = 0; i < ALL_COLORS.length; i += 1) {
    const color = ALL_COLORS[i]
    next[color] = Math.max(0, next[color])
  }
  return next
}

export function getMetaNodeRank(metaTree: MetaTreeState, nodeId: MetaNodeId): number {
  return metaTree[nodeId]
}
