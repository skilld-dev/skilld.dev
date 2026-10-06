import type { SkillDemoView } from '../../utils/skill-demos'
import { defineApiHandler } from '#shared/server/handler'
import { listSkillDemos, presentSkillDemo } from '../../utils/skill-demos'

export interface SkillDemoListResponse {
  items: SkillDemoView[]
}

/**
 * Every published demo, newest first, for the homepage demo section. The
 * manifest ships with the build, so the list changes only on deploy. The list
 * reads no D1 row, so it never knows the current commit and marks nothing
 * outdated; the Skill page does that.
 */
export default defineApiHandler({
  handler: ({ event }) => {
    setHeader(event, 'Cache-Control', 'public, max-age=300, s-maxage=3600')
    return listSkillDemos()
  },
  presenter: (demos): SkillDemoListResponse => ({
    items: demos.map(demo => presentSkillDemo(demo, null)),
  }),
})
