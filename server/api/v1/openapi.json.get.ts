import { defineEventHandler, setHeader } from 'h3'
import document from 'skilld-sdk/openapi.json'

/**
 * The OpenAPI 3.1 document for the skilld API. `packages/sdk` generates it
 * from the contract, and a test fails when the committed copy drifts.
 */
export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  setHeader(event, 'access-control-allow-origin', '*')
  return document
})
