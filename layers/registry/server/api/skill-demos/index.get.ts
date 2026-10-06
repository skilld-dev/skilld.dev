import type { SkillDemoView } from '../../utils/skill-demos'
import { runCheckFlagKey } from '#shared/run-check-flags'
import { defineApiHandler } from '#shared/server/handler'
import { fetchFlaggedSkillKeys } from '#shared/server/run-check-flags'
import { listSkillDemos, presentSkillDemo } from '../../utils/skill-demos'

export interface SkillDemoListResponse {
  items: SkillDemoView[]
}

/**
 * Every published demo, newest first, for the homepage demo section and
 * `/skills/demos`. The manifest ships with the build. A demo whose Skill holds
 * a run check flag stays out until a check passes: a visitor who watches it
 * would copy a run command that fails. The list reads no D1 row of its own,
 * so it never knows the current commit and marks nothing outdated; the Skill
 * page does that.
 */
export default defineApiHandler({
  handler: async ({ event }) => {
    setHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600')
    const flagged = await fetchFlaggedSkillKeys('skill-demos')
    return listSkillDemos().filter(demo => !flagged.has(runCheckFlagKey(demo.owner, demo.repo, demo.name)))
  },
  presenter: (demos): SkillDemoListResponse => ({
    items: demos.map(demo => presentSkillDemo(demo, null)),
  }),
})
