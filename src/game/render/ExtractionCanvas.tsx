import { useEffect, useMemo, useRef, type PointerEventHandler } from 'react'
import { BUILDINGS, MAX_BEACONS, MAX_PARTICLES, MAX_VISIBLE_OPERATORS } from '../config'
import type { OperatorAgent, SquadBeacon, WorkforceState } from '../types'

interface CanvasProps {
  restorationPercent: number
  unlockedBuildings: number
  workforce: WorkforceState
  agents: OperatorAgent[]
  beacons: SquadBeacon[]
  selectedBuildingId: string | null
  onExtract: () => void
  onSelectBuilding: (buildingId: string | null) => void
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
}

interface BeaconVisual {
  active: boolean
  x: number
  y: number
  count: number
  pulse: number
}

interface BuildingLayout {
  id: string
  index: number
  placement: 'ground' | 'orbital'
  worldX: number
  worldY: number
  width: number
  height: number
  color: string
}

interface DragState {
  active: boolean
  pointerId: number
  lastX: number
  moved: boolean
}

interface SceneMetrics {
  width: number
  height: number
  scale: number
}

interface CameraState {
  x: number
  y: number
  zoom: number
}

interface Star {
  x: number
  y: number
  radius: number
  phase: number
  speed: number
}

const WORLD_PADDING = 0.42
const BUILDING_SPACING = 0.46
const GROUND_BUILDING_COUNT = Math.max(
  1,
  BUILDINGS.filter((building) => building.placement === 'ground').length,
)
const WORLD_WIDTH = WORLD_PADDING * 2 + (GROUND_BUILDING_COUNT - 1) * BUILDING_SPACING
const EXTRACTION_WORLD_X = WORLD_WIDTH * 0.5
const EXTRACTION_WORLD_Y = 0.5
const GROUND_WORLD_Y = 0.82
const EXTRACTION_ZONE_RADIUS = 0.26
const ORBITAL_RING_RADIUS = 0.34

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function createSlotOrder(count: number): number[] {
  const centerLeft = Math.floor((count - 1) * 0.5)
  const order: number[] = [centerLeft]
  let offset = 1
  while (order.length < count) {
    const right = centerLeft + offset
    if (right < count) {
      order.push(right)
    }
    const left = centerLeft - offset
    if (left >= 0) {
      order.push(left)
    }
    offset += 1
  }
  return order
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '')
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((part) => part + part)
          .join('')
      : clean
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return { r, g, b }
}

function mixChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453123
  return value - Math.floor(value)
}

function worldToScreenX(worldX: number, camera: CameraState, metrics: SceneMetrics): number {
  return metrics.width * 0.5 + (worldX - camera.x) * metrics.scale * camera.zoom
}

function worldToScreenY(worldY: number, camera: CameraState, metrics: SceneMetrics): number {
  return metrics.height * 0.5 + (worldY - camera.y) * metrics.scale * camera.zoom
}

function screenToWorldX(screenX: number, camera: CameraState, metrics: SceneMetrics): number {
  return (screenX - metrics.width * 0.5) / (metrics.scale * camera.zoom) + camera.x
}

function screenToWorldY(screenY: number, camera: CameraState, metrics: SceneMetrics): number {
  return (screenY - metrics.height * 0.5) / (metrics.scale * camera.zoom) + camera.y
}

function clampCameraX(targetX: number, zoom: number, metrics: SceneMetrics): number {
  const halfVisible = metrics.width / (metrics.scale * zoom) / 2
  const minX = WORLD_PADDING - 0.2 + halfVisible
  const maxX = WORLD_WIDTH - WORLD_PADDING + 0.2 - halfVisible
  if (minX > maxX) {
    return WORLD_WIDTH * 0.5
  }
  return clamp(targetX, minX, maxX)
}

function drawGreyCity(
  ctx: CanvasRenderingContext2D,
  metrics: SceneMetrics,
  camera: CameraState,
  tint: number,
): void {
  const sky = ctx.createLinearGradient(0, 0, 0, metrics.height)
  sky.addColorStop(0, 'rgba(83, 88, 102, 1)')
  sky.addColorStop(0.45, 'rgba(55, 60, 72, 1)')
  sky.addColorStop(1, 'rgba(30, 34, 45, 1)')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, metrics.width, metrics.height)

  const horizonY = worldToScreenY(0.7, camera, metrics)
  const parallax = (camera.x - WORLD_WIDTH * 0.5) * metrics.scale * 0.25

  for (let i = 0; i < 22; i += 1) {
    const width = metrics.width * (0.07 + seeded(i, 17) * 0.06)
    const height = metrics.height * (0.16 + seeded(i, 18) * 0.22)
    const baseX = (i / 21) * (metrics.width + width * 2) - width
    const x = baseX - parallax
    const y = horizonY - height
    const shade = 52 + Math.floor(seeded(i, 19) * 32)
    ctx.fillStyle = `rgba(${shade}, ${shade + 4}, ${shade + 8}, 0.72)`
    ctx.fillRect(x, y, width, height)
  }

  for (let i = 0; i < 18; i += 1) {
    const width = metrics.width * (0.09 + seeded(i, 27) * 0.06)
    const height = metrics.height * (0.2 + seeded(i, 28) * 0.28)
    const baseX = (i / 17) * (metrics.width + width * 2) - width
    const x = baseX - parallax * 1.4
    const y = horizonY - height
    const shade = 34 + Math.floor(seeded(i, 29) * 24)
    ctx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 7}, 0.88)`
    ctx.fillRect(x, y, width, height)
  }

  const haze = ctx.createLinearGradient(0, horizonY - metrics.height * 0.22, 0, horizonY + metrics.height * 0.05)
  haze.addColorStop(0, 'rgba(198, 208, 222, 0)')
  haze.addColorStop(1, `rgba(146, 156, 174, ${0.16 + tint * 0.07})`)
  ctx.fillStyle = haze
  ctx.fillRect(0, horizonY - metrics.height * 0.24, metrics.width, metrics.height * 0.3)
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  layout: BuildingLayout,
  camera: CameraState,
  metrics: SceneMetrics,
  colored: boolean,
  focused: boolean,
  tint: number,
  now: number,
): { x: number; y: number; width: number; height: number } {
  const x = worldToScreenX(layout.worldX, camera, metrics)
  const baseY = worldToScreenY(layout.worldY, camera, metrics)
  const width = layout.width * metrics.scale * camera.zoom
  const height = layout.height * metrics.scale * camera.zoom
  const left = x - width / 2
  const top = baseY - height

  const rgb = hexToRgb(layout.color)
  const colorMix = 0.66 + tint * 0.2
  const body = colored
    ? `rgba(${mixChannel(106, rgb.r, colorMix)}, ${mixChannel(112, rgb.g, colorMix)}, ${mixChannel(126, rgb.b, colorMix)}, 0.94)`
    : 'rgba(115, 123, 140, 0.62)'
  ctx.fillStyle = body
  ctx.strokeStyle = focused ? 'rgba(255, 252, 236, 0.85)' : 'rgba(220, 232, 255, 0.28)'
  ctx.lineWidth = Math.max(1, metrics.scale * 0.0026 * camera.zoom)
  ctx.beginPath()
  ctx.roundRect(left, top, width, height, Math.max(4, width * 0.08))
  ctx.fill()
  ctx.stroke()

  if (layout.index % 3 === 0) {
    ctx.fillRect(left + width * 0.16, top - height * 0.26, width * 0.24, height * 0.26)
    ctx.fillRect(left + width * 0.64, top - height * 0.36, width * 0.2, height * 0.36)
  } else if (layout.index % 3 === 1) {
    ctx.beginPath()
    ctx.moveTo(left + width * 0.1, top)
    ctx.lineTo(left + width * 0.5, top - height * 0.34)
    ctx.lineTo(left + width * 0.9, top)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.fillRect(left + width * 0.33, top - height * 0.28, width * 0.34, height * 0.28)
    ctx.strokeStyle = colored
      ? `rgba(${mixChannel(160, rgb.r, 0.35)}, ${mixChannel(182, rgb.g, 0.35)}, ${mixChannel(210, rgb.b, 0.35)}, 0.42)`
      : 'rgba(224, 236, 255, 0.35)'
    ctx.beginPath()
    ctx.moveTo(left + width * 0.5, top - height * 0.28)
    ctx.lineTo(left + width * 0.5, top - height * 0.52)
    ctx.stroke()
  }

  if (layout.placement === 'orbital') {
    ctx.fillStyle = colored
      ? `rgba(${mixChannel(150, rgb.r, 0.35)}, ${mixChannel(180, rgb.g, 0.35)}, ${mixChannel(220, rgb.b, 0.35)}, 0.9)`
      : 'rgba(125, 135, 160, 0.65)'
    ctx.beginPath()
    ctx.ellipse(x, baseY + height * 0.06, width * 0.42, height * 0.08, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = colored
      ? `rgba(${mixChannel(175, rgb.r, 0.45)}, ${mixChannel(210, rgb.g, 0.45)}, ${mixChannel(235, rgb.b, 0.45)}, 0.45)`
      : 'rgba(210, 222, 245, 0.3)'
    ctx.beginPath()
    ctx.moveTo(x - width * 0.34, baseY + height * 0.06)
    ctx.lineTo(x + width * 0.34, baseY + height * 0.06)
    ctx.stroke()
  }

  const glow = colored ? 0.28 + tint * 0.46 : 0.1
  ctx.fillStyle = colored
    ? `rgba(${mixChannel(170, rgb.r, 0.25)}, ${mixChannel(210, rgb.g, 0.25)}, ${mixChannel(232, rgb.b, 0.25)}, ${glow})`
    : `rgba(176, 220, 255, ${glow})`
  const windowRows = 3
  const windowCols = 3
  for (let row = 0; row < windowRows; row += 1) {
    for (let col = 0; col < windowCols; col += 1) {
      const wx = left + width * (0.14 + col * 0.26)
      const wy = top + height * (0.22 + row * 0.22)
      ctx.fillRect(wx, wy, width * 0.12, height * 0.08)
    }
  }

  if (colored) {
    const pulse = 0.4 + Math.sin(now * 0.002 + layout.index) * 0.24
    const beamStartY =
      layout.placement === 'orbital' ? baseY - height * 0.18 : top - height * 0.52
    ctx.strokeStyle = `rgba(${mixChannel(131, rgb.r, 0.62)}, ${mixChannel(244, rgb.g, 0.62)}, ${mixChannel(255, rgb.b, 0.62)}, ${0.12 + pulse * 0.35})`
    ctx.lineWidth = Math.max(1, metrics.scale * 0.0018 * camera.zoom)
    ctx.beginPath()
    ctx.moveTo(x, beamStartY)
    ctx.lineTo(worldToScreenX(EXTRACTION_WORLD_X, camera, metrics), worldToScreenY(EXTRACTION_WORLD_Y, camera, metrics))
    ctx.stroke()
  }

  return { x: left, y: top, width, height }
}

function isPointInBuilding(
  worldX: number,
  worldY: number,
  building: BuildingLayout,
): boolean {
  const top = building.worldY - building.height
  const left = building.worldX - building.width / 2
  return worldX >= left && worldX <= left + building.width && worldY >= top - building.height * 0.55 && worldY <= building.worldY
}

export function ExtractionCanvas({
  restorationPercent,
  unlockedBuildings,
  workforce,
  agents,
  beacons,
  selectedBuildingId,
  onExtract,
  onSelectBuilding,
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const latest = useRef<CanvasProps>({
    restorationPercent,
    unlockedBuildings,
    workforce,
    agents,
    beacons,
    selectedBuildingId,
    onExtract,
    onSelectBuilding,
  })
  const lastFrameTime = useRef<number>(0)
  const metricsRef = useRef<SceneMetrics>({ width: 1, height: 1, scale: 1 })
  const cameraRef = useRef<CameraState>({ x: EXTRACTION_WORLD_X, y: 0.58, zoom: 1 })
  const panTargetRef = useRef<number>(EXTRACTION_WORLD_X)
  const dragRef = useRef<DragState>({
    active: false,
    pointerId: -1,
    lastX: 0,
    moved: false,
  })

  const particlePool = useRef<Particle[]>(
    Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: EXTRACTION_WORLD_X,
      y: EXTRACTION_WORLD_Y,
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
      x: 0,
      y: 0,
      tint: 0,
    })),
  )
  const beaconPool = useRef<BeaconVisual[]>(
    Array.from({ length: MAX_BEACONS }, () => ({
      active: false,
      x: 0,
      y: 0,
      count: 0,
      pulse: 0,
    })),
  )

  const buildings = useMemo<BuildingLayout[]>(
    () => {
      const groundBuildings = BUILDINGS.filter((building) => building.placement === 'ground')
      const orbitalBuildings = BUILDINGS.filter((building) => building.placement === 'orbital')
      const groundSlots = createSlotOrder(Math.max(1, groundBuildings.length))
      const orbitalCount = Math.max(1, orbitalBuildings.length)
      const orbitStartAngle = -Math.PI * 0.92
      const orbitEndAngle = -Math.PI * 0.08

      return BUILDINGS.map((building, index) => {
        if (building.placement === 'orbital') {
          const orbitalIndex =
            BUILDINGS.slice(0, index + 1).filter((entry) => entry.placement === 'orbital')
              .length - 1
          const t = orbitalCount === 1 ? 0.5 : orbitalIndex / (orbitalCount - 1)
          const angle = lerp(orbitStartAngle, orbitEndAngle, t)
          const worldX = EXTRACTION_WORLD_X + Math.cos(angle) * ORBITAL_RING_RADIUS
          const worldY = EXTRACTION_WORLD_Y + Math.sin(angle) * ORBITAL_RING_RADIUS
          return {
            id: building.id,
            index,
            placement: building.placement,
            worldX,
            worldY,
            width: 0.11 + (orbitalIndex % 2) * 0.01,
            height: 0.12 + ((orbitalIndex + 1) % 2) * 0.02,
            color: building.color,
          }
        }

        const groundIndex =
          BUILDINGS.slice(0, index + 1).filter((entry) => entry.placement === 'ground').length - 1
        const slot = groundSlots[groundIndex] ?? 0
        return {
          id: building.id,
          index,
          placement: building.placement,
          worldX: WORLD_PADDING + slot * BUILDING_SPACING,
          worldY: GROUND_WORLD_Y,
          width: 0.13 + (groundIndex % 2) * 0.02,
          height: 0.16 + ((groundIndex + 1) % 3) * 0.04,
          color: building.color,
        }
      })
    },
    [],
  )

  const buildingById = useMemo(() => {
    const map = new Map<string, BuildingLayout>()
    buildings.forEach((building) => {
      map.set(building.id, building)
    })
    return map
  }, [buildings])

  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: 110 }, (_, idx) => ({
        x: seeded(idx, 1),
        y: seeded(idx, 2) * 0.66,
        radius: 0.0012 + seeded(idx, 3) * 0.0035,
        phase: seeded(idx, 4) * Math.PI * 2,
        speed: 0.5 + seeded(idx, 5) * 1.3,
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
      selectedBuildingId,
      onExtract,
      onSelectBuilding,
    }
  }, [
    restorationPercent,
    unlockedBuildings,
    workforce,
    agents,
    beacons,
    selectedBuildingId,
    onExtract,
    onSelectBuilding,
  ])

  useEffect(() => {
    if (!selectedBuildingId) {
      return
    }
    const target = buildingById.get(selectedBuildingId)
    if (target) {
      panTargetRef.current = target.worldX
    }
  }, [buildingById, selectedBuildingId])

  const spawnParticles = (count: number) => {
    const pool = particlePool.current
    for (let i = 0; i < pool.length && count > 0; i += 1) {
      if (pool[i].active) continue
      const angle = Math.random() * Math.PI * 2
      const speed = 0.08 + Math.random() * 0.16
      pool[i].active = true
      pool[i].x = EXTRACTION_WORLD_X
      pool[i].y = EXTRACTION_WORLD_Y
      pool[i].vx = Math.cos(angle) * speed
      pool[i].vy = Math.sin(angle) * speed
      pool[i].ttl = 0.32 + Math.random() * 0.28
      pool[i].life = pool[i].ttl
      count -= 1
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

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

      const metrics: SceneMetrics = {
        width: renderW,
        height: renderH,
        scale: Math.min(renderW, renderH),
      }
      metricsRef.current = metrics
      const dtSeconds = clamp((now - lastFrameTime.current) / 1000, 0, 0.05)
      lastFrameTime.current = now

      const selectedBuilding = props.selectedBuildingId
        ? buildingById.get(props.selectedBuildingId) ?? null
        : null
      const targetZoom = selectedBuilding
        ? selectedBuilding.placement === 'orbital'
          ? 1.52
          : 1.45
        : 1
      const targetY = selectedBuilding
        ? selectedBuilding.placement === 'orbital'
          ? EXTRACTION_WORLD_Y - 0.06
          : GROUND_WORLD_Y - 0.12
        : 0.58
      const unclampedTargetX = selectedBuilding ? selectedBuilding.worldX : panTargetRef.current
      const targetX = clampCameraX(unclampedTargetX, targetZoom, metrics)

      cameraRef.current.zoom = lerp(cameraRef.current.zoom, targetZoom, 0.14)
      cameraRef.current.y = lerp(cameraRef.current.y, targetY, 0.14)
      cameraRef.current.x = lerp(cameraRef.current.x, targetX, 0.14)
      cameraRef.current.x = clampCameraX(cameraRef.current.x, cameraRef.current.zoom, metrics)

      const camera = cameraRef.current
      const tint = clamp(props.restorationPercent / 100, 0, 1)
      const baseHue = 188 + tint * 106

      ctx.save()
      ctx.clearRect(0, 0, metrics.width, metrics.height)

      drawGreyCity(ctx, metrics, camera, tint)

      for (let i = 0; i < stars.length; i += 1) {
        const star = stars[i]
        const flicker = 0.2 + Math.sin(now * 0.001 * star.speed + star.phase) * 0.2
        ctx.fillStyle = `rgba(198, 207, 222, ${0.1 + flicker * 0.18})`
        ctx.beginPath()
        ctx.arc(
          star.x * metrics.width,
          star.y * metrics.height,
          star.radius * metrics.scale,
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      const zoneX = worldToScreenX(EXTRACTION_WORLD_X, camera, metrics)
      const zoneY = worldToScreenY(EXTRACTION_WORLD_Y, camera, metrics)
      const zoneRadiusPx = EXTRACTION_ZONE_RADIUS * metrics.scale * camera.zoom
      const zoneRim = Math.max(6, metrics.scale * camera.zoom * 0.08)

      const zoneAura = ctx.createRadialGradient(
        zoneX,
        zoneY,
        zoneRadiusPx * 0.6,
        zoneX,
        zoneY,
        zoneRadiusPx * 1.25,
      )
      zoneAura.addColorStop(0, `rgba(130, 224, 255, ${0.1 + tint * 0.12})`)
      zoneAura.addColorStop(1, 'rgba(130, 224, 255, 0)')
      ctx.fillStyle = zoneAura
      ctx.beginPath()
      ctx.arc(zoneX, zoneY, zoneRadiusPx * 1.25, 0, Math.PI * 2)
      ctx.fill()

      const ringGradient = ctx.createLinearGradient(
        zoneX - zoneRadiusPx,
        zoneY - zoneRadiusPx,
        zoneX + zoneRadiusPx,
        zoneY + zoneRadiusPx,
      )
      ringGradient.addColorStop(0, `rgba(255, 140, 206, ${0.7 + tint * 0.18})`)
      ringGradient.addColorStop(0.45, `rgba(255, 255, 255, ${0.42 + tint * 0.2})`)
      ringGradient.addColorStop(0.75, `rgba(124, 230, 255, ${0.7 + tint * 0.16})`)
      ringGradient.addColorStop(1, `rgba(114, 154, 255, ${0.66 + tint * 0.18})`)
      ctx.strokeStyle = ringGradient
      ctx.lineWidth = zoneRim
      ctx.beginPath()
      ctx.arc(zoneX, zoneY, zoneRadiusPx, 0, Math.PI * 2)
      ctx.stroke()

      const innerRadius = zoneRadiusPx - zoneRim * 0.55
      const liquid = ctx.createRadialGradient(
        zoneX - innerRadius * 0.34,
        zoneY - innerRadius * 0.34,
        innerRadius * 0.05,
        zoneX,
        zoneY,
        innerRadius * 1.1,
      )
      liquid.addColorStop(0, `hsla(${baseHue + 30}, ${72 + tint * 18}%, ${66 + tint * 16}%, 0.95)`)
      liquid.addColorStop(0.35, `hsla(${baseHue - 10}, ${76 + tint * 16}%, ${58 + tint * 14}%, 0.9)`)
      liquid.addColorStop(0.7, `hsla(${baseHue + 58}, ${78 + tint * 14}%, ${51 + tint * 12}%, 0.88)`)
      liquid.addColorStop(1, `hsla(${baseHue + 92}, ${60 + tint * 14}%, ${38 + tint * 8}%, 0.84)`)
      ctx.fillStyle = liquid
      ctx.beginPath()
      ctx.arc(zoneX, zoneY, innerRadius, 0, Math.PI * 2)
      ctx.fill()

      const activityBoost = 0.22 + Math.min(0.4, props.workforce.visibleOperators / 120)
      ctx.strokeStyle = `rgba(245, 255, 255, ${0.14 + tint * activityBoost})`
      ctx.lineWidth = Math.max(1, metrics.scale * camera.zoom * 0.0024)
      for (let i = 0; i < 5; i += 1) {
        const sweep = (now * 0.00015 + i * 0.21) % 1
        const arcRadius = innerRadius * (0.42 + i * 0.12)
        ctx.beginPath()
        ctx.arc(zoneX, zoneY, arcRadius, sweep * Math.PI * 2, sweep * Math.PI * 2 + Math.PI * 0.62)
        ctx.stroke()
      }

      const orbitalRingRadiusPx = ORBITAL_RING_RADIUS * metrics.scale * camera.zoom
      ctx.strokeStyle = `rgba(170, 188, 220, ${0.16 + tint * 0.22})`
      ctx.lineWidth = Math.max(1, metrics.scale * camera.zoom * 0.0022)
      ctx.beginPath()
      ctx.arc(zoneX, zoneY, orbitalRingRadiusPx, -Math.PI * 0.94, -Math.PI * 0.06)
      ctx.stroke()

      const groundY = worldToScreenY(GROUND_WORLD_Y, camera, metrics)
      const ground = ctx.createLinearGradient(0, groundY - 20, 0, metrics.height)
      ground.addColorStop(0, 'rgba(36, 41, 54, 0.92)')
      ground.addColorStop(1, 'rgba(17, 21, 31, 0.97)')
      ctx.fillStyle = ground
      ctx.fillRect(0, groundY, metrics.width, metrics.height - groundY)

      ctx.strokeStyle = 'rgba(176, 190, 210, 0.34)'
      ctx.lineWidth = Math.max(1, metrics.scale * 0.002)
      ctx.beginPath()
      ctx.moveTo(0, groundY)
      ctx.lineTo(metrics.width, groundY)
      ctx.stroke()

      const buildingBoxes: Array<{ building: BuildingLayout; rect: { x: number; y: number; width: number; height: number } }> = []
      for (let i = 0; i < buildings.length; i += 1) {
        const building = buildings[i]
        const colored = i < props.unlockedBuildings
        const focused = props.selectedBuildingId === building.id
        const rect = drawBuilding(ctx, building, camera, metrics, colored, focused, tint, now)
        buildingBoxes.push({ building, rect })
      }

      const beams = beamPool.current
      const operators = operatorPool.current
      beams.forEach((beam) => {
        beam.active = false
      })
      operators.forEach((operator) => {
        operator.active = false
      })

      for (let i = 0; i < props.agents.length && i < MAX_VISIBLE_OPERATORS; i += 1) {
        const agent = props.agents[i]
        const operator = operators[i]
        operator.active = true
        operator.x = EXTRACTION_WORLD_X + (agent.position.x - 0.5) * EXTRACTION_ZONE_RADIUS * 1.5
        operator.y = EXTRACTION_WORLD_Y + (agent.position.y - 0.5) * EXTRACTION_ZONE_RADIUS * 1.4
        operator.tint = agent.tintLevel

        const beam = beams[i]
        beam.active = agent.state === 'siphon' || agent.state === 'approach'
        beam.fromX = operator.x
        beam.fromY = operator.y
        beam.toX = EXTRACTION_WORLD_X
        beam.toY = EXTRACTION_WORLD_Y
        beam.alpha = agent.state === 'siphon' ? 0.35 + tint * 0.4 : 0.16 + tint * 0.2
      }

      ctx.lineWidth = Math.max(1, metrics.scale * camera.zoom * 0.0028)
      beams.forEach((beam) => {
        if (!beam.active) return
        ctx.strokeStyle = `rgba(124, 244, 255, ${beam.alpha})`
        ctx.beginPath()
        ctx.moveTo(worldToScreenX(beam.fromX, camera, metrics), worldToScreenY(beam.fromY, camera, metrics))
        ctx.lineTo(worldToScreenX(beam.toX, camera, metrics), worldToScreenY(beam.toY, camera, metrics))
        ctx.stroke()
      })

      operators.forEach((operator) => {
        if (!operator.active) return
        const x = worldToScreenX(operator.x, camera, metrics)
        const y = worldToScreenY(operator.y, camera, metrics)
        const dist = Math.hypot(operator.x - EXTRACTION_WORLD_X, operator.y - EXTRACTION_WORLD_Y)
        const lowDetail = dist > EXTRACTION_ZONE_RADIUS * 0.72
        const body = `hsla(${198 + operator.tint * 130}, ${8 + operator.tint * 62}%, ${62 + operator.tint * 18}%, 0.95)`

        if (lowDetail) {
          ctx.fillStyle = body
          ctx.beginPath()
          ctx.arc(x, y, Math.max(2, metrics.scale * camera.zoom * 0.008), 0, Math.PI * 2)
          ctx.fill()
          return
        }

        const w = metrics.scale * camera.zoom * 0.014
        const h = metrics.scale * camera.zoom * 0.024
        ctx.fillStyle = body
        ctx.beginPath()
        ctx.roundRect(x - w / 2, y - h / 2, w, h, w * 0.6)
        ctx.fill()
        ctx.fillStyle = `rgba(188, 248, 255, ${0.34 + operator.tint * 0.56})`
        ctx.beginPath()
        ctx.arc(x + w * 0.28, y + h * 0.08, w * 0.34, 0, Math.PI * 2)
        ctx.fill()
      })

      const beaconVisuals = beaconPool.current
      beaconVisuals.forEach((beacon) => {
        beacon.active = false
      })

      for (let i = 0; i < props.beacons.length && i < MAX_BEACONS; i += 1) {
        const source = props.beacons[i]
        const target = beaconVisuals[i]
        target.active = true
        target.x = EXTRACTION_WORLD_X + (source.anchorPosition.x - 0.5) * EXTRACTION_ZONE_RADIUS * 1.2
        target.y = EXTRACTION_WORLD_Y + (source.anchorPosition.y - 0.5) * EXTRACTION_ZONE_RADIUS * 1.2
        target.count = source.representedCount
        target.pulse = source.pulsePhase
      }

      beaconVisuals.forEach((beacon) => {
        if (!beacon.active) return
        const x = worldToScreenX(beacon.x, camera, metrics)
        const y = worldToScreenY(beacon.y, camera, metrics)
        const pulse = 0.8 + Math.sin(beacon.pulse * Math.PI * 2) * 0.22
        const radius = metrics.scale * camera.zoom * 0.014 * pulse
        ctx.fillStyle = `rgba(112, 226, 255, ${0.22 + tint * 0.55})`
        ctx.beginPath()
        ctx.arc(x, y, radius * 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = `rgba(224, 255, 255, ${0.68 + tint * 0.2})`
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, Math.PI * 2)
        ctx.fill()
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
        ctx.fillStyle = `rgba(230, 255, 255, ${alpha * (0.46 + tint * 0.52)})`
        ctx.beginPath()
        ctx.arc(
          worldToScreenX(particle.x, camera, metrics),
          worldToScreenY(particle.y, camera, metrics),
          metrics.scale * camera.zoom * (0.004 + alpha * 0.006),
          0,
          Math.PI * 2,
        )
        ctx.fill()
      }

      ctx.restore()
      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [buildingById, buildings, stars])

  const handlePointerDown: PointerEventHandler<HTMLCanvasElement> = (event) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: event.clientX,
      moved: false,
    }
  }

  const handlePointerMove: PointerEventHandler<HTMLCanvasElement> = (event) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.lastX
    drag.lastX = event.clientX

    if (Math.abs(dx) > 1.5) {
      drag.moved = true
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const renderScaleX = rect.width > 0 ? canvas.width / rect.width : 1
    const metrics = metricsRef.current
    const camera = cameraRef.current
    const worldDelta = (dx * renderScaleX) / (metrics.scale * camera.zoom)
    const targetX = clampCameraX(panTargetRef.current - worldDelta, camera.zoom, metrics)
    panTargetRef.current = targetX

    if (latest.current.selectedBuildingId && drag.moved) {
      latest.current.onSelectBuilding(null)
    }
  }

  const handlePointerUp: PointerEventHandler<HTMLCanvasElement> = (event) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    drag.active = false

    if (drag.moved) {
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1) * rect.width
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1) * rect.height
    const metrics = metricsRef.current
    const camera = cameraRef.current
    const worldX = screenToWorldX(x * (canvas.width / rect.width), camera, metrics)
    const worldY = screenToWorldY(y * (canvas.height / rect.height), camera, metrics)

    for (let i = buildings.length - 1; i >= 0; i -= 1) {
      const building = buildings[i]
      if (isPointInBuilding(worldX, worldY, building)) {
        if (i < latest.current.unlockedBuildings) {
          latest.current.onSelectBuilding(building.id)
          panTargetRef.current = building.worldX
        }
        return
      }
    }

    const dist = Math.hypot(worldX - EXTRACTION_WORLD_X, worldY - EXTRACTION_WORLD_Y)
    if (dist <= EXTRACTION_ZONE_RADIUS) {
      spawnParticles(18)
      latest.current.onExtract()
    } else {
      latest.current.onSelectBuilding(null)
    }
  }

  const handlePointerCancel: PointerEventHandler<HTMLCanvasElement> = (event) => {
    const drag = dragRef.current
    if (drag.active && drag.pointerId === event.pointerId) {
      drag.active = false
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="extraction-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      role="img"
      aria-label="Color extraction city with selectable buildings"
    />
  )
}
