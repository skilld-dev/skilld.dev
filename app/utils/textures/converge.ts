import type { TextureScene } from '~/composables/useTextureCanvas'
import { fillDots, hash } from './dots'

/**
 * "Converge": scattered dots fall into one line that ends on a rose dot. Many
 * Skills in, one out.
 *
 * As a divider the dots hold their place and drift a little. As a loading
 * indicator they stream left to right into the line, so the motion reads as
 * progress.
 */

export interface ConvergeOptions {
  /** Where the line ends, as a share of the width. The rose dot sits just past it. */
  end: number
  /** Dots per column. */
  perColumn: number
  /** Radius of the rose dot. */
  dot: number
  /** Stream the dots toward the rose dot. */
  flow: boolean
}

const ALPHA = [0.16, 0.28, 0.42, 0.6, 0.8]
const FLOW_SPEED = 0.16

export function createConvergeScene(options: ConvergeOptions): TextureScene {
  let w = 0
  let h = 0
  let columns = 0

  return {
    restTime: 3,
    layout(width, height) {
      w = width
      h = height
      columns = Math.max(20, Math.floor((w * options.end - 14) / 7))
    },
    draw(ctx, t, colors) {
      ctx.clearRect(0, 0, w, h)
      const cy = h / 2
      const end = w * options.end
      const buckets: number[][] = [[], [], [], [], []]
      for (let c = 0; c < columns; c++) {
        for (let i = 0; i < options.perColumn; i++) {
          const start = c / (columns - 1)
          // A streaming dot keeps its own lane and phase, and wraps back to the left.
          const u = options.flow ? (start + t * FLOW_SPEED * (0.8 + hash(c, i, 13) * 0.4)) % 1 : start
          const x = 14 + u * (end - 24)
          const spread = (1 - u) ** 1.5 * h * 0.42
          const base = hash(c, i, 7) * 2 - 1
          const jitter = 0.16 * Math.sin(t * (0.6 + hash(c, i, 3)) + hash(c, i, 5) * 6.283)
          buckets[Math.min(4, Math.floor(u * 5))]!.push(x, cy + (base + jitter * (1 - u)) * spread)
        }
      }
      ctx.fillStyle = colors.ink
      for (const [k, alpha] of ALPHA.entries()) {
        ctx.globalAlpha = alpha
        fillDots(ctx, buckets[k]!, 1.15 + k * 0.12)
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = colors.dot
      ctx.beginPath()
      ctx.arc(end + 10, cy, options.dot, 0, Math.PI * 2)
      ctx.fill()
    },
  }
}
