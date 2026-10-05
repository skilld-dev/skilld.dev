/**
 * Drawing helpers the brand textures share. Every texture is a field of stone
 * dots with one rose dot, so they share the noise, the ripple, and the batch
 * fill.
 */

/** A stable pseudo-random number in [0, 1] for three integers. */
export function hash(x: number, y: number, seed: number): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

/**
 * Brightness of three rings, half a second apart, at distance `d` from their
 * origin `age` seconds after they left it. The CLI noise field uses the same
 * model: a Gaussian ring front with exponential decay.
 */
export function ripple(d: number, age: number, speed: number): number {
  let brightness = 0
  for (let ring = 0; ring < 3; ring++) {
    const ringAge = age - ring * 0.5
    if (ringAge < 0)
      continue
    const front = (d - ringAge * speed) / 16
    brightness += Math.exp(-front * front) * Math.exp(-ringAge * 0.45)
  }
  return brightness
}

/** Fill every dot in a flat `[x, y, x, y, ...]` list as one path. */
export function fillDots(ctx: CanvasRenderingContext2D, points: readonly number[], radius: number): void {
  if (!points.length)
    return
  ctx.beginPath()
  for (let k = 0; k < points.length; k += 2) {
    ctx.moveTo(points[k]! + radius, points[k + 1]!)
    ctx.arc(points[k]!, points[k + 1]!, radius, 0, Math.PI * 2)
  }
  ctx.fill()
}
