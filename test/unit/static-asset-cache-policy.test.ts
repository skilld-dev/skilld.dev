import { withBuildAssetMissFallthrough } from '../../scripts/lib/static-asset-fallthrough'

describe('static asset cache policy', () => {
  it('lets missing build assets reach the Worker without changing other asset roots', () => {
    const assets = withBuildAssetMissFallthrough([
      { baseURL: '/_nuxt/v2/', fallthrough: false },
      { baseURL: '/images/', fallthrough: false },
    ], '/_nuxt/v2/')

    expect(assets).toEqual([
      { baseURL: '/_nuxt/v2/', fallthrough: true },
      { baseURL: '/images/', fallthrough: false },
    ])
  })
})
