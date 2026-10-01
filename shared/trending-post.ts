/**
 * A social post, cut down to what one board card can show at a glance.
 *
 * Three things made the quoted posts on `/skills/trending` hard to read. Their
 * line breaks collapsed, so a numbered list ran on as one paragraph. Their
 * `t.co` links printed as text and spent a third of a two-line clamp. And a
 * listicle often reaches the skill in its seventh line, so the visible lines
 * never mentioned the skill the row is about.
 *
 * Pure, so the server render and the browser cut the same excerpt.
 */

export type PostSegment
  = | { _tag: 'text', value: string }
    | { _tag: 'mention', value: string }

export interface PostExcerptInput {
  /** The post as stored, with its own line breaks and links. */
  text: string
  /** Names the Skill answers to: its slug and its frontmatter name. */
  names: readonly string[]
  /**
   * Characters the card shows before its clamp cuts in. A first mention past
   * this point moves the excerpt to it, because the row exists for it.
   */
  budget: number
}

/** Shortest name worth marking. Anything shorter matches inside ordinary words. */
const MIN_NAME_LENGTH = 3

/**
 * A `t.co` link, with the separator or the parentheses that introduced it.
 *
 * The address is opaque, so it tells a reader nothing. `Superpowers - ` with
 * only its link removed reads as an unfinished sentence.
 */
const SHORT_LINK = /\s*\(\s*https?:\/\/t\.co\/\w+\s*\)|\s*(?:[-–—:]\s*)?https?:\/\/t\.co\/\w+/g

/** Scheme and `www.` on any other link. The host and path are the useful part. */
const LINK_PREFIX = /https?:\/\/(?:www\.)?/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(SHORT_LINK, '')
    .replace(LINK_PREFIX, '')
    .split('\n')
    .map(line => line.replace(/[ \t\xA0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/**
 * One pattern for every form the Skill's names take.
 *
 * Boundaries follow `skill-name-match.ts`, which decided these posts name the
 * Skill in the first place. A hyphenated name must not start inside a longer
 * compound, and a spaced form keeps plain word boundaries.
 */
function mentionPattern(names: readonly string[]): RegExp | null {
  const aliases = new Set<string>()
  for (const raw of names) {
    const name = raw.trim().toLowerCase()
    if (name.length < MIN_NAME_LENGTH)
      continue
    aliases.add(name)
    if (/[-_]/.test(name))
      aliases.add(name.replace(/[-_]+/g, ' '))
  }
  if (aliases.size === 0)
    return null
  // Longest first, so a longer alias wins where two start at the same index.
  const alternatives = [...aliases]
    .sort((a, b) => b.length - a.length)
    .map(alias => alias.includes(' ')
      ? `\\b${escapeRegExp(alias)}\\b`
      : `(?<![\\w-])${escapeRegExp(alias)}(?!\\w)`)
  return new RegExp(alternatives.join('|'), 'gi')
}

/** The first word that starts at or after `from`. */
function wordStartAfter(text: string, from: number): number {
  if (from <= 0)
    return 0
  if (/\s/.test(text[from - 1] ?? ''))
    return from
  const gap = text.slice(from).search(/\s/)
  return gap < 0 ? from : from + gap + 1
}

/**
 * Move the excerpt to a mention the clamp would hide.
 *
 * A short first line stays as the lead, because it usually says what the list
 * is ("Top 10 skill repos:"). The cut is marked with an ellipsis, so the jump
 * never reads as the author's own words.
 */
function windowTo(text: string, first: number, budget: number): string {
  const context = Math.floor(budget / 3)
  const lineStart = text.lastIndexOf('\n', first - 1) + 1
  const start = first - lineStart <= context
    ? lineStart
    : Math.min(wordStartAfter(text, first - context), first)

  const firstLineEnd = text.indexOf('\n')
  const lead = firstLineEnd > 0 && firstLineEnd <= budget / 2 ? text.slice(0, firstLineEnd) : null
  const resumesAt = lead === null ? 0 : firstLineEnd + 1
  const rest = text.slice(start)
  const body = start > resumesAt ? `… ${rest}` : rest
  return lead === null ? body : `${lead}\n${body}`
}

function segment(text: string, pattern: RegExp): PostSegment[] {
  const out: PostSegment[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index > last)
      out.push({ _tag: 'text', value: text.slice(last, match.index) })
    out.push({ _tag: 'mention', value: match[0] })
    last = match.index + match[0].length
  }
  if (last < text.length)
    out.push({ _tag: 'text', value: text.slice(last) })
  return out
}

export function postExcerpt(input: PostExcerptInput): PostSegment[] {
  const text = tidy(input.text)
  if (!text)
    return []
  const pattern = mentionPattern(input.names)
  if (!pattern)
    return [{ _tag: 'text', value: text }]
  const first = text.search(pattern)
  const excerpt = first > input.budget ? windowTo(text, first, input.budget) : text
  return segment(excerpt, pattern)
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
