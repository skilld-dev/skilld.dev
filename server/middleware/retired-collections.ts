import { findRetiredCollection } from '#shared/retired-collections'

// Retired collections that no category absorbed answer 410 so search engines
// drop them.
export default defineEventHandler((event) => {
  if (findRetiredCollection(event.path ?? ''))
    throw createError({ statusCode: 410, statusMessage: 'Gone' })
})
