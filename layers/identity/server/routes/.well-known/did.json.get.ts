/**
 * Serve the DID document for this service.
 * Required for AT Protocol feed generator registration.
 * The service DID is did:web:<hostname>, resolved via this endpoint.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const hostname = config.public?.siteUrl
    ? new URL(config.public.siteUrl as string).hostname
    : 'skilld.dev'

  setResponseHeader(event, 'content-type', 'application/json')
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')

  return {
    '@context': ['https://www.w3.org/ns/did/v1'],
    'id': `did:web:${hostname}`,
    'service': [
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${hostname}`,
      },
    ],
  }
})
