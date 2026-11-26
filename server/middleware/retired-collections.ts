import { defineEventHandler, getRequestURL } from 'h3'
import { findRetiredCollection } from '#shared/retired-collections'
import { createGoneResponse } from '../utils/gone-response'

// Retired collections that no category absorbed answer 410 so search engines
// drop them without triggering /__nuxt_error Vue SSR.
export default defineEventHandler((event) => {
  if (findRetiredCollection(getRequestURL(event).pathname))
    return createGoneResponse(event)
})
