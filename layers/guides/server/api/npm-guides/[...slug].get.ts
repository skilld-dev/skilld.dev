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

    // The page renders its own canonical <h1> from the title, so drop the
    // markdown's leading h1 to avoid a duplicate top-level heading (SEO + a11y).
    const firstPage = document.pages?.[0]
    const firstChild = firstPage?.body?.children?.[0] as { tag?: string } | undefined
    if (firstChild?.tag === 'h1')
      firstPage!.body.children.shift()

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
