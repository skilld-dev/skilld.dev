import { findGuide } from '#layers/guides/server/utils/npm-guides'
import { defineApiHandler } from '#shared/server/handler'

// Returns guide metadata + raw markdown + per-version buckets. The PAGE parses
// the markdown (via parseMdxg); with the mdxg highlighter now registered
// universally (JS Shiki engine, see modules/mdxg), highlighting runs at SSR.
const LEADING_H1_RE = /^#\s+(?:\S.*)?(?:\r?\n|$)/

export default defineApiHandler({
  handler: async ({ event }) => {
    const slug = getRouterParam(event, 'slug')
    if (!slug)
      throw createError({ statusCode: 400, message: 'Missing package slug' })

    const guide = await findGuide(event, decodeURIComponent(slug))
    if (!guide)
      throw createError({ statusCode: 404, message: 'Guide not found' })

    // The page renders its own canonical <h1> from the title; drop the markdown's
    // leading h1 to avoid a duplicate top-level heading (SEO + a11y).
    const markdown = guide.markdown.replace(LEADING_H1_RE, '').trimStart()

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
        releaseBuckets: guide.releaseBuckets,
        supersedes: guide.supersedes,
        generatedAt: guide.generatedAt,
      },
      markdown,
    }
  },
})
