import { defineEventHandler, getRequestURL } from 'h3'
import { createGoneResponse } from '../utils/gone-response'

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname
  if (pathname !== '/guides' && !pathname.startsWith('/guides/'))
    return

  return createGoneResponse(event, 'This guide is no longer available.')
})
