/**
 * sprites — runtime-generated SDF vessel silhouettes for MapLibre.
 *
 * Canvas-drawn (no assets, no network), registered via map.addImage with
 * { sdf: true } so per-feature status colors come from icon-color:
 *   LIVE → near-white · RECENT → amber · STALE → slate · DEMO → violet.
 * Heading rotation is handled by the symbol layer (icon-rotate), not here.
 *
 * Variants map ONLY from backend AIS ship_type codes (see vesselEngine
 * shipVariant); unknown/missing type → neutral 'hull'.
 */

export const SHIP_VARIANTS = ['hull', 'cargo', 'tanker', 'passenger', 'fishing', 'tug', 'service']

const W = 64
const H = 96

function hullPath(ctx, lengthScale = 1, beamScale = 1) {
  const cx = W / 2
  const bowY = 6
  const sternY = 6 + 84 * lengthScale
  const beam = 15 * beamScale
  ctx.beginPath()
  ctx.moveTo(cx, bowY)
  ctx.lineTo(cx + beam, bowY + 30 * lengthScale)
  ctx.lineTo(cx + beam, sternY - 8)
  ctx.quadraticCurveTo(cx + beam, sternY, cx + beam - 6, sternY)
  ctx.lineTo(cx - beam + 6, sternY)
  ctx.quadraticCurveTo(cx - beam, sternY, cx - beam, sternY - 8)
  ctx.lineTo(cx - beam, bowY + 30 * lengthScale)
  ctx.closePath()
}

function detailLine(ctx, x0, y0, x1, y1, width = 3) {
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
  ctx.restore()
}

function paintHull(ctx, variant) {
  const cx = W / 2
  ctx.fillStyle = '#fff'
  if (variant === 'tanker') {
    hullPath(ctx, 1.0, 0.92)
    ctx.fill()
    detailLine(ctx, cx, 22, cx, 78, 4) // center pipeline
    detailLine(ctx, cx - 8, 30, cx + 8, 30, 2)
    detailLine(ctx, cx - 8, 58, cx + 8, 58, 2)
  } else if (variant === 'cargo') {
    hullPath(ctx, 0.96, 1.0)
    ctx.fill()
    // container blocks (negative space)
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    for (const y of [30, 44, 58]) ctx.fillRect(cx - 9, y, 18, 8)
    ctx.restore()
  } else if (variant === 'passenger') {
    hullPath(ctx, 0.9, 0.8)
    ctx.fill()
    detailLine(ctx, cx - 6, 34, cx + 6, 34, 2)
    detailLine(ctx, cx - 6, 46, cx + 6, 46, 2)
    detailLine(ctx, cx - 6, 58, cx + 6, 58, 2)
  } else if (variant === 'fishing') {
    hullPath(ctx, 0.62, 1.0)
    ctx.fill()
    ctx.fillRect(cx - 2, 8, 4, 26) // mast
  } else if (variant === 'tug') {
    hullPath(ctx, 0.58, 1.05)
    ctx.fill()
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    ctx.fillRect(cx - 7, 40, 14, 12) // cabin block cutout
    ctx.restore()
    ctx.fillStyle = '#fff'
    ctx.fillRect(cx - 4, 42, 8, 5) // cabin
  } else if (variant === 'service') {
    hullPath(ctx, 0.7, 0.95)
    ctx.fill()
    detailLine(ctx, cx - 7, 48, cx + 7, 48, 3)
    detailLine(ctx, cx, 41, cx, 55, 3)
  } else {
    hullPath(ctx, 0.92, 0.95)
    ctx.fill()
    detailLine(ctx, cx - 6, 44, cx + 6, 44, 2.5) // deck line
  }
}

function paintWake(ctx, variant) {
  // Subtle diverging wake astern (stern at bottom). Lower alpha — SDF keeps
  // it dimmer than the hull under the same icon-color.
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  const sternY = variant === 'tanker' ? 90 : 86
  for (const s of [-1, 1]) {
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.moveTo(32 + s * 8, sternY)
    ctx.lineTo(32 + s * 20, 95)
    ctx.stroke()
  }
  ctx.restore()
}

function makeCanvas() {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return c
}

function ringImageData() {
  const s = 128
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2)
  ctx.stroke()
  // soft outer glow ring
  ctx.save()
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
  return ctx.getImageData(0, 0, s, s)
}

/**
 * Returns [{ name, image }] for every sprite the vessel layers need, where
 * image is an ImageData (the type map.addImage accepts alongside
 * HTMLImageElement/ImageBitmap — raw canvas elements are rejected).
 * Safe to call when document is unavailable (returns []).
 */
export function createShipSprites() {
  if (typeof document === 'undefined') return []
  const out = []
  for (const variant of SHIP_VARIANTS) {
    for (const wake of [false, true]) {
      const c = makeCanvas()
      const ctx = c.getContext('2d')
      ctx.clearRect(0, 0, W, H)
      if (wake) paintWake(ctx, variant)
      paintHull(ctx, variant)
      out.push({ name: `ship-${variant}${wake ? '-wake' : ''}`, image: ctx.getImageData(0, 0, W, H) })
    }
  }
  out.push({ name: 'sel-ring', image: ringImageData() })
  return out
}
