import type { SkillDemoView } from '../../utils/skill-demos'
import { defineApiHandler } from '#shared/server/handler'
import { fetchFlaggedSkillKeys } from '#shared/server/run-check-flags'
import { listShownSkillDemos, presentSkillDemo } from '../../utils/skill-demos'

export interface SkillDemoListResponse {
  items: SkillDemoView[]
}

/**
 * Every shown demo, newest first, for the homepage demo section,
 * `/skills/demos`, and each demo page. The manifest ships with the build. The
 * list reads no D1 row of its own, so it never knows the current commit and
 * marks nothing outdated; the Skill page does that.
 */
export default defineApiHandler({
  handler: async ({ event }) => {
    setHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600')
    return listShownSkillDemos(await fetchFlaggedSkillKeys('skill-demos'))
  },
  presenter: (demos): SkillDemoListResponse => ({
    items: demos.map(demo => presentSkillDemo(demo, null)),
  }),
})
