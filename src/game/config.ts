import type { BuildingDefinition, UpgradeLaneDefinition } from './types'

export const GAME_TITLE = 'Chromavault Extraction'

export const SAVE_KEY = 'chromavault-save-v1'
export const SAVE_VERSION = 1

export const TICK_RATE_HZ = 10
export const TICK_SECONDS = 1 / TICK_RATE_HZ
export const SAVE_INTERVAL_MS = 10_000
export const OFFLINE_CAP_SECONDS = 8 * 60 * 60
export const OFFLINE_EFFICIENCY = 0.8

export const RESTORATION_TARGET_POINTS = 120_000
export const MAX_VISIBLE_OPERATORS = 48
export const MAX_BEACONS = 12
export const MAX_PARTICLES = 80

export const BASE_TAP_GAIN = 1
export const BASE_OPERATOR_RATE = 0.14
export const PRISM_SHARD_MULTIPLIER = 0.12
export const DIFFUSION_PER_TIER = 0.2
export const EXTRACTION_PER_TIER = 0.25
export const OPERATOR_STRENGTH_PER_EXTRACTION_TIER = 0.18

export const BUILDINGS: BuildingDefinition[] = [
  { id: 'core', name: 'Core Dock', unlockAtTotalTiers: 1, color: '#ff6f4a' },
  { id: 'pump', name: 'Pulse Pump', unlockAtTotalTiers: 4, color: '#ffd23f' },
  { id: 'refinery', name: 'Spectrum Refinery', unlockAtTotalTiers: 8, color: '#6ae8ff' },
  { id: 'diffuser', name: 'Diffusion Lab', unlockAtTotalTiers: 13, color: '#66f57c' },
  { id: 'storage', name: 'Prism Storage', unlockAtTotalTiers: 19, color: '#ff84ef' },
  { id: 'spire', name: 'Aurora Spire', unlockAtTotalTiers: 26, color: '#7d92ff' },
]

export const UPGRADE_LANES: UpgradeLaneDefinition[] = [
  {
    id: 'extraction',
    name: 'Extraction Power',
    description: 'Stronger taps and per-operator siphon strength.',
    baseCost: 10,
    growth: 1.45,
    maxTier: 12,
  },
  {
    id: 'automation',
    name: 'Automation Crew',
    description: 'Increases active vacuum operator headcount.',
    baseCost: 25,
    growth: 1.6,
    maxTier: 12,
  },
  {
    id: 'diffusion',
    name: 'Diffusion',
    description: 'Improves restoration conversion efficiency.',
    baseCost: 40,
    growth: 1.7,
    maxTier: 12,
  },
]

export const OPERATOR_CYCLE_SECONDS = {
  approach: 0.9,
  siphon: 1.2,
  return: 0.9,
  recover: 0.4,
} as const

export const OPERATOR_PHASE_ORDER = [
  'approach',
  'siphon',
  'return',
  'recover',
] as const

