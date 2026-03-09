import { useEffect, useMemo, useRef, type PointerEventHandler } from 'react'
import { BUILDINGS, MAX_BEACONS, MAX_PARTICLES, MAX_VISIBLE_OPERATORS } from '../config'
import type { OperatorAgent, SquadBeacon, WorkforceState } from '../types'

interface CanvasProps {
  restorationPercent: number
  unlockedBuildings: number
  workforce: WorkforceState
  agents: OperatorAgent[]
  beacons: SquadBeacon[]
  onExtract: () => void
}

interface Particle {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  ttl: number
}

interface BeamVisual {
  active: boolean
  fromX: number
  fromY: number
  toX: number
  toY: number
  alpha: number
}

interface OperatorVisual {
  active: boolean
  x: number
  y: number
  tint: number
  nearCore: boolean
}

interface BeaconVisual {
  active: boolean
  x: number
  y: number
  count: number
  pulse: number
}

interface Star {
  x: number
  y: number
  radius: number
  phase: number
  speed: number
}

interface BuildingSprite {
  x: number
  y: number
  width: number
  height: number
}

const EXTRACTION_ZONE_RADIUS = 0.35
const CORE_NODE_RADIUS = 0.09

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toCanvasX(value: number, width: number): number {
  return value * width
}

function toCanvasY(value: number, height: number): number {
  return value * height
}

function toScale(value: number, scale: number): number {
  return value * scale
}

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '')
  const value = normalized.length === 3
    ? normalized
        .split('')
        .map((char) => char + char)
        .join('')
    : normalized
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  sceneWidth: number,
  sceneHeight: number,
  scale: number,
  sprite: BuildingSprite,
  colored: boolean,
  tint: number,
  accent: string,
  index: number,
  now: number,
): void {
  const x = toCanvasX(sprite.x, sceneWidth)
  const y = toCanvasY(sprite.y, sceneHeight)
  const width = toScale(sprite.width, scale)
  const height = toScale(sprite.height, scale)
  const left = x - width / 2
  const top = y - height

  const bodyColor = colored
    ? hexToRgba(accent, 0.55 + tint * 0.35)
    : 'rgba(125, 133, 150, 0.42)'
  const lineColor = colored ? 'rgba(232, 246, 255, 0.42)' : 'rgba(232, 246, 255, 0.14)'

  ctx.fillStyle = bodyColor
  ctx.strokeStyle = lineColor
  ctx.lineWidth = Math.max(1, scale * 0.0022)
  ctx.beginPath()
  ctx.roundRect(left, top, width, height, width * 0.08)
  ctx.fill()
  ctx.stroke()

  if (index % 3 === 0) {
    ctx.beginPath()
    ctx.roundRect(left + width * 0.14, top - height * 0.28, width * 0.22, height * 0.28, width * 0.04)
    ctx.roundRect(left + width * 0.64, top - height * 0.38, width * 0.2, height * 0.38, width * 0.04)
    ctx.fill()
  } else if (index % 3 === 1) {
    ctx.beginPath()
    ctx.moveTo(left + width * 0.12, top)
    ctx.lineTo(left + width * 0.5, top - height * 0.36)
    ctx.lineTo(left + width * 0.88, top)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.roundRect(left + width * 0.32, top - height * 0.34, width * 0.36, height * 0.34, width * 0.12)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(left + width * 0.5, top - height * 0.34)
    ctx.lineTo(left + width * 0.5, top - height * 0.55)
    ctx.stroke()
  }

  const windowGlow = colored ? 0.26 + tint * 0.54 : 0.12
  ctx.fillStyle = colored ? `rgba(170, 248, 255, ${windowGlow})` : 'rgba(188, 198, 214, 0.18)'
  const rows = 3
  const cols = 3
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const wx = left + width * (0.14 + col * 0.26)
      const wy = top + height * (0.22 + row * 0.22)
      ctx.fillRect(wx, wy, width * 0.12, height * 0.08)
    }
  }

  if (colored) {
    const pulse = 0.45 + Math.sin(now * 0.002 + index * 0.8) * 0.22
    ctx.strokeStyle = hexToRgba(accent, 0.28 + pulse * 0.35)
    ctx.lineWidth = Math.max(1, scale * 0.0016)
    ctx.beginPath()
    ctx.moveTo(x, top - height * 0.55)
    ctx.lineTo(x, toCanvasY(0.5, sceneHeight))
    ctx.stroke()
  }
}

export function ExtractionCanvas({
  restorationPercent,
  unlockedBuildings,
  workforce,
  agents,
  beacons,
  onExtract,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const latest = useRef<CanvasProps>({
    restorationPercent,
    unlockedBuildings,
    workforce,
    agents,
    beacons,
    onExtract,
  })
  const lastFrameTime = useRef<number>(0)
  const particlePool = useRef<Particle[]>(
    Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0.5,
      y: 0.5,
      vx: 0,
      vy: 0,
      life: 0,
      ttl: 0,
    })),
  )
  const beamPool = useRef<BeamVisual[]>(
    Array.from({ length: MAX_VISIBLE_OPERATORS }, () => ({
      active: false,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
      alpha: 0,
    })),
  )
  const operatorPool = useRef<OperatorVisual[]>(
    Array.from({ length: MAX_VISIBLE_OPERATORS }, () => ({
      active: false,
      x: 0.5,
      y: 0.5,
      tint: 0,
      nearCore: false,
    })),
  )
  const beaconPool = useRef<BeaconVisual[]>(
    Array.from({ length: MAX_BEACONS }, () => ({
      active: false,
      x: 0.5,
      y: 0.5,
      count: 0,
      pulse: 0,
    })),
  )
  const buildingPositions = useMemo(
    () => {
      const columns = Math.max(1, BUILDINGS.length)
      return BUILDINGS.map((_, idx) => {
        const lane = idx / Math.max(1, columns - 1)
        const wave = Math.sin(idx * 1.3) * 0.015
        return {
          x: 0.1 + lane * 0.8,
          y: 0.85 + wave,
          width: 0.1 + (idx % 2) * 0.02,
          height: 0.12 + ((idx + 1) % 3) * 0.03,
        }
      })
    },
    [],
  )
  const starField = useMemo<Star[]>(
    () =>
      Array.from({ length: 110 }, (_, idx) => ({
        x: seeded(idx, 1),
        y: seeded(idx, 2) * 0.72,
        radius: 0.0012 + seeded(idx, 3) * 0.0036,
        phase: seeded(idx, 4) * Math.PI * 2,
        speed: 0.5 + seeded(idx, 5) * 1.5,
      })),
    [],
  )

  useEffect(() => {
    latest.current = {
      restorationPercent,
      unlockedBuildings,
      workforce,
      agents,
      beacons,
      onExtract,
    }
  }, [restorationPercent, unlockedBuildings, workforce, agents, beacons, onExtract])

  const spawnParticles = (count: number) => {
    const pool = particlePool.current
    for (let i = 0; i < pool.length && count > 0; i += 1) {
      if (pool[i].active) {
        continue
      }
      const angle = Math.random() * Math.PI * 2
      const speed = 0.18 + Math.random() * 0.32
      pool[i].active = true
      pool[i].x = 0.5
      pool[i].y = 0.5
      pool[i].vx = Math.cos(angle) * speed
      pool[i].vy = Math.sin(angle) * speed
      pool[i].ttl = 0.35 + Math.random() * 0.3
      pool[i].life = pool[i].ttl
      count -= 1
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    let rafId = 0

    const draw = (now: number) => {
      const props = latest.current
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const renderW = Math.max(1, Math.floor(rect.width * dpr))
      const renderH = Math.max(1, Math.floor(rect.height * dpr))

      if (canvas.width !== renderW || canvas.height !== renderH) {
        canvas.width = renderW
        canvas.height = renderH
      }

      const sceneW = renderW
      const sceneH = renderH
      const scale = Math.min(sceneW, sceneH)
      const dtSeconds = clamp((now - lastFrameTime.current) / 1000, 0, 0.05)
      lastFrameTime.current = now

      ctx.save()
      ctx.clearRect(0, 0, renderW, renderH)

      const tint = clamp(props.restorationPercent / 100, 0, 1)
      const baseHue = 200 + tint * 130
      const bg = ctx.createRadialGradient(
        toCanvasX(0.5, sceneW),
        toCanvasY(0.5, sceneH),
        toScale(0.08, scale),
        toCanvasX(0.5, sceneW),
        toCanvasY(0.5, sceneH),
        toScale(0.7, scale),
      )
      bg.addColorStop(0, `hsla(${baseHue}, ${35 + tint * 45}%, ${20 + tint * 22}%, 0.95)`)
      bg.addColorStop(1, `hsla(${210 + tint * 30}, ${8 + tint * 16}%, ${5 + tint * 8}%, 1)`)
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, sceneW, sceneH)

      for (let i = 0; i < starField.length; i += 1) {
        const star = starField[i]
        const flicker = 0.25 + Math.sin(now * 0.001 * star.speed + star.phase) * 0.22
        ctx.fillStyle = `rgba(240, 248, 255, ${0.28 + flicker})`
        ctx.beginPath()
        ctx.arc(
          toCanvasX(star.x, sceneW),
          toCanvasY(star.y, sceneH),
          toScale(star.radius, scale),
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      const zoneRadiusPx = toScale(EXTRACTION_ZONE_RADIUS, scale)
      const zoneRim = toScale(0.085, scale)
      const zoneX = toCanvasX(0.5, sceneW)
      const zoneY = toCanvasY(0.5, sceneH)

      const zoneAura = ctx.createRadialGradient(
        zoneX,
        zoneY,
        zoneRadiusPx * 0.64,
        zoneX,
        zoneY,
        zoneRadiusPx * 1.25,
      )
      zoneAura.addColorStop(0, `rgba(126, 228, 255, ${0.04 + tint * 0.08})`)
      zoneAura.addColorStop(1, `rgba(126, 228, 255, 0)`)
      ctx.fillStyle = zoneAura
      ctx.beginPath()
      ctx.arc(zoneX, zoneY, zoneRadiusPx * 1.25, 0, Math.PI * 2)
      ctx.fill()

      const zoneRing = ctx.createLinearGradient(
        toCanvasX(0.14, sceneW),
        toCanvasY(0.22, sceneH),
        toCanvasX(0.86, sceneW),
        toCanvasY(0.78, sceneH),
      )
      zoneRing.addColorStop(0, `rgba(255, 137, 208, ${0.65 + tint * 0.2})`)
      zoneRing.addColorStop(0.45, `rgba(255, 255, 255, ${0.38 + tint * 0.2})`)
      zoneRing.addColorStop(0.75, `rgba(123, 230, 255, ${0.62 + tint * 0.2})`)
      zoneRing.addColorStop(1, `rgba(115, 156, 255, ${0.6 + tint * 0.2})`)
      ctx.strokeStyle = zoneRing
      ctx.lineWidth = zoneRim
      ctx.beginPath()
      ctx.arc(zoneX, zoneY, zoneRadiusPx, 0, Math.PI * 2)
      ctx.stroke()

      ctx.fillStyle = 'rgba(8, 13, 26, 0.96)'
      ctx.beginPath()
      ctx.arc(zoneX, zoneY, zoneRadiusPx - zoneRim * 0.55, 0, Math.PI * 2)
      ctx.fill()

      for (let i = 0; i < buildingPositions.length; i += 1) {
        const building = BUILDINGS[i]
        const sprite = buildingPositions[i]
        const colored = i < props.unlockedBuildings
        drawBuilding(ctx, sceneW, sceneH, scale, sprite, colored, tint, building.color, i, now)
      }

      const beams = beamPool.current
      beams.forEach((beam) => {
        beam.active = false
      })
      const operators = operatorPool.current
      operators.forEach((operator) => {
        operator.active = false
      })

      for (let i = 0; i < props.agents.length && i < MAX_VISIBLE_OPERATORS; i += 1) {
        const agent = props.agents[i]
        const operator = operators[i]
        operator.active = true
        operator.x = agent.position.x
        operator.y = agent.position.y
        operator.tint = agent.tintLevel
        operator.nearCore = agent.state === 'siphon'

        const beam = beams[i]
        beam.active = agent.state === 'siphon' || agent.state === 'approach'
        if (beam.active) {
          beam.fromX = agent.position.x
          beam.fromY = agent.position.y
          beam.toX = 0.5
          beam.toY = 0.5
          beam.alpha = agent.state === 'siphon' ? 0.5 + tint * 0.35 : 0.2 + tint * 0.2
        }
      }

      ctx.lineWidth = Math.max(1, scale * 0.003)
      beams.forEach((beam) => {
        if (!beam.active) return
        ctx.strokeStyle = `rgba(130, 245, 255, ${beam.alpha})`
        ctx.beginPath()
        ctx.moveTo(toCanvasX(beam.fromX, sceneW), toCanvasY(beam.fromY, sceneH))
        ctx.lineTo(toCanvasX(beam.toX, sceneW), toCanvasY(beam.toY, sceneH))
        ctx.stroke()
      })

      const coreGlow = ctx.createRadialGradient(
        zoneX,
        zoneY,
        toScale(0.02, scale),
        zoneX,
        zoneY,
        toScale(CORE_NODE_RADIUS * 1.9, scale),
      )
      coreGlow.addColorStop(0, `rgba(255, 255, 255, ${0.5 + tint * 0.28})`)
      coreGlow.addColorStop(1, `rgba(75, 145, 250, ${0.08 + tint * 0.3})`)
      ctx.fillStyle = coreGlow
      ctx.beginPath()
      ctx.arc(
        zoneX,
        zoneY,
        toScale(CORE_NODE_RADIUS * 1.9, scale),
        0,
        Math.PI * 2,
      )
      ctx.fill()

      ctx.fillStyle = `hsl(${baseHue}, ${30 + tint * 60}%, ${22 + tint * 52}%)`
      ctx.beginPath()
      ctx.arc(
        zoneX,
        zoneY,
        toScale(CORE_NODE_RADIUS, scale),
        0,
        Math.PI * 2,
      )
      ctx.fill()

      const scanAngle = now * 0.00032
      ctx.strokeStyle = `rgba(255, 145, 206, ${0.28 + tint * 0.28})`
      ctx.lineWidth = Math.max(1, scale * 0.0036)
      ctx.beginPath()
      ctx.moveTo(zoneX, zoneY)
      ctx.lineTo(
        toCanvasX(0.5 + Math.cos(scanAngle) * (EXTRACTION_ZONE_RADIUS - 0.045), sceneW),
        toCanvasY(0.5 + Math.sin(scanAngle) * (EXTRACTION_ZONE_RADIUS - 0.045), sceneH),
      )
      ctx.stroke()

      operators.forEach((operator) => {
        if (!operator.active) return
        const x = toCanvasX(operator.x, sceneW)
        const y = toCanvasY(operator.y, sceneH)
        const distToCore = Math.hypot(operator.x - 0.5, operator.y - 0.5)
        const lowDetail = distToCore > 0.24
        const bodyColor = `hsla(${205 + operator.tint * 120}, ${8 + operator.tint * 64}%, ${
          62 + operator.tint * 20
        }%, 0.95)`

        if (lowDetail) {
          ctx.fillStyle = bodyColor
          ctx.beginPath()
          ctx.arc(x, y, toScale(0.008, scale), 0, Math.PI * 2)
          ctx.fill()
          return
        }

        const width = toScale(0.015, scale)
        const height = toScale(0.026, scale)
        ctx.fillStyle = bodyColor
        ctx.beginPath()
        ctx.roundRect(x - width / 2, y - height / 2, width, height, width * 0.6)
        ctx.fill()

        ctx.fillStyle = `rgba(190, 250, 255, ${0.35 + operator.tint * 0.6})`
        ctx.beginPath()
        ctx.arc(x + width * 0.32, y + height * 0.1, width * 0.36, 0, Math.PI * 2)
        ctx.fill()
      })

      const beaconVisuals = beaconPool.current
      beaconVisuals.forEach((beaconVisual) => {
        beaconVisual.active = false
      })
      for (let i = 0; i < props.beacons.length && i < MAX_BEACONS; i += 1) {
        const source = props.beacons[i]
        const target = beaconVisuals[i]
        target.active = true
        target.x = source.anchorPosition.x
        target.y = source.anchorPosition.y
        target.count = source.representedCount
        target.pulse = source.pulsePhase
      }

      beaconVisuals.forEach((beacon) => {
        if (!beacon.active) return
        const x = toCanvasX(beacon.x, sceneW)
        const y = toCanvasY(beacon.y, sceneH)
        const pulse = 0.8 + Math.sin(beacon.pulse * Math.PI * 2) * 0.22
        const radius = toScale(0.015, scale) * pulse
        ctx.fillStyle = `rgba(115, 230, 255, ${0.22 + tint * 0.58})`
        ctx.beginPath()
        ctx.arc(x, y, radius * 2.1, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(220, 255, 255, ${0.7 + tint * 0.2})`
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(15, 30, 38, 0.85)'
        ctx.font = `${Math.max(9, scale * 0.026)}px ui-sans-serif, system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`+${beacon.count}`, x, y + 1)
      })

      const particles = particlePool.current
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i]
        if (!particle.active) continue
        particle.life -= dtSeconds
        if (particle.life <= 0) {
          particle.active = false
          continue
        }
        particle.x += particle.vx * dtSeconds
        particle.y += particle.vy * dtSeconds
        const alpha = particle.life / particle.ttl
        ctx.fillStyle = `rgba(230, 255, 255, ${alpha * (0.5 + tint * 0.5)})`
        ctx.beginPath()
        ctx.arc(
          toCanvasX(particle.x, sceneW),
          toCanvasY(particle.y, sceneH),
          toScale(0.004 + alpha * 0.007, scale),
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      ctx.strokeStyle = `rgba(255, 255, 255, ${0.18 + tint * 0.48})`
      ctx.lineWidth = Math.max(1.5, scale * 0.005)
      ctx.beginPath()
      ctx.arc(
        zoneX,
        zoneY,
        toScale(CORE_NODE_RADIUS + 0.03, scale),
        0,
        Math.PI * 2,
      )
      ctx.stroke()

      ctx.fillStyle = 'rgba(5, 10, 21, 0.95)'
      ctx.beginPath()
      ctx.moveTo(0, toCanvasY(0.82, sceneH))
      for (let i = 0; i <= 16; i += 1) {
        const x = (i / 16) * sceneW
        const tower = (Math.sin(i * 1.4 + 0.5) * 0.03 + 0.08) * scale
        ctx.lineTo(x, toCanvasY(0.9, sceneH) - tower)
      }
      ctx.lineTo(sceneW, sceneH)
      ctx.lineTo(0, sceneH)
      ctx.closePath()
      ctx.fill()

      ctx.restore()
      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(rafId)
    }
  }, [buildingPositions, starField])

  const handlePointerDown: PointerEventHandler<HTMLCanvasElement> = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    const scale = Math.min(rect.width, rect.height)
    const dx = ((x - 0.5) * rect.width) / scale
    const dy = ((y - 0.5) * rect.height) / scale
    const dist = Math.hypot(dx, dy)
    if (dist <= EXTRACTION_ZONE_RADIUS) {
      spawnParticles(18)
      latest.current.onExtract()
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="extraction-canvas"
      onPointerDown={handlePointerDown}
      role="img"
      aria-label="Color extraction core with vacuum operators"
    />
  )
}
