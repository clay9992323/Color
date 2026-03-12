export type UpgradeLaneId = 'extraction' | 'automation' | 'diffusion'
export type ColorCurrencyId = 'cyan' | 'magenta'

export type OperatorState = 'approach' | 'siphon' | 'return' | 'recover'

export interface Vec2 {
  x: number
  y: number
}

export type BuildingPlacement = 'ground' | 'orbital'

export interface BuildingDefinition {
  id: string
  name: string
  unlockAtTotalTiers: number
  unlockAtPrismShards: number
  placement: BuildingPlacement
  color: string
}

export interface BuildingUpgradeOption {
  id: string
  name: string
  description: string
  lane: UpgradeLaneId
}

export interface UpgradePrestigeGate {
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
  prestigeGates: UpgradePrestigeGate[]
}

export interface WorkforceState {
  logicalOperators: number
  visibleCap: number
  visibleOperators: number
  overflowOperators: number
  squads: number
}

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
  chromaAwarded: number
  restorationAwarded: number
}

export interface PrestigeResult {
  earnedShards: number
  newTotalShards: number
  launchChroma: number
  launchMomentum: number
  launchSurgeSeconds: number
  newMultiplier: number
}

export interface SaveDataV1 {
  version: 1
  chroma: number
  magenta: number
  restorationPoints: number
  prismShards: number
  upgrades: Record<UpgradeLaneId, number>
  totalUpgradesPurchased: number
  lifetimeRestorationPoints: number
  lastActiveAt: number
}

export interface GameState {
  chroma: number
  magenta: number
  magentaUnlocked: boolean
  restorationPoints: number
  restorationPercent: number
  momentum: number
  unlockSurgeSeconds: number
  prismShards: number
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
}
