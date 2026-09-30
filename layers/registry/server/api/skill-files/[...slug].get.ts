import { defineApiHandler } from '#shared/server/handler'
import { loadStoredSkillRow, readStoredSkillFiles } from '../../utils/skill-stored-source'
import { findSkill } from '../../utils/skills-registry'

/**
 * The file explorer's list, read from the `assets` the sync stored. No GitHub
 * call happens on this path, so the list is as fresh as the last sync.
 */
export default defineApiHandler({
  handler: async ({ event, platform }) => {
    const slugParam = getRouterParam(event, 'slug')
    if (!slugParam)
      throw createError({ statusCode: 400, message: 'Missing slug' })

    const segments = slugParam.split('/').filter(Boolean)
    if (segments.length !== 3)
      throw createError({ statusCode: 400, message: 'Expected /skill-files/:owner/:repo/:name' })

    const [owner, repo, name] = segments
    if (!owner || !repo || !name)
      throw createError({ statusCode: 400, message: 'Missing path components' })

    const skill = await findSkill(event, `${owner}/${repo}/${name}`)
    if (!skill)
      throw createError({ statusCode: 404, message: 'Skill not found' })

    const row = await loadStoredSkillRow(platform.db, skill)
    if (!row)
      throw createError({ statusCode: 404, message: 'Skill metadata missing' })

    // The sync's verdict that this SKILL.md is gone upstream. The page serves
    // a 410 tombstone on the same verdict, and this endpoint must agree.
    const stored = readStoredSkillFiles(row)
    if (stored._tag === 'gone')
      throw createError({ statusCode: 410, message: 'Skill source is gone upstream' })
    return stored.payload
  },
})
