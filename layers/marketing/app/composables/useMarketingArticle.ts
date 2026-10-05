import { pageRobots } from '../utils/page-admissions'

export interface MarketingArticleInput {
  collection: 'learn' | 'pages' | 'agents' | 'comparisons'
  /** Content path inside the collection, for example `/learn/private-repositories`. */
  path: string
  /** Public route the page canonicalises to. */
  canonicalPath: string
}

/**
 * Load one Markdown article and set its head tags.
 * Throws a fatal 404 when the collection has no page at `path`.
 */
export async function useMarketingArticle(input: MarketingArticleInput) {
  // Head composables need the Nuxt instance, which an `await` drops on the
  // server. Capture it first and run them inside its context.
  const nuxtApp = useNuxtApp()
  const { data } = await useAsyncData(`article-${input.collection}-${input.path}`, () => {
    return queryCollection(input.collection).path(input.path).first()
  })

  if (!data.value) {
    throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
  }

  const canonicalUrl = `https://skilld.dev${input.canonicalPath}`
  const title = data.value.title ?? ''
  const description = data.value.description ?? ''
  const author = typeof data.value.author === 'string' ? data.value.author : undefined

  nuxtApp.runWithContext(() => {
    useSeoMeta({
      title,
      description,
      author,
      ogTitle: title,
      ogDescription: description,
      ogUrl: canonicalUrl,
      robots: pageRobots(input.canonicalPath),
    })
    useHead({
      link: [{ rel: 'canonical', href: canonicalUrl }],
    })
    defineOgImage('Page.takumi', { title, description }, { alt: title })
  })

  return { data }
}
