/**
 * Timing entries carry their page or resource URL in `name`, so it scrubs
 * like any other URL key at every nesting depth.
 */
const URL_KEYS = new Set(['location', 'referrer', 'url', 'href', 'name'])

function stripQuery(value: string): string {
  const cut = value.search(/[?#]/)
  return cut === -1 ? value : value.slice(0, cut)
}

function scrubValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(scrubValue)
  if (typeof value !== 'object' || value === null)
    return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    URL_KEYS.has(key) && typeof entry === 'string' ? stripQuery(entry) : scrubValue(entry),
  ]))
}

export type RumBeaconBody
  = | { _tag: 'forward', body: string }
    | { _tag: 'drop', reason: 'unparseable' }

/**
 * A Web Analytics beacon body with no query strings or fragments left in its
 * page and referrer URLs. Query strings can carry OAuth codes, tokens, and
 * search terms. A body that is not JSON is dropped, never forwarded unread.
 */
export function scrubRumBeaconBody(body: string): RumBeaconBody {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  }
  catch {
    // A beacon body that is not JSON cannot be scrubbed, so it is dropped.
    return { _tag: 'drop', reason: 'unparseable' }
  }
  return { _tag: 'forward', body: JSON.stringify(scrubValue(parsed)) }
}
