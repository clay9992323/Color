import { useEffect, useMemo, useRef, type PointerEventHandler, type WheelEventHandler } from 'react'
import { BUILDINGS, MAX_BEACONS, MAX_PARTICLES, MAX_VISIBLE_OPERATORS } from '../config'
import type { OperatorAgent, PrestigeReadiness, SquadBeacon, WorkforceState } from '../types'
import backgroundImageSrc from '../../assets/vfx/Background.png'
import undergroundImageSrc from '../../assets/vfx/Underground.png'
import pumpRedImageSrc from '../../assets/vfx/Pump_Red.png'
import pumpTubeImageSrc from '../../assets/vfx/Pump_Tube.png'
import missionBuildingImageSrc from '../../assets/vfx/Building_Mission_Control_1.png'
import researchBuildingImageSrc from '../../assets/vfx/Building_Hue_Research_Lab_1.png'
import purifierBuildingImageSrc from '../../assets/vfx/Building_Pigment_Purifier_Pixel.png'
import harmonizerBuildingImageSrc from '../../assets/vfx/Building_Spectrum_Harmonizer_Pixel.png'

interface CanvasProps {
  restorationPercent: number
  unlockedBuildings: number
  workforce: WorkforceState
  agents: OperatorAgent[]
  beacons: SquadBeacon[]
  selectedBuildingId: string | null
  prestigeReadiness: PrestigeReadiness
  worldVisualTier: number
  ritualPhase: 'idle' | 'charge' | 'flash' | 'wave' | 'settle'
  inputLocked: boolean
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
  lastY: number
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

interface DepthBounds {
  minY: number
  maxY: number
}

interface BackgroundTransform {
  drawX: number
  drawW: number
  seamY: number
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
const GROUND_BUILDING_PUMP_CLEARANCE = 0.64
const GROUND_BUILDING_COUNT = Math.max(
  1,
  BUILDINGS.filter((building) => building.placement === 'ground').length,
)
const WORLD_WIDTH = WORLD_PADDING * 2 + (GROUND_BUILDING_COUNT - 1) * BUILDING_SPACING
const EXTRACTION_WORLD_X = WORLD_WIDTH * 0.5
const GROUND_WORLD_Y = 0.96
const GROUND_BUILDING_WORLD_Y_OFFSET = 0.13
const EXTRACTION_ZONE_RADIUS = 0.2
const PUMP_WORLD_Y_OFFSET = -0.12
const PUMP_SPRITE_Y_OFFSET = 2.3
const PUMP_TUBE_SCALE = 0.6
const PUMP_TUBE_Y_OFFSET = 3.4
const EXTRACTION_WORLD_Y = GROUND_WORLD_Y + PUMP_WORLD_Y_OFFSET
const BACKGROUND_ZOOM_OUT = 0.86
const UNDERGROUND_ZOOM_OUT = 0.5
const UNDERGROUND_Y_OFFSET = -120
const UNDERGROUND_EDGE_OVERSCAN = 0.1
const UNDERGROUND_SOURCE_INSET_X = 48
// Background.png visible content reaches y=443 in a 559px frame.
const BACKGROUND_IMAGE_BOTTOM_VISIBLE_RATIO = 420 / 559
const BACKGROUND_GROUND_OVERLAP_PX = 1
const DEPTH_MIN_CAMERA_Y = 0.58
const DEPTH_MAX_BASE_CAMERA_Y = 1.35
const DEPTH_MAX_EXTRA_RANGE = 2.8
const DEPTH_LAYER_MARKERS = [
  { id: 'red', label: 'Red Seam', worldY: 1.38, unlockPercent: 0, color: '#ff6d4f' },
  { id: 'blue', label: 'Blue Seam', worldY: 2.08, unlockPercent: 22, color: '#67ddff' },
  { id: 'yellow', label: 'Yellow Seam', worldY: 2.76, unlockPercent: 54, color: '#ffd86f' },
  { id: 'core', label: 'Deep Blend', worldY: 3.45, unlockPercent: 78, color: '#dcb4ff' },
] as const
const GROUND_BUILDING_X_OFFSETS: Record<string, number> = {
  mission: 0.0,
  research: -0.1,
  purifier: 0.0,
  harmonizer: -0.18,
  laser: 0,
  drill: 0,
  siphon: 0,
  anchor: 0,
}
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
    scale: 3,
    groundOffset: 0.28,
  },
  research: {
    sourceWidth: 601,
    sourceHeight: 1024,
    x: 27,
    y: 55,
    width: 550,
    height: 897,
    scale: 2,
    groundOffset: 0.02,
  },
  purifier: {
    sourceWidth: 601,
    sourceHeight: 1024,
    x: 50,
    y: 112,
    width: 501,
    height: 819,
    scale: 3,
    groundOffset: 0.5,
  },
  harmonizer: {
    sourceWidth: 601,
    sourceHeight: 1024,
    x: 23,
    y: 56,
    width: 557,
    height: 907,
    scale: 3.5,
    groundOffset: 0.19,
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

function getDepthBounds(restorationPercent: number, worldVisualTier: number): DepthBounds {
  const normalized = clamp(restorationPercent / 100, 0, 1)
  const tierBonus = Math.min(0.65, worldVisualTier * 0.08)
  return {
    minY: DEPTH_MIN_CAMERA_Y,
    maxY: DEPTH_MAX_BASE_CAMERA_Y + normalized * DEPTH_MAX_EXTRA_RANGE + tierBonus,
  }
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

function drawNightSkyStars(
  ctx: CanvasRenderingContext2D,
  metrics: SceneMetrics,
  stars: Star[],
  now: number,
  skyBottomY: number,
): void {
  const clampedSkyBottom = clamp(skyBottomY, 0, metrics.height)
  if (clampedSkyBottom <= 0) {
    return
  }

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, metrics.width, clampedSkyBottom)
  ctx.clip()

  for (let i = 0; i < stars.length; i += 1) {
    const star = stars[i]
    const flicker = 0.4 + Math.sin(now * 0.0011 * star.speed + star.phase) * 0.26
    const alpha = clamp(0.14 + flicker * 0.28, 0.08, 0.42)
    const x = star.x * metrics.width
    const y = star.y * clampedSkyBottom
    const radius = Math.max(0.75, star.radius * metrics.scale)
    ctx.fillStyle = `rgba(229, 238, 255, ${alpha})`
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}

interface PumpPalette {
  core: string
  coreBright: string
  vein: string
  steelA: string
  steelB: string
  accent: string
  spark: string
}

function getPumpPalette(restorationPercent: number, worldVisualTier: number): PumpPalette {
  const tierBoost = Math.min(0.16, worldVisualTier * 0.02)
  if (restorationPercent < 22) {
    return {
      core: `rgba(255, 98, 74, ${0.78 + tierBoost})`,
      coreBright: `rgba(255, 175, 128, ${0.8 + tierBoost})`,
      vein: `rgba(255, 86, 62, ${0.55 + tierBoost})`,
      steelA: 'rgba(105, 116, 132, 0.96)',
      steelB: 'rgba(59, 70, 87, 0.96)',
      accent: `rgba(255, 129, 90, ${0.85 + tierBoost})`,
      spark: `rgba(255, 208, 163, ${0.9 + tierBoost})`,
    }
  }
  if (restorationPercent < 54) {
    return {
      core: `rgba(255, 158, 66, ${0.78 + tierBoost})`,
      coreBright: `rgba(255, 224, 124, ${0.82 + tierBoost})`,
      vein: `rgba(255, 180, 72, ${0.58 + tierBoost})`,
      steelA: 'rgba(108, 122, 137, 0.96)',
      steelB: 'rgba(63, 74, 92, 0.96)',
      accent: `rgba(255, 206, 100, ${0.86 + tierBoost})`,
      spark: `rgba(255, 234, 161, ${0.92 + tierBoost})`,
    }
  }
  if (restorationPercent < 82) {
    return {
      core: `rgba(72, 198, 255, ${0.8 + tierBoost})`,
      coreBright: `rgba(142, 247, 255, ${0.83 + tierBoost})`,
      vein: `rgba(76, 220, 255, ${0.6 + tierBoost})`,
      steelA: 'rgba(102, 124, 143, 0.96)',
      steelB: 'rgba(55, 71, 91, 0.96)',
      accent: `rgba(118, 234, 255, ${0.86 + tierBoost})`,
      spark: `rgba(195, 250, 255, ${0.92 + tierBoost})`,
    }
  }
  return {
    core: `rgba(188, 151, 255, ${0.8 + tierBoost})`,
    coreBright: `rgba(118, 255, 222, ${0.85 + tierBoost})`,
    vein: `rgba(205, 137, 255, ${0.62 + tierBoost})`,
    steelA: 'rgba(110, 130, 148, 0.96)',
    steelB: 'rgba(59, 74, 95, 0.96)',
    accent: `rgba(250, 192, 116, ${0.88 + tierBoost})`,
    spark: `rgba(222, 255, 230, ${0.94 + tierBoost})`,
  }
}

function drawSubsurfaceChroma(
  ctx: CanvasRenderingContext2D,
  metrics: SceneMetrics,
  groundY: number,
  worldCenterX: number,
  maxScenePanPx: number,
  undergroundImage: HTMLImageElement | null,
  backgroundTransform: BackgroundTransform | null,
): void {
  const hasUndergroundImage =
    !!undergroundImage &&
    undergroundImage.complete &&
    undergroundImage.naturalWidth > 0 &&
    undergroundImage.naturalHeight > 0

  if (hasUndergroundImage && undergroundImage) {
    const seamY = backgroundTransform?.seamY ?? groundY
    const targetHeight = Math.max(1, metrics.height - seamY)
    const baseDrawW = backgroundTransform?.drawW ?? (() => {
      const coverScale = Math.max(
        (metrics.width + maxScenePanPx * 2) / undergroundImage.naturalWidth,
        targetHeight / undergroundImage.naturalHeight,
      )
      return undergroundImage.naturalWidth * coverScale
    })()
    const zoomedW = baseDrawW * UNDERGROUND_ZOOM_OUT
    const minScrollableW =
      metrics.width + maxScenePanPx * 2 + metrics.width * UNDERGROUND_EDGE_OVERSCAN * 2
    const drawW = Math.max(zoomedW, minScrollableW)
    const drawH = (undergroundImage.naturalHeight / undergroundImage.naturalWidth) * drawW
    const drawX = worldCenterX - drawW * 0.5
    const drawY = seamY + UNDERGROUND_Y_OFFSET
    const sourceInsetX = Math.min(
      UNDERGROUND_SOURCE_INSET_X,
      Math.floor((undergroundImage.naturalWidth - 1) * 0.25),
    )
    const sourceWidth = Math.max(1, undergroundImage.naturalWidth - sourceInsetX * 2)

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, seamY, metrics.width, targetHeight)
    ctx.clip()
    ctx.drawImage(
      undergroundImage,
      sourceInsetX,
      0,
      sourceWidth,
      undergroundImage.naturalHeight,
      drawX,
      drawY,
      drawW,
      drawH,
    )
    ctx.restore()
    return
  }

  const undergroundShade = ctx.createLinearGradient(0, groundY, 0, metrics.height)
  undergroundShade.addColorStop(0, 'rgba(14, 18, 26, 0.42)')
  undergroundShade.addColorStop(1, 'rgba(7, 10, 16, 0.7)')
  ctx.fillStyle = undergroundShade
  ctx.fillRect(0, groundY, metrics.width, metrics.height - groundY)
}

function drawMiningDepthProgression(params: {
  ctx: CanvasRenderingContext2D
  camera: CameraState
  metrics: SceneMetrics
  zoneX: number
  restorationPercent: number
}): void {
  const { ctx, camera, metrics, zoneX, restorationPercent } = params
  const shaftWidth = metrics.scale * camera.zoom * 0.32

  DEPTH_LAYER_MARKERS.forEach((layer) => {
    const y = worldToScreenY(layer.worldY, camera, metrics)
    const unlocked = restorationPercent >= layer.unlockPercent
    const markerSize = shaftWidth * 0.1
    const labelX = zoneX + shaftWidth * 0.86
    ctx.fillStyle = unlocked ? layer.color : 'rgba(122, 132, 146, 0.55)'
    ctx.beginPath()
    ctx.arc(zoneX, y, markerSize, 0, Math.PI * 2)
    ctx.fill()

    ctx.font = `${Math.max(11, Math.round(metrics.scale * camera.zoom * 0.028))}px 'Trebuchet MS', 'Segoe UI', sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = unlocked ? 'rgba(232, 242, 255, 0.92)' : 'rgba(150, 160, 176, 0.74)'
    const status = unlocked ? 'ONLINE' : `LOCK ${layer.unlockPercent}%`
    ctx.fillText(`${layer.label}  ${status}`, labelX, y)

    if (!unlocked) {
      drawLockGlyph(ctx, labelX - shaftWidth * 0.18, y + shaftWidth * 0.2, shaftWidth * 0.22, false)
    }
  })

}

function drawExtractionPump(params: {
  ctx: CanvasRenderingContext2D
  zoneX: number
  zoneY: number
  zoneRadiusPx: number
  groundY: number
  pumpImage: HTMLImageElement | null
  tubeImage: HTMLImageElement | null
  moduleCount: number
  tint: number
  ritualPhase: 'idle' | 'charge' | 'flash' | 'wave' | 'settle'
  palette: PumpPalette
}): void {
  const {
    ctx,
    zoneX,
    zoneY,
    zoneRadiusPx,
    groundY,
    pumpImage,
    tubeImage,
    moduleCount,
    tint,
    ritualPhase,
    palette,
  } = params
  const bodyWidth = zoneRadiusPx * 1.55
  const bodyHeight = zoneRadiusPx * 2.2
  const bodyLeft = zoneX - bodyWidth * 0.5
  const bodyTop = zoneY - bodyHeight * 0.82
  const platformY = groundY - zoneRadiusPx * 0.04

  const ritualBoost =
    ritualPhase === 'flash' ? 0.34 : ritualPhase === 'wave' ? 0.2 : ritualPhase === 'charge' ? 0.1 : 0
  const hasPumpSprite =
    !!pumpImage &&
    pumpImage.complete &&
    pumpImage.naturalWidth > 0 &&
    pumpImage.naturalHeight > 0

  if (hasPumpSprite && pumpImage) {
    const spriteScale = Math.max(
      (bodyWidth * 1.65) / pumpImage.naturalWidth,
      (bodyHeight * 3) / pumpImage.naturalHeight,
    )
    const spriteW = pumpImage.naturalWidth * spriteScale
    const spriteH = pumpImage.naturalHeight * spriteScale
    const spriteX = zoneX - spriteW * 0.5
    const spriteY = platformY - spriteH + zoneRadiusPx * PUMP_SPRITE_Y_OFFSET

    ctx.save()
    ctx.filter = `drop-shadow(0 ${Math.max(2, zoneRadiusPx * 0.04)}px ${Math.max(2, zoneRadiusPx * 0.08)}px rgba(0, 0, 0, 0.6))`
    ctx.globalAlpha = 0.95 + tint * 0.05 + ritualBoost * 0.06
    ctx.drawImage(pumpImage, spriteX, spriteY, spriteW, spriteH)
    const hasTubeSprite =
      !!tubeImage &&
      tubeImage.complete &&
      tubeImage.naturalWidth > 0 &&
      tubeImage.naturalHeight > 0
    if (hasTubeSprite && tubeImage) {
      // Pump_Tube replaces the temporary tube look in Pump_Red.
      const tubeW = spriteW * PUMP_TUBE_SCALE
      const tubeH = spriteH * PUMP_TUBE_SCALE
      const tubeX = zoneX - tubeW * 0.5
      const tubeY = spriteY + zoneRadiusPx * PUMP_TUBE_Y_OFFSET
      ctx.globalAlpha = 0.98 + ritualBoost * 0.02
      ctx.drawImage(tubeImage, tubeX, tubeY, tubeW, tubeH)
    }
    ctx.filter = 'none'
    ctx.restore()
  } else {
    const shell = ctx.createLinearGradient(0, bodyTop, 0, bodyTop + bodyHeight)
    shell.addColorStop(0, palette.steelA)
    shell.addColorStop(1, palette.steelB)
    ctx.fillStyle = shell
    ctx.beginPath()
    ctx.roundRect(bodyLeft, bodyTop, bodyWidth, bodyHeight, zoneRadiusPx * 0.32)
    ctx.fill()
  }

  const clampedModules = Math.max(0, Math.min(12, moduleCount))
  for (let i = 0; i < clampedModules; i += 1) {
    const side = i % 2 === 0 ? -1 : 1
    const row = Math.floor(i / 2)
    const moduleWidth = zoneRadiusPx * 0.46
    const moduleHeight = zoneRadiusPx * 0.22
    const moduleX = zoneX + side * (bodyWidth * 0.66) - moduleWidth * 0.5
    const moduleY = bodyTop + zoneRadiusPx * 0.24 + row * zoneRadiusPx * 0.36
    const moduleFill = `rgba(62, 78, 102, ${0.88 - row * 0.03})`
    ctx.fillStyle = moduleFill
    ctx.beginPath()
    ctx.roundRect(moduleX, moduleY, moduleWidth, moduleHeight, zoneRadiusPx * 0.05)
    ctx.fill()

    ctx.fillStyle = palette.accent
    ctx.beginPath()
    ctx.roundRect(
      moduleX + moduleWidth * 0.16,
      moduleY + moduleHeight * 0.28,
      moduleWidth * 0.68,
      moduleHeight * 0.44,
      zoneRadiusPx * 0.04,
    )
    ctx.fill()

    ctx.strokeStyle = 'rgba(18, 24, 34, 0.85)'
    ctx.lineWidth = zoneRadiusPx * 0.04
    ctx.beginPath()
    ctx.moveTo(moduleX + (side < 0 ? moduleWidth : 0), moduleY + moduleHeight * 0.5)
    ctx.lineTo(zoneX + side * (bodyWidth * 0.5), moduleY + moduleHeight * 0.5)
    ctx.stroke()
  }

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
    ctx.strokeStyle = 'rgba(220, 232, 255, 0.28)'
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
  prestigeReadiness,
  worldVisualTier,
  ritualPhase,
  inputLocked,
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
    prestigeReadiness,
    worldVisualTier,
    ritualPhase,
    inputLocked,
    onExtract,
    onSelectBuilding,
  })
  const lastFrameTime = useRef<number>(0)
  const metricsRef = useRef<SceneMetrics>({ width: 1, height: 1, scale: 1 })
  const cameraRef = useRef<CameraState>({ x: EXTRACTION_WORLD_X, y: DEPTH_MIN_CAMERA_Y, zoom: 1 })
  const panTargetRef = useRef<number>(EXTRACTION_WORLD_X)
  const depthTargetRef = useRef<number>(DEPTH_MIN_CAMERA_Y)
  const backgroundImageRef = useRef<HTMLImageElement | null>(null)
  const undergroundImageRef = useRef<HTMLImageElement | null>(null)
  const pumpImageRef = useRef<HTMLImageElement | null>(null)
  const pumpTubeImageRef = useRef<HTMLImageElement | null>(null)
  const groundBuildingImageRefs = useRef<Partial<Record<string, HTMLImageElement>>>({})
  const dragRef = useRef<DragState>({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
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
        const distFromPump = Math.abs(worldX - EXTRACTION_WORLD_X)
        if (distFromPump < GROUND_BUILDING_PUMP_CLEARANCE) {
          const direction = worldX <= EXTRACTION_WORLD_X ? -1 : 1
          worldX = EXTRACTION_WORLD_X + direction * GROUND_BUILDING_PUMP_CLEARANCE
        }
        worldX += GROUND_BUILDING_X_OFFSETS[building.id] ?? 0
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
    image.src = backgroundImageSrc
    backgroundImageRef.current = image
    return () => {
      if (backgroundImageRef.current === image) {
        backgroundImageRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const image = new Image()
    image.src = undergroundImageSrc
    undergroundImageRef.current = image
    return () => {
      if (undergroundImageRef.current === image) {
        undergroundImageRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const image = new Image()
    image.src = pumpRedImageSrc
    pumpImageRef.current = image
    return () => {
      if (pumpImageRef.current === image) {
        pumpImageRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const image = new Image()
    image.src = pumpTubeImageSrc
    pumpTubeImageRef.current = image
    return () => {
      if (pumpTubeImageRef.current === image) {
        pumpTubeImageRef.current = null
      }
    }
  }, [])

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
      prestigeReadiness,
      worldVisualTier,
      ritualPhase,
      inputLocked,
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
    prestigeReadiness,
    worldVisualTier,
    ritualPhase,
    inputLocked,
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
      const depthBounds = getDepthBounds(props.restorationPercent, props.worldVisualTier)
      const targetZoom = selectedBuilding
        ? selectedBuilding.placement === 'orbital'
          ? 1.52
          : 1.45
        : 1
      if (!selectedBuilding) {
        depthTargetRef.current = clamp(depthTargetRef.current, depthBounds.minY, depthBounds.maxY)
      }
      const targetY = selectedBuilding
        ? selectedBuilding.placement === 'orbital'
          ? EXTRACTION_WORLD_Y
          : GROUND_WORLD_Y - 0.02
        : depthTargetRef.current
      const unclampedTargetX = selectedBuilding ? selectedBuilding.worldX : panTargetRef.current
      const targetX = clampCameraX(unclampedTargetX, targetZoom, metrics)

      cameraRef.current.zoom = lerp(cameraRef.current.zoom, targetZoom, 0.14)
      cameraRef.current.y = lerp(cameraRef.current.y, targetY, 0.14)
      cameraRef.current.x = lerp(cameraRef.current.x, targetX, 0.14)
      cameraRef.current.x = clampCameraX(cameraRef.current.x, cameraRef.current.zoom, metrics)

      const camera = cameraRef.current
      const readinessBoost =
        props.prestigeReadiness === 'ready'
          ? 0.18
          : props.prestigeReadiness === 'critical'
            ? 0.12
            : props.prestigeReadiness === 'charged'
              ? 0.06
              : 0
      const ritualBoost =
        props.ritualPhase === 'flash'
          ? 0.35
          : props.ritualPhase === 'wave'
            ? 0.18
            : props.ritualPhase === 'charge'
              ? 0.08
              : 0
      const tierBoost = Math.min(0.24, props.worldVisualTier * 0.03)
      const tint = clamp(props.restorationPercent / 100 + readinessBoost + ritualBoost + tierBoost, 0, 1.35)
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
      let backgroundTransform: BackgroundTransform | null = null

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
        backgroundTransform = {
          drawX,
          drawW,
          seamY: drawY + drawH * BACKGROUND_IMAGE_BOTTOM_VISIBLE_RATIO,
        }
      } else {
        drawGreyCity(ctx, metrics, camera, tint)
      }

      drawNightSkyStars(
        ctx,
        metrics,
        stars,
        now,
        backgroundTransform?.seamY ?? groundY,
      )

      ctx.strokeStyle = 'rgba(156, 166, 182, 0.72)'
      ctx.lineWidth = Math.max(1, metrics.scale * 0.0032)
      ctx.beginPath()
      ctx.moveTo(0, groundY)
      ctx.lineTo(metrics.width, groundY)
      ctx.stroke()

      const zoneX = worldToScreenX(EXTRACTION_WORLD_X, camera, metrics)
      const zoneY = worldToScreenY(EXTRACTION_WORLD_Y, camera, metrics)
      const zoneRadiusPx = EXTRACTION_ZONE_RADIUS * metrics.scale * camera.zoom
      const palette = getPumpPalette(props.restorationPercent, props.worldVisualTier)
      drawSubsurfaceChroma(
        ctx,
        metrics,
        groundY,
        worldCenterX,
        maxScenePanPx,
        undergroundImageRef.current,
        backgroundTransform,
      )
      drawMiningDepthProgression({
        ctx,
        camera,
        metrics,
        zoneX,
        restorationPercent: props.restorationPercent,
      })
      drawExtractionPump({
        ctx,
        zoneX,
        zoneY,
        zoneRadiusPx,
        groundY,
        pumpImage: pumpImageRef.current,
        tubeImage: pumpTubeImageRef.current,
        moduleCount: Math.max(0, props.unlockedBuildings - 1),
        tint,
        ritualPhase: props.ritualPhase,
        palette,
      })

      const buildingBoxes: Array<{ building: BuildingLayout; rect: { x: number; y: number; width: number; height: number } }> = []
      for (let i = 0; i < buildings.length; i += 1) {
        const building = buildings[i]
        const colored = i < props.unlockedBuildings
        const rect = drawBuilding(
          ctx,
          building,
          camera,
          metrics,
          colored,
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

      if (props.ritualPhase !== 'idle') {
        const overlayAlpha =
          props.ritualPhase === 'flash'
            ? 0.34
            : props.ritualPhase === 'wave'
              ? 0.2
              : props.ritualPhase === 'charge'
                ? 0.12
                : 0.08
        ctx.fillStyle = `rgba(180, 236, 255, ${overlayAlpha})`
        ctx.fillRect(0, 0, metrics.width, metrics.height)
      }

      ctx.restore()
      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafId)
  }, [buildingById, buildings, stars])

  const handlePointerDown: PointerEventHandler<HTMLCanvasElement> = (event) => {
    if (latest.current.inputLocked) return
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.setPointerCapture(event.pointerId)
    dragRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    }
  }

  const handlePointerMove: PointerEventHandler<HTMLCanvasElement> = (event) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    drag.lastX = event.clientX
    drag.lastY = event.clientY

    if (Math.abs(dx) > 1.5 || Math.abs(dy) > 1.5) {
      drag.moved = true
    }
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const renderScaleX = rect.width > 0 ? canvas.width / rect.width : 1
    const renderScaleY = rect.height > 0 ? canvas.height / rect.height : 1
    const metrics = metricsRef.current
    const camera = cameraRef.current
    const worldDeltaX = (dx * renderScaleX) / (metrics.scale * camera.zoom)
    const targetX = clampCameraX(panTargetRef.current - worldDeltaX, camera.zoom, metrics)
    panTargetRef.current = targetX
    const worldDeltaY = (dy * renderScaleY) / (metrics.scale * camera.zoom)
    const depthBounds = getDepthBounds(latest.current.restorationPercent, latest.current.worldVisualTier)
    depthTargetRef.current = clamp(
      depthTargetRef.current - worldDeltaY,
      depthBounds.minY,
      depthBounds.maxY,
    )

    if (latest.current.selectedBuildingId && drag.moved) {
      latest.current.onSelectBuilding(null)
    }
  }

  const handleWheel: WheelEventHandler<HTMLCanvasElement> = (event) => {
    if (latest.current.inputLocked || latest.current.selectedBuildingId) {
      return
    }
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const renderScaleY = rect.height > 0 ? canvas.height / rect.height : 1
    const metrics = metricsRef.current
    const camera = cameraRef.current
    const worldDeltaY = (event.deltaY * renderScaleY) / (metrics.scale * camera.zoom)
    const depthBounds = getDepthBounds(latest.current.restorationPercent, latest.current.worldVisualTier)
    depthTargetRef.current = clamp(
      depthTargetRef.current + worldDeltaY,
      depthBounds.minY,
      depthBounds.maxY,
    )
  }

  const handlePointerUp: PointerEventHandler<HTMLCanvasElement> = (event) => {
    const drag = dragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return
    drag.active = false

    if (latest.current.inputLocked) {
      return
    }

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
      onWheel={handleWheel}
      role="img"
      aria-label="Underground color pump facility with selectable buildings"
    />
  )
}
