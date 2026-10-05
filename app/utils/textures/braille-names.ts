import type { TextureScene } from '~/composables/useTextureCanvas'
import { hash, ripple } from './dots'

/**
 * "Braille names": real Skill names read as braille far from the rose dot and
 * resolve into letters near it. The dot hops between names, and each hop
 * ripples outward.
 *
 * Each frame is a grid of characters. The picked name is ink, its neighbours
 * muted then faint letters, then the same names in braille, thinning to
 * sparse dots. The canvas paints that grid at a fixed cell width, so a
 * fallback font never shifts a column.
 */

const SEP = '   '
const FONT_SIZE = 11
const CELL_W = 6.6
const LINE_H = 14
const HOLD = 4.2
const MOVE = 1.4
const CYCLE = HOLD + MOVE
const RING_SPEED = 80
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)
const DOT_ALPHA = [0.22, 0.36, 0.52, 0.7]

// Tones: -1 blank, 0 to 3 braille dot strength, then letters and the bullet.
const T_FAINT = 4
const T_MUTED = 5
const T_INK = 6
const T_ROSE = 7

/** Six-dot literary braille. Bit k is dot k + 1, the same order as U+2800. */
const BRAILLE: Record<string, number> = {}
for (const token of 'a1 b12 c14 d145 e15 f124 g1245 h125 i24 j245 k13 l123 m134 n1345 o135 p1234 q12345 r1235 s234 t2345 u136 v1236 w2456 x1346 y13456 z1356 -36 /34 .256 _456'.split(' ')) {
  let mask = 0
  for (const dot of token.slice(1))
    mask |= 1 << (Number(dot) - 1)
  BRAILLE[token[0]!] = mask
}
for (const [index, digit] of [...'1234567890'].entries())
  BRAILLE[digit] = BRAILLE['abcdefghij'[index]!]!

interface Span { y: number, s: number, e: number }
interface Line { text: string, spans: Span[] }
interface Moment { a: Span, b: Span, e: number, age: number }

/** At rest the first ring sits about 120px out, so a still frame still shows the ripple. */
const REST = MOVE / 2 + 1.5

export function createBrailleNamesScene(names: readonly string[]): TextureScene {
  let w = 0
  let h = 0
  let cols = 0
  let rows = 0
  let ox = 0
  let oy = 0
  let sx2 = 1
  let sy2 = 1
  let reach = 1
  let lines: Line[] = []
  let picks: Span[] = []
  let chars: string[] = []
  let tones = new Int8Array(0)

  // One row of names, cut at a random offset. With `align`, the cut puts the first name that fits fully in view.
  function buildRow(y: number, align = false): Line {
    const stream: { s: number, len: number }[] = []
    let text = ''
    let last = -1
    for (let k = 0; text.length < cols + 600; k++) {
      let i = Math.floor(hash(y, k, 5) * names.length)
      if (i === last)
        i = (i + 1) % names.length
      last = i
      if (k > 0)
        text += SEP
      stream.push({ s: text.length, len: names[i]!.length })
      text += names[i]
    }
    let offset = Math.floor(hash(y, 7, 3) * 28)
    const fits = (max: number) => stream.find((n, k) => k > 0 && n.len <= max)
    const fit = align && (fits(Math.min(cols - 2, Math.max(22, cols * 0.6))) || fits(cols - 2))
    if (fit)
      offset = Math.max(0, fit.s - 2 - Math.floor(hash(y, 11, 3) * (cols - 1 - fit.len)))
    return { text: text.slice(offset, offset + cols), spans: stream.map(n => ({ y, s: n.s - offset, e: n.s - offset + n.len })) }
  }

  function layout(width: number, height: number) {
    w = width
    h = height
    const c = Math.max(8, Math.floor(w / CELL_W))
    const r = Math.max(4, Math.floor(h / LINE_H))
    ox = (w - c * CELL_W) / 2
    oy = (h - r * LINE_H) / 2
    reach = Math.max(w, h) * 0.18
    if (c === cols && r === rows && lines.length)
      return
    cols = c
    rows = r
    sx2 = Math.max(5, cols * 0.28) ** 2
    sy2 = Math.max(1.6, rows * 0.12) ** 2
    if (!names.length) {
      lines = Array.from({ length: rows }, () => ({ text: '', spans: [] }))
      picks = []
    }
    else {
      lines = Array.from({ length: rows }, (_, y) => buildRow(y))
      // Three band rows always hold a name in full view, so the pick has somewhere to hop.
      for (const y of [0.55, 0.36, 0.7].map(f => Math.floor(rows * f))) {
        if (!lines[y]!.spans.some(span => span.s >= 2 && span.e <= cols))
          lines[y] = buildRow(y, true)
      }
      // A pick is a name fully in view, in the middle band, with room for the dot two cells before it.
      picks = []
      for (let y = Math.floor(rows * 0.25); y < Math.ceil(rows * 0.75) && y < rows; y++) {
        for (const span of lines[y]!.spans) {
          if (span.s >= 2 && span.e <= cols)
            picks.push(span)
        }
      }
      // Rest on a short pick near 40% across and 55% down, then hop in hashed order.
      const score = (p: Span) => (Math.abs((p.s + p.e) / 2 - cols * 0.4) + (p.e - p.s) * 0.5) / cols + Math.abs(p.y - rows * 0.55) / rows
      picks.sort((a, b) => hash(a.y, a.s, 9) - hash(b.y, b.s, 9))
      const first = picks.reduce((best, p, i) => (score(p) < score(picks[best]!) ? i : best), 0)
      if (picks.length)
        picks.unshift(picks.splice(first, 1)[0]!)
    }
    chars = Array.from<string>({ length: cols * rows })
    tones = new Int8Array(cols * rows)
  }

  const inside = (p: Span, x: number, y: number) => (y === p.y && x >= p.s && x < p.e ? 1 : 0)
  const gapX = (p: Span, x: number) => (x < p.s ? p.s - x : x >= p.e ? x - p.e + 1 : 0)
  // Letters hold a tight band around the pick; braille density falls off much farther out, in pixels.
  const letterField = (p: Span, x: number, y: number) => Math.exp(-(gapX(p, x) ** 2) / sx2 - ((y - p.y) ** 2) / sy2)
  const dotField = (p: Span, x: number, y: number) => Math.exp(-Math.hypot(gapX(p, x) * CELL_W, (y - p.y) * LINE_H) / reach)

  // Where the pick is at time t: blending from a to b by e, and how long ago the rose dot landed.
  function timeline(t: number): Moment | null {
    const count = picks.length
    if (!count)
      return null
    if (count < 2)
      return { a: picks[0]!, b: picks[0]!, e: 1, age: (((t - MOVE / 2) % CYCLE) + CYCLE) % CYCLE }
    const n = Math.floor(t / CYCLE)
    const phase = t - n * CYCLE
    const b = picks[((n % count) + count) % count]!
    const a = phase < MOVE ? picks[(((n - 1) % count) + count) % count]! : b
    const u = Math.min(1, phase / MOVE)
    const age = phase >= MOVE / 2 ? phase - MOVE / 2 : phase + CYCLE - MOVE / 2
    return { a, b, e: u * u * (3 - 2 * u), age }
  }

  // Fill chars and tones for one frame. The grid alone says what to paint.
  function compose(moment: Moment | null, t: number) {
    const a = moment?.a ?? null
    const b = moment?.b ?? null
    const e = moment?.e ?? 1
    const age = moment?.age ?? 99
    const rose = a && b ? (e < 0.5 ? a : b) : null
    const rx = rose ? ox + (rose.s - 2) * CELL_W + CELL_W / 2 : 0
    const ry = rose ? oy + rose.y * LINE_H + LINE_H / 2 : 0
    for (let y = 0; y < rows; y++) {
      const text = lines[y]!.text
      for (let x = 0; x < cols; x++) {
        const k = y * cols + x
        let ch = text[x] || ' '
        let tone = -1
        if (rose && y === rose.y && x === rose.s - 2) {
          ch = '•'
          tone = T_ROSE
        }
        else if (ch !== ' ') {
          const threshold = BAYER[(y & 3) * 4 + (x & 3)]!
          const ink = a && b ? inside(a, x, y) * (1 - e) + inside(b, x, y) * e : 0
          if (threshold < ink) {
            tone = T_INK
          }
          else {
            const letters = a && b ? letterField(a, x, y) * (1 - e) + letterField(b, x, y) * e : 0
            const base = a && b ? dotField(a, x, y) * (1 - e) + dotField(b, x, y) * e : 0
            const ring = rose ? ripple(Math.hypot(ox + x * CELL_W + CELL_W / 2 - rx, oy + y * LINE_H + LINE_H / 2 - ry), age, RING_SPEED) : 0
            // The ripple lifts every cell it crosses: dots light up, braille near the band reads as letters.
            const q = Math.min(3, Math.floor(Math.min(1, letters + ring * 0.42) * 3 + threshold))
            if (q === 3) {
              tone = T_MUTED
            }
            else if (q === 2) {
              tone = T_FAINT
            }
            else {
              const full = BRAILLE[ch.toLowerCase()] ?? 0
              let mask = full
              if (q === 0) {
                // Sparse noise far out, a 4 Hz staggered shimmer, denser where the base field or a ring is.
                const p = base * 0.5 + ring * 0.9 + 0.03
                const step = Math.floor(t * 4 + hash(x, y, 99) * 4)
                mask = 0
                for (let i = 0; i < 6; i++) {
                  if ((full >> i) & 1 && hash(x * 2 + (i >= 3 ? 1 : 0), y * 3 + (i % 3), step) < p)
                    mask |= 1 << i
                }
              }
              if (mask) {
                ch = String.fromCharCode(0x2800 + mask)
                tone = q === 1 ? 2 : Math.min(3, Math.floor((base * 0.6 + ring) * 3.2))
              }
              else {
                ch = ' '
              }
            }
          }
        }
        chars[k] = ch
        tones[k] = tone
      }
    }
  }

  return {
    layout,
    restTime: REST,
    startTime: MOVE / 2 + 0.9,
    draw(ctx, t, colors) {
      if (!rows)
        return
      compose(timeline(t), t)
      ctx.clearRect(0, 0, w, h)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const fills: Record<number, string> = { [T_FAINT]: colors.faint, [T_MUTED]: colors.muted, [T_INK]: colors.ink }
      // Letters, one fill per tone, each centred in its own fixed cell.
      for (const tone of [T_FAINT, T_MUTED, T_INK]) {
        ctx.font = `${tone === T_INK ? 600 : 400} ${FONT_SIZE}px ${colors.mono}`
        ctx.fillStyle = fills[tone]!
        for (let k = 0; k < tones.length; k++) {
          if (tones[k] === tone)
            ctx.fillText(chars[k]!, ox + (k % cols) * CELL_W + CELL_W / 2, oy + Math.floor(k / cols) * LINE_H + LINE_H / 2 + 0.5)
        }
      }
      // Braille, decoded from each cell's code point: two columns of three dots, centred on the line.
      ctx.fillStyle = colors.ink
      const r = 1.05
      for (let bucket = 0; bucket < 4; bucket++) {
        ctx.globalAlpha = DOT_ALPHA[bucket]!
        ctx.beginPath()
        for (let k = 0; k < tones.length; k++) {
          if (tones[k] !== bucket)
            continue
          const mask = chars[k]!.charCodeAt(0) - 0x2800
          const cx = ox + (k % cols) * CELL_W
          const cy = oy + Math.floor(k / cols) * LINE_H + LINE_H / 2
          for (let i = 0; i < 6; i++) {
            if (!((mask >> i) & 1))
              continue
            const x = cx + CELL_W * (i >= 3 ? 0.75 : 0.25)
            const y = cy + ((i % 3) - 1) * 3.4
            ctx.moveTo(x + r, y)
            ctx.arc(x, y, r, 0, Math.PI * 2)
          }
        }
        ctx.fill()
      }
      ctx.globalAlpha = 1
      const k = tones.indexOf(T_ROSE)
      if (k >= 0) {
        ctx.fillStyle = colors.dot
        ctx.beginPath()
        ctx.arc(ox + (k % cols) * CELL_W + CELL_W / 2, oy + Math.floor(k / cols) * LINE_H + LINE_H / 2, 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
    },
  }
}
