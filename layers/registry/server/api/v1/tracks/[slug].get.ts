import type { LegacyTrackPage } from '../../../presenters/track-v1'
import { tracksV1 } from 'skilld-sdk/contract'
import { defineApiOperation, operationFailure } from '#shared/server/operation'
import { legacyTrackPages, presentTrack } from '../../../presenters/track-v1'
import { readOwnRoute } from '../../../utils/own-route-read'
import { findSkillsByKeys, registrySkillKey } from '../../../utils/skills-registry'

/**
 * Reads the track page's own route in process, page by page at the page's own
 * size, so v1 lists Skills in the order the page shows and shares its cache.
 * Page 1 has no query string because the page requests it that way.
 */
export default defineApiOperation({
  operation: tracksV1.operations.get,
  handler: async ({ event, input }) => {
    const { slug } = input.params
    const { pages, skip } = legacyTrackPages(input.query)
    const reads = await Promise.all(pages.map(page =>
      readOwnRoute<LegacyTrackPage>(event, page === 1 ? `/api/clusters/${slug}` : `/api/clusters/${slug}?page=${page}`),
    ))
    const found = reads.flatMap(read => read._tag === 'found' ? [read.value] : [])
    const first = found[0]
    if (!first || found.length !== reads.length)
      return operationFailure('NOT_FOUND', `No track ${slug}.`)

    const window = found
      .flatMap(page => page.items)
      .slice(skip, skip + input.query.limit)
    const cards = await findSkillsByKeys(event, window)
    const skills = window.flatMap((key) => {
      const card = cards.get(registrySkillKey(key))
      return card ? [card] : []
    })
    return presentTrack(first.cluster, skills, first.total)
  },
})
