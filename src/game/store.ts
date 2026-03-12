import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  BLUE_UNLOCK_RESTORATION_PERCENT,
  BUILDINGS,
  CRAFT_RECIPES,
  LEGACY_SAVE_KEYS,
  MOMENTUM_DECAY_PER_SECOND,
  MOMENTUM_PER_TAP,
  MOMENTUM_PER_UPGRADE,
  NEON_COLOR_MAP,
  REFINERY_CYCLE_SECONDS,
  REFINERY_INPUT_PER_BATCH,
  SAVE_KEY,
  SAVE_VERSION,
  TICK_SECONDS,
  UNLOCK_SURGE_SECONDS,
  UPGRADE_LANES,
  YELLOW_UNLOCK_RESTORATION_PERCENT,
  META_TREE_NODES,
} from './config'
import {
  addInventory,
  calculateExtractionDistribution,
  calculateEconomySnapshot,
  calculateEffectiveUpgradeScalar,
  calculateEngagementMultiplier,
  calculateExchangeFeeRate,
  calculateLaneUpgradeColorCost,
  calculateMissingColorCost,
  calculateOfflineGain,
  calculatePrestigeMultiplier,
  calculatePrestigeReadiness,
  calculatePrestigeResult,
  calculateRefineryOutputPerBatch,
  calculateRestorationFromExtraction,
  calculateRestorationPercent,
  calculateSwapQuote,
  calculateUpgradeShardRequirement,
  canAffordColorCost,
  cloneInventory,
  createDefaultMetaTree,
  createEmptyInventory,
  getAvailableColors,
  isColorAvailable,
} from './economy'
import type {
  ColorCost,
  ColorId,
  ExchangeQuote,
  GameState,
  MetaNodeId,
  OfflineGainResult,
  PrestigeResult,
  RecipeQueueItem,
  RefineryQueueItem,
  SaveDataV1,
  SaveDataV2,
  UpgradeLaneId,
} from './types'
import {
  calculateWorkforce,
  createOperators,
  createSquadBeacons,
  stepBeacons,
  stepOperators,
} from './workforce'

export interface GameStore extends GameState {
  initialized: boolean
  initialize: () => void
  tick: (deltaSeconds?: number) => void
  extract: () => void
  purchaseUpgrade: (lane: UpgradeLaneId) => boolean
  getUpgradeColorCost: (lane: UpgradeLaneId) => ColorCost
  craftColor: (recipeId: string, amount: number) => boolean
  refineToNeon: (colorId: Exclude<ColorId, `neon_${string}`>, amount: number) => boolean
  quoteSwap: (from: ColorId, to: ColorId, amount: number) => ExchangeQuote
  executeSwap: (from: ColorId, to: ColorId, amount: number) => boolean
  purchaseMetaNode: (nodeId: MetaNodeId) => boolean
  prestige: () => PrestigeResult | null
  dismissOfflineGain: () => void
  saveNow: () => void
}

interface BaseState {
  inventory: ReturnType<typeof createEmptyInventory>
  restorationPoints: number
  momentum: number
  unlockSurgeSeconds: number
  prismShards: number
  unspentShards: number
  upgrades: Record<UpgradeLaneId, number>
  totalUpgradesPurchased: number
  lifetimeRestorationPoints: number
  lastTickAt: number
  lastActiveAt: number
  offlineGainResult: OfflineGainResult | null
  recipeQueue: RecipeQueueItem[]
  refineryQueue: RefineryQueueItem[]
  runExtractionSeconds: number
  prestigeCount: number
  worldVisualTier: number
  metaTree: ReturnType<typeof createDefaultMetaTree>
  campaignComplete: boolean
  milestoneFlags: {
    blueUnlocked: boolean
    yellowUnlocked: boolean
    neonUnlocked: boolean
  }
}

const DEFAULT_UPGRADES: Record<UpgradeLaneId, number> = {
  extraction: 0,
  automation: 0,
  diffusion: 0,
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function buildRecipeCost(recipeId: string, amount: number): ColorCost {
  const recipe = CRAFT_RECIPES.find((entry) => entry.id === recipeId)
  if (!recipe) {
    return {}
  }
  const cost: ColorCost = {}
  const entries = Object.entries(recipe.inputs)
  for (let i = 0; i < entries.length; i += 1) {
    const [color, unitCost] = entries[i]
    const value = Number(unitCost ?? 0)
    if (value > 0) {
      cost[color as ColorId] = value * amount
    }
  }
  return cost
}

function applyCost(inventory: ReturnType<typeof createEmptyInventory>, cost: ColorCost) {
  const next = cloneInventory(inventory)
  const entries = Object.entries(cost)
  for (let i = 0; i < entries.length; i += 1) {
    const [rawColor, rawAmount] = entries[i]
    const color = rawColor as ColorId
    const amount = Number(rawAmount ?? 0)
    if (amount > 0) {
      next[color] = Math.max(0, next[color] - amount)
    }
  }
  return next
}

function createBaseState(
  now: number,
  prismShards = 0,
  unspentShards = prismShards,
  metaTree = createDefaultMetaTree(),
  prestigeCount = 0,
  worldVisualTier = 0,
  campaignComplete = false,
): BaseState {
  return {
    inventory: createEmptyInventory(),
    restorationPoints: 0,
    momentum: 0,
    unlockSurgeSeconds: 0,
    prismShards,
    unspentShards,
    upgrades: { ...DEFAULT_UPGRADES },
    totalUpgradesPurchased: 0,
    lifetimeRestorationPoints: 0,
    lastTickAt: now,
    lastActiveAt: now,
    offlineGainResult: null,
    recipeQueue: [],
    refineryQueue: [],
    runExtractionSeconds: 0,
    prestigeCount,
    worldVisualTier,
    metaTree: { ...metaTree },
    campaignComplete,
    milestoneFlags: {
      blueUnlocked: false,
      yellowUnlocked: false,
      neonUnlocked: prestigeCount >= 1,
    },
  }
}

function baseFromState(state: GameState): BaseState {
  return {
    inventory: cloneInventory(state.inventory),
    restorationPoints: state.restorationPoints,
    momentum: state.momentum,
    unlockSurgeSeconds: state.unlockSurgeSeconds,
    prismShards: state.prismShards,
    unspentShards: state.unspentShards,
    upgrades: { ...state.upgrades },
    totalUpgradesPurchased: state.totalUpgradesPurchased,
    lifetimeRestorationPoints: state.lifetimeRestorationPoints,
    lastTickAt: state.lastTickAt,
    lastActiveAt: state.lastActiveAt,
    offlineGainResult: state.offlineGainResult,
    recipeQueue: state.recipeQueue.map((item) => ({ ...item })),
    refineryQueue: state.refineryQueue.map((item) => ({ ...item })),
    runExtractionSeconds: state.runExtractionSeconds,
    prestigeCount: state.prestigeCount,
    worldVisualTier: state.worldVisualTier,
    metaTree: { ...state.metaTree },
    campaignComplete: state.campaignComplete,
    milestoneFlags: { ...state.milestoneFlags },
  }
}

function refreshColorUnlockMilestones(base: BaseState): void {
  const restorationPercent = calculateRestorationPercent(base.restorationPoints)
  if (!base.milestoneFlags.blueUnlocked && restorationPercent >= BLUE_UNLOCK_RESTORATION_PERCENT) {
    base.milestoneFlags.blueUnlocked = true
  }
  if (
    !base.milestoneFlags.yellowUnlocked &&
    restorationPercent >= YELLOW_UNLOCK_RESTORATION_PERCENT
  ) {
    base.milestoneFlags.yellowUnlocked = true
  }
  if (!base.milestoneFlags.neonUnlocked && base.prestigeCount >= 1) {
    base.milestoneFlags.neonUnlocked = true
  }
}

export function calculateUnlockedBuildingCount(
  totalUpgradesPurchased: number,
  prismShards: number,
): number {
  let unlocked = 0
  for (let i = 0; i < BUILDINGS.length; i += 1) {
    const building = BUILDINGS[i]
    const meetsTier = totalUpgradesPurchased >= building.unlockAtTotalTiers
    const meetsShards = prismShards >= building.unlockAtPrismShards
    if (!meetsTier || !meetsShards) {
      break
    }
    unlocked += 1
  }
  return Math.max(1, Math.min(BUILDINGS.length, unlocked))
}

function hydrateState(base: BaseState, previous?: GameState): GameState {
  refreshColorUnlockMilestones(base)
  const unlockedBuildings = calculateUnlockedBuildingCount(
    base.totalUpgradesPurchased,
    base.prismShards,
  )
  const workforce = calculateWorkforce(base.upgrades.automation, unlockedBuildings)
  const restorationPercent = calculateRestorationPercent(base.restorationPoints)
  const prestigeReadiness = calculatePrestigeReadiness(restorationPercent)
  const engagementMultiplier = calculateEngagementMultiplier(
    base.momentum,
    base.unlockSurgeSeconds,
  )
  const prestigeMultiplier = calculatePrestigeMultiplier(base.prismShards)
  const economy = calculateEconomySnapshot({
    extractionTier: base.upgrades.extraction,
    diffusionTier: base.upgrades.diffusion,
    logicalOperators: workforce.logicalOperators,
    prestigeMultiplier,
    engagementMultiplier,
    metaTree: base.metaTree,
  })
  const laneCount = Math.max(1, unlockedBuildings)
  const tintLevel = restorationPercent / 100

  const canReuseOperators =
    !!previous &&
    previous.agents.length === workforce.visibleOperators &&
    previous.unlockedBuildings === unlockedBuildings

  const agents = canReuseOperators
    ? previous.agents.map((agent) => ({
        ...agent,
        lane: agent.id % laneCount,
        tintLevel,
      }))
    : createOperators(workforce.visibleOperators, laneCount, tintLevel)

  const beacons = createSquadBeacons(workforce.squads, workforce.overflowOperators)

  return {
    inventory: cloneInventory(base.inventory),
    restorationPoints: base.restorationPoints,
    restorationPercent,
    momentum: base.momentum,
    unlockSurgeSeconds: base.unlockSurgeSeconds,
    prismShards: base.prismShards,
    unspentShards: base.unspentShards,
    prestigeMultiplier,
    upgrades: { ...base.upgrades },
    totalUpgradesPurchased: base.totalUpgradesPurchased,
    unlockedBuildings,
    workforce,
    agents,
    beacons,
    economy,
    lastTickAt: base.lastTickAt,
    lastActiveAt: base.lastActiveAt,
    lifetimeRestorationPoints: base.lifetimeRestorationPoints,
    offlineGainResult: base.offlineGainResult,
    recipeQueue: base.recipeQueue,
    refineryQueue: base.refineryQueue,
    runExtractionSeconds: base.runExtractionSeconds,
    prestigeCount: base.prestigeCount,
    prestigeReadiness,
    worldVisualTier: base.worldVisualTier,
    metaTree: { ...base.metaTree },
    campaignComplete: base.campaignComplete || base.prestigeCount >= 5,
    milestoneFlags: { ...base.milestoneFlags },
  }
}

export function parseSave(raw: string | null): SaveDataV1 | SaveDataV2 | null {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') {
      return null
    }
    const data = parsed as Record<string, unknown>

    if (data.version === 1) {
      if (typeof data.chroma !== 'number') return null
      if (typeof data.restorationPoints !== 'number') return null
      if (typeof data.prismShards !== 'number') return null
      if (typeof data.totalUpgradesPurchased !== 'number') return null
      if (typeof data.lifetimeRestorationPoints !== 'number') return null
      if (typeof data.lastActiveAt !== 'number') return null
      if (!data.upgrades || typeof data.upgrades !== 'object') return null
      const upgrades = data.upgrades as Record<string, unknown>
      return {
        version: 1,
        chroma: data.chroma,
        restorationPoints: data.restorationPoints,
        prismShards: data.prismShards,
        upgrades: {
          extraction: Number(upgrades.extraction ?? 0),
          automation: Number(upgrades.automation ?? 0),
          diffusion: Number(upgrades.diffusion ?? 0),
        },
        totalUpgradesPurchased: data.totalUpgradesPurchased,
        lifetimeRestorationPoints: data.lifetimeRestorationPoints,
        lastActiveAt: data.lastActiveAt,
      }
    }

    if (data.version === SAVE_VERSION) {
      if (!data.inventory || typeof data.inventory !== 'object') return null
      if (typeof data.restorationPoints !== 'number') return null
      if (typeof data.prismShards !== 'number') return null
      if (typeof data.unspentShards !== 'number') return null
      if (typeof data.totalUpgradesPurchased !== 'number') return null
      if (typeof data.lifetimeRestorationPoints !== 'number') return null
      if (typeof data.lastActiveAt !== 'number') return null
      if (typeof data.runExtractionSeconds !== 'number') return null
      if (typeof data.prestigeCount !== 'number') return null
      if (typeof data.worldVisualTier !== 'number') return null
      if (!data.upgrades || typeof data.upgrades !== 'object') return null
      if (!data.metaTree || typeof data.metaTree !== 'object') return null
      if (!data.milestoneFlags || typeof data.milestoneFlags !== 'object') return null
      const upgrades = data.upgrades as Record<string, unknown>
      const metaTree = data.metaTree as Record<string, unknown>
      const milestoneFlags = data.milestoneFlags as Record<string, unknown>

      return {
        version: 2,
        inventory: addInventory(
          createEmptyInventory(),
          data.inventory as Partial<ReturnType<typeof createEmptyInventory>>,
        ),
        restorationPoints: data.restorationPoints,
        prismShards: data.prismShards,
        unspentShards: data.unspentShards,
        upgrades: {
          extraction: Number(upgrades.extraction ?? 0),
          automation: Number(upgrades.automation ?? 0),
          diffusion: Number(upgrades.diffusion ?? 0),
        },
        totalUpgradesPurchased: data.totalUpgradesPurchased,
        lifetimeRestorationPoints: data.lifetimeRestorationPoints,
        lastActiveAt: data.lastActiveAt,
        runExtractionSeconds: data.runExtractionSeconds,
        prestigeCount: data.prestigeCount,
        worldVisualTier: data.worldVisualTier,
        metaTree: {
          ...createDefaultMetaTree(),
          ...metaTree,
        },
        campaignComplete: Boolean(data.campaignComplete),
        milestoneFlags: {
          blueUnlocked: Boolean(milestoneFlags.blueUnlocked),
          yellowUnlocked: Boolean(milestoneFlags.yellowUnlocked),
          neonUnlocked: Boolean(milestoneFlags.neonUnlocked),
        },
      }
    }
    return null
  } catch {
    return null
  }
}

function readSave(): SaveDataV1 | SaveDataV2 | null {
  if (!isBrowser()) {
    return null
  }

  const primary = parseSave(window.localStorage.getItem(SAVE_KEY))
  if (primary) {
    return primary
  }

  for (let i = 0; i < LEGACY_SAVE_KEYS.length; i += 1) {
    const legacy = parseSave(window.localStorage.getItem(LEGACY_SAVE_KEYS[i]))
    if (legacy) {
      return legacy
    }
  }

  return null
}

export function toBaseState(save: SaveDataV1 | SaveDataV2, now: number): BaseState {
  if (save.version === 1) {
    const base = createBaseState(now, save.prismShards, save.prismShards)
    base.inventory.red = save.chroma
    base.restorationPoints = save.restorationPoints
    base.upgrades = { ...save.upgrades }
    base.totalUpgradesPurchased = save.totalUpgradesPurchased
    base.lifetimeRestorationPoints = save.lifetimeRestorationPoints
    return base
  }

  const base = createBaseState(
    now,
    save.prismShards,
    save.unspentShards,
    save.metaTree,
    save.prestigeCount,
    save.worldVisualTier,
    save.campaignComplete,
  )
  base.inventory = addInventory(createEmptyInventory(), save.inventory)
  base.restorationPoints = save.restorationPoints
  base.upgrades = { ...save.upgrades }
  base.totalUpgradesPurchased = save.totalUpgradesPurchased
  base.lifetimeRestorationPoints = save.lifetimeRestorationPoints
  base.runExtractionSeconds = save.runExtractionSeconds
  base.milestoneFlags = {
    blueUnlocked: save.milestoneFlags.blueUnlocked,
    yellowUnlocked: save.milestoneFlags.yellowUnlocked,
    neonUnlocked: save.milestoneFlags.neonUnlocked,
  }
  return base
}

function toSaveData(state: GameState): SaveDataV2 {
  return {
    version: 2,
    inventory: cloneInventory(state.inventory),
    restorationPoints: state.restorationPoints,
    prismShards: state.prismShards,
    unspentShards: state.unspentShards,
    upgrades: { ...state.upgrades },
    totalUpgradesPurchased: state.totalUpgradesPurchased,
    lifetimeRestorationPoints: state.lifetimeRestorationPoints,
    lastActiveAt: state.lastActiveAt,
    runExtractionSeconds: state.runExtractionSeconds,
    prestigeCount: state.prestigeCount,
    worldVisualTier: state.worldVisualTier,
    metaTree: { ...state.metaTree },
    campaignComplete: state.campaignComplete,
    milestoneFlags: { ...state.milestoneFlags },
  }
}

function stepRecipeQueue(base: BaseState, deltaSeconds: number): void {
  let remaining = deltaSeconds
  while (remaining > 0 && base.recipeQueue.length > 0) {
    const current = base.recipeQueue[0]
    const recipe = CRAFT_RECIPES.find((entry) => entry.id === current.recipeId)
    if (!recipe) {
      base.recipeQueue.shift()
      continue
    }

    const toComplete = recipe.unitDurationSeconds - current.progressSeconds
    const advance = Math.min(remaining, toComplete)
    current.progressSeconds += advance
    remaining -= advance

    if (current.progressSeconds >= recipe.unitDurationSeconds) {
      base.inventory[recipe.output] += recipe.outputAmount
      current.remainingUnits -= 1
      current.progressSeconds = 0
      if (current.remainingUnits <= 0) {
        base.recipeQueue.shift()
      }
    }
  }
}

function stepRefineryQueue(base: BaseState, deltaSeconds: number): void {
  let remaining = deltaSeconds
  while (remaining > 0 && base.refineryQueue.length > 0) {
    const current = base.refineryQueue[0]
    const toComplete = current.unitDurationSeconds - current.progressSeconds
    const advance = Math.min(remaining, toComplete)
    current.progressSeconds += advance
    remaining -= advance

    if (current.progressSeconds >= current.unitDurationSeconds) {
      base.inventory[current.neonColorId] += current.outputPerBatch
      current.remainingBatches -= 1
      current.progressSeconds = 0
      if (current.remainingBatches <= 0) {
        base.refineryQueue.shift()
      }
    }
  }
}

function deriveUpgradeCost(state: GameState, lane: UpgradeLaneId): ColorCost {
  const nextTier = state.upgrades[lane] + 1
  const scalarCost = calculateEffectiveUpgradeScalar(lane, state.upgrades[lane], state.metaTree)
  return calculateLaneUpgradeColorCost({
    lane,
    nextTier,
    scalarCost,
    prestigeCount: state.prestigeCount,
    availableColors: getAvailableColors(state.milestoneFlags),
  })
}

function createPostPrestigeBase(state: GameState, result: PrestigeResult, now: number): BaseState {
  const base = createBaseState(
    now,
    result.newTotalShards,
    state.unspentShards + result.earnedShards,
    state.metaTree,
    result.newPrestigeCount,
    Math.max(state.worldVisualTier, result.newPrestigeCount),
    result.campaignComplete,
  )
  base.momentum = result.launchMomentum
  base.unlockSurgeSeconds = result.launchSurgeSeconds
  base.lifetimeRestorationPoints = state.lifetimeRestorationPoints
  base.milestoneFlags = {
    blueUnlocked: false,
    yellowUnlocked: false,
    neonUnlocked: result.newPrestigeCount >= 1,
  }
  return base
}

export function createGameStore() {
  const now = Date.now()
  const initial = hydrateState(createBaseState(now))

  return createStore<GameStore>((set, get) => ({
    ...initial,
    initialized: false,

    initialize: () => {
      const nowTs = Date.now()
      if (!isBrowser()) {
        set({ initialized: true, lastTickAt: nowTs, lastActiveAt: nowTs })
        return
      }

      const parsed = readSave()
      if (!parsed) {
        const fresh = hydrateState(createBaseState(nowTs))
        set({ ...fresh, initialized: true })
        return
      }

      const base = toBaseState(parsed, nowTs)
      const hydrated = hydrateState(base)
      const elapsedSeconds = Math.max(0, (nowTs - parsed.lastActiveAt) / 1000)
      const offline = calculateOfflineGain({
        elapsedSeconds,
        autoGainPerSec: hydrated.economy.autoGainPerSec,
        diffusionTier: base.upgrades.diffusion,
        metaTree: base.metaTree,
        milestoneFlags: base.milestoneFlags,
      })

      base.inventory = addInventory(base.inventory, offline.inventoryAwarded)
      base.restorationPoints += offline.restorationAwarded
      base.lifetimeRestorationPoints += offline.restorationAwarded
      base.runExtractionSeconds += offline.extractionSecondsAwarded
      refreshColorUnlockMilestones(base)
      base.offlineGainResult = offline
      const finalState = hydrateState(base, hydrated)
      set({ ...finalState, initialized: true })
    },

    tick: (deltaSeconds = TICK_SECONDS) => {
      const nowTick = Date.now()
      set((state) => {
        const base = baseFromState(state)
        base.momentum = Math.max(0, base.momentum - MOMENTUM_DECAY_PER_SECOND * deltaSeconds)
        base.unlockSurgeSeconds = Math.max(0, base.unlockSurgeSeconds - deltaSeconds)

        const engagementMultiplier = calculateEngagementMultiplier(
          base.momentum,
          base.unlockSurgeSeconds,
        )
        const prestigeMultiplier = calculatePrestigeMultiplier(base.prismShards)
        const economy = calculateEconomySnapshot({
          extractionTier: base.upgrades.extraction,
          diffusionTier: base.upgrades.diffusion,
          logicalOperators: state.workforce.logicalOperators,
          prestigeMultiplier,
          engagementMultiplier,
          metaTree: base.metaTree,
        })

        const autoGain = economy.autoGainPerSec * deltaSeconds
        const autoDistribution = calculateExtractionDistribution(autoGain, base.milestoneFlags)
        base.inventory.red += autoDistribution.red
        base.inventory.blue += autoDistribution.blue
        base.inventory.yellow += autoDistribution.yellow

        const restorationGain = calculateRestorationFromExtraction(
          autoGain,
          base.upgrades.diffusion,
          base.metaTree,
        )
        base.restorationPoints += restorationGain
        base.lifetimeRestorationPoints += restorationGain
        base.runExtractionSeconds += deltaSeconds
        refreshColorUnlockMilestones(base)

        stepRecipeQueue(base, deltaSeconds)
        stepRefineryQueue(base, deltaSeconds)

        base.lastTickAt = nowTick
        base.lastActiveAt = nowTick
        const next = hydrateState(base, state)
        return {
          ...next,
          agents: stepOperators(
            next.agents,
            deltaSeconds,
            Math.max(1, next.unlockedBuildings),
            next.restorationPercent / 100,
          ),
          beacons: stepBeacons(next.beacons, deltaSeconds),
        }
      })
    },

    extract: () => {
      const nowTick = Date.now()
      set((state) => {
        const base = baseFromState(state)
        base.momentum = Math.min(1, base.momentum + MOMENTUM_PER_TAP)

        const engagementMultiplier = calculateEngagementMultiplier(
          base.momentum,
          base.unlockSurgeSeconds,
        )
        const prestigeMultiplier = calculatePrestigeMultiplier(base.prismShards)
        const economy = calculateEconomySnapshot({
          extractionTier: base.upgrades.extraction,
          diffusionTier: base.upgrades.diffusion,
          logicalOperators: state.workforce.logicalOperators,
          prestigeMultiplier,
          engagementMultiplier,
          metaTree: base.metaTree,
        })

        const gain = economy.tapGain
        const tapDistribution = calculateExtractionDistribution(gain, base.milestoneFlags)
        base.inventory.red += tapDistribution.red
        base.inventory.blue += tapDistribution.blue
        base.inventory.yellow += tapDistribution.yellow

        const restorationGain = calculateRestorationFromExtraction(
          gain,
          base.upgrades.diffusion,
          base.metaTree,
        )
        base.restorationPoints += restorationGain
        base.lifetimeRestorationPoints += restorationGain
        refreshColorUnlockMilestones(base)
        base.lastTickAt = nowTick
        base.lastActiveAt = nowTick

        return hydrateState(base, state)
      })
    },

    getUpgradeColorCost: (lane: UpgradeLaneId) => {
      const state = get()
      return deriveUpgradeCost(state, lane)
    },

    purchaseUpgrade: (lane: UpgradeLaneId) => {
      const state = get()
      const laneDef = UPGRADE_LANES.find((entry) => entry.id === lane)
      if (!laneDef) {
        return false
      }

      const currentTier = state.upgrades[lane]
      if (currentTier >= laneDef.maxTier) {
        return false
      }

      const nextTier = currentTier + 1
      const requiredShards = calculateUpgradeShardRequirement(lane, nextTier)
      if (state.prismShards < requiredShards) {
        return false
      }

      const cost = deriveUpgradeCost(state, lane)
      if (!canAffordColorCost(state.inventory, cost)) {
        return false
      }

      set((current) => {
        const base = baseFromState(current)
        base.inventory = applyCost(base.inventory, cost)
        base.upgrades[lane] += 1
        base.totalUpgradesPurchased += 1
        const nextUnlockedBuildings = calculateUnlockedBuildingCount(
          base.totalUpgradesPurchased,
          base.prismShards,
        )
        if (nextUnlockedBuildings > current.unlockedBuildings) {
          base.unlockSurgeSeconds = Math.max(base.unlockSurgeSeconds, UNLOCK_SURGE_SECONDS)
        }
        base.momentum = Math.min(1, base.momentum + MOMENTUM_PER_UPGRADE)
        base.lastTickAt = Date.now()
        base.lastActiveAt = base.lastTickAt
        base.offlineGainResult = null
        return hydrateState(base, current)
      })
      return true
    },

    craftColor: (recipeId: string, amount: number) => {
      const units = Math.max(0, Math.floor(amount))
      if (units < 1) {
        return false
      }
      const recipe = CRAFT_RECIPES.find((entry) => entry.id === recipeId)
      if (!recipe) {
        return false
      }

      const state = get()
      const cost = buildRecipeCost(recipeId, units)
      if (!canAffordColorCost(state.inventory, cost)) {
        return false
      }

      set((current) => {
        const base = baseFromState(current)
        base.inventory = applyCost(base.inventory, cost)
        base.recipeQueue.push({
          id: `${recipeId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          recipeId,
          remainingUnits: units,
          totalUnits: units,
          progressSeconds: 0,
        })
        base.lastActiveAt = Date.now()
        return hydrateState(base, current)
      })
      return true
    },

    refineToNeon: (colorId: Exclude<ColorId, `neon_${string}`>, amount: number) => {
      const state = get()
      if (state.prestigeCount < 1) {
        return false
      }
      if (!isColorAvailable(colorId as ColorId, state.milestoneFlags)) {
        return false
      }

      const units = Math.max(0, Math.floor(amount))
      const batches = Math.floor(units / REFINERY_INPUT_PER_BATCH)
      if (batches < 1) {
        return false
      }

      const requiredInput = batches * REFINERY_INPUT_PER_BATCH
      if (state.inventory[colorId] < requiredInput) {
        return false
      }

      const neonColorId = NEON_COLOR_MAP[colorId]
      if (!isColorAvailable(neonColorId, state.milestoneFlags)) {
        return false
      }
      const outputPerBatch = calculateRefineryOutputPerBatch(state.metaTree)
      set((current) => {
        const base = baseFromState(current)
        base.inventory[colorId] = Math.max(0, base.inventory[colorId] - requiredInput)
        base.refineryQueue.push({
          id: `${colorId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          colorId,
          neonColorId,
          remainingBatches: batches,
          totalBatches: batches,
          progressSeconds: 0,
          inputPerBatch: REFINERY_INPUT_PER_BATCH,
          outputPerBatch,
          unitDurationSeconds: REFINERY_CYCLE_SECONDS,
        })
        base.lastActiveAt = Date.now()
        return hydrateState(base, current)
      })
      return true
    },

    quoteSwap: (from: ColorId, to: ColorId, amount: number) => {
      const state = get()
      if (!isColorAvailable(from, state.milestoneFlags) || !isColorAvailable(to, state.milestoneFlags)) {
        return calculateSwapQuote({
          from,
          to,
          inputAmount: 0,
          feeRate: calculateExchangeFeeRate(state.metaTree),
        })
      }
      return calculateSwapQuote({
        from,
        to,
        inputAmount: amount,
        feeRate: calculateExchangeFeeRate(state.metaTree),
      })
    },

    executeSwap: (from: ColorId, to: ColorId, amount: number) => {
      const state = get()
      if (!isColorAvailable(from, state.milestoneFlags) || !isColorAvailable(to, state.milestoneFlags)) {
        return false
      }
      const quote = calculateSwapQuote({
        from,
        to,
        inputAmount: amount,
        feeRate: calculateExchangeFeeRate(state.metaTree),
      })

      if (quote.inputAmount <= 0 || quote.outputAmount <= 0) {
        return false
      }
      if (state.inventory[from] < quote.inputAmount) {
        return false
      }

      set((current) => {
        const base = baseFromState(current)
        base.inventory[from] = Math.max(0, base.inventory[from] - quote.inputAmount)
        base.inventory[to] += quote.outputAmount
        base.lastActiveAt = Date.now()
        return hydrateState(base, current)
      })
      return true
    },

    purchaseMetaNode: (nodeId: MetaNodeId) => {
      const state = get()
      const node = META_TREE_NODES.find((entry) => entry.id === nodeId)
      if (!node) {
        return false
      }

      const rank = state.metaTree[nodeId]
      if (rank >= node.maxRank) {
        return false
      }

      const cost = node.costs[rank]
      if (state.unspentShards < cost) {
        return false
      }

      set((current) => {
        const base = baseFromState(current)
        base.unspentShards -= cost
        base.metaTree[nodeId] += 1
        base.lastActiveAt = Date.now()
        return hydrateState(base, current)
      })
      return true
    },

    prestige: () => {
      const state = get()
      if (state.restorationPercent < 100) {
        return null
      }

      const nowTs = Date.now()
      const result = calculatePrestigeResult(
        state.restorationPoints,
        state.prismShards,
        state.prestigeCount,
      )
      const nextBase = createPostPrestigeBase(state, result, nowTs)
      const nextState = hydrateState(nextBase)
      set(nextState)
      return result
    },

    dismissOfflineGain: () => set({ offlineGainResult: null }),

    saveNow: () => {
      if (!isBrowser()) {
        return
      }
      const snapshot = get()
      const payload = toSaveData({
        ...snapshot,
        lastActiveAt: Date.now(),
      })
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload))
    },
  }))
}

export const gameStore = createGameStore()
export const useGameStore = <T>(selector: (state: GameStore) => T) => useStore(gameStore, selector)

export function getUpgradeMissingCosts(state: GameState, lane: UpgradeLaneId): ColorCost {
  const cost = deriveUpgradeCost(state, lane)
  return calculateMissingColorCost(state.inventory, cost)
}
