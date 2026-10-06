import { setHeader } from 'h3'
import { defineApiHandler } from '#shared/server/handler'
import { presentRunnableSkills } from '../../presenters/runnable-skills'
import { listAllSkillsForSitemap } from '../../utils/skills-registry'

/**
 * Every Skill the registry indexes, which is every Skill whose page shows a
 * run command to search. The run sweep in artifact delivery reads this over
 * HTTP (ADR-0001) and checks each one through the Resolution request the CLI
 * sends.
 */
export default defineApiHandler({
  handler: async ({ event }) => {
    setHeader(event, 'cache-control', 'private, no-store')
    return await listAllSkillsForSitemap(event)
  },
  presenter: presentRunnableSkills,
})
