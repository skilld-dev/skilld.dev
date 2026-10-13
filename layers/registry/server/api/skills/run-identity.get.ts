import { setHeader } from 'h3'
import { z } from 'zod'
import { defineApiHandler } from '#shared/server/handler'
import { presentSkillRunIdentity } from '../../presenters/skill-run-identity'
import { findRenamedSkill, findSkillRunIdentity } from '../../utils/skill-run-identity'

const RunIdentityQuery = z.object({
  owner: z.string().min(1).max(39).regex(/^[a-z0-9-]+$/i),
  repo: z.string().min(1).max(100).regex(/^[\w.-]+$/),
  name: z.string().min(1).max(64),
}).strict()

const RunIdentityResponse = z.object({
  skillPath: z.string().min(1).nullable(),
  commitSha: z.string().regex(/^[a-f0-9]{40}$/).nullable(),
  renamedTo: z.string().min(1).max(64).nullable(),
}).strict()

/**
 * The admitted folder and source commit of one registry Skill, the new name
 * of a renamed one, or nulls.
 *
 * Artifact delivery reads this over HTTP, so `skilld run OWNER/REPO/NAME`
 * resolves the identity the registry admitted and the Skill page shows. Not
 * cached: a stale answer would deliver a commit the page no longer names, and
 * the lookup is one indexed read per Resolution request.
 */
export default defineApiHandler({
  schema: RunIdentityQuery,
  response: RunIdentityResponse,
  handler: async ({ event, body, platform }) => {
    setHeader(event, 'cache-control', 'private, no-store')
    const query = { owner: body.owner, repository: body.repo, name: body.name }
    const identity = await findSkillRunIdentity(platform.db, query)
    if (identity)
      return { _tag: 'admitted' as const, identity }
    const renamed = await findRenamedSkill(platform.db, query)
    return renamed ? { _tag: 'renamed' as const, name: renamed } : { _tag: 'unknown' as const }
  },
  presenter: presentSkillRunIdentity,
})
