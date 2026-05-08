/// <reference types="@cloudflare/workers-types" />

const NPM_BULK_LIMIT = 128 // npm point endpoint cap per request
const CONCURRENCY = 6
const PERIOD = 'last-week'

interface NpmBulkResponse {
  [pkg: string]: { downloads: number, package: string, start: string, end: string } | null
}

/**
 * Refresh `installs` (weekly npm downloads) for every skill. Treats the skill
 * `name` as the npm package name and queries npm's bulk point endpoint.
 *
 * Skills that don't exist on npm (git-only) return null in the response and
 * are left untouched, so we never zero out a previously-seeded count from a
 * 404. Scoped names (`@scope/pkg`) aren't supported by the bulk endpoint and
 * are skipped here; if scoped skills appear later they'll need a per-name
 * fetch path.
 */
export default defineTask({
  meta: {
    name: 'sync-npm-downloads',
    description: 'Refresh skills.installs from npm weekly download counts',
  },
  async run({ context }) {
    const env = (context as Record<string, any>).cloudflare?.env as Record<string, unknown> | undefined
    const db = env?.DB as D1Database | undefined
    if (!db) {
      console.warn('[sync-npm-downloads] D1 binding not available in task context')
      return { result: { error: 'no-db' } }
    }

    const rows = await db
      .prepare(`SELECT DISTINCT name FROM skills WHERE broken_since IS NULL AND name NOT LIKE '@%'`)
      .all<{ name: string }>()
    const names = (rows.results ?? []).map(r => r.name)

    const startedAt = Date.now()
    const batches: string[][] = []
    for (let i = 0; i < names.length; i += NPM_BULK_LIMIT)
      batches.push(names.slice(i, i + NPM_BULK_LIMIT))

    let updatedRows = 0
    let nullRows = 0
    let errorBatches = 0

    // Light parallelism; npm doesn't publish a hard limit but we want to be polite.
    const queue = batches.slice()
    await Promise.all(
      Array.from({ length: CONCURRENCY }, async () => {
        while (queue.length) {
          const batch = queue.shift()
          if (!batch)
            break
          const url = `https://api.npmjs.org/downloads/point/${PERIOD}/${batch.join(',')}`
          const data = await $fetch<NpmBulkResponse>(url).catch(() => null)
          if (!data) {
            errorBatches += 1
            continue
          }
          // Single-package responses come back without the wrapping map. Treat
          // a flat shape as { [name]: result } so the loop below stays uniform.
          const map: NpmBulkResponse = (data as { downloads?: number, package?: string }).package
            ? { [(data as { package: string }).package]: data as NpmBulkResponse[string] }
            : data
          const updates: { name: string, downloads: number }[] = []
          for (const name of batch) {
            const entry = map[name]
            if (entry == null) {
              nullRows += 1
              continue
            }
            updates.push({ name, downloads: entry.downloads })
          }
          if (updates.length) {
            await db.batch(
              updates.map(u =>
                db.prepare(`UPDATE skills SET installs = ? WHERE name = ?`).bind(u.downloads, u.name),
              ),
            )
            updatedRows += updates.length
          }
        }
      }),
    )

    const elapsedMs = Date.now() - startedAt
    const summary = {
      skillsChecked: names.length,
      batches: batches.length,
      updatedRows,
      nullRows,
      errorBatches,
      elapsedMs,
    }
    console.warn('[sync-npm-downloads] done', summary)
    return { result: summary }
  },
})
