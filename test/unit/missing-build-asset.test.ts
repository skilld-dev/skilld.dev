import { describe, expect, it } from 'vitest'
import { createMissingBuildAssetResponse } from '../../server/utils/missing-build-asset'

describe('missing build asset route', () => {
  it('makes an asset miss immediately recoverable', async () => {
    const response = createMissingBuildAssetResponse()

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
  })
})
