// Type and colour for the content column of every OG card. A card is the
// homepage hero as one still frame, so its title takes the hero H1's face:
// Plus Jakarta Sans 600, tracked tight. DESIGN.md "On OG cards" has the frame.

/** Width of the centred content column. `OgLayout` keeps the texture out of it. */
export const OG_COLUMN_WIDTH = 840

export const OG_INK = 'oklch(0.97 0.005 60)'
export const OG_MUTED = 'oklch(0.66 0.01 60)'
export const OG_DIMMED = 'oklch(0.55 0.01 60)'
export const OG_RULE = 'oklch(0.36 0.012 60)'
export const OG_SURFACE = 'oklch(0.22 0.012 60)'

export type OgFace = 'title' | 'body'

// Average advance of one character, in em, measured from renders. A name such
// as `frontend-design` has no narrow spaces, so it runs wider than a sentence.
const NAME_EM = 0.5
const FACE_EM: Record<OgFace, number> = { title: 0.45, body: 0.43 }

type OgStyle = Record<string, string | number>

/**
 * The largest title size, in px, at which `text` fits `lines` lines of the
 * column. A Skill name with no space to wrap at shrinks to fit instead of
 * running off the card.
 */
export function ogTitleSize(text: string, options: { max: number, min: number, lines?: number }): number {
  const { max, min, lines = 1 } = options
  const perLine = Math.max(1, Math.ceil(text.length / lines))
  return Math.max(min, Math.min(max, Math.floor(OG_COLUMN_WIDTH / (perLine * NAME_EM))))
}

/**
 * Splits text that needs two lines at the space that makes them closest in
 * length, so centred text never leaves one word alone. The renderer's own
 * `text-wrap: balance` shifts balanced lines off centre, so the card breaks
 * them itself. A line break in the text wins, for a title that should break
 * where its page breaks it. Text that fits one line, or needs more than
 * `lines`, comes back whole to wrap and clamp on its own.
 */
export function ogEvenLines(text: string, options: { fontSize: number, face: OgFace, lines: number }): string[] {
  const { fontSize, face, lines } = options
  if (text.includes('\n'))
    return text.split('\n').slice(0, lines)
  const words = text.split(' ')
  const needed = Math.ceil((text.length * FACE_EM[face] * fontSize) / OG_COLUMN_WIDTH)
  if (lines < 2 || needed !== 2 || words.length < 2)
    return [text]
  let split = 1
  let longest = Number.POSITIVE_INFINITY
  for (let k = 1; k < words.length; k++) {
    const length = Math.max(words.slice(0, k).join(' ').length, words.slice(k).join(' ').length)
    if (length < longest) {
      split = k
      longest = length
    }
  }
  return [words.slice(0, split).join(' '), words.slice(split).join(' ')]
}

export function ogTitleStyle(fontSize: number, lines: number): OgStyle {
  return {
    maxWidth: `${OG_COLUMN_WIDTH}px`,
    fontSize: `${fontSize}px`,
    fontWeight: 600,
    letterSpacing: '-0.045em',
    lineHeight: 1.04,
    color: OG_INK,
    lineClamp: lines,
    textOverflow: 'ellipsis',
  }
}

export function ogLineStyle(fontSize: number, lines: number, color: string = OG_MUTED): OgStyle {
  return {
    maxWidth: `${OG_COLUMN_WIDTH}px`,
    fontSize: `${fontSize}px`,
    lineHeight: 1.35,
    color,
    lineClamp: lines,
    textOverflow: 'ellipsis',
  }
}
