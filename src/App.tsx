import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  BUILDINGS,
  BUILDING_UPGRADE_OPTIONS,
  CRAFT_RECIPES,
  META_TREE_NODES,
  SAVE_INTERVAL_MS,
  TICK_RATE_HZ,
  UPGRADE_LANES,
} from './game/config'
import { createAudioBus } from './game/audio'
import {
  calculateMissingColorCost,
  calculatePrestigeReward,
  getAvailableColors,
  getColorLabel,
} from './game/economy'
import { formatCompact, formatPercent, formatSeconds } from './game/format'
import { ExtractionCanvas } from './game/render/ExtractionCanvas'
import { useGameStore } from './game/store'
import type { ColorCost, ColorId, PrestigeResult } from './game/types'

type ActivePanel = 'crew' | 'systems' | null
type RitualPhase = 'idle' | 'charge' | 'flash' | 'wave' | 'settle'

const BASE_COLORS: Array<'red' | 'blue' | 'yellow'> = ['red', 'blue', 'yellow']
const CRAFTED_COLORS: ColorId[] = ['green', 'orange', 'violet']
const NEON_COLORS: ColorId[] = [
  'neon_red',
  'neon_blue',
  'neon_yellow',
  'neon_green',
  'neon_orange',
  'neon_violet',
]

const REFINERY_COLORS: Array<Exclude<ColorId, `neon_${string}`>> = [
  'red',
  'blue',
  'yellow',
  'green',
  'orange',
  'violet',
]

function formatCost(cost: ColorCost): string {
  const entries = Object.entries(cost)
    .filter(([, amount]) => Number(amount ?? 0) > 0)
    .map(([color, amount]) => `${getColorLabel(color as ColorId)} ${formatCompact(Number(amount ?? 0))}`)
  return entries.length > 0 ? entries.join(' + ') : 'None'
}

function summarizeMissing(missing: ColorCost): string {
  const entries = Object.entries(missing).filter(([, amount]) => Number(amount ?? 0) > 0)
  if (entries.length === 0) {
    return ''
  }
  return entries
    .slice(0, 2)
    .map(([color, amount]) => `${getColorLabel(color as ColorId)} ${formatCompact(Number(amount ?? 0))}`)
    .join(', ')
}

function App() {
  const [lastPrestigeResult, setLastPrestigeResult] = useState<PrestigeResult | null>(null)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  const [inventoryCollapsed, setInventoryCollapsed] = useState(true)
  const [resourceMenuOpen, setResourceMenuOpen] = useState(false)
  const [exchangeFrom, setExchangeFrom] = useState<ColorId>('red')
  const [exchangeTo, setExchangeTo] = useState<ColorId>('blue')
  const [exchangeAmount, setExchangeAmount] = useState<number>(100)
  const [ritualPhase, setRitualPhase] = useState<RitualPhase>('idle')
  const [inputLocked, setInputLocked] = useState(false)

  const audioRef = useRef(createAudioBus())
  const priorUnlockedRef = useRef(0)
  const ritualTimeoutsRef = useRef<number[]>([])

  const initialized = useGameStore((state) => state.initialized)
  const initialize = useGameStore((state) => state.initialize)
  const tick = useGameStore((state) => state.tick)
  const extract = useGameStore((state) => state.extract)
  const purchaseUpgrade = useGameStore((state) => state.purchaseUpgrade)
  const getUpgradeColorCost = useGameStore((state) => state.getUpgradeColorCost)
  const craftColor = useGameStore((state) => state.craftColor)
  const refineToNeon = useGameStore((state) => state.refineToNeon)
  const quoteSwap = useGameStore((state) => state.quoteSwap)
  const executeSwap = useGameStore((state) => state.executeSwap)
  const purchaseMetaNode = useGameStore((state) => state.purchaseMetaNode)
  const prestige = useGameStore((state) => state.prestige)
  const saveNow = useGameStore((state) => state.saveNow)
  const dismissOfflineGain = useGameStore((state) => state.dismissOfflineGain)

  const inventory = useGameStore((state) => state.inventory)
  const restorationPercent = useGameStore((state) => state.restorationPercent)
  const restorationPoints = useGameStore((state) => state.restorationPoints)
  const momentum = useGameStore((state) => state.momentum)
  const prismShards = useGameStore((state) => state.prismShards)
  const unspentShards = useGameStore((state) => state.unspentShards)
  const upgrades = useGameStore((state) => state.upgrades)
  const unlockedBuildings = useGameStore((state) => state.unlockedBuildings)
  const workforce = useGameStore((state) => state.workforce)
  const agents = useGameStore((state) => state.agents)
  const beacons = useGameStore((state) => state.beacons)
  const offlineGainResult = useGameStore((state) => state.offlineGainResult)
  const economy = useGameStore((state) => state.economy)
  const recipeQueue = useGameStore((state) => state.recipeQueue)
  const refineryQueue = useGameStore((state) => state.refineryQueue)
  const prestigeReadiness = useGameStore((state) => state.prestigeReadiness)
  const worldVisualTier = useGameStore((state) => state.worldVisualTier)
  const metaTree = useGameStore((state) => state.metaTree)
  const campaignComplete = useGameStore((state) => state.campaignComplete)
  const milestoneFlags = useGameStore((state) => state.milestoneFlags)
  const availableColors = useMemo(() => getAvailableColors(milestoneFlags), [milestoneFlags])
  const availableColorSet = useMemo(() => new Set<ColorId>(availableColors), [availableColors])
  const availableNormalColors = useMemo(
    () => availableColors.filter((color) => !color.startsWith('neon_')),
    [availableColors],
  )
  const unlockedBaseColors = useMemo(
    () => BASE_COLORS.filter((color) => availableColorSet.has(color)),
    [availableColorSet],
  )
  const unlockedCraftedColors = useMemo(
    () => CRAFTED_COLORS.filter((color) => availableColorSet.has(color)),
    [availableColorSet],
  )
  const unlockedNeonColors = useMemo(
    () => NEON_COLORS.filter((color) => availableColorSet.has(color)),
    [availableColorSet],
  )
  const unlockedColorCount =
    unlockedBaseColors.length + unlockedCraftedColors.length + unlockedNeonColors.length

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (unlockedBuildings > priorUnlockedRef.current) {
      audioRef.current.unlock()
    }
    priorUnlockedRef.current = unlockedBuildings
  }, [unlockedBuildings])

  useEffect(() => {
    if (!initialized) return
    const intervalId = window.setInterval(() => {
      tick()
    }, 1000 / TICK_RATE_HZ)
    return () => window.clearInterval(intervalId)
  }, [initialized, tick])

  useEffect(() => {
    if (!initialized) return
    const saveIntervalId = window.setInterval(() => {
      saveNow()
    }, SAVE_INTERVAL_MS)
    const handleVisibility = () => {
      if (document.hidden) {
        saveNow()
      }
    }
    const handleUnload = () => {
      saveNow()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      window.clearInterval(saveIntervalId)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [initialized, saveNow])

  useEffect(() => {
    return () => {
      ritualTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  const crewCards = useMemo(
    () => Array.from({ length: Math.min(12, workforce.visibleOperators) }, (_, idx) => idx),
    [workforce.visibleOperators],
  )

  const nextBuilding = BUILDINGS[unlockedBuildings]
  const outputBoostPercent = Math.max(0, (economy.engagementMultiplier - 1) * 100)
  const prestigeRewardNow = calculatePrestigeReward(restorationPoints, prismShards)
  const unlockedBuildingIds = useMemo(
    () =>
      BUILDINGS.slice(0, unlockedBuildings)
        .filter((building) => building.placement === 'ground')
        .map((building) => building.id),
    [unlockedBuildings],
  )

  const selectedBuilding =
    selectedBuildingId && unlockedBuildingIds.includes(selectedBuildingId)
      ? BUILDINGS.find((building) => building.id === selectedBuildingId) ?? null
      : null

  const selectedBuildingIndex = selectedBuilding
    ? BUILDINGS.findIndex((building) => building.id === selectedBuilding.id)
    : -1
  const selectedBuildingUnlocked =
    selectedBuildingIndex >= 0 && selectedBuildingIndex < unlockedBuildings

  const selectedBuildingUpgrades = useMemo(() => {
    if (!selectedBuilding) {
      return []
    }

    const options = BUILDING_UPGRADE_OPTIONS[selectedBuilding.id] ?? []
    return options
      .map((option) => {
        const lane = UPGRADE_LANES.find((entry) => entry.id === option.lane)
        if (!lane) {
          return null
        }

        const currentTier = upgrades[option.lane]
        const isMaxed = currentTier >= lane.maxTier
        const nextTier = currentTier + 1
        const nextCost = isMaxed ? {} : getUpgradeColorCost(option.lane)
        const missing = isMaxed ? {} : calculateMissingColorCost(inventory, nextCost)
        const missingReason = summarizeMissing(missing)

        return {
          ...option,
          currentTier,
          nextTier,
          maxTier: lane.maxTier,
          isMaxed,
          nextCost,
          missing,
          missingReason,
          canAfford:
            selectedBuildingUnlocked &&
            !isMaxed &&
            Object.keys(missing).length === 0 &&
            !inputLocked,
        }
      })
      .filter((entry) => entry !== null)
  }, [
    getUpgradeColorCost,
    inputLocked,
    inventory,
    selectedBuilding,
    selectedBuildingUnlocked,
    upgrades,
  ])

  const resolvedExchangeFrom = useMemo<ColorId>(() => {
    if (availableColors.length === 0) {
      return 'red'
    }
    return availableColors.includes(exchangeFrom) ? exchangeFrom : availableColors[0]
  }, [availableColors, exchangeFrom])
  const resolvedExchangeTo = useMemo<ColorId>(() => {
    if (availableColors.length === 0) {
      return resolvedExchangeFrom
    }
    if (
      availableColors.includes(exchangeTo) &&
      (availableColors.length === 1 || exchangeTo !== resolvedExchangeFrom)
    ) {
      return exchangeTo
    }
    const fallback = availableColors.find((color) => color !== resolvedExchangeFrom)
    return fallback ?? resolvedExchangeFrom
  }, [availableColors, exchangeTo, resolvedExchangeFrom])
  const exchangeQuote = useMemo(
    () => quoteSwap(resolvedExchangeFrom, resolvedExchangeTo, exchangeAmount),
    [exchangeAmount, quoteSwap, resolvedExchangeFrom, resolvedExchangeTo],
  )

  const ritualClass = ritualPhase !== 'idle' ? `ritual-${ritualPhase}` : ''

  const handleExtract = () => {
    if (inputLocked) {
      return
    }
    extract()
    audioRef.current.tap()
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  }

  const clearRitualTimeouts = () => {
    ritualTimeoutsRef.current.forEach((id) => window.clearTimeout(id))
    ritualTimeoutsRef.current = []
  }

  const handlePrestige = () => {
    if (inputLocked || restorationPercent < 100) {
      return
    }

    clearRitualTimeouts()
    setInputLocked(true)
    setRitualPhase('charge')

    ritualTimeoutsRef.current.push(
      window.setTimeout(() => {
        setRitualPhase('flash')
      }, 500),
    )

    ritualTimeoutsRef.current.push(
      window.setTimeout(() => {
        const result = prestige()
        if (result) {
          audioRef.current.prestige()
          setLastPrestigeResult(result)
          setActivePanel(null)
          setSelectedBuildingId(null)
          setRitualPhase('wave')
        } else {
          setRitualPhase('idle')
          setInputLocked(false)
        }
      }, 680),
    )

    ritualTimeoutsRef.current.push(
      window.setTimeout(() => {
        setRitualPhase('settle')
      }, 1280),
    )

    ritualTimeoutsRef.current.push(
      window.setTimeout(() => {
        setRitualPhase('idle')
        setInputLocked(false)
      }, 1700),
    )
  }

  const togglePanel = (panel: ActivePanel) => {
    if (inputLocked) {
      return
    }
    setActivePanel((current) => (current === panel ? null : panel))
    setSelectedBuildingId(null)
  }

  const cycleSelectedBuilding = (direction: 1 | -1) => {
    if (unlockedBuildingIds.length === 0) {
      return
    }
    if (!selectedBuildingId || !unlockedBuildingIds.includes(selectedBuildingId)) {
      setSelectedBuildingId(unlockedBuildingIds[0])
      return
    }
    const currentIndex = unlockedBuildingIds.indexOf(selectedBuildingId)
    const nextIndex =
      (currentIndex + direction + unlockedBuildingIds.length) % unlockedBuildingIds.length
    setSelectedBuildingId(unlockedBuildingIds[nextIndex])
  }

  return (
    <div className={`app-shell readiness-${prestigeReadiness} ${ritualClass}`}>
      <section className={`env-stage tier-${Math.min(6, worldVisualTier)}`}>
        <ExtractionCanvas
          restorationPercent={restorationPercent}
          unlockedBuildings={unlockedBuildings}
          workforce={workforce}
          agents={agents}
          beacons={beacons}
          selectedBuildingId={selectedBuildingId}
          prestigeReadiness={prestigeReadiness}
          worldVisualTier={worldVisualTier}
          ritualPhase={ritualPhase}
          inputLocked={inputLocked}
          onExtract={handleExtract}
          onSelectBuilding={(buildingId) => {
            if (inputLocked) {
              return
            }
            if (buildingId && unlockedBuildingIds.includes(buildingId)) {
              setSelectedBuildingId(buildingId)
            } else {
              setSelectedBuildingId(null)
            }
            if (buildingId) {
              setActivePanel(null)
            }
          }}
        />

        <div className="mission-card hud-panel">
          {campaignComplete ? (
            <strong>Campaign complete at Prestige 5. Mastery loops are now active.</strong>
          ) : nextBuilding ? (
            <strong>
              Unlock {nextBuilding.name} @ {nextBuilding.unlockAtTotalTiers} tiers
              {nextBuilding.unlockAtPrismShards > 0
                ? ` + ${nextBuilding.unlockAtPrismShards} shards`
                : ''}
            </strong>
          ) : (
            <strong>All sectors colorized. Ready for prestige.</strong>
          )}
        </div>

        <aside className="inventory-stack">
          <article className={`hud-panel inventory-card collapsible${inventoryCollapsed ? ' collapsed' : ''}`}>
            <div className="inventory-header">
              <div>
                <h3>Resources</h3>
                <small>{unlockedColorCount} unlocked</small>
              </div>
              <button
                type="button"
                className="inventory-toggle"
                onClick={() => setInventoryCollapsed((current) => !current)}
                aria-expanded={!inventoryCollapsed}
              >
                {inventoryCollapsed ? 'Show' : 'Hide'}
              </button>
            </div>
            {inventoryCollapsed ? (
              <div className="inventory-preview">
                {unlockedBaseColors.length > 0 ? (
                  <>
                    <span>{getColorLabel(unlockedBaseColors[0])}</span>
                    <strong>{formatCompact(inventory[unlockedBaseColors[0]])}</strong>
                  </>
                ) : (
                  <span>No resources unlocked</span>
                )}
              </div>
            ) : (
              <div className="inventory-groups">
                {unlockedBaseColors.length > 0 && (
                  <section className="inventory-group">
                    <h4>Base</h4>
                    {unlockedBaseColors.map((color) => (
                      <div key={color} className="inventory-row">
                        <span>{getColorLabel(color)}</span>
                        <strong>{formatCompact(inventory[color])}</strong>
                      </div>
                    ))}
                  </section>
                )}
                {unlockedCraftedColors.length > 0 && (
                  <section className="inventory-group">
                    <h4>Crafted</h4>
                    {unlockedCraftedColors.map((color) => (
                      <div key={color} className="inventory-row">
                        <span>{getColorLabel(color)}</span>
                        <strong>{formatCompact(inventory[color])}</strong>
                      </div>
                    ))}
                  </section>
                )}
                {unlockedNeonColors.length > 0 && (
                  <section className="inventory-group">
                    <h4>Neon</h4>
                    {unlockedNeonColors.map((color) => (
                      <div key={color} className="inventory-row">
                        <span>{getColorLabel(color)}</span>
                        <strong>{formatCompact(inventory[color])}</strong>
                      </div>
                    ))}
                  </section>
                )}
              </div>
            )}
          </article>
        </aside>

        <nav
          id="bottom-resource-menu"
          className={`bottom-resource-menu hud-panel${resourceMenuOpen ? ' open' : ''}`}
          aria-label="Resource menu"
          aria-hidden={!resourceMenuOpen}
        >
          <header>
            <span>Resource Menu</span>
            <small>{unlockedColorCount} unlocked</small>
          </header>
          <div className="bottom-resource-scroll">
            {availableColors.map((color) => (
              <article
                key={color}
                className={`resource-pill resource-${color.replace('_', '-')}`}
                aria-label={`${getColorLabel(color)} amount`}
              >
                <span>{getColorLabel(color)}</span>
                <strong>{formatCompact(inventory[color])}</strong>
              </article>
            ))}
          </div>
        </nav>

        <footer className="command-dock">
          <button className="dock-extract" type="button" onClick={handleExtract} disabled={inputLocked}>
            Extract +{Math.max(1, Math.round(economy.tapGain))}
          </button>
          <button className="dock-crew" type="button" onClick={() => togglePanel('crew')} disabled={inputLocked}>
            Crew
          </button>
          <button
            className="dock-systems"
            type="button"
            onClick={() => togglePanel('systems')}
            disabled={inputLocked}
          >
            Systems
          </button>
          <button
            className={`dock-resources${resourceMenuOpen ? ' on' : ''}`}
            type="button"
            onClick={() => {
              if (inputLocked) {
                return
              }
              setResourceMenuOpen((open) => !open)
            }}
            disabled={inputLocked}
            aria-expanded={resourceMenuOpen}
            aria-controls="bottom-resource-menu"
          >
            Resources
          </button>
          <button
            className={restorationPercent >= 100 ? 'dock-prestige ready' : 'dock-prestige'}
            type="button"
            disabled={restorationPercent < 100 || inputLocked}
            onClick={handlePrestige}
          >
            {restorationPercent >= 100 ? `Prestige +${prestigeRewardNow}` : 'Prestige'}
          </button>
        </footer>

        {selectedBuilding && (
          <section className="building-menu">
            <header>
              <div>
                <span>{selectedBuilding.name}</span>
                <strong>
                  {selectedBuildingUnlocked
                    ? 'Building Upgrades'
                    : `Unlocks at ${selectedBuilding.unlockAtTotalTiers} tiers${
                        selectedBuilding.unlockAtPrismShards > 0
                          ? ` + ${selectedBuilding.unlockAtPrismShards} shards`
                          : ''
                      }`}
                </strong>
              </div>
              <div className="building-menu-nav">
                <button type="button" onClick={() => cycleSelectedBuilding(-1)} aria-label="Previous building">
                  &lt;
                </button>
                <span>
                  {Math.max(1, unlockedBuildingIds.indexOf(selectedBuilding.id) + 1)}/
                  {unlockedBuildingIds.length}
                </span>
                <button type="button" onClick={() => cycleSelectedBuilding(1)} aria-label="Next building">
                  &gt;
                </button>
                <button type="button" onClick={() => setSelectedBuildingId(null)}>
                  Close
                </button>
              </div>
            </header>

            {selectedBuildingUnlocked ? (
              <div className="building-upgrade-grid">
                {selectedBuildingUpgrades.map((upgrade) => (
                  <article key={upgrade.id} className="building-upgrade-card">
                    <h3>{upgrade.name}</h3>
                    <p>{upgrade.description}</p>
                    <small>
                      {upgrade.currentTier}/{upgrade.maxTier}
                    </small>
                    {!upgrade.isMaxed && (
                      <small className="upgrade-cost">Cost: {formatCost(upgrade.nextCost)}</small>
                    )}
                    {!upgrade.isMaxed && Object.keys(upgrade.missing).length > 0 && (
                      <small className="upgrade-gate locked">Missing: {upgrade.missingReason}</small>
                    )}
                    <button
                      type="button"
                      disabled={!upgrade.canAfford}
                      onClick={() => {
                        const purchased = purchaseUpgrade(upgrade.lane)
                        if (purchased) {
                          audioRef.current.buy()
                        }
                      }}
                    >
                      {upgrade.isMaxed
                        ? 'Maxed'
                        : upgrade.canAfford
                          ? 'Upgrade'
                          : upgrade.missingReason
                            ? `Need ${upgrade.missingReason}`
                            : 'Unavailable'}
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <p className="building-locked-note">
                Keep upgrading other structures to activate this building.
              </p>
            )}
          </section>
        )}

        <section className={`drawer ${activePanel ? 'open' : ''}`}>
          {activePanel === 'crew' && (
            <div className="drawer-content">
              <header>
                <h2>Vacuum Crew</h2>
                <span>Squads {formatCompact(workforce.squads)}</span>
              </header>
              <div className="crew-grid">
                {crewCards.map((id) => (
                  <article key={id} className="crew-card">
                    <strong>Operator #{id + 1}</strong>
                    <span>Siphon Unit</span>
                  </article>
                ))}
              </div>
              <div className="building-row">
                {BUILDINGS.filter((building) => building.placement === 'ground').map((building) => (
                  <span
                    key={building.id}
                    className={unlockedBuildingIds.includes(building.id) ? 'on' : ''}
                  >
                    {building.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activePanel === 'systems' && (
            <div className="drawer-content">
              <header>
                <h2>System Status</h2>
                <span>Points {formatCompact(restorationPoints)}</span>
              </header>
              <div className="systems-grid">
                <article>
                  <span>Visible Crew Cap</span>
                  <strong>{formatCompact(workforce.visibleCap)}</strong>
                </article>
                <article>
                  <span>Overflow Crew</span>
                  <strong>{formatCompact(workforce.overflowOperators)}</strong>
                </article>
                <article>
                  <span>Auto Gain/sec</span>
                  <strong>{formatCompact(economy.autoGainPerSec)}</strong>
                </article>
                <article>
                  <span>Restoration/sec</span>
                  <strong>{formatCompact(economy.restorationGainPerSec)}</strong>
                </article>
                <article>
                  <span>Momentum</span>
                  <strong>{formatPercent(momentum * 100)}</strong>
                </article>
                <article>
                  <span>Output Boost</span>
                  <strong>{formatPercent(outputBoostPercent)}</strong>
                </article>
              </div>

              <div className="systems-section">
                <h3>Crafting</h3>
                <div className="systems-list">
                  {CRAFT_RECIPES.filter((recipe) =>
                    availableColors.includes(recipe.output) &&
                    Object.keys(recipe.inputs).every((color) =>
                      availableColors.includes(color as ColorId),
                    ),
                  ).map((recipe) => {
                    const cost = Object.fromEntries(
                      Object.entries(recipe.inputs).map(([color, amount]) => [
                        color,
                        Number(amount ?? 0),
                      ]),
                    ) as ColorCost
                    const missing = calculateMissingColorCost(inventory, cost)
                    const canCraft = Object.keys(missing).length === 0 && !inputLocked
                    return (
                      <article key={recipe.id} className="systems-card">
                        <strong>{recipe.name}</strong>
                        <small>{formatCost(cost)} -&gt; {getColorLabel(recipe.output)} {recipe.outputAmount}</small>
                        <button
                          type="button"
                          disabled={!canCraft}
                          onClick={() => {
                            if (craftColor(recipe.id, 1)) {
                              audioRef.current.buy()
                            }
                          }}
                        >
                          {canCraft ? 'Craft 1' : `Need ${summarizeMissing(missing)}`}
                        </button>
                      </article>
                    )
                  })}
                  {!CRAFT_RECIPES.some((recipe) =>
                    availableColors.includes(recipe.output) &&
                    Object.keys(recipe.inputs).every((color) =>
                      availableColors.includes(color as ColorId),
                    ),
                  ) && (
                    <p className="building-locked-note">Unlock more base colors to access crafting.</p>
                  )}
                </div>
                <small className="queue-note">Recipe Queue: {recipeQueue.length}</small>
              </div>

              <div className="systems-section">
                <h3>Refinery</h3>
                {milestoneFlags.neonUnlocked ? (
                  <div className="systems-list">
                    {REFINERY_COLORS.filter((color) =>
                      availableNormalColors.includes(color),
                    ).map((color) => {
                      const canRefine = inventory[color] >= 20 && !inputLocked
                      return (
                        <article key={color} className="systems-card">
                          <strong>{getColorLabel(color)} -&gt; {getColorLabel(`neon_${color}` as ColorId)}</strong>
                          <small>20 input over 20s per batch</small>
                          <button
                            type="button"
                            disabled={!canRefine}
                            onClick={() => {
                              if (refineToNeon(color, 20)) {
                                audioRef.current.buy()
                              }
                            }}
                          >
                            {canRefine ? 'Refine 20' : `Need ${getColorLabel(color)} 20`}
                          </button>
                        </article>
                      )
                    })}
                  </div>
                ) : (
                  <p className="building-locked-note">Unlock refinery after Prestige 1.</p>
                )}
                <small className="queue-note">Refinery Queue: {refineryQueue.length}</small>
              </div>

              <div className="systems-section">
                <h3>Exchange</h3>
                <div className="exchange-grid">
                  <label>
                    From
                    <select
                      value={resolvedExchangeFrom}
                      onChange={(event) => setExchangeFrom(event.target.value as ColorId)}
                      disabled={inputLocked}
                    >
                      {availableColors.map((color) => (
                        <option key={color} value={color}>
                          {getColorLabel(color)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    To
                    <select
                      value={resolvedExchangeTo}
                      onChange={(event) => setExchangeTo(event.target.value as ColorId)}
                      disabled={inputLocked}
                    >
                      {availableColors.map((color) => (
                        <option key={color} value={color}>
                          {getColorLabel(color)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Amount
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={exchangeAmount}
                      onChange={(event) =>
                        setExchangeAmount(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                      }
                      disabled={inputLocked}
                    />
                  </label>
                </div>
                <p className="exchange-quote">
                  Quote: {formatCompact(exchangeQuote.inputAmount)} {getColorLabel(resolvedExchangeFrom)} -&gt;{' '}
                  {formatCompact(exchangeQuote.outputAmount)} {getColorLabel(resolvedExchangeTo)}
                </p>
                <button
                  type="button"
                  className="exchange-btn"
                  disabled={
                    inputLocked ||
                    resolvedExchangeFrom === resolvedExchangeTo ||
                    exchangeQuote.outputAmount <= 0 ||
                    inventory[resolvedExchangeFrom] < exchangeQuote.inputAmount
                  }
                  onClick={() => {
                    if (executeSwap(resolvedExchangeFrom, resolvedExchangeTo, exchangeAmount)) {
                      audioRef.current.buy()
                    }
                  }}
                >
                  Execute Swap
                </button>
              </div>

              <div className="systems-section">
                <h3>Shard Tree</h3>
                <div className="systems-list">
                  {META_TREE_NODES.map((node) => {
                    const rank = metaTree[node.id]
                    const nextCost = rank < node.maxRank ? node.costs[rank] : null
                    const canBuy = nextCost !== null && unspentShards >= nextCost && !inputLocked
                    return (
                      <article key={node.id} className="systems-card">
                        <strong>{node.name}</strong>
                        <small>{node.description}</small>
                        <small>
                          Rank {rank}/{node.maxRank}
                        </small>
                        <button
                          type="button"
                          disabled={!canBuy}
                          onClick={() => {
                            if (purchaseMetaNode(node.id)) {
                              audioRef.current.buy()
                            }
                          }}
                        >
                          {nextCost === null ? 'Maxed' : canBuy ? `Buy (${nextCost})` : `Need ${nextCost} shards`}
                        </button>
                      </article>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      </section>

      {offlineGainResult && (
        <aside className="modal-overlay">
          <div className="modal-card">
            <h3>Welcome Back</h3>
            <p>
              Offline time: {formatSeconds(offlineGainResult.elapsedSeconds)} (capped at{' '}
              {formatSeconds(offlineGainResult.cappedSeconds)})
            </p>
            <p>
              Gained {formatCompact(offlineGainResult.inventoryAwarded.red)} red,{' '}
              {formatCompact(offlineGainResult.inventoryAwarded.blue)} blue,{' '}
              {formatCompact(offlineGainResult.inventoryAwarded.yellow)} yellow.
            </p>
            <button type="button" onClick={dismissOfflineGain}>
              Continue
            </button>
          </div>
        </aside>
      )}

      {lastPrestigeResult !== null && (
        <aside className="toast">
          Prestige complete: +{lastPrestigeResult.earnedShards} shards.
          <button
            type="button"
            onClick={() => {
              setLastPrestigeResult(null)
            }}
          >
            Dismiss
          </button>
        </aside>
      )}
    </div>
  )
}

export default App
