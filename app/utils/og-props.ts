/**
 * OG image props travel to the renderer inside the image URL, so they arrive
 * untyped. A login that looks like a number, such as `/gh/24601`, comes back as
 * the number `24601`, a missing value comes back as `undefined`, and a list can
 * come back as anything. Declaring `handle: string` did not stop that: Vue
 * checks prop types at runtime with a warning, it does not coerce them, so
 * `handle.split(' ')` threw "split is not a function" and the island 500'd.
 *
 * These parsers run once at the top of an OG component, turning the wire value
 * into the type the template needs. Everything after that point can trust it.
 */

/** What an OG image URL can produce for a text prop. */
export type OgTextProp = string | number | null | undefined

/** What an OG image URL can produce for a count prop. */
export type OgCountProp = number | string | null | undefined

export function ogText(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' && Number.isFinite(value))
    return String(value)
  return ''
}

export function ogCount(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isFinite(parsed))
    return 0
  return Math.max(0, Math.trunc(parsed))
}

export function ogTextList(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return value.map(ogText).filter(item => item.length > 0)
}

/** Up to two uppercase initials for an avatar fallback. */
export function ogInitials(value: unknown): string {
  return ogText(value)
    .split(' ')
    .map(word => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}
