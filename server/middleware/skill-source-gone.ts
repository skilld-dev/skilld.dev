import { defineEventHandler, getRequestURL, setResponseStatus } from 'h3'
import { createGoneResponse } from '../utils/gone-response'
import {
  resolveGoneSkillKeys,
  skillKeyFromFilePath,
  skillKeyFromPath,
} from '../utils/source-gone-skills'

const ISOLATE_TTL_MS = 60_000
const isolateCache = new WeakMap<object, { keys: ReadonlySet<string>, expiresAt: number }>()

/**
 * Answer 410 for a skill whose source was deleted upstream, while still letting
 * the page render the last indexed copy.
 *
 * The status is set rather than thrown on purpose. Throwing would replace a
 * useful tombstone with an error page, and 410 is perfectly valid with a body:
 * a crawler learns the resource is permanently gone, a reader still sees what
 * the skill was and why installing it will fail.
 *
 * Referenced file deep links (`/gh/<owner>/<repo>/<name>/-/<file>`) have no
 * saved copy once the source is gone upstream (`/api/skill-asset` returns 410),
 * so answering them with a fast plain-text 410 skips ~230 ms of Vue SSR.
 *
 * The key set is cached because this runs on every `/gh` request, and an
 * uncached per-request D1 read on a hot path is exactly what produced the
 * 2026-08-04 overload burst. One query an hour returns about 800 rows (798 on 2026-09-30).
 * A 60s in-isolate Set avoids a KV read, JSON parse, and linear scan on warm hits.
 *
 * `resolveGoneSkillKeys` answers null when it cannot reach either store, and
 * that leaves the response status alone. A middleware that only ever upgrades a
 * status must never be the reason a page fails.
 */
export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname
  const pageKey = skillKeyFromPath(pathname)
  const fileKey = pageKey ? null : skillKeyFromFilePath(pathname)
  const key = pageKey ?? fileKey
  if (!key)
    return

  const db = event.context.platform?.db
  if (!db)
    return

  const storage = useStorage('cache')
  const now = Date.now()
  let entry = isolateCache.get(storage)
  if (!entry || entry.expiresAt <= now) {
    const keys = await resolveGoneSkillKeys(storage, db)
    if (!keys)
      return
    entry = { keys: new Set(keys), expiresAt: now + ISOLATE_TTL_MS }
    isolateCache.set(storage, entry)
  }

  if (!entry.keys.has(key))
    return

  if (fileKey)
    return createGoneResponse(event, 'This Skill source is gone upstream.')

  setResponseStatus(event, 410)
})
