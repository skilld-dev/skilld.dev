import { findRetiredCollection } from '#shared/retired-collections'

// Retired collections that no category absorbed answer 410 so search engines
// drop them. The redirecting ones are route rules in nuxt.config.ts, built from
// the same list.
export default defineEventHandler((event) => {
  const retired = findRetiredCollection(event.path ?? '')
  if (retired?.outcome._tag === 'gone')
    throw createError({ statusCode: 410, statusMessage: 'Gone' })
})
