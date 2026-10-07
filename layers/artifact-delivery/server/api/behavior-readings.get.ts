import { setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentBehaviorReadings } from '../presenters/behavior-readings'
import { behaviorReadingsQuerySchema } from '../schemas/behavior-readings'
import { loadSkillMdReadings } from '../utils/behavior-reviewer'

/**
 * A language model's readings of the SKILL.md matches that need approval,
 * for one SKILL.md Git blob (ADR-0016). The Skill page shows them beside its
 * own matches.
 *
 * Public and read only: each reading names a line of a public file, and only
 * public builds are reviewed. A blob's readings change only when a newer
 * build reads it again, so five minutes of reuse is safe.
 */
export default defineApiHandler({
  schema: behaviorReadingsQuerySchema,
  handler: async ({ event, body, platform }) => {
    setHeader(event, 'cache-control', 'public, max-age=300')
    return await loadSkillMdReadings(platform.db, body.blob)
  },
  presenter: presentBehaviorReadings,
})
