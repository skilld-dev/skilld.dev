// The skilld mark: a prompt caret and one rose dot. Stone dots are the noise;
// the rose dot is the Skill you picked. This module is the only place the
// geometry lives. AppLogo, the OG lockup, and every file in public/ come from
// it (scripts/generate-brand-assets.ts writes the files). DESIGN.md describes
// the system; change the shapes here, then run `pnpm brand:assets`.

export interface BrandColors {
  /** The caret and the wordmark. */
  ink: string
  /** The one rose dot. */
  dot: string
}

/** Stone 900 and Tailwind rose 500 on light surfaces, stone 100 and rose 400 on dark ones. */
export const BRAND_LIGHT: BrandColors = { ink: '#1c1917', dot: '#f43f5e' }
export const BRAND_DARK: BrandColors = { ink: '#f5f5f4', dot: '#fb7185' }

/** The stone 900 tile behind raster icons, where the background is unknown. */
export const BRAND_TILE = '#1c1917'

/** Which cut of the mark to draw. `small` is for 16px, where the regular caret thins out. */
export type MarkCut = 'regular' | 'small'

/** The mark lives in a 100 unit box. The box starts at x 5 so the caret and the dot sit optically centred. */
const MARK_VIEWBOX = { x: 5, y: 0, width: 100, height: 100 } as const

const CARET_PATH: Record<MarkCut, string> = {
  regular: 'M58 50 L18 82 L18 68 L40.5 50 L18 32 L18 18 Z',
  small: 'M58 50 L18 82 L18 62 L33 50 L18 38 L18 18 Z',
}

const MARK_DOT: Record<MarkCut, { cx: number, cy: number, r: number }> = {
  regular: { cx: 80, cy: 50, r: 10 },
  small: { cx: 80, cy: 50, r: 12 },
}

export interface MarkGeometry {
  viewBox: string
  caret: string
  dot: { cx: number, cy: number, r: number }
}

/** The mark's parts, for callers that compose their own SVG, such as the README badge. */
export function markGeometry(cut: MarkCut = 'regular'): MarkGeometry {
  const { x, y, width, height } = MARK_VIEWBOX
  return { viewBox: `${x} ${y} ${width} ${height}`, caret: CARET_PATH[cut], dot: MARK_DOT[cut] }
}

/** The caret's ink, in mark units. Both cuts share it. */
const CARET_INK = { left: 18, right: 58, top: 18, bottom: 82, centreY: 50 } as const

/**
 * The wordmark, outlined from IBM Plex Mono SemiBold (SIL Open Font License),
 * so a file renders the same with or without the font installed. Font units:
 * 1000 per em, y points up, the origin is the baseline at the glyph's left
 * edge. Every glyph advances 600 units, because Plex Mono is monospaced.
 */
const GLYPHS: Record<'s' | 'k' | 'i' | 'l' | 'd', string> = {
  s: 'M298 -12Q213 -12 151 14.5Q89 41 54 86L129 154Q161 119 202.5 100Q244 81 299 81Q347 81 376 97Q405 113 405 146Q405 174 385.5 184Q366 194 334 199L251 212Q219 217 188.5 226.5Q158 236 134.5 253Q111 270 97 296.5Q83 323 83 361Q83 442 143.5 485Q204 528 310 528Q385 528 437.5 507Q490 486 524 448L457 374Q435 398 398.5 416.5Q362 435 306 435Q208 435 208 374Q208 346 228 335.5Q248 325 280 320L362 307Q395 302 425.5 292.5Q456 283 479.5 266Q503 249 517 223Q531 197 531 159Q531 79 469.5 33.5Q408 -12 298 -12Z',
  k: 'M77 740L205 740L205 306L211 306L286 388L413 516L562 516L357 313L584 0L431 0L266 240L205 182L205 0L77 0Z',
  i: 'M332 596Q287 596 268.5 615Q250 634 250 661L250 685Q250 712 268.5 731Q287 750 332 750Q377 750 395.5 731Q414 712 414 685L414 661Q414 634 395.5 615Q377 596 332 596ZM98 101L268 101L268 415L98 415L98 516L396 516L396 101L554 101L554 0L98 0Z',
  l: 'M72 101L236 101L236 639L72 639L72 740L364 740L364 101L529 101L529 0L72 0Z',
  d: 'M403 91L396 91Q375 44 338.5 16Q302 -12 242 -12Q198 -12 161.5 4.5Q125 21 99 54.5Q73 88 59 139Q45 190 45 258Q45 394 99 461Q153 528 242 528Q302 528 338.5 500Q375 472 396 425L403 425L403 740L531 740L531 0L403 0ZM296 90Q318 90 337.5 95.5Q357 101 371.5 111.5Q386 122 394.5 138.5Q403 155 403 177L403 339Q403 361 394.5 377.5Q386 394 371.5 404.5Q357 415 337.5 420.5Q318 426 296 426Q240 426 209.5 392Q179 358 179 299L179 217Q179 158 209.5 124Q240 90 296 90Z',
}
const WORD = ['s', 'k', 'i', 'l', 'l', 'd'] as const
const FONT_UNITS = 1000
const ADVANCE = 600

/**
 * The lockup, in ems of the wordmark (from the brand lab, 2026-10-06). The
 * caret box is 1.05em tall and centred on a line-height 1 box, which puts its
 * centre 0.375em above the baseline for Plex Mono. The trailing dot is 0.3em
 * across, sits 0.32em after the word and 0.12em above the baseline, so its
 * centre lands at half the x-height (0.258em) and it reads as a cursor.
 */
const LOCKUP_EM = {
  caretBoxHeight: 1.05,
  caretCentre: 0.375,
  gap: 0.38,
  tracking: -0.02,
  dotSize: 0.3,
  dotGap: 0.32,
  dotLift: 0.12,
} as const

/** Lockup coordinates use 100 units per em, baseline at y 0, y pointing down. */
const EM = 100

export interface LockupPart {
  d: string
  transform: string
}

export interface LockupGeometry {
  /** A tight box around the ink: x, y, width, height, in lockup units. */
  box: { x: number, y: number, width: number, height: number }
  caret: LockupPart
  glyphs: LockupPart[]
  dot: { cx: number, cy: number, r: number }
}

const round = (value: number): number => Math.round(value * 1e4) / 1e4

/** Where every piece of the lockup sits. Pure data; the SVG writer and AppLogo both draw from it. */
export function lockupGeometry(): LockupGeometry {
  // The lab drew the caret in a 56 by 80 crop of the mark box, 8 units of air on each side.
  const caretScale = (LOCKUP_EM.caretBoxHeight * EM) / 80
  const caretTop = -LOCKUP_EM.caretCentre * EM - (CARET_INK.centreY - CARET_INK.top) * caretScale
  const caretBottom = -LOCKUP_EM.caretCentre * EM + (CARET_INK.bottom - CARET_INK.centreY) * caretScale
  const caretWidth = (CARET_INK.right - CARET_INK.left) * caretScale
  const caretTranslateY = -LOCKUP_EM.caretCentre * EM - CARET_INK.centreY * caretScale

  const wordStart = caretWidth + 8 * caretScale + LOCKUP_EM.gap * EM
  const glyphScale = EM / FONT_UNITS
  const pitch = ADVANCE * glyphScale + LOCKUP_EM.tracking * EM
  const glyphs = WORD.map((char, index) => ({
    d: GLYPHS[char],
    transform: `matrix(${glyphScale} 0 0 ${-glyphScale} ${round(wordStart + index * pitch)} 0)`,
  }))
  const wordEnd = wordStart + WORD.length * pitch

  const r = (LOCKUP_EM.dotSize * EM) / 2
  const dot = { cx: round(wordEnd + LOCKUP_EM.dotGap * EM + r), cy: round(-(LOCKUP_EM.dotLift * EM + r)), r }

  // Glyph descent: `s` and `d` overshoot the baseline by 12 font units.
  const bottom = Math.max(caretBottom, 12 * glyphScale)
  return {
    box: { x: 0, y: round(caretTop), width: round(dot.cx + r), height: round(bottom - caretTop) },
    caret: {
      d: CARET_PATH.regular,
      transform: `matrix(${round(caretScale)} 0 0 ${round(caretScale)} ${round(-CARET_INK.left * caretScale)} ${round(caretTranslateY)})`,
    },
    glyphs,
    dot,
  }
}

interface SvgOptions {
  /** Colours for light surfaces, or the only colours when `dark` is absent. */
  colors: BrandColors
  /** When set, a prefers-color-scheme rule switches to these colours. For favicons and README images. */
  dark?: BrandColors
}

function schemeStyle(dark: BrandColors | undefined): string {
  return dark ? `<style>@media (prefers-color-scheme:dark){.ink{fill:${dark.ink}}.dot{fill:${dark.dot}}}</style>` : ''
}

/** The standalone mark as an SVG file: caret plus dot, optionally on a rounded tile. */
export function markSvg(options: SvgOptions & { cut?: MarkCut, tile?: string }): string {
  const { colors, dark, cut = 'regular', tile } = options
  const dot = MARK_DOT[cut]
  if (tile) {
    // A 512 tile with the mark's ink centred: x 18 to 90, y 18 to 82, centre (54, 50).
    // The small cut fills more of the tile, because a 16px tile has no pixels to spare.
    const scale = cut === 'small' ? 5.4 : 4.4
    const tx = round(256 - 54 * scale)
    const ty = round(256 - 50 * scale)
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${schemeStyle(dark)}<rect width="512" height="512" rx="64" fill="${tile}"/>`
      + `<g transform="matrix(${scale} 0 0 ${scale} ${tx} ${ty})"><path class="ink" d="${CARET_PATH[cut]}" fill="${colors.ink}"/><circle class="dot" cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${colors.dot}"/></g></svg>\n`
  }
  const { x, y, width, height } = MARK_VIEWBOX
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="160" height="160">${schemeStyle(dark)}`
    + `<path class="ink" d="${CARET_PATH[cut]}" fill="${colors.ink}"/><circle class="dot" cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${colors.dot}"/></svg>\n`
}

/** The lockup as an SVG file: caret, outlined wordmark, trailing dot. `height` sets the intrinsic pixel height. */
export function lockupSvg(options: SvgOptions & { height?: number }): string {
  const { colors, dark, height } = options
  const { box, caret, glyphs, dot } = lockupGeometry()
  const size = height ? ` width="${round((height * box.width) / box.height)}" height="${height}"` : ''
  const paths = [caret, ...glyphs].map(part => `<path transform="${part.transform}" d="${part.d}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.width} ${box.height}"${size}>${schemeStyle(dark)}`
    + `<g class="ink" fill="${colors.ink}">${paths}</g><circle class="dot" cx="${dot.cx}" cy="${dot.cy}" r="${dot.r}" fill="${colors.dot}"/></svg>\n`
}

/** An SVG string as an `<img src>` value. */
export function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`
}
