import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import {
  BUILDINGS,
  BUILDING_UPGRADE_OPTIONS,
  GAME_TITLE,
  RESTORATION_TARGET_POINTS,
  SAVE_INTERVAL_MS,
  TICK_RATE_HZ,
  UPGRADE_LANES,
} from './game/config'
import { createAudioBus } from './game/audio'
import {
  calculatePrestigeReward,
  calculateUpgradeCost,
  calculateUpgradeShardRequirement,
} from './game/economy'
import { formatCompact, formatPercent, formatSeconds } from './game/format'
import { ExtractionCanvas } from './game/render/ExtractionCanvas'
import { useGameStore } from './game/store'
import type { PrestigeResult } from './game/types'

type ActivePanel = 'crew' | 'systems' | null

function App() {
  const [lastPrestigeResult, setLastPrestigeResult] = useState<PrestigeResult | null>(null)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null)
  const audioRef = useRef(createAudioBus())
  const priorUnlockedRef = useRef(0)
  const initialized = useGameStore((state) => state.initialized)
  const initialize = useGameStore((state) => state.initialize)
  const tick = useGameStore((state) => state.tick)
  const extract = useGameStore((state) => state.extract)
  const purchaseUpgrade = useGameStore((state) => state.purchaseUpgrade)
  const prestige = useGameStore((state) => state.prestige)
  const saveNow = useGameStore((state) => state.saveNow)
  const dismissOfflineGain = useGameStore((state) => state.dismissOfflineGain)

  const chroma = useGameStore((state) => state.chroma)
  const restorationPercent = useGameStore((state) => state.restorationPercent)
  const restorationPoints = useGameStore((state) => state.restorationPoints)
  const momentum = useGameStore((state) => state.momentum)
  const unlockSurgeSeconds = useGameStore((state) => state.unlockSurgeSeconds)
  const prismShards = useGameStore((state) => state.prismShards)
  const prestigeMultiplier = useGameStore((state) => state.prestigeMultiplier)
  const upgrades = useGameStore((state) => state.upgrades)
  const totalUpgradesPurchased = useGameStore((state) => state.totalUpgradesPurchased)
  const unlockedBuildings = useGameStore((state) => state.unlockedBuildings)
  const workforce = useGameStore((state) => state.workforce)
  const agents = useGameStore((state) => state.agents)
  const beacons = useGameStore((state) => state.beacons)
  const offlineGainResult = useGameStore((state) => state.offlineGainResult)
  const economy = useGameStore((state) => state.economy)

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

  const crewCards = useMemo(
    () => Array.from({ length: Math.min(12, workforce.visibleOperators) }, (_, idx) => idx),
    [workforce.visibleOperators],
  )

  const nextBuilding = BUILDINGS[unlockedBuildings]
  const nextTierProgress = nextBuilding
    ? `${Math.min(totalUpgradesPurchased, nextBuilding.unlockAtTotalTiers)}/${nextBuilding.unlockAtTotalTiers} tiers`
    : null
  const nextShardProgress =
    nextBuilding && nextBuilding.unlockAtPrismShards > 0
      ? `${Math.min(prismShards, nextBuilding.unlockAtPrismShards)}/${nextBuilding.unlockAtPrismShards} shards`
      : null
  const outputBoostPercent = Math.max(0, (economy.engagementMultiplier - 1) * 100)
  const prestigeRewardNow = calculatePrestigeReward(restorationPoints, prismShards)
  const prestigeRewardAt125 = calculatePrestigeReward(
    Math.max(restorationPoints, RESTORATION_TARGET_POINTS * 1.25),
    prismShards,
  )
  const selectedBuilding = selectedBuildingId
    ? BUILDINGS.find((building) => building.id === selectedBuildingId) ?? null
    : null
  const unlockedBuildingIds = useMemo(
    () => BUILDINGS.slice(0, unlockedBuildings).map((building) => building.id),
    [unlockedBuildings],
  )
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
        const nextCost = isMaxed ? 0 : calculateUpgradeCost(option.lane, currentTier)
        const shardRequirement = isMaxed
          ? 0
          : calculateUpgradeShardRequirement(option.lane, nextTier)
        const missingShards = !isMaxed && prismShards < shardRequirement
        return {
          ...option,
          currentTier,
          nextTier,
          maxTier: lane.maxTier,
          isMaxed,
          nextCost,
          shardRequirement,
          missingShards,
          canAfford:
            selectedBuildingUnlocked &&
            !isMaxed &&
            chroma >= nextCost &&
            !missingShards,
        }
      })
      .filter((entry) => entry !== null)
  }, [chroma, prismShards, selectedBuilding, selectedBuildingUnlocked, upgrades])

  const handleExtract = () => {
    extract()
    audioRef.current.tap()
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  }

  const handlePrestige = () => {
    const result = prestige()
    if (!result) {
      return
    }
    audioRef.current.prestige()
    setLastPrestigeResult(result)
    setActivePanel(null)
    setSelectedBuildingId(null)
  }

  const togglePanel = (panel: ActivePanel) => {
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
    <div className="app-shell">
      <section className="env-stage">
        <ExtractionCanvas
          restorationPercent={restorationPercent}
          unlockedBuildings={unlockedBuildings}
          workforce={workforce}
          agents={agents}
          beacons={beacons}
          selectedBuildingId={selectedBuildingId}
          onExtract={handleExtract}
          onSelectBuilding={(buildingId) => {
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
          <span className="label">Mission</span>
          {nextBuilding ? (
            <strong>
              Unlock {nextBuilding.name} @ {nextBuilding.unlockAtTotalTiers} tiers
              {nextBuilding.unlockAtPrismShards > 0
                ? ` + ${nextBuilding.unlockAtPrismShards} shards`
                : ''}
            </strong>
          ) : (
            <strong>All sectors colorized. Ready for prestige.</strong>
          )}
          {nextBuilding && (
            <small className="mission-progress">
              {nextTierProgress}
              {nextShardProgress ? ` - ${nextShardProgress}` : ''}
            </small>
          )}
          <small className={`mission-bonus ${outputBoostPercent <= 0.1 ? 'muted' : ''}`}>
            {outputBoostPercent > 0.1
              ? `Output Boost +${outputBoostPercent.toFixed(0)}%${
                  unlockSurgeSeconds > 0
                    ? ` - Surge ${Math.ceil(unlockSurgeSeconds)}s`
                    : ` - Momentum ${Math.round(momentum * 100)}%`
                }`
              : 'Build momentum by tapping and buying upgrades.'}
          </small>
          <small className="mission-prestige">
            Prestige now +{prestigeRewardNow} shards (125%: +{prestigeRewardAt125})
          </small>
        </div>

        <div className="top-right-meta hud-panel">
          <span>{GAME_TITLE}</span>
          <strong>x{prestigeMultiplier.toFixed(2)}</strong>
        </div>

        <aside className="left-stack">
          <article className="hud-panel metric">
            <span>Chroma</span>
            <strong>{formatCompact(chroma)}</strong>
          </article>
          <article className="hud-panel metric">
            <span>Recovery</span>
            <strong>{formatPercent(restorationPercent)}</strong>
          </article>
          <article className="hud-panel metric">
            <span>Prism Shards</span>
            <strong>{formatCompact(prismShards)}</strong>
          </article>
          <article className="hud-panel metric compact">
            <span>Crew</span>
            <strong>{formatCompact(workforce.logicalOperators)}</strong>
            <small>Visible {formatCompact(workforce.visibleOperators)}</small>
          </article>
        </aside>

        <button className="extract-fab" type="button" onClick={handleExtract}>
          Extract +{economy.tapGain.toFixed(1)}
        </button>

        <footer className="command-dock">
          <button type="button" onClick={() => togglePanel('crew')}>
            Crew
          </button>
          <button type="button" onClick={() => togglePanel('systems')}>
            Systems
          </button>
          <button
            type="button"
            disabled={restorationPercent < 100}
            onClick={handlePrestige}
            className={restorationPercent >= 100 ? 'ready' : ''}
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
                    {!upgrade.isMaxed && upgrade.shardRequirement > 0 && (
                      <small className={`upgrade-gate ${upgrade.missingShards ? 'locked' : ''}`}>
                        Tier {upgrade.nextTier} requires {formatCompact(upgrade.shardRequirement)} shards
                      </small>
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
                        : upgrade.missingShards
                          ? `Need ${formatCompact(upgrade.shardRequirement)} shards`
                          : upgrade.canAfford
                            ? `Upgrade ${formatCompact(upgrade.nextCost)}`
                            : `Need ${formatCompact(upgrade.nextCost)} chroma`}
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
                {BUILDINGS.map((building, index) => (
                  <span key={building.id} className={index < unlockedBuildings ? 'on' : ''}>
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
            <p>Recovered {formatCompact(offlineGainResult.chromaAwarded)} chroma while away.</p>
            <button type="button" onClick={dismissOfflineGain}>
              Continue
            </button>
          </div>
        </aside>
      )}

      {lastPrestigeResult !== null && (
        <aside className="toast">
          Prestige complete: +{lastPrestigeResult.earnedShards} Prism Shards, +
          {formatCompact(lastPrestigeResult.launchChroma)} launch chroma
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
