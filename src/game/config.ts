import type {
  BaseColorId,
  BuildingDefinition,
  BuildingUpgradeOption,
  ColorId,
  MetaTreeNode,
  NeonColorId,
  RecipeDefinition,
  UpgradeLaneDefinition,
} from './types'

export const GAME_TITLE = 'Chromavault Extraction'

export const SAVE_KEY = 'chromavault-save-v2'
export const LEGACY_SAVE_KEYS = ['chromavault-save-v1']
export const SAVE_VERSION = 2

export const TICK_RATE_HZ = 10
export const TICK_SECONDS = 1 / TICK_RATE_HZ
export const SAVE_INTERVAL_MS = 10_000
export const OFFLINE_CAP_SECONDS = 3 * 60 * 60
export const OFFLINE_EFFICIENCY = 0.8

export const RESTORATION_TARGET_POINTS = 3_000_000
export const MAX_VISIBLE_OPERATORS = 48
export const MAX_BEACONS = 12
export const MAX_PARTICLES = 80

export const BASE_TAP_GAIN = 1
export const BASE_OPERATOR_RATE = 0.16
export const PRISM_SHARD_MULTIPLIER = 0.12
export const DIFFUSION_PER_TIER = 0.2
export const EXTRACTION_PER_TIER = 0.25
export const OPERATOR_STRENGTH_PER_EXTRACTION_TIER = 0.18
export const MOMENTUM_PER_TAP = 0.03
export const MOMENTUM_PER_UPGRADE = 0.12
export const MOMENTUM_DECAY_PER_SECOND = 0.045
export const MOMENTUM_MAX_BONUS = 0.45
export const UNLOCK_SURGE_SECONDS = 20
export const UNLOCK_SURGE_BONUS = 0.35

export const BLUE_UNLOCK_RESTORATION_PERCENT = 22
export const YELLOW_UNLOCK_RESTORATION_PERCENT = 54

export const BASE_COLORS: BaseColorId[] = ['red', 'blue', 'yellow']
export const NORMAL_COLORS: ColorId[] = ['red', 'blue', 'yellow', 'green', 'orange', 'violet']
export const NEON_COLORS: NeonColorId[] = [
  'neon_red',
  'neon_blue',
  'neon_yellow',
  'neon_green',
  'neon_orange',
  'neon_violet',
]

export const BASE_EXTRACTION_SPLIT: Record<BaseColorId, number> = {
  red: 0.34,
  blue: 0.33,
  yellow: 0.33,
}

export const NEON_COLOR_MAP: Record<Exclude<ColorId, NeonColorId>, NeonColorId> = {
  red: 'neon_red',
  blue: 'neon_blue',
  yellow: 'neon_yellow',
  green: 'neon_green',
  orange: 'neon_orange',
  violet: 'neon_violet',
}

export const COLOR_VALUES: Record<ColorId, number> = {
  red: 1,
  blue: 1.1,
  yellow: 1.1,
  orange: 2.2,
  green: 2.3,
  violet: 2.7,
  neon_red: 3.5,
  neon_blue: 3.85,
  neon_yellow: 3.85,
  neon_green: 8.05,
  neon_orange: 7.7,
  neon_violet: 9.45,
}

export const CRAFT_RECIPES: RecipeDefinition[] = [
  {
    id: 'craft_green',
    name: 'Green Synthesis',
    inputs: { blue: 10, yellow: 10 },
    output: 'green',
    outputAmount: 8,
    unitDurationSeconds: 4,
  },
  {
    id: 'craft_orange',
    name: 'Orange Synthesis',
    inputs: { red: 10, yellow: 10 },
    output: 'orange',
    outputAmount: 8,
    unitDurationSeconds: 4,
  },
  {
    id: 'craft_violet',
    name: 'Violet Synthesis',
    inputs: { red: 10, blue: 10 },
    output: 'violet',
    outputAmount: 8,
    unitDurationSeconds: 4,
  },
]

export const REFINERY_UNLOCK_PRESTIGE = 1
export const REFINERY_INPUT_PER_BATCH = 20
export const REFINERY_OUTPUT_PER_BATCH = 5
export const REFINERY_CYCLE_SECONDS = 20

export const EXCHANGE_BASE_FEE = 0.15
export const EXCHANGE_FEE_REDUCTION_PER_RANK = 0.02

export const PRESTIGE_READINESS_THRESHOLDS = {
  charged: 70,
  critical: 90,
  ready: 100,
} as const

export const META_TREE_NODES: MetaTreeNode[] = [
  {
    id: 'tap_mastery',
    branch: 'extraction',
    name: 'Tap Mastery',
    description: 'Increase tap extraction by 6% per rank.',
    maxRank: 5,
    costs: [1, 2, 4, 7, 11],
  },
  {
    id: 'extract_efficiency',
    branch: 'extraction',
    name: 'Extract Efficiency',
    description: 'Reduce extraction lane upgrade costs by 4% per rank.',
    maxRank: 4,
    costs: [1, 3, 6, 10],
  },
  {
    id: 'operator_protocols',
    branch: 'automation',
    name: 'Operator Protocols',
    description: 'Increase automation extraction by 5% per rank.',
    maxRank: 5,
    costs: [1, 2, 4, 7, 11],
  },
  {
    id: 'exchange_protocols',
    branch: 'automation',
    name: 'Exchange Protocols',
    description: 'Reduce exchange fee by 2% absolute per rank.',
    maxRank: 3,
    costs: [2, 5, 9],
  },
  {
    id: 'restore_flux',
    branch: 'diffusion',
    name: 'Restore Flux',
    description: 'Increase restoration conversion by 5% per rank.',
    maxRank: 5,
    costs: [1, 2, 4, 7, 11],
  },
  {
    id: 'refinery_mastery',
    branch: 'diffusion',
    name: 'Refinery Mastery',
    description: 'Increase refinery neon output by 8% per rank.',
    maxRank: 4,
    costs: [2, 4, 7, 11],
  },
]

export const BUILDINGS: BuildingDefinition[] = [
  {
    id: 'mission',
    name: 'Chroma Mission Control',
    unlockAtTotalTiers: 0,
    unlockAtPrismShards: 0,
    placement: 'ground',
    color: '#ff6f4a',
  },
  {
    id: 'research',
    name: 'Hue Research Lab',
    unlockAtTotalTiers: 16,
    unlockAtPrismShards: 0,
    placement: 'ground',
    color: '#ffd23f',
  },
  {
    id: 'purifier',
    name: 'Pigment Purifier',
    unlockAtTotalTiers: 34,
    unlockAtPrismShards: 8,
    placement: 'ground',
    color: '#6ae8ff',
  },
  {
    id: 'harmonizer',
    name: 'Spectrum Harmonizer',
    unlockAtTotalTiers: 52,
    unlockAtPrismShards: 20,
    placement: 'ground',
    color: '#66f57c',
  },
  {
    id: 'laser',
    name: 'Prism Lance Platform',
    unlockAtTotalTiers: 72,
    unlockAtPrismShards: 45,
    placement: 'orbital',
    color: '#ff84ef',
  },
  {
    id: 'drill',
    name: 'Chromadrill Ring',
    unlockAtTotalTiers: 92,
    unlockAtPrismShards: 82,
    placement: 'orbital',
    color: '#7d92ff',
  },
  {
    id: 'siphon',
    name: 'Aurora Siphon Array',
    unlockAtTotalTiers: 114,
    unlockAtPrismShards: 130,
    placement: 'orbital',
    color: '#ff63c3',
  },
  {
    id: 'anchor',
    name: 'Resonance Anchor',
    unlockAtTotalTiers: 136,
    unlockAtPrismShards: 190,
    placement: 'orbital',
    color: '#8dffde',
  },
]

export const BUILDING_UPGRADE_OPTIONS: Record<string, BuildingUpgradeOption[]> = {
  mission: [
    {
      id: 'mission-overclock',
      name: 'Mission Overclock',
      description: 'Increase mission-control extraction authority.',
      lane: 'extraction',
    },
    {
      id: 'mission-dispatch',
      name: 'Crew Dispatch',
      description: 'Coordinate larger vacuum operator deployments.',
      lane: 'automation',
    },
  ],
  research: [
    {
      id: 'research-spectrum',
      name: 'Spectrum Theory',
      description: 'Increase conversion quality from extracted color.',
      lane: 'diffusion',
    },
    {
      id: 'research-operators',
      name: 'Lab Operators',
      description: 'Add specialized analysts to automation teams.',
      lane: 'automation',
    },
  ],
  purifier: [
    {
      id: 'purifier-filters',
      name: 'Prism Filters',
      description: 'Purify raw chroma into stable extract channels.',
      lane: 'diffusion',
    },
    {
      id: 'purifier-feed',
      name: 'Feed Pressure',
      description: 'Raise transfer throughput into processing lanes.',
      lane: 'extraction',
    },
  ],
  harmonizer: [
    {
      id: 'harmonizer-wave',
      name: 'Harmonic Wave',
      description: 'Amplify area-wide color restoration resonance.',
      lane: 'diffusion',
    },
    {
      id: 'harmonizer-routing',
      name: 'Wave Routing',
      description: 'Route more crews into synchronized extraction cycles.',
      lane: 'automation',
    },
  ],
  laser: [
    {
      id: 'laser-focus',
      name: 'Lance Focus',
      description: 'Concentrate orbital prism lances on dense sectors.',
      lane: 'extraction',
    },
    {
      id: 'laser-prisms',
      name: 'Refraction Prisms',
      description: 'Split beams into higher-yield restoration vectors.',
      lane: 'diffusion',
    },
  ],
  drill: [
    {
      id: 'drill-core',
      name: 'Core Bore',
      description: 'Drive deeper into desaturated crust bands.',
      lane: 'extraction',
    },
    {
      id: 'drill-crews',
      name: 'Orbital Rigs',
      description: 'Scale automated rig teams around the ring.',
      lane: 'automation',
    },
  ],
  siphon: [
    {
      id: 'siphon-manifold',
      name: 'Siphon Manifold',
      description: 'Pull atmospheric chroma streams into the core.',
      lane: 'diffusion',
    },
    {
      id: 'siphon-extractors',
      name: 'Array Extractors',
      description: 'Multiply orbital extraction heads around the orb.',
      lane: 'automation',
    },
  ],
  anchor: [
    {
      id: 'anchor-lock',
      name: 'Resonance Lock',
      description: 'Anchor stable color frequencies for extreme output.',
      lane: 'extraction',
    },
    {
      id: 'anchor-field',
      name: 'Anchor Field',
      description: 'Sustain full-spectrum restoration at scale.',
      lane: 'diffusion',
    },
  ],
}

export const UPGRADE_LANES: UpgradeLaneDefinition[] = [
  {
    id: 'extraction',
    name: 'Extraction Power',
    description: 'Stronger taps and per-operator siphon strength.',
    baseCost: 12,
    growth: 1.5,
    maxTier: 48,
    prestigeGates: [
      { tier: 18, minShards: 20 },
      { tier: 28, minShards: 55 },
      { tier: 36, minShards: 120 },
      { tier: 44, minShards: 230 },
    ],
  },
  {
    id: 'automation',
    name: 'Automation Crew',
    description: 'Increases active vacuum operator headcount.',
    baseCost: 34,
    growth: 1.59,
    maxTier: 48,
    prestigeGates: [
      { tier: 16, minShards: 18 },
      { tier: 26, minShards: 50 },
      { tier: 34, minShards: 110 },
      { tier: 42, minShards: 220 },
    ],
  },
  {
    id: 'diffusion',
    name: 'Diffusion',
    description: 'Improves restoration conversion efficiency.',
    baseCost: 60,
    growth: 1.67,
    maxTier: 48,
    prestigeGates: [
      { tier: 14, minShards: 22 },
      { tier: 24, minShards: 65 },
      { tier: 32, minShards: 140 },
      { tier: 40, minShards: 260 },
      { tier: 47, minShards: 380 },
    ],
  },
]

export const OPERATOR_CYCLE_SECONDS = {
  approach: 0.9,
  siphon: 1.2,
  return: 0.9,
  recover: 0.4,
} as const

export const OPERATOR_PHASE_ORDER = ['approach', 'siphon', 'return', 'recover'] as const
