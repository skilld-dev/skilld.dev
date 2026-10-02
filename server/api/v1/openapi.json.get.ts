import { defineEventHandler, setHeader } from 'h3'
import document from 'skilld-sdk/openapi.json'

/**
 * The OpenAPI 3.1 document comes from the pinned skilld-sdk npm package.
 * The public CLI repository generates it and checks for contract drift.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  setHeader(event, 'access-control-allow-origin', '*')
  return document
})
