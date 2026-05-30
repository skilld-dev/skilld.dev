import { findGuide } from '#layers/guides/server/utils/npm-guides'
import { defineApiHandler } from '#shared/server/handler'

// Returns the guide metadata plus a parsed MdxgDocument so the page can render
// the markdown without re-parsing client-side.
export default defineApiHandler({
  handler: async ({ event }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing package slug' })

    const guide = await findGuide(event, decodeURIComponent(slug))
    if (!guide)
      throw createError({ statusCode: 404, message: 'Guide not found' })

    const document = await parseMdxg(guide.markdown)
    return {
      meta: {
        slug: guide.slug,
        packageName: guide.packageName,
        version: guide.version,
        tag: guide.tag,
        prerelease: guide.prerelease,
        fromVersion: guide.fromVersion,
        repoUrl: guide.repoUrl,
        releasedAt: guide.releasedAt,
        title: guide.title,
        counts: guide.counts,
        supersedes: guide.supersedes,
        generatedAt: guide.generatedAt,
      },
      document,
    }
  },
})
