/**
 * What a trending row can claim, and when the claim was made.
 *
 * Pure, and separate from the page, because this is the sentence the whole
 * board rests on. A skill qualifies two ways and they are different
 * assertions: a person named it in a post, or its repository gained stars
 * while holding exactly one skill. THE ROW STATES WHICH, NOT A HEADING OVER
 * THE LIST. A heading can only ever state one of them, so an earlier
 * "Named by developers" heading was false for every star-attributed entry
 * beneath it.
 *
 * Kept out of the component so both halves are testable without rendering,
 * after a version that branched per `attribution` value silently dropped the
 * star half of every `both` row and the author count of every multi-author
 * row.
 */

export interface TrendingBasisInput {
  /** Separate accounts that named the skill. Zero for a star-only entry. */
  authorCount: number
  /** Stars gained on the surge day, present only on the GitHub route. */
  starGain: number | null
  /** UTC midnight of the surge day, present only on the GitHub route. */
  starGainDay: number | null
  /** True when the row shows a quoted post above the basis line. */
  hasEvidence: boolean
}

/**
 * Age measured from the server's clock, never the browser's.
 *
 * `Date.now()` inside the component produced a real hydration mismatch: the
 * server rendered "4d ago" against its own clock and the client recomputed
 * against a different one, so Vue found the text changed under it. The
 * reference travels with the payload and is identical on both sides.
 */
export function relativeDay(unixSeconds: number, reference: number): string {
  const hours = Math.floor((reference - unixSeconds) / 3600)
  if (hours < 1)
    return 'just now'
  if (hours < 24)
    return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/**
 * The row's claim, or null when the quote above it has already said everything.
 *
 * Built as parts rather than as one branch per attribution route, so a row
 * carrying both routes states both.
 */
export function trendingBasis(input: TrendingBasisInput, reference: number): string | null {
  const parts: string[] = []

  // One dev is named, not counted. "1 dev talked about it" beside the quoted
  // "@handle" is the same fact twice, and the handle is the more useful half.
  if (input.authorCount > 1)
    parts.push(`${input.authorCount} devs talked about it`)
  else if (input.authorCount === 1 && !input.hasEvidence)
    parts.push('1 dev talked about it')

  if (input.starGain !== null)
    parts.push(`+${input.starGain.toLocaleString()} stars this week`)

  // A star-only row carries no quote block, so it dates itself here or nowhere.
  // Otherwise it is the only kind of entry on a page titled "this week" that
  // states no time at all, which reads as missing data rather than as a
  // different kind of claim.
  if (!input.hasEvidence && input.starGainDay !== null)
    parts.push(relativeDay(input.starGainDay, reference))

  return parts.length > 0 ? parts.join(' · ') : null
}
