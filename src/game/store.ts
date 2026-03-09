import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'
import { BUILDINGS, SAVE_KEY, SAVE_VERSION, TICK_SECONDS, UPGRADE_LANES } from './config'
import {
  calculateDiffusionMultiplier,
  calculateEconomySnapshot,
  calculateOfflineGain,
  calculatePrestigeResult,
  calculateRestorationPercent,
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
  prestige: () => PrestigeResult | null
  dismissOfflineGain: () => void
  saveNow: () => void
}

interface BaseState {
  chroma: number
  restorationPoints: number
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

export function calculateUnlockedBuildingCount(totalUpgradesPurchased: number): number {
  return BUILDINGS.filter((building) => totalUpgradesPurchased >= building.unlockAtTotalTiers).length
}

function createBaseState(now: number, prismShards = 0): BaseState {
  return {
    chroma: 0,
    restorationPoints: 0,
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
  const unlockedBuildings = calculateUnlockedBuildingCount(base.totalUpgradesPurchased)
  const workforce = calculateWorkforce(base.upgrades.automation, unlockedBuildings)
  const restorationPercent = calculateRestorationPercent(base.restorationPoints)
  const prestigeMultiplier = calculatePrestigeMultiplier(base.prismShards)
  const economy = calculateEconomySnapshot({
    extractionTier: base.upgrades.extraction,
    diffusionTier: base.upgrades.diffusion,
    logicalOperators: workforce.logicalOperators,
    prestigeMultiplier,
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
    restorationPoints: base.restorationPoints,
    restorationPercent,
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
    chroma: 0,
    restorationPoints: 0,
    prismShards: result.newTotalShards,
    upgrades: { ...DEFAULT_UPGRADES },
    totalUpgradesPurchased: 0,
    lifetimeRestorationPoints: state.lifetimeRestorationPoints,
    lastTickAt: now,
    lastActiveAt: now,
    offlineGainResult: null,
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
        restorationPoints: parsed.restorationPoints,
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
        const autoGain = state.economy.autoGainPerSec * deltaSeconds
        const restorationGain = autoGain * calculateDiffusionMultiplier(state.upgrades.diffusion)
        const restorationPoints = state.restorationPoints + restorationGain
        const restorationPercent = calculateRestorationPercent(restorationPoints)
        const tintLevel = restorationPercent / 100
        const laneCount = Math.max(1, state.unlockedBuildings)

        return {
          chroma: state.chroma + autoGain,
          restorationPoints,
          restorationPercent,
          lifetimeRestorationPoints: state.lifetimeRestorationPoints + restorationGain,
          agents: stepOperators(state.agents, deltaSeconds, laneCount, tintLevel),
          beacons: stepBeacons(state.beacons, deltaSeconds),
          lastTickAt: nowTick,
          lastActiveAt: nowTick,
        }
      })
    },

    extract: () => {
      const nowTick = Date.now()
      set((state) => {
        const gain = state.economy.tapGain
        const restorationGain = gain * calculateDiffusionMultiplier(state.upgrades.diffusion)
        const restorationPoints = state.restorationPoints + restorationGain
        return {
          chroma: state.chroma + gain,
          restorationPoints,
          restorationPercent: calculateRestorationPercent(restorationPoints),
          lifetimeRestorationPoints: state.lifetimeRestorationPoints + restorationGain,
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

      const cost = calculateUpgradeCost(lane, currentTier)
      if (state.chroma < cost) {
        return false
      }

      const nextUpgrades = {
        ...state.upgrades,
        [lane]: currentTier + 1,
      }
      const nextBase: BaseState = {
        chroma: state.chroma - cost,
        restorationPoints: state.restorationPoints,
        prismShards: state.prismShards,
        upgrades: nextUpgrades,
        totalUpgradesPurchased: state.totalUpgradesPurchased + 1,
        lifetimeRestorationPoints: state.lifetimeRestorationPoints,
        lastTickAt: Date.now(),
        lastActiveAt: Date.now(),
        offlineGainResult: null,
      }
      const next = hydrateState(nextBase, state)
      set(next)
      return true
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
