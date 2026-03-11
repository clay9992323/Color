import { useEffect, useMemo, useRef, type PointerEventHandler } from 'react'
import { BUILDINGS, MAX_BEACONS, MAX_PARTICLES, MAX_VISIBLE_OPERATORS } from '../config'
import type { OperatorAgent, SquadBeacon, WorkforceState } from '../types'
import orbCoreImageSrc from '../../assets/vfx/Orb_1.png'
import backgroundImageSrc from '../../assets/vfx/Background.png'
import groundImageSrc from '../../assets/vfx/Ground.png'
import missionBuildingImageSrc from '../../assets/vfx/Building_Mission_Control.png'
import researchBuildingImageSrc from '../../assets/vfx/Building_Hue_Research_Lab.png'
import purifierBuildingImageSrc from '../../assets/vfx/Building_Pigment_Purifier.png'
import harmonizerBuildingImageSrc from '../../assets/vfx/Building_Spectrum_Harmonizer.png'

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
  orbitRadius: number
  orbitAngle: number
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

interface GroundBuildingSpriteConfig {
  sourceWidth: number
  sourceHeight: number
  x: number
  y: number
  width: number
  height: number
  scale: number
  groundOffset: number
}

const WORLD_PADDING = 0.42
const BUILDING_SPACING = 0.82
const GROUND_BUILDING_ORB_CLEARANCE = 0.64
const GROUND_BUILDING_COUNT = Math.max(
  1,
  BUILDINGS.filter((building) => building.placement === 'ground').length,
)
const WORLD_WIDTH = WORLD_PADDING * 2 + (GROUND_BUILDING_COUNT - 1) * BUILDING_SPACING
const EXTRACTION_WORLD_X = WORLD_WIDTH * 0.5
const GROUND_WORLD_Y = 0.96
const GROUND_BUILDING_WORLD_Y_OFFSET = 0.13
const EXTRACTION_ZONE_RADIUS = 0.26
const EXTRACTION_WORLD_Y = GROUND_WORLD_Y - EXTRACTION_ZONE_RADIUS + 0.2
const BACKGROUND_ZOOM_OUT = 0.86
// Background.png visible content reaches y=443 in a 559px frame.
const BACKGROUND_IMAGE_BOTTOM_VISIBLE_RATIO = 443 / 559
const BACKGROUND_GROUND_OVERLAP_PX = 1
const GROUND_IMAGE_SCALE = 1
// Ground.png has transparent headroom before visible platform content.
// This ratio aligns the first visible ground pixel to `groundY`.
const GROUND_IMAGE_TOP_TRIM_RATIO = 115 / 559
const GROUND_IMAGE_Y_OFFSET = 0
const GROUND_BUILDING_SPRITE_ASSETS: Record<string, string> = {
  mission: missionBuildingImageSrc,
  research: researchBuildingImageSrc,
  purifier: purifierBuildingImageSrc,
  harmonizer: harmonizerBuildingImageSrc,
}
const GROUND_BUILDING_SPRITE_CONFIG: Record<string, GroundBuildingSpriteConfig> = {
  mission: {
    sourceWidth: 601,
    sourceHeight: 1024,
    x: 0,
    y: 54,
    width: 575,
    height: 970,
    scale: 1.78,
    groundOffset: 0.28,
  },
  research: {
    sourceWidth: 601,
    sourceHeight: 1024,
    x: 27,
    y: 55,
    width: 550,
    height: 897,
    scale: 1.82,
    groundOffset: 0.14,
  },
  purifier: {
    sourceWidth: 601,
    sourceHeight: 1024,
    x: 50,
    y: 112,
    width: 501,
    height: 819,
    scale: 1.86,
    groundOffset: 0.18,
  },
  harmonizer: {
    sourceWidth: 601,
    sourceHeight: 1024,
    x: 23,
    y: 56,
    width: 557,
    height: 907,
    scale: 1.78,
    groundOffset: 0.15,
  },
}

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

function getCameraBounds(
  zoom: number,
  metrics: SceneMetrics,
): { minX: number; maxX: number } {
  const halfVisible = metrics.width / (metrics.scale * zoom) / 2
  const minX = WORLD_PADDING - 0.2 + halfVisible
  const maxX = WORLD_WIDTH - WORLD_PADDING + 0.2 - halfVisible
  if (minX > maxX) {
    const center = WORLD_WIDTH * 0.5
    return { minX: center, maxX: center }
  }
  return { minX, maxX }
}

function clampCameraX(targetX: number, zoom: number, metrics: SceneMetrics): number {
  const { minX, maxX } = getCameraBounds(zoom, metrics)
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

function drawLockGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  bright: boolean,
): void {
  const w = size
  const h = size * 0.72
  ctx.fillStyle = bright ? 'rgba(226, 237, 255, 0.92)' : 'rgba(98, 106, 126, 0.95)'
  ctx.beginPath()
  ctx.roundRect(x - w * 0.5, y - h * 0.2, w, h, w * 0.16)
  ctx.fill()
  ctx.strokeStyle = bright ? 'rgba(245, 252, 255, 0.9)' : 'rgba(124, 132, 154, 0.7)'
  ctx.lineWidth = Math.max(1, size * 0.11)
  ctx.beginPath()
  ctx.arc(x, y - h * 0.2, w * 0.28, Math.PI * 1.02, Math.PI * 1.98)
  ctx.stroke()
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  layout: BuildingLayout,
  camera: CameraState,
  metrics: SceneMetrics,
  colored: boolean,
  focused: boolean,
  tint: number,
  buildingSprites: Partial<Record<string, HTMLImageElement>>,
): { x: number; y: number; width: number; height: number } {
  const x = worldToScreenX(layout.worldX, camera, metrics)
  const baseY = worldToScreenY(layout.worldY, camera, metrics)
  const width = layout.width * metrics.scale * camera.zoom
  const height = layout.height * metrics.scale * camera.zoom
  const left = x - width / 2
  const top = baseY - height

  const spriteImage = layout.placement === 'ground' ? buildingSprites[layout.id] ?? null : null
  const hasBuildingSprite =
    !!spriteImage &&
    spriteImage.complete &&
    spriteImage.naturalWidth > 0 &&
    spriteImage.naturalHeight > 0

  const rgb = hexToRgb(layout.color)
  const colorMix = 0.66 + tint * 0.2
  if (!hasBuildingSprite) {
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
  }

  if (hasBuildingSprite && spriteImage) {
    const config = GROUND_BUILDING_SPRITE_CONFIG[layout.id]
    const frameW = Math.max(1, width)
    const frameH = Math.max(1, height)
    const hasExpectedSourceShape =
      !!config &&
      spriteImage.naturalWidth === config.sourceWidth &&
      spriteImage.naturalHeight === config.sourceHeight
    const sourceX = hasExpectedSourceShape && config ? config.x : 0
    const sourceY = hasExpectedSourceShape && config ? config.y : 0
    const sourceW = hasExpectedSourceShape && config ? config.width : spriteImage.naturalWidth
    const sourceH = hasExpectedSourceShape && config ? config.height : spriteImage.naturalHeight
    const baseScale = Math.min(frameW / sourceW, frameH / sourceH)
    const scale = baseScale * (config?.scale ?? 1.2)
    const drawW = sourceW * scale
    const drawH = sourceH * scale
    const drawX = x - drawW * 0.5
    const drawY = baseY - drawH + height * (config?.groundOffset ?? 0.015)

    ctx.save()
    if (!colored) {
      ctx.filter = 'grayscale(1) saturate(0.12) brightness(0.78)'
    }
    ctx.drawImage(spriteImage, sourceX, sourceY, sourceW, sourceH, drawX, drawY, drawW, drawH)
    ctx.filter = 'none'
    ctx.restore()
  }

  if (layout.placement === 'orbital') {
    const nodeY = baseY + height * 0.06
    const podWidth = width * 0.84
    const podHeight = height * 0.32
    ctx.fillStyle = colored
      ? `rgba(${mixChannel(128, rgb.r, 0.48)}, ${mixChannel(144, rgb.g, 0.48)}, ${mixChannel(168, rgb.b, 0.48)}, 0.95)`
      : 'rgba(124, 133, 152, 0.74)'
    ctx.beginPath()
    ctx.ellipse(x, nodeY, podWidth * 0.5, podHeight * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()

    if (layout.id === 'laser') {
      ctx.fillRect(left + width * 0.58, top + height * 0.12, width * 0.34, height * 0.16)
      ctx.beginPath()
      ctx.moveTo(left + width * 0.9, top + height * 0.18)
      ctx.lineTo(left + width * 1.02, top + height * 0.15)
      ctx.lineTo(left + width * 0.9, top + height * 0.23)
      ctx.closePath()
      ctx.fill()
    } else if (layout.id === 'drill') {
      ctx.fillRect(left + width * 0.08, top + height * 0.12, width * 0.48, height * 0.18)
      ctx.beginPath()
      ctx.moveTo(left + width * 0.08, top + height * 0.21)
      ctx.lineTo(left - width * 0.1, top + height * 0.17)
      ctx.lineTo(left + width * 0.08, top + height * 0.11)
      ctx.closePath()
      ctx.fill()
    } else if (layout.id === 'siphon') {
      ctx.beginPath()
      ctx.arc(x, top + height * 0.2, width * 0.24, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = colored
        ? `rgba(${mixChannel(180, rgb.r, 0.4)}, ${mixChannel(210, rgb.g, 0.4)}, ${mixChannel(238, rgb.b, 0.4)}, 0.46)`
        : 'rgba(211, 220, 242, 0.32)'
      ctx.lineWidth = Math.max(1, metrics.scale * 0.0019 * camera.zoom)
      ctx.beginPath()
      ctx.arc(x, top + height * 0.2, width * 0.34, 0, Math.PI * 2)
      ctx.stroke()
    } else if (layout.id === 'anchor') {
      ctx.fillRect(left + width * 0.24, top + height * 0.07, width * 0.52, height * 0.22)
      ctx.beginPath()
      ctx.arc(left + width * 0.2, top + height * 0.19, width * 0.14, 0, Math.PI * 2)
      ctx.arc(left + width * 0.82, top + height * 0.19, width * 0.14, 0, Math.PI * 2)
      ctx.fill()
    }

    if (!colored) {
      drawLockGlyph(ctx, x, top + height * 0.22, width * 0.2, false)
    }
  } else if (!hasBuildingSprite && layout.id === 'mission') {
    ctx.fillRect(left + width * 0.1, top - height * 0.24, width * 0.26, height * 0.24)
    ctx.fillRect(left + width * 0.66, top - height * 0.28, width * 0.2, height * 0.28)
    ctx.fillRect(left + width * 0.4, top - height * 0.2, width * 0.2, height * 0.2)
    ctx.strokeStyle = colored
      ? `rgba(${mixChannel(160, rgb.r, 0.35)}, ${mixChannel(182, rgb.g, 0.35)}, ${mixChannel(210, rgb.b, 0.35)}, 0.42)`
      : 'rgba(224, 236, 255, 0.35)'
    ctx.beginPath()
    ctx.moveTo(left + width * 0.5, top - height * 0.2)
    ctx.lineTo(left + width * 0.5, top - height * 0.46)
    ctx.stroke()
  } else if (!hasBuildingSprite && layout.id === 'research') {
    ctx.beginPath()
    ctx.arc(left + width * 0.35, top + height * 0.08, width * 0.18, Math.PI, Math.PI * 2)
    ctx.arc(left + width * 0.68, top + height * 0.1, width * 0.14, Math.PI, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.fillRect(left + width * 0.12, top - height * 0.1, width * 0.2, height * 0.1)
  } else if (!hasBuildingSprite && layout.id === 'purifier') {
    ctx.fillRect(left + width * 0.2, top - height * 0.3, width * 0.16, height * 0.3)
    ctx.fillRect(left + width * 0.45, top - height * 0.24, width * 0.16, height * 0.24)
    ctx.fillRect(left + width * 0.68, top - height * 0.34, width * 0.12, height * 0.34)
  } else if (!hasBuildingSprite && layout.id === 'harmonizer') {
    ctx.beginPath()
    ctx.moveTo(left + width * 0.08, top)
    ctx.lineTo(left + width * 0.5, top - height * 0.32)
    ctx.lineTo(left + width * 0.92, top)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = colored
      ? `rgba(${mixChannel(160, rgb.r, 0.35)}, ${mixChannel(182, rgb.g, 0.35)}, ${mixChannel(210, rgb.b, 0.35)}, 0.42)`
      : 'rgba(224, 236, 255, 0.35)'
    ctx.beginPath()
    ctx.arc(x, top - height * 0.12, width * 0.26, Math.PI, Math.PI * 2)
    ctx.stroke()
  } else if (!hasBuildingSprite) {
    ctx.fillRect(left + width * 0.16, top - height * 0.24, width * 0.24, height * 0.24)
    ctx.fillRect(left + width * 0.64, top - height * 0.3, width * 0.2, height * 0.3)
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

  if (!colored && layout.placement === 'ground') {
    drawLockGlyph(ctx, x, top + height * 0.2, width * 0.16, false)
  }

  if (hasBuildingSprite && focused) {
    ctx.strokeStyle = 'rgba(255, 252, 236, 0.85)'
    ctx.lineWidth = Math.max(1, metrics.scale * 0.0024 * camera.zoom)
    ctx.beginPath()
    ctx.roundRect(left, top, width, height, Math.max(4, width * 0.08))
    ctx.stroke()
  }

  if (!hasBuildingSprite) {
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
  const cameraRef = useRef<CameraState>({ x: EXTRACTION_WORLD_X, y: 0.52, zoom: 1 })
  const panTargetRef = useRef<number>(EXTRACTION_WORLD_X)
  const orbImageRef = useRef<HTMLImageElement | null>(null)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const groundImageRef = useRef<HTMLImageElement | null>(null)
  const groundBuildingImageRefs = useRef<Partial<Record<string, HTMLImageElement>>>({})
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
      const groundSlots = createSlotOrder(Math.max(1, groundBuildings.length))
      const layouts: BuildingLayout[] = []
      let groundIndex = 0

      for (let index = 0; index < BUILDINGS.length; index += 1) {
        const building = BUILDINGS[index]
        if (building.placement !== 'ground') {
          continue
        }
        const slot = groundSlots[groundIndex] ?? 0
        let worldX = WORLD_PADDING + slot * BUILDING_SPACING
        const distFromOrb = Math.abs(worldX - EXTRACTION_WORLD_X)
        if (distFromOrb < GROUND_BUILDING_ORB_CLEARANCE) {
          const direction = worldX <= EXTRACTION_WORLD_X ? -1 : 1
          worldX = EXTRACTION_WORLD_X + direction * GROUND_BUILDING_ORB_CLEARANCE
        }
        layouts.push({
          id: building.id,
          index,
          placement: building.placement,
          worldX,
          worldY: GROUND_WORLD_Y + GROUND_BUILDING_WORLD_Y_OFFSET,
          orbitRadius: 0,
          orbitAngle: 0,
          width: 0.235 + (groundIndex % 2) * 0.036,
          height: 0.31 + ((groundIndex + 1) % 3) * 0.07,
          color: building.color,
        })
        groundIndex += 1
      }

      return layouts
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
  const groundBuildingSpriteSources = Object.values(GROUND_BUILDING_SPRITE_ASSETS).join('|')

  useEffect(() => {
    const image = new Image()
    image.src = orbCoreImageSrc
    orbImageRef.current = image
    return () => {
      if (orbImageRef.current === image) {
        orbImageRef.current = null
      }
    }
  }, [orbCoreImageSrc])

  useEffect(() => {
    const image = new Image()
    image.src = backgroundImageSrc
    backgroundImageRef.current = image
    return () => {
      if (backgroundImageRef.current === image) {
        backgroundImageRef.current = null
      }
    }
  }, [backgroundImageSrc])

  useEffect(() => {
    const image = new Image()
    image.src = groundImageSrc
    groundImageRef.current = image
    return () => {
      if (groundImageRef.current === image) {
        groundImageRef.current = null
      }
    }
  }, [groundImageSrc])

  useEffect(() => {
    const loadedImages: Partial<Record<string, HTMLImageElement>> = {}
    const entries = Object.entries(GROUND_BUILDING_SPRITE_ASSETS)
    for (let i = 0; i < entries.length; i += 1) {
      const [id, src] = entries[i]
      const image = new Image()
      image.src = src
      loadedImages[id] = image
    }
    groundBuildingImageRefs.current = loadedImages
    return () => {
      if (groundBuildingImageRefs.current === loadedImages) {
        groundBuildingImageRefs.current = {}
      }
    }
  }, [groundBuildingSpriteSources])

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
        : 0.52
      const unclampedTargetX = selectedBuilding ? selectedBuilding.worldX : panTargetRef.current
      const targetX = clampCameraX(unclampedTargetX, targetZoom, metrics)

      cameraRef.current.zoom = lerp(cameraRef.current.zoom, targetZoom, 0.14)
      cameraRef.current.y = lerp(cameraRef.current.y, targetY, 0.14)
      cameraRef.current.x = lerp(cameraRef.current.x, targetX, 0.14)
      cameraRef.current.x = clampCameraX(cameraRef.current.x, cameraRef.current.zoom, metrics)

      const camera = cameraRef.current
      const tint = clamp(props.restorationPercent / 100, 0, 1)
      const baseHue = 188 + tint * 106
      const groundY = worldToScreenY(GROUND_WORLD_Y, camera, metrics)
      const worldCenterX = worldToScreenX(EXTRACTION_WORLD_X, camera, metrics)
      const { minX: cameraMinX, maxX: cameraMaxX } = getCameraBounds(camera.zoom, metrics)
      const maxScenePanPx =
        Math.max(
          Math.abs(EXTRACTION_WORLD_X - cameraMinX),
          Math.abs(EXTRACTION_WORLD_X - cameraMaxX),
        ) *
        metrics.scale *
        camera.zoom

      ctx.save()
      ctx.clearRect(0, 0, metrics.width, metrics.height)

      const backgroundImage = backgroundImageRef.current
      const hasBackgroundImage =
        !!backgroundImage &&
        backgroundImage.complete &&
        backgroundImage.naturalWidth > 0 &&
        backgroundImage.naturalHeight > 0

      if (hasBackgroundImage && backgroundImage) {
        const coverScale = Math.max(
          metrics.width / backgroundImage.naturalWidth,
          metrics.height / backgroundImage.naturalHeight,
        )
        const baseScale = coverScale * BACKGROUND_ZOOM_OUT
        const baseDrawW = backgroundImage.naturalWidth * baseScale
        const minDrawW = metrics.width + maxScenePanPx * 2 + 2
        const drawW = Math.max(baseDrawW, minDrawW)
        const drawH = (backgroundImage.naturalHeight / backgroundImage.naturalWidth) * drawW
        ctx.fillStyle = '#0f1628'
        ctx.fillRect(0, 0, metrics.width, metrics.height)
        const drawX = worldCenterX - drawW * 0.5
        const drawY =
          groundY -
          drawH * BACKGROUND_IMAGE_BOTTOM_VISIBLE_RATIO +
          BACKGROUND_GROUND_OVERLAP_PX
        ctx.drawImage(backgroundImage, drawX, drawY, drawW, drawH)
      } else {
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
      }

      const groundImage = groundImageRef.current
      const hasGroundImage =
        !!groundImage &&
        groundImage.complete &&
        groundImage.naturalWidth > 0 &&
        groundImage.naturalHeight > 0

      if (hasGroundImage && groundImage) {
        // Keep a subtle dark base so transparent areas in the ground image blend cleanly.
        ctx.fillStyle = 'rgba(17, 21, 31, 0.97)'
        ctx.fillRect(0, groundY, metrics.width, metrics.height - groundY)

        const drawW = Math.max(
          metrics.width,
          (metrics.width + maxScenePanPx * 2) * GROUND_IMAGE_SCALE,
        )
        const drawH = (groundImage.naturalHeight / groundImage.naturalWidth) * drawW
        const drawX = worldCenterX - drawW * 0.5
        const visibleTopOffset = drawH * GROUND_IMAGE_TOP_TRIM_RATIO
        const drawY = groundY - visibleTopOffset + metrics.scale * GROUND_IMAGE_Y_OFFSET
        ctx.drawImage(groundImage, drawX, drawY, drawW, drawH)
      } else {
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
      }

      const zoneX = worldToScreenX(EXTRACTION_WORLD_X, camera, metrics)
      const zoneY = worldToScreenY(EXTRACTION_WORLD_Y, camera, metrics)
      const zoneRadiusPx = EXTRACTION_ZONE_RADIUS * metrics.scale * camera.zoom

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

      const innerRadius = zoneRadiusPx
      const orbImage = orbImageRef.current
      if (
        orbImage &&
        orbImage.complete &&
        orbImage.naturalWidth > 0 &&
        orbImage.naturalHeight > 0
      ) {
        const minSide = Math.min(orbImage.naturalWidth, orbImage.naturalHeight)
        const baseSize = innerRadius * 2
        const srcScale = baseSize / minSide
        const drawW = orbImage.naturalWidth * srcScale
        const drawH = orbImage.naturalHeight * srcScale
        const pulseScale = 1 + Math.sin(now * 0.00085) * 0.012
        const finalW = drawW * pulseScale
        const finalH = drawH * pulseScale

        ctx.save()
        ctx.beginPath()
        ctx.arc(zoneX, zoneY, innerRadius, 0, Math.PI * 2)
        ctx.clip()
        ctx.globalAlpha = 0.9 + tint * 0.1
        ctx.drawImage(orbImage, zoneX - finalW / 2, zoneY - finalH / 2, finalW, finalH)
        ctx.restore()

        const gloss = ctx.createRadialGradient(
          zoneX - innerRadius * 0.36,
          zoneY - innerRadius * 0.36,
          innerRadius * 0.06,
          zoneX,
          zoneY,
          innerRadius * 1.1,
        )
        gloss.addColorStop(0, 'rgba(255, 255, 255, 0.28)')
        gloss.addColorStop(0.4, 'rgba(255, 255, 255, 0.08)')
        gloss.addColorStop(1, 'rgba(255, 255, 255, 0)')
        ctx.fillStyle = gloss
        ctx.beginPath()
        ctx.arc(zoneX, zoneY, innerRadius, 0, Math.PI * 2)
        ctx.fill()
      } else {
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
      }

      const buildingBoxes: Array<{ building: BuildingLayout; rect: { x: number; y: number; width: number; height: number } }> = []
      for (let i = 0; i < buildings.length; i += 1) {
        const building = buildings[i]
        const colored = i < props.unlockedBuildings
        const focused = props.selectedBuildingId === building.id
        const rect = drawBuilding(
          ctx,
          building,
          camera,
          metrics,
          colored,
          focused,
          tint,
          groundBuildingImageRefs.current,
        )
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
