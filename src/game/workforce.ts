import {
  MAX_BEACONS,
  MAX_VISIBLE_OPERATORS,
  OPERATOR_CYCLE_SECONDS,
  OPERATOR_PHASE_ORDER,
} from './config'
import type { OperatorAgent, OperatorState, SquadBeacon, Vec2, WorkforceState } from './types'

const TAU = Math.PI * 2

function phaseDuration(state: OperatorState): number {
  return OPERATOR_CYCLE_SECONDS[state]
}

function hashToUnit(value: number): number {
  const x = Math.sin(value * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function laneAnchor(lane: number, laneCount: number): Vec2 {
  const angle = (lane / Math.max(1, laneCount)) * TAU - Math.PI / 2
  return {
    x: 0.5 + Math.cos(angle) * 0.28,
    y: 0.5 + Math.sin(angle) * 0.28,
  }
}

function nextPhase(state: OperatorState): OperatorState {
  const idx = OPERATOR_PHASE_ORDER.indexOf(state)
  const nextIdx = (idx + 1) % OPERATOR_PHASE_ORDER.length
  return OPERATOR_PHASE_ORDER[nextIdx]
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function calculateWorkforce(
  automationTier: number,
  unlockedBuildingCount: number,
): WorkforceState {
  const logicalOperators = Math.floor(
    2 + 3 * automationTier + 0.4 * automationTier * automationTier,
  )
  const visibleCap = Math.min(MAX_VISIBLE_OPERATORS, 24 + 4 * unlockedBuildingCount)
  const visibleOperators = Math.min(logicalOperators, visibleCap)
  const overflowOperators = logicalOperators - visibleOperators
  const squads = Math.ceil(Math.max(0, overflowOperators) / 8)

  return {
    logicalOperators,
    visibleCap,
    visibleOperators,
    overflowOperators,
    squads,
  }
}

export function createOperators(
  visibleOperatorCount: number,
  laneCount: number,
  tintLevel: number,
): OperatorAgent[] {
  const agents: OperatorAgent[] = []
  for (let id = 0; id < visibleOperatorCount; id += 1) {
    const lane = id % Math.max(1, laneCount)
    const spawn = laneAnchor(lane, laneCount)
    const jitterAngle = hashToUnit(id + 31) * TAU
    const jitterRadius = 0.015 + hashToUnit(id + 67) * 0.02
    const anchor = {
      x: 0.5 + Math.cos(jitterAngle) * jitterRadius,
      y: 0.5 + Math.sin(jitterAngle) * jitterRadius,
    }
    const state: OperatorState = OPERATOR_PHASE_ORDER[id % OPERATOR_PHASE_ORDER.length]
    const duration = phaseDuration(state)
    const offset = hashToUnit(id + 111) * duration
    agents.push({
      id,
      state,
      lane,
      cycleProgress: offset / duration,
      tintLevel,
      phaseElapsed: offset,
      phaseDuration: duration,
      spawn,
      anchor,
      position: { ...spawn },
    })
  }
  return agents
}

export function stepOperators(
  operators: OperatorAgent[],
  deltaSeconds: number,
  laneCount: number,
  tintLevel: number,
): OperatorAgent[] {
  const count = operators.length
  const updated: OperatorAgent[] = new Array(count)

  for (let i = 0; i < count; i += 1) {
    const current = operators[i]
    const lane = i % Math.max(1, laneCount)
    const spawn = laneAnchor(lane, laneCount)
    const working = { ...current, lane, spawn }

    let elapsed = working.phaseElapsed + deltaSeconds
    let state = working.state
    let duration = phaseDuration(state)

    while (elapsed >= duration) {
      elapsed -= duration
      state = nextPhase(state)
      duration = phaseDuration(state)
    }

    const progress = elapsed / duration
    let x = working.position.x
    let y = working.position.y

    if (state === 'approach') {
      x = lerp(spawn.x, working.anchor.x, progress)
      y = lerp(spawn.y, working.anchor.y, progress)
    } else if (state === 'siphon') {
      const wobble = Math.sin(progress * TAU * 2 + working.id) * 0.01
      x = working.anchor.x + wobble
      y = working.anchor.y + Math.cos(progress * TAU + working.id) * 0.008
    } else if (state === 'return') {
      x = lerp(working.anchor.x, spawn.x, progress)
      y = lerp(working.anchor.y, spawn.y, progress)
    } else {
      x = spawn.x
      y = spawn.y
    }

    updated[i] = {
      ...working,
      state,
      phaseElapsed: elapsed,
      phaseDuration: duration,
      cycleProgress: progress,
      tintLevel,
      position: { x, y },
    }
  }

  return updated
}

export function createSquadBeacons(squadCount: number, overflowOperators: number): SquadBeacon[] {
  const limitedCount = Math.min(MAX_BEACONS, squadCount)
  const beacons: SquadBeacon[] = []
  let remaining = overflowOperators

  for (let i = 0; i < limitedCount; i += 1) {
    const representedCount =
      i === limitedCount - 1 ? Math.max(0, remaining) : Math.min(8, Math.max(0, remaining))
    remaining -= representedCount
    const angle = (i / Math.max(1, limitedCount)) * TAU - Math.PI / 2
    beacons.push({
      id: i,
      representedCount,
      anchorPosition: {
        x: 0.5 + Math.cos(angle) * 0.12,
        y: 0.5 + Math.sin(angle) * 0.12,
      },
      pulsePhase: hashToUnit(i + 503),
    })
  }

  return beacons
}

export function stepBeacons(beacons: SquadBeacon[], deltaSeconds: number): SquadBeacon[] {
  return beacons.map((beacon) => ({
    ...beacon,
    pulsePhase: (beacon.pulsePhase + deltaSeconds * 0.85) % 1,
  }))
}

