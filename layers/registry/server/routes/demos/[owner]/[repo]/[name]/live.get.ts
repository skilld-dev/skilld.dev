import { findSkillDemo, skillDemoOutputKey } from '../../../../../utils/skill-demos'

/**
 * A demo's output page, as the Agent wrote it. The page is third-party code
 * that a Skill shaped, so it never runs as skilld.dev: the CSP `sandbox`
 * directive gives it an opaque origin, with no cookies, storage, or
 * same-origin requests, whether it opens in the Skill page frame or on its own.
 * It is recorded output, not content, so it answers noindex.
 */
export default defineEventHandler(async (event) => {
  const { owner, repo, name } = getRouterParams(event)
  const demo = owner && repo && name ? findSkillDemo(owner, repo, name) : null
  const key = demo ? skillDemoOutputKey(demo) : null
  if (!key)
    throw createError({ statusCode: 404, statusMessage: 'No demo page for this Skill' })

  const html = await useStorage('assets:skill-demos').getItem<string>(key)
  if (typeof html !== 'string')
    throw createError({ statusCode: 404, statusMessage: 'Demo output missing' })

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Content-Security-Policy', 'sandbox allow-scripts')
  setHeader(event, 'X-Robots-Tag', 'noindex')
  setHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=86400')
  return html
})
