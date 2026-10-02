import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it, vi } from 'vitest'
import { apiSnippets } from '../../layers/marketing/app/utils/developer-setup'

// The OG image module renders nothing in this environment.
vi.stubGlobal('defineOgImage', () => {})

async function mountAt(route: string) {
  return await mountSuspended(
    await import('../../layers/marketing/app/pages/developers.vue').then(module => module.default),
    { route },
  )
}

describe('developers page API setup', () => {
  it('renders the sample the query names, so the choice works before hydration', async () => {
    const curl = await mountAt('/developers?setup=api&sample=curl')
    const codes = curl.findAll('code').map(code => code.text())
    expect(codes).toContain(apiSnippets.curlQuickStart)
    expect(codes).not.toContain(apiSnippets.sdkInstall)
    expect(curl.find('a[aria-current="true"][href*="sample=curl"]').exists()).toBe(true)

    const sdk = await mountAt('/developers?setup=api')
    expect(sdk.findAll('code').map(code => code.text())).toContain(apiSnippets.sdkInstall)
  })

  it('links the token page and the OpenAPI document', async () => {
    const page = await mountAt('/developers?setup=api')
    const hrefs = page.findAll('a').map(a => a.attributes('href'))
    expect(hrefs).toEqual(expect.arrayContaining(['/me/cli-tokens/new', '/me/devices', '/api/v1/openapi.json']))
  })
})
