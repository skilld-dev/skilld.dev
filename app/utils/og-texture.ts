// Static brand textures for OG cards. The site draws the live versions on a
// canvas; an OG card is one still frame, drawn server side as SVG dots,
// because the OG renderer has only Plus Jakarta Sans and IBM Plex Mono and
// neither has braille glyphs. Every texture is stone: on a card, the lockup's
// trailing dot is the one rose element. DESIGN.md "Texture system" has the jobs.

export interface TextureDot {
  x: number
  y: number
  /** 0 to 1, multiplied into the ink colour. */
  alpha: number
}

export interface TextureRect {
  x: number
  y: number
  width: number
  height: number
}

/** A stable 0 to 1 value for three integers. The live canvases use the same hash. */
function hash(x: number, y: number, s: number): number {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0
  n = Math.imul(n ^ (n >>> 13), 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295
}

/** A stable seed for a string, such as a Skill's owner, repository and name. */
export function textureSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return (h >>> 0) % 1_000_000_007
}

/** Whether a box touches any of the rects. */
function overlaps(rects: readonly TextureRect[], box: TextureRect): boolean {
  return rects.some(r => box.x <= r.x + r.width && box.x + box.width >= r.x && box.y <= r.y + r.height && box.y + box.height >= r.y)
}

// Six-dot literary braille. Bit k is dot k + 1, the order Unicode uses from U+2800.
const BRAILLE: Record<string, number> = {}
for (const token of 'a1 b12 c14 d145 e15 f124 g1245 h125 i24 j245 k13 l123 m134 n1345 o135 p1234 q12345 r1235 s234 t2345 u136 v1236 w2456 x1346 y13456 z1356 -36 /34'.split(' ')) {
  let mask = 0
  for (const dot of token.slice(1))
    mask |= 1 << (Number(dot) - 1)
  BRAILLE[token[0]!] = mask
}
for (const [index, digit] of [...'1234567890'].entries())
  BRAILLE[digit] = BRAILLE['abcdefghij'[index]!]!

/** Real registry Skills, so the noise is made of the thing itself. */
const FIELD_NAMES = [
  'anthropics/skills/pdf',
  'mattpocock/skills/tdd',
  'obra/superpowers/brainstorming',
  'vercel-labs/agent-skills/react-best-practices',
  'anthropics/skills/frontend-design',
  'obra/superpowers/systematic-debugging',
  'anthropics/skills/mcp-builder',
  'anthropics/skills/skill-creator',
  'vercel-labs/agent-skills/web-design-guidelines',
  'anthropics/skills/webapp-testing',
  'obra/superpowers/writing-plans',
  'addyosmani/web-quality-skills/performance',
  'antfu/skills/vitest',
  'pbakaus/impeccable/impeccable',
  'kepano/obsidian-skills/json-canvas',
  'anthropics/skills/canvas-design',
] as const

/**
 * Braille names: rows of real Skill names written in braille, dense and
 * complete near the focal point, thinning to sparse dots far from it. Three
 * ripple rings cross the field, frozen where the live field rests. On a card
 * the focal point is the lockup's dot, so the lockup is the name the noise
 * resolves into.
 */
export function brailleNamesField(input: {
  width: number
  height: number
  focal: { x: number, y: number }
  /** Areas that stay empty, such as the text block. */
  clear?: readonly TextureRect[]
}): TextureDot[] {
  const { width, height, focal, clear = [] } = input
  const cellWidth = 12
  const lineHeight = 24
  const dotStep = 6
  const cols = Math.floor(width / cellWidth)
  const rows = Math.floor(height / lineHeight)
  const ox = (width - cols * cellWidth) / 2
  const oy = (height - rows * lineHeight) / 2
  const reach = Math.max(width, height) * 0.26
  // The still frame: rings at about 170, 245 and 315px from the focal point.
  const ring = (d: number): number => {
    let b = 0
    for (const age of [2.2, 1.7, 1.2]) {
      const g = (d - age * 144) / 29
      b += Math.exp(-g * g) * Math.exp(-age * 0.45)
    }
    return b
  }
  const alphas = [0.2, 0.32, 0.46, 0.62]

  const dots: TextureDot[] = []
  for (let y = 0; y < rows; y++) {
    let text = ''
    let last = -1
    for (let k = 0; text.length < cols + 60; k++) {
      let pick = Math.floor(hash(y, k, 5) * FIELD_NAMES.length)
      if (pick === last)
        pick = (pick + 1) % FIELD_NAMES.length
      last = pick
      text += `${k > 0 ? '   ' : ''}${FIELD_NAMES[pick]}`
    }
    text = text.slice(Math.floor(hash(y, 7, 3) * 28))
    for (let x = 0; x < cols; x++) {
      const full = BRAILLE[text[x] ?? ' '] ?? 0
      if (!full)
        continue
      const cx = ox + x * cellWidth
      const cy = oy + y * lineHeight + lineHeight / 2
      // A whole cell stays out of a clear area, so no letter is cut in half at its edge.
      if (overlaps(clear, { x: cx, y: cy - lineHeight / 2, width: cellWidth, height: lineHeight }))
        continue
      const d = Math.hypot(cx + cellWidth / 2 - focal.x, cy - focal.y)
      const base = Math.exp(-d / reach)
      const lift = ring(d)
      const strength = base * 0.6 + lift
      // Near the focal point a cell keeps its whole letter; farther out each dot survives by chance.
      const keep = strength > 0.62 ? 1 : base * 0.5 + lift * 0.9 + 0.03
      const alpha = alphas[Math.min(3, Math.floor(strength * 3.2))]!
      for (let i = 0; i < 6; i++) {
        if (!((full >> i) & 1) || hash(x * 2 + (i >= 3 ? 1 : 0), y * 3 + (i % 3), 4) >= keep)
          continue
        dots.push({ x: cx + cellWidth * (i >= 3 ? 0.75 : 0.25), y: cy + ((i % 3) - 1) * dotStep, alpha })
      }
    }
  }
  return dots
}

/**
 * File minimap: columns of SKILL.md files drawn as rows of dots. Each file has
 * frontmatter, a title, an intro, then sections of prose, lists or code. One
 * dot is one character cell. The same seed always draws the same files.
 */
export function fileMinimap(input: {
  region: TextureRect
  seed: number
  /** Distance in px over which the left edge fades in. */
  fade?: number
  /** Cell pitch in px. Rows sit at twice the pitch. */
  pitch?: number
  /** Start each column at the top of a file, instead of partway down the stream. */
  fromStart?: boolean
}): TextureDot[] {
  const { region, seed, fade = 0, pitch = 5.6, fromStart = false } = input
  const rowPitch = pitch * 2
  const lineCells = 20
  const columnCells = 25
  const levels = [0.12, 0.2, 0.3, 0.42, 0.56]
  const rowCount = Math.ceil(region.height / rowPitch)

  const dots: TextureDot[] = []
  for (let c = 0; c * columnCells * pitch < region.width; c++) {
    const lines: Array<number[] | null> = []
    const offset = fromStart ? 0 : Math.floor(hash(seed, c, 41) * 30)
    for (let f = 0; lines.length < offset + rowCount; f++)
      skillFileLines(Math.floor(hash(seed + c, f, 43) * 1e9), lineCells, lines)
    const x0 = region.x + c * columnCells * pitch
    for (let r = 0; r < rowCount; r++) {
      const runs = lines[offset + r]
      if (!runs)
        continue
      const y = region.y + (r + 0.5) * rowPitch
      for (let i = 0; i < runs.length; i += 3) {
        for (let k = 0; k < runs[i + 1]!; k++) {
          const x = x0 + (runs[i]! + k + 0.5) * pitch
          if (x > region.x + region.width)
            continue
          const edge = fade > 0 ? Math.min(1, (x - region.x) / fade) : 1
          if (edge > 0)
            dots.push({ x, y, alpha: levels[runs[i + 2]!]! * edge * edge })
        }
      }
    }
  }
  return dots
}

/** Appends one SKILL.md's lines. A line is a flat list of runs: start cell, length, level 0 to 4. A blank line is null. */
function skillFileLines(seed: number, width: number, out: Array<number[] | null>): void {
  let n = 0
  const rnd = (): number => hash(seed, n++, 23)
  const ri = (k: number): number => Math.floor(rnd() * k)
  const words = (from: number, to: number, level: number, runs: number[] = [], minLen = 2, spread = 6): number[] => {
    const wordSeed = ri(1e9)
    let x = from
    for (let i = 0; i < 40; i++) {
      const len = minLen + Math.floor(hash(wordSeed, i, 11) * spread)
      if (x + len > to)
        break
      runs.push(x, len, level)
      x += len + 1
    }
    return runs
  }
  const line = (runs: number[]): void => {
    out.push(runs)
  }
  const gap = (): void => {
    out.push(null)
  }
  const para = (count: number): void => {
    for (let j = 0; j < count; j++)
      line(words(0, j === count - 1 ? 6 + ri(11) : width - ri(3), 1))
  }
  // Frontmatter fences, name, description.
  line([0, 3, 0])
  line(words(6, 9 + ri(7), 1, [0, 4, 2]))
  line(words(9, width, 1, [0, 7, 2]))
  if (rnd() < 0.6)
    line(words(2, width - ri(5), 1))
  line([0, 3, 0])
  gap()
  // Title, intro.
  line(words(2, 8 + ri(10), 4, [0, 1, 4]))
  gap()
  para(2 + ri(2))
  const sections = 2 + ri(3)
  for (let i = 0; i < sections; i++) {
    gap()
    line(words(3, 8 + ri(9), 3, [0, 2, 3]))
    gap()
    const kind = rnd()
    if (kind < 0.36) {
      para(2 + ri(3))
    }
    else if (kind < 0.72) {
      const items = 2 + ri(3)
      for (let j = 0; j < items; j++) {
        line(words(2, width - ri(7), 1, [0, 1, 3]))
        if (rnd() < 0.3)
          line(words(2, 7 + ri(10), 1))
      }
    }
    else {
      line([0, 3, 0])
      const count = 2 + ri(4)
      for (let j = 0; j < count; j++)
        line(words(ri(3) * 2, width - ri(6), 0, [], 1, 5))
      line([0, 3, 0])
    }
  }
  gap()
  gap()
  gap()
}

/**
 * Dots as one SVG image. Each alpha step is one path of zero-length round-capped
 * segments, which keeps a field of thousands of dots to a few kilobytes.
 */
export function textureSvg(dots: readonly TextureDot[], options: { width: number, height: number, ink: string, radius: number }): string {
  const { width, height, ink, radius } = options
  const groups = new Map<number, string[]>()
  for (const dot of dots) {
    const step = Math.round(dot.alpha * 40) / 40
    if (step <= 0)
      continue
    let group = groups.get(step)
    if (!group) {
      group = []
      groups.set(step, group)
    }
    group.push(`M${Math.round(dot.x * 10) / 10} ${Math.round(dot.y * 10) / 10}h0`)
  }
  const paths = [...groups].map(([alpha, segments]) =>
    `<path d="${segments.join('')}" stroke-opacity="${alpha}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<g fill="none" stroke="${ink}" stroke-width="${radius * 2}" stroke-linecap="round">${paths}</g></svg>`
}
