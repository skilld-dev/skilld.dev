import { InstallEventInput } from '~~/server/schemas/install-event'
import { analyticsCountry, copyDataPoint } from '#shared/analytics'
import { defineApiHandler } from '#shared/server/handler'

/**
 * Records that a printed command was copied.
 *
 * The count is the site's clearest activation signal, so it stays. It lands in
 * Analytics Engine as an aggregate, not in D1 as one row per copy: migration
 * 0118 dropped the old `install_events` table, which kept a timestamped row
 * for every visitor action.
 */
export default defineApiHandler({
  schema: InstallEventInput,
  handler: async ({ event, body, platform }) => {
    const dataset = platform.env.SKILLD_WEB_ANALYTICS
    if (!dataset || typeof dataset.writeDataPoint !== 'function')
      throw createError({ statusCode: 500, message: 'Analytics Engine binding missing' })

    dataset.writeDataPoint(copyDataPoint({
      surface: body.surface,
      mode: body.mode === 'install' ? 'install' : 'run',
      kind: body.kind,
      slug: copySlug(body),
      country: analyticsCountry(getHeader(event, 'cf-ipcountry')),
    }))

    return { ok: true as const }
  },
})

/**
 * One slug column for three shapes. A Skill and a repository both read
 * `owner/name`; a collection reads `handle/slug`.
 */
function copySlug(body: InstallEventInput): string {
  const [left, right] = body.kind === 'collection'
    ? [body.handle, body.slug]
    : [body.owner, body.name]
  return left && right ? `${left}/${right}` : left ?? right ?? ''
}
