import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { BUILDINGS, GAME_TITLE, SAVE_INTERVAL_MS, TICK_RATE_HZ, UPGRADE_LANES } from './game/config'
import { createAudioBus } from './game/audio'
import { calculateUpgradeCost } from './game/economy'
import { formatCompact, formatPercent, formatSeconds } from './game/format'
import { ExtractionCanvas } from './game/render/ExtractionCanvas'
import { useGameStore } from './game/store'

type ActivePanel = 'upgrades' | 'crew' | 'systems' | null

function App() {
  const [lastPrestigeGain, setLastPrestigeGain] = useState<number | null>(null)
  const [activePanel, setActivePanel] = useState<ActivePanel>(null)
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
  const prismShards = useGameStore((state) => state.prismShards)
  const prestigeMultiplier = useGameStore((state) => state.prestigeMultiplier)
  const upgrades = useGameStore((state) => state.upgrades)
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

  const laneViewModels = useMemo(
    () =>
      UPGRADE_LANES.map((lane) => {
        const currentTier = upgrades[lane.id]
        const isMaxed = currentTier >= lane.maxTier
        const nextCost = isMaxed ? 0 : calculateUpgradeCost(lane.id, currentTier)
        const canAfford = !isMaxed && chroma >= nextCost
        return {
          ...lane,
          currentTier,
          isMaxed,
          nextCost,
          canAfford,
        }
      }),
    [chroma, upgrades],
  )

  const crewCards = useMemo(
    () => Array.from({ length: Math.min(12, workforce.visibleOperators) }, (_, idx) => idx),
    [workforce.visibleOperators],
  )

  const nextBuilding = BUILDINGS[unlockedBuildings]

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
    setLastPrestigeGain(result.earnedShards)
    setActivePanel(null)
  }

  const togglePanel = (panel: ActivePanel) => {
    setActivePanel((current) => (current === panel ? null : panel))
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
          onExtract={handleExtract}
        />

        <div className="mission-card hud-panel">
          <span className="label">Mission</span>
          {nextBuilding ? (
            <strong>
              Unlock {nextBuilding.name} @ {nextBuilding.unlockAtTotalTiers} tiers
            </strong>
          ) : (
            <strong>All sectors colorized. Ready for prestige.</strong>
          )}
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
          <button type="button" onClick={() => togglePanel('upgrades')}>
            Upgrades
          </button>
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
            Prestige
          </button>
        </footer>

        <section className={`drawer ${activePanel ? 'open' : ''}`}>
          {activePanel === 'upgrades' && (
            <div className="drawer-content">
              <header>
                <h2>Upgrade Network</h2>
                <span>Auto/sec {formatCompact(economy.autoGainPerSec)}</span>
              </header>
              <div className="upgrade-grid">
                {laneViewModels.map((lane) => (
                  <article key={lane.id} className="upgrade-card">
                    <header>
                      <h3>{lane.name}</h3>
                      <span>
                        {lane.currentTier}/{lane.maxTier}
                      </span>
                    </header>
                    <p>{lane.description}</p>
                    <button
                      type="button"
                      disabled={!lane.canAfford}
                      onClick={() => {
                        const purchased = purchaseUpgrade(lane.id)
                        if (purchased) {
                          audioRef.current.buy()
                        }
                      }}
                    >
                      {lane.isMaxed ? 'Maxed' : `Upgrade ${formatCompact(lane.nextCost)}`}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          )}

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

      {lastPrestigeGain !== null && (
        <aside className="toast">
          Prestige complete: +{lastPrestigeGain} Prism Shards
          <button
            type="button"
            onClick={() => {
              setLastPrestigeGain(null)
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

