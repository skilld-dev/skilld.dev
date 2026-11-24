import { fetch as nitroFetch } from 'nitro/app'
import { createFetch } from 'ofetch'

// Nitro dispatches relative URLs in process and sends absolute URLs over HTTP.
export const $fetch = createFetch({ fetch: (request, options) => nitroFetch(request, options) })
