import type { TextureScene } from '~/composables/useTextureCanvas'
import { fillDots, hash } from './dots'

/**
 * "File minimap": SKILL.md files drawn as editor minimap rows of dots, one
 * column per file. A rose cursor sits on the changed line of one file, erases
 * it back to its first word, and types the new line.
 *
 * With real sources, those columns draw the real files. The rest, and every
 * column without a source, draw a generated file with the shape of a SKILL.md:
 * frontmatter, a title, an intro, then sections of prose, lists, or code.
 */

// Geometry in CSS px. One dot is one character cell.
const PITCH = 3.2
const ROW_PITCH = 6.4
const LINE_CELLS = 20
const COLUMN_CELLS = 25
/** A real line folds four characters into each dot, so 80 columns fill one minimap line. */
const CHARS_PER_CELL = 4
const ALPHA = [0.15, 0.3, 0.46, 0.64, 0.85]
const RADIUS = [0.85, 0.85, 0.9, 0.95, 1.1]
const CYCLE = 7

/** Runs of dots as flat triples: start cell, length, level 0 to 4. */
interface Row { kind: 'prose' | 'other', runs: number[] }
type Rows = (Row | null)[]

interface Column { x: number, offset: number, rows: Rows, speed: number, phase: number }
interface Focal { column: number, row: number, prefix: number, keep: number }

function words(out: number[], seed: number, from: number, to: number, level: number, minLen = 2, spread = 6): number[] {
  let x = from
  for (let i = 0; i < 40; i++) {
    const len = minLen + Math.floor(hash(seed, i, 11) * spread)
    if (x + len > to)
      break
    out.push(x, len, level)
    x += len + 1
  }
  return out
}

const lineEnd = (row: Row | null | undefined) => row?.runs.length ? row.runs[row.runs.length - 3]! + row.runs[row.runs.length - 2]! : 0

function generatedFile(seed: number, rows: Rows): void {
  let n = 0
  const rnd = () => hash(seed, n++, 23)
  const ri = (k: number) => Math.floor(rnd() * k)
  const line = (runs: number[], kind: Row['kind'] = 'other') => rows.push({ kind, runs })
  const gap = () => rows.push(null)
  const ws = (from: number, to: number, level: number, out: number[] = [], minLen?: number, spread?: number) => words(out, ri(1e9), from, to, level, minLen, spread)
  const para = (count: number) => {
    for (let j = 0; j < count; j++)
      line(ws(0, j === count - 1 ? 6 + ri(11) : LINE_CELLS - ri(3), 1), 'prose')
  }
  line([0, 3, 0])
  line(ws(6, 9 + ri(7), 1, [0, 4, 2]))
  line(ws(9, LINE_CELLS, 1, [0, 7, 2]))
  if (rnd() < 0.6)
    line(ws(2, LINE_CELLS - ri(5), 1))
  line([0, 3, 0])
  gap()
  line(ws(2, 8 + ri(10), 4, [0, 1, 4]))
  gap()
  para(2 + ri(2))
  const sections = 2 + ri(3)
  for (let i = 0; i < sections; i++) {
    gap()
    line(ws(3, 8 + ri(9), 3, [0, 2, 3]))
    gap()
    const kind = rnd()
    if (kind < 0.36) {
      para(2 + ri(3))
    }
    else if (kind < 0.72) {
      const items = 2 + ri(3)
      for (let j = 0; j < items; j++) {
        line(ws(2, LINE_CELLS - ri(7), 1, [0, 1, 3]))
        if (rnd() < 0.3)
          line(ws(2, 7 + ri(10), 1))
      }
    }
    else {
      line([0, 3, 0])
      const count = 2 + ri(4)
      for (let j = 0; j < count; j++)
        line(ws(ri(3) * 2, LINE_CELLS - ri(6), 0, [], 1, 5))
      line([0, 3, 0])
    }
  }
  gap()
  gap()
  gap()
}

/** Cells of one line of text: a run per stretch of characters, at one level. */
function textRuns(text: string, from: number, level: number, out: number[]): number[] {
  let start = -1
  const cells = Math.min(LINE_CELLS - from, Math.ceil(text.length / CHARS_PER_CELL))
  for (let cell = 0; cell <= cells; cell++) {
    const chunk = text.slice(cell * CHARS_PER_CELL, (cell + 1) * CHARS_PER_CELL)
    const filled = cell < cells && chunk.trim().length > 0
    if (filled && start < 0)
      start = cell
    if (!filled && start >= 0) {
      out.push(from + start, cell - start, level)
      start = -1
    }
  }
  return out
}

/** One real SKILL.md as minimap rows. Long lines fold at the column edge, as an editor wraps them. */
function sourceFile(source: string, rows: Rows): void {
  let frontmatter = false
  let code = false
  for (const [index, raw] of source.replace(/\r\n?/g, '\n').split('\n').entries()) {
    const text = raw.replace(/\t/g, '  ').trimEnd()
    if (!text) {
      rows.push(null)
      continue
    }
    if ((index === 0 && text === '---') || (frontmatter && text === '---')) {
      frontmatter = index === 0
      rows.push({ kind: 'other', runs: [0, 3, 0] })
      continue
    }
    if (text.startsWith('```')) {
      code = !code
      rows.push({ kind: 'other', runs: [0, 3, 0] })
      continue
    }
    const indent = Math.min(6, Math.floor((text.length - text.trimStart().length) / CHARS_PER_CELL))
    const body = text.trimStart()
    let level = 1
    let kind: Row['kind'] = 'other'
    let marker: number[] = []
    let rest = body
    if (code) {
      level = 0
    }
    else if (frontmatter) {
      const colon = body.indexOf(':')
      if (colon > 0) {
        marker = textRuns(body.slice(0, colon + 1), indent, 2, [])
        rest = body.slice(colon + 1)
      }
    }
    else if (/^#\s/.test(body)) {
      level = 4
    }
    else if (/^#{2,6}\s/.test(body)) {
      level = 3
    }
    else if (/^(?:[-*+]|\d+\.)\s/.test(body)) {
      marker = [indent, 1, 3]
      rest = body.replace(/^(?:[-*+]|\d+\.)\s+/, '')
    }
    else {
      kind = 'prose'
    }
    const markerEnd = marker.length ? marker[marker.length - 3]! + marker[marker.length - 2]! + 1 : indent
    const width = (LINE_CELLS - markerEnd) * CHARS_PER_CELL
    // Fold at most three rows, so one long paragraph cannot fill the column.
    for (let fold = 0; fold < 3 && rest.trim(); fold++) {
      const part = rest.slice(0, width)
      rest = rest.slice(width)
      rows.push({ kind, runs: textRuns(part, markerEnd, level, fold === 0 ? [...marker] : []) })
    }
  }
  rows.push(null, null, null)
}

export function createFileMinimapScene(sources: readonly string[] = []): TextureScene {
  let w = 0
  let h = 0
  let rowCount = 0
  let columns: Column[] = []
  let focal: Focal | null = null
  const cache = new Map<number, Uint8Array>()

  function layout(width: number, height: number) {
    w = width
    h = height
    const x0 = -PITCH * 7
    rowCount = Math.ceil(h / ROW_PITCH) + 1
    columns = []
    for (let c = 0; x0 + c * COLUMN_CELLS * PITCH < w; c++) {
      // Real files start at their top, so the frontmatter stays in view.
      const source = sources.length ? sources[(c + sources.length - 1) % sources.length] : undefined
      const offset = source ? 0 : Math.floor(hash(c, 0, 41) * 30)
      const rows: Rows = []
      if (source)
        sourceFile(source, rows)
      for (let f = 0; rows.length < offset + rowCount; f++)
        generatedFile(Math.floor(hash(c, f, 43) * 1e9), rows)
      columns.push({ x: x0 + c * COLUMN_CELLS * PITCH, offset, rows, speed: 9 + hash(c, 1, 5) * 9, phase: hash(c, 2, 5) })
    }
    // The cursor column is the whole column nearest 40% across.
    let fc = -1
    let best = Infinity
    columns.forEach((column, i) => {
      if (column.x < 0 || column.x + LINE_CELLS * PITCH > w)
        return
      const d = Math.abs(column.x + LINE_CELLS * PITCH / 2 - w * 0.4)
      if (d < best) {
        best = d
        fc = i
      }
    })
    if (fc < 0)
      fc = Math.min(1, columns.length - 1)
    const column = columns[fc]!
    const mid = Math.max(1, Math.round(h * 0.52 / ROW_PITCH - 0.5))
    let row = -1
    for (let d = 0; d < rowCount && row < 0; d++) {
      for (const r of [mid + d, mid - d]) {
        if (r < 1 || r >= rowCount - 1)
          continue
        const line = column.rows[column.offset + r]
        if (line && line.kind === 'prose' && lineEnd(line) >= 12) {
          row = r
          break
        }
      }
    }
    if (row < 0)
      row = mid
    const line = column.rows[column.offset + row]
    const prefix = line && line.runs.length && line.runs[0] === 0 ? Math.min(7, line.runs[1]!) : 4
    focal = { column: fc, row, prefix, keep: prefix + 1 }
    cache.clear()
  }

  // The changed line after edit n, as levels per cell (0 is empty). The first word survives every edit.
  function content(n: number): Uint8Array {
    const hit = cache.get(n)
    if (hit)
      return hit
    const to = LINE_CELLS - Math.floor(hash(n, 5, 89) * 4)
    const runs = words([0, focal!.prefix, 1], Math.floor(hash(n, focal!.column, 83) * 1e9), focal!.keep, to, 2)
    const end = runs[runs.length - 3]! + runs[runs.length - 2]!
    if (to - end >= 3)
      runs.push(end + 1, to - end - 1, 2)
    const cells = new Uint8Array(runs[runs.length - 3]! + runs[runs.length - 2]!)
    for (let i = 0; i < runs.length; i += 3)
      cells.fill(runs[i + 2]! + 1, runs[i]!, runs[i]! + runs[i + 1]!)
    if (cache.size > 8)
      cache.clear()
    cache.set(n, cells)
    return cells
  }

  // Rest on the old line, erase to the first word, pause, type the new line.
  function edit(t: number, still: boolean): { cells: Uint8Array, k: number } {
    if (still) {
      const cells = content(0)
      return { cells, k: cells.length }
    }
    const n = Math.floor(t / CYCLE)
    const u = t - n * CYCLE
    const before = content(n - 1)
    const after = content(n)
    const keep = focal!.keep
    const t1 = 2.2
    const t2 = t1 + Math.max(0, before.length - keep) / 18
    const t3 = t2 + 0.4
    if (u < t1)
      return { cells: before, k: before.length }
    if (u < t2)
      return { cells: before, k: Math.max(keep, before.length - Math.floor((u - t1) * 18)) }
    let k = keep
    let at = t3
    while (k < after.length) {
      at += (after[k] ? 0.07 : 0.16) * (0.6 + hash(n, k, 71) * 0.8)
      if (at > u)
        break
      k++
    }
    return { cells: after, k }
  }

  return {
    layout,
    restTime: 0,
    startTime: 1,
    // A still frame has no reading position and shows the changed line at rest.
    draw(ctx, t, colors, still) {
      if (!w || !focal)
        return
      ctx.clearRect(0, 0, w, h)
      const buckets: number[][] = [[], [], [], [], []]
      columns.forEach((column, ci) => {
        // A reading position walks down some files, and its row darkens as it passes.
        let head = -1e9
        if (!still) {
          const span = h + 8 * ROW_PITCH
          const pos = t * column.speed + column.phase * span
          if (hash(ci, Math.floor(pos / span), 61) < 0.6)
            head = (pos % span) - 4 * ROW_PITCH
        }
        for (let r = 0; r < rowCount; r++) {
          if (ci === focal!.column && r === focal!.row)
            continue
          const line = column.rows[column.offset + r]
          if (!line)
            continue
          const y = (r + 0.5) * ROW_PITCH
          const d = Math.abs(y - head)
          const boost = d < ROW_PITCH * 0.6 ? 2 : d < ROW_PITCH * 1.6 ? 1 : 0
          const runs = line.runs
          for (let i = 0; i < runs.length; i += 3) {
            const bucket = buckets[Math.min(4, runs[i + 2]! + boost)]!
            for (let k = 0; k < runs[i + 1]!; k++)
              bucket.push(column.x + (runs[i]! + k + 0.5) * PITCH, y)
          }
        }
      })
      const column = columns[focal.column]!
      const fy = (focal.row + 0.5) * ROW_PITCH
      const { cells, k } = edit(t, still)
      for (let i = 0; i < Math.min(k, cells.length); i++) {
        if (cells[i])
          buckets[cells[i]! - 1]!.push(column.x + (i + 0.5) * PITCH, fy)
      }
      ctx.fillStyle = colors.ink
      for (let level = 0; level < 5; level++) {
        ctx.globalAlpha = ALPHA[level]!
        fillDots(ctx, buckets[level]!, RADIUS[level]!)
      }
      ctx.globalAlpha = 1
      ctx.fillStyle = colors.dot
      ctx.beginPath()
      ctx.arc(column.x + (k + 1) * PITCH, fy, 1.8, 0, Math.PI * 2)
      ctx.fill()
    },
  }
}
