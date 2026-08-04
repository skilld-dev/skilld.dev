export function createMissingBuildAssetResponse(): Response {
  return new Response('Asset not found', {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'Cloudflare-CDN-Cache-Control': 'no-store',
    },
  })
}
