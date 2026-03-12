export type UpgradeLaneId = 'extraction' | 'automation' | 'diffusion'

export interface UpgradeGate {
  tier: number
  minShards: number
}

export interface UpgradeLaneDefinition {
  id: UpgradeLaneId
  name: string
  description: string
  baseCost: number
  growth: number
  maxTier: number
  prestigeGates: UpgradeGate[]
}

export interface BuildingDefinition {
  id: string
  name: string
  unlockAtTotalTiers: number
  unlockAtPrismShards: number
  placement: 'ground' | 'orbital'
  color: string
}

export interface BuildingUpgradeOption {
  id: string
  name: string
  description: string
  lane: UpgradeLaneId
}

export type BaseColorId = 'red' | 'blue' | 'yellow'
export type CraftedColorId = 'green' | 'orange' | 'violet'
export type NormalColorId = BaseColorId | CraftedColorId
export type NeonColorId =
  | 'neon_red'
  | 'neon_blue'
  | 'neon_yellow'
  | 'neon_green'
  | 'neon_orange'
  | 'neon_violet'

export type ColorId = NormalColorId | NeonColorId
export type CurrencyId = ColorId | 'prism_shard'
export type ColorInventory = Record<ColorId, number>
export type ColorCost = Partial<Record<ColorId, number>>

export interface RecipeDefinition {
  id: string
  name: string
  output: CraftedColorId
  outputAmount: number
  unitDurationSeconds: number
  inputs: Partial<Record<NormalColorId, number>>
}

export interface RecipeQueueItem {
  id: string
  recipeId: string
  remainingUnits: number
  totalUnits: number
  progressSeconds: number
}

export interface RefineryQueueItem {
  id: string
  colorId: NormalColorId
  neonColorId: NeonColorId
  remainingBatches: number
  totalBatches: number
  progressSeconds: number
  inputPerBatch: number
  outputPerBatch: number
  unitDurationSeconds: number
}

export interface RefineryState {
  unlocked: boolean
  inputPerBatch: number
  outputPerBatch: number
  unitDurationSeconds: number
}

export interface ExchangeQuote {
  from: ColorId
  to: ColorId
  inputAmount: number
  outputAmount: number
  feeRate: number
  valueIn: number
  valueOut: number
}

export type PrestigeReadiness = 'calm' | 'charged' | 'critical' | 'ready'

export type MetaNodeId =
  | 'tap_mastery'
  | 'extract_efficiency'
  | 'operator_protocols'
  | 'exchange_protocols'
  | 'restore_flux'
  | 'refinery_mastery'

export interface MetaTreeNode {
  id: MetaNodeId
  branch: UpgradeLaneId
  name: string
  description: string
  maxRank: number
  costs: number[]
}

export type MetaTreeState = Record<MetaNodeId, number>

export interface EconomySnapshot {
  tapGain: number
  autoGainPerSec: number
  restorationGainPerSec: number
  engagementMultiplier: number
  prestigeMultiplier: number
}

export interface OfflineGainResult {
  elapsedSeconds: number
  cappedSeconds: number
  restorationAwarded: number
  extractionSecondsAwarded: number
  inventoryAwarded: ColorInventory
}

export interface PrestigeResult {
  earnedShards: number
  newTotalShards: number
  launchMomentum: number
  launchSurgeSeconds: number
  newMultiplier: number
  newPrestigeCount: number
  campaignComplete: boolean
}

export interface WorkforceState {
  logicalOperators: number
  visibleCap: number
  visibleOperators: number
  overflowOperators: number
  squads: number
}

export interface Vec2 {
  x: number
  y: number
}

export type OperatorState = 'approach' | 'siphon' | 'return' | 'recover'

export interface OperatorAgent {
  id: number
  state: OperatorState
  lane: number
  cycleProgress: number
  tintLevel: number
  phaseElapsed: number
  phaseDuration: number
  spawn: Vec2
  anchor: Vec2
  position: Vec2
}

export interface SquadBeacon {
  id: number
  representedCount: number
  anchorPosition: Vec2
  pulsePhase: number
}

export interface MilestoneFlags {
  blueUnlocked: boolean
  yellowUnlocked: boolean
  neonUnlocked: boolean
}

export interface GameState {
  inventory: ColorInventory
  restorationPoints: number
  restorationPercent: number
  momentum: number
  unlockSurgeSeconds: number
  prismShards: number
  unspentShards: number
  prestigeMultiplier: number
  upgrades: Record<UpgradeLaneId, number>
  totalUpgradesPurchased: number
  unlockedBuildings: number
  workforce: WorkforceState
  agents: OperatorAgent[]
  beacons: SquadBeacon[]
  economy: EconomySnapshot
  lastTickAt: number
  lastActiveAt: number
  lifetimeRestorationPoints: number
  offlineGainResult: OfflineGainResult | null
  recipeQueue: RecipeQueueItem[]
  refineryQueue: RefineryQueueItem[]
  runExtractionSeconds: number
  prestigeCount: number
  prestigeReadiness: PrestigeReadiness
  worldVisualTier: number
  metaTree: MetaTreeState
  campaignComplete: boolean
  milestoneFlags: MilestoneFlags
}

export interface SaveDataV1 {
  version: 1
  chroma: number
  restorationPoints: number
  prismShards: number
  upgrades: Record<UpgradeLaneId, number>
  totalUpgradesPurchased: number
  lifetimeRestorationPoints: number
  lastActiveAt: number
}

export interface SaveDataV2 {
  version: 2
  inventory: ColorInventory
  restorationPoints: number
  prismShards: number
  unspentShards: number
  upgrades: Record<UpgradeLaneId, number>
  totalUpgradesPurchased: number
  lifetimeRestorationPoints: number
  lastActiveAt: number
  runExtractionSeconds: number
  prestigeCount: number
  worldVisualTier: number
  metaTree: MetaTreeState
  campaignComplete: boolean
  milestoneFlags: MilestoneFlags
}
