import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import {
  BUILDINGS,
  MAGENTA_EXCHANGE_RATE,
  MAGENTA_UNLOCK_AT_BUILDING_COUNT,
  MOMENTUM_DECAY_PER_SECOND,
  MOMENTUM_PER_TAP,
  MOMENTUM_PER_UPGRADE,
  SAVE_KEY,
  SAVE_VERSION,
  TICK_SECONDS,
  UNLOCK_SURGE_SECONDS,
  UPGRADE_LANES,
} from './config'
import {
  calculateBuildingUnlockChromaReward,
  calculateDiffusionMultiplier,
  calculateEngagementMultiplier,
  calculateEconomySnapshot,
  calculateOfflineGain,
  calculatePrestigeResult,
  calculateRestorationPercent,
  calculateUpgradeShardRequirement,
  calculateUpgradeCost,
  calculatePrestigeMultiplier,
} from './economy'
import type {
  GameState,
  OfflineGainResult,
  PrestigeResult,
  SaveDataV1,
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
  exchangeCyanToMagenta: (cyanAmount: number) => boolean
  exchangeMagentaToCyan: (magentaAmount: number) => boolean
  prestige: () => PrestigeResult | null
  dismissOfflineGain: () => void
  saveNow: () => void
}

interface BaseState {
  chroma: number
  magenta: number
  restorationPoints: number
  momentum: number
  unlockSurgeSeconds: number
  prismShards: number
  upgrades: Record<UpgradeLaneId, number>
  totalUpgradesPurchased: number
  lifetimeRestorationPoints: number
  lastTickAt: number
  lastActiveAt: number
  offlineGainResult: OfflineGainResult | null
}

const DEFAULT_UPGRADES: Record<UpgradeLaneId, number> = {
  extraction: 0,
  automation: 0,
  diffusion: 0,
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
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

function createBaseState(now: number, prismShards = 0): BaseState {
  return {
    chroma: 0,
    magenta: 0,
    restorationPoints: 0,
    momentum: 0,
    unlockSurgeSeconds: 0,
    prismShards,
    upgrades: { ...DEFAULT_UPGRADES },
    totalUpgradesPurchased: 0,
    lifetimeRestorationPoints: 0,
    lastTickAt: now,
    lastActiveAt: now,
    offlineGainResult: null,
  }
}

function hydrateState(base: BaseState, previous?: GameState): GameState {
  const unlockedBuildings = calculateUnlockedBuildingCount(
    base.totalUpgradesPurchased,
    base.prismShards,
  )
  const magentaUnlocked = unlockedBuildings >= MAGENTA_UNLOCK_AT_BUILDING_COUNT
  const workforce = calculateWorkforce(base.upgrades.automation, unlockedBuildings)
  const restorationPercent = calculateRestorationPercent(base.restorationPoints)
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
    chroma: base.chroma,
    magenta: base.magenta,
    magentaUnlocked,
    restorationPoints: base.restorationPoints,
    restorationPercent,
    momentum: base.momentum,
    unlockSurgeSeconds: base.unlockSurgeSeconds,
    prismShards: base.prismShards,
    prestigeMultiplier,
    upgrades: base.upgrades,
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
  }
}

function parseSave(raw: string | null): SaveDataV1 | null {
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as Partial<SaveDataV1>
    if (parsed.version !== SAVE_VERSION) {
      return null
    }
    if (typeof parsed.chroma !== 'number') return null
    if (typeof parsed.restorationPoints !== 'number') return null
    if (typeof parsed.prismShards !== 'number') return null
    if (typeof parsed.totalUpgradesPurchased !== 'number') return null
    if (typeof parsed.lifetimeRestorationPoints !== 'number') return null
    if (typeof parsed.lastActiveAt !== 'number') return null
    if (!parsed.upgrades) return null
    return {
      version: SAVE_VERSION,
      chroma: parsed.chroma,
      magenta: Number(parsed.magenta ?? 0),
      restorationPoints: parsed.restorationPoints,
      prismShards: parsed.prismShards,
      upgrades: {
        extraction: Number(parsed.upgrades.extraction ?? 0),
        automation: Number(parsed.upgrades.automation ?? 0),
        diffusion: Number(parsed.upgrades.diffusion ?? 0),
      },
      totalUpgradesPurchased: parsed.totalUpgradesPurchased,
      lifetimeRestorationPoints: parsed.lifetimeRestorationPoints,
      lastActiveAt: parsed.lastActiveAt,
    }
  } catch {
    return null
  }
}

function toSaveData(state: GameState): SaveDataV1 {
  return {
    version: SAVE_VERSION,
    chroma: state.chroma,
    magenta: state.magenta,
    restorationPoints: state.restorationPoints,
    prismShards: state.prismShards,
    upgrades: state.upgrades,
    totalUpgradesPurchased: state.totalUpgradesPurchased,
    lifetimeRestorationPoints: state.lifetimeRestorationPoints,
    lastActiveAt: state.lastActiveAt,
  }
}

function createPostPrestigeBase(state: GameState, result: PrestigeResult, now: number): BaseState {
  return {
    chroma: result.launchChroma,
    magenta: 0,
    restorationPoints: 0,
    momentum: result.launchMomentum,
    unlockSurgeSeconds: result.launchSurgeSeconds,
    prismShards: result.newTotalShards,
    upgrades: { ...DEFAULT_UPGRADES },
    totalUpgradesPurchased: 0,
    lifetimeRestorationPoints: state.lifetimeRestorationPoints,
    lastTickAt: now,
    lastActiveAt: now,
    offlineGainResult: null,
  }
}

function totalSpendableCyan(chroma: number, magenta: number): number {
  return chroma + magenta * MAGENTA_EXCHANGE_RATE
}

function spendCyanEquivalent(
  chroma: number,
  magenta: number,
  requiredCyan: number,
): { chroma: number; magenta: number } | null {
  if (requiredCyan <= chroma) {
    return { chroma: chroma - requiredCyan, magenta }
  }

  const remaining = requiredCyan - chroma
  const magentaNeeded = Math.ceil(remaining / MAGENTA_EXCHANGE_RATE)
  if (magentaNeeded > magenta) {
    return null
  }

  const spentFromMagenta = magentaNeeded * MAGENTA_EXCHANGE_RATE
  const cyanLeftover = spentFromMagenta - remaining
  return {
    chroma: cyanLeftover,
    magenta: magenta - magentaNeeded,
  }
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

      const parsed = parseSave(window.localStorage.getItem(SAVE_KEY))
      if (!parsed) {
        const fresh = hydrateState(createBaseState(nowTs))
        set({ ...fresh, initialized: true })
        return
      }

      const base: BaseState = {
        chroma: parsed.chroma,
        magenta: parsed.magenta,
        restorationPoints: parsed.restorationPoints,
        momentum: 0,
        unlockSurgeSeconds: 0,
        prismShards: parsed.prismShards,
        upgrades: parsed.upgrades,
        totalUpgradesPurchased: parsed.totalUpgradesPurchased,
        lifetimeRestorationPoints: parsed.lifetimeRestorationPoints,
        lastTickAt: nowTs,
        lastActiveAt: nowTs,
        offlineGainResult: null,
      }

      const hydrated = hydrateState(base)
      const elapsedSeconds = Math.max(0, (nowTs - parsed.lastActiveAt) / 1000)
      const offline = calculateOfflineGain({
        elapsedSeconds,
        autoGainPerSec: hydrated.economy.autoGainPerSec,
        diffusionMultiplier: calculateDiffusionMultiplier(parsed.upgrades.diffusion),
      })

      base.chroma += offline.chromaAwarded
      base.restorationPoints += offline.restorationAwarded
      base.lifetimeRestorationPoints += offline.restorationAwarded
      base.offlineGainResult = offline
      const finalState = hydrateState(base, hydrated)
      set({ ...finalState, initialized: true })
    },

    tick: (deltaSeconds = TICK_SECONDS) => {
      const nowTick = Date.now()
      set((state) => {
        const momentum = Math.max(0, state.momentum - MOMENTUM_DECAY_PER_SECOND * deltaSeconds)
        const unlockSurgeSeconds = Math.max(0, state.unlockSurgeSeconds - deltaSeconds)
        const engagementMultiplier = calculateEngagementMultiplier(momentum, unlockSurgeSeconds)
        const economy = calculateEconomySnapshot({
          extractionTier: state.upgrades.extraction,
          diffusionTier: state.upgrades.diffusion,
          logicalOperators: state.workforce.logicalOperators,
          prestigeMultiplier: state.prestigeMultiplier,
          engagementMultiplier,
        })
        const autoGain = economy.autoGainPerSec * deltaSeconds
        const restorationGain = autoGain * calculateDiffusionMultiplier(state.upgrades.diffusion)
        const restorationPoints = state.restorationPoints + restorationGain
        const restorationPercent = calculateRestorationPercent(restorationPoints)
        const tintLevel = restorationPercent / 100
        const laneCount = Math.max(1, state.unlockedBuildings)

        return {
          momentum,
          unlockSurgeSeconds,
          chroma: state.chroma + autoGain,
          magenta: state.magenta,
          restorationPoints,
          restorationPercent,
          lifetimeRestorationPoints: state.lifetimeRestorationPoints + restorationGain,
          agents: stepOperators(state.agents, deltaSeconds, laneCount, tintLevel),
          beacons: stepBeacons(state.beacons, deltaSeconds),
          economy,
          lastTickAt: nowTick,
          lastActiveAt: nowTick,
        }
      })
    },

    extract: () => {
      const nowTick = Date.now()
      set((state) => {
        const momentum = Math.min(1, state.momentum + MOMENTUM_PER_TAP)
        const engagementMultiplier = calculateEngagementMultiplier(
          momentum,
          state.unlockSurgeSeconds,
        )
        const economy = calculateEconomySnapshot({
          extractionTier: state.upgrades.extraction,
          diffusionTier: state.upgrades.diffusion,
          logicalOperators: state.workforce.logicalOperators,
          prestigeMultiplier: state.prestigeMultiplier,
          engagementMultiplier,
        })
        const gain = economy.tapGain
        const restorationGain = gain * calculateDiffusionMultiplier(state.upgrades.diffusion)
        const restorationPoints = state.restorationPoints + restorationGain
        return {
          momentum,
          chroma: state.chroma + gain,
          magenta: state.magenta,
          restorationPoints,
          restorationPercent: calculateRestorationPercent(restorationPoints),
          lifetimeRestorationPoints: state.lifetimeRestorationPoints + restorationGain,
          economy,
          lastTickAt: nowTick,
          lastActiveAt: nowTick,
        }
      })
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

      const cost = calculateUpgradeCost(lane, currentTier)
      if (totalSpendableCyan(state.chroma, state.magenta) < cost) {
        return false
      }

      const balancesAfterSpend = spendCyanEquivalent(state.chroma, state.magenta, cost)
      if (!balancesAfterSpend) {
        return false
      }

      const nextUpgrades = {
        ...state.upgrades,
        [lane]: nextTier,
      }
      const nextTotalUpgradesPurchased = state.totalUpgradesPurchased + 1
      const nextUnlockedBuildingCount = calculateUnlockedBuildingCount(
        nextTotalUpgradesPurchased,
        state.prismShards,
      )
      let unlockReward = 0
      for (
        let unlocked = state.unlockedBuildings + 1;
        unlocked <= nextUnlockedBuildingCount;
        unlocked += 1
      ) {
        unlockReward += calculateBuildingUnlockChromaReward(unlocked)
      }
      const hasNewUnlock = nextUnlockedBuildingCount > state.unlockedBuildings
      const nextUnlockSurgeSeconds = hasNewUnlock
        ? Math.max(state.unlockSurgeSeconds, UNLOCK_SURGE_SECONDS)
        : state.unlockSurgeSeconds

      const nextBase: BaseState = {
        chroma: balancesAfterSpend.chroma + unlockReward,
        magenta: balancesAfterSpend.magenta,
        restorationPoints: state.restorationPoints,
        momentum: Math.min(1, state.momentum + MOMENTUM_PER_UPGRADE),
        unlockSurgeSeconds: nextUnlockSurgeSeconds,
        prismShards: state.prismShards,
        upgrades: nextUpgrades,
        totalUpgradesPurchased: nextTotalUpgradesPurchased,
        lifetimeRestorationPoints: state.lifetimeRestorationPoints,
        lastTickAt: Date.now(),
        lastActiveAt: Date.now(),
        offlineGainResult: null,
      }
      const next = hydrateState(nextBase, state)
      set(next)
      return true
    },

    exchangeCyanToMagenta: (cyanAmount: number) => {
      const nowTs = Date.now()
      let exchanged = false
      set((state) => {
        if (!state.magentaUnlocked) {
          return state
        }
        const roundedAmount =
          Math.floor(Math.max(0, cyanAmount) / MAGENTA_EXCHANGE_RATE) *
          MAGENTA_EXCHANGE_RATE
        if (roundedAmount <= 0 || state.chroma < roundedAmount) {
          return state
        }
        exchanged = true
        return {
          chroma: state.chroma - roundedAmount,
          magenta: state.magenta + roundedAmount / MAGENTA_EXCHANGE_RATE,
          lastTickAt: nowTs,
          lastActiveAt: nowTs,
        }
      })
      return exchanged
    },

    exchangeMagentaToCyan: (magentaAmount: number) => {
      const nowTs = Date.now()
      let exchanged = false
      set((state) => {
        if (!state.magentaUnlocked) {
          return state
        }
        const roundedAmount = Math.floor(Math.max(0, magentaAmount))
        if (roundedAmount <= 0 || state.magenta < roundedAmount) {
          return state
        }
        exchanged = true
        return {
          chroma: state.chroma + roundedAmount * MAGENTA_EXCHANGE_RATE,
          magenta: state.magenta - roundedAmount,
          lastTickAt: nowTs,
          lastActiveAt: nowTs,
        }
      })
      return exchanged
    },

    prestige: () => {
      const state = get()
      if (state.restorationPercent < 100) {
        return null
      }
      const nowTs = Date.now()
      const result = calculatePrestigeResult(state.restorationPoints, state.prismShards)
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
