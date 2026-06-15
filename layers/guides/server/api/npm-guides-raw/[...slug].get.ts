import { defineApiHandler } from '#shared/server/handler'
import { findGuide } from '../../utils/npm-guides'

// Raw markdown for agents: the same artifact a coding agent would be handed via
// `npx skilld add`. Plain text/markdown, cacheable, no rendering shell.
export default defineApiHandler({
  handler: async ({ event }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing package slug' })

    const guide = await findGuide(event, decodeURIComponent(slug))
    if (!guide)
      throw createError({ statusCode: 404, message: 'Guide not found' })

    setHeader(event, 'content-type', 'text/markdown; charset=utf-8')
    setHeader(event, 'cache-control', 'public, max-age=3600')
    setHeader(event, 'x-skilld-guide', `${guide.packageName}@${guide.version}`)
    return guide.markdown
  },
})
