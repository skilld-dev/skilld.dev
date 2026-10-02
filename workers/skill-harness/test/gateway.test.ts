import { describe, expect, it, vi } from 'vitest'
import { forwardSandboxRequest } from '../src/gateway'

function fixture() {
  return {
    model: 'gemini-2.5-flash',
    apiKey: 'worker-only-secret',
    consumeModelCall: vi.fn(async () => true),
    fetch: vi.fn<typeof fetch>(async () => new Response('model output')),
  }
}

function modelRequest(body: unknown, model = 'gemini-2.5-flash') {
  return new Request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=untrusted`, {
    method: 'POST',
    headers: { 'x-goog-api-key': 'sandbox-placeholder', 'cookie': 'private=cookie' },
    body: JSON.stringify(body),
  })
}

describe('sandbox credential gateway', () => {
  it('calls the platform fetch without attaching the options object', async () => {
    const options = fixture()
    options.fetch.mockImplementation(async function (this: unknown) {
      if (this !== undefined)
        throw new TypeError('Illegal invocation')
      return new Response('package source')
    })
    const response = await forwardSandboxRequest(new Request('https://registry.npmjs.org/package'), options)
    expect(await response.text()).toBe('package source')
  })

  it('keeps real credentials in the Worker and bounds model output', async () => {
    const options = fixture()
    const result = await forwardSandboxRequest(modelRequest({ contents: [], generationConfig: { maxOutputTokens: 100000, temperature: 0.5 } }), options)
    expect(result.status).toBe(200)
    const [, forwarded] = options.fetch.mock.calls[0]!
    expect(new Headers(forwarded?.headers).get('x-goog-api-key')).toBe('worker-only-secret')
    expect(new Headers(forwarded?.headers).get('cookie')).toBeNull()
    expect(String(options.fetch.mock.calls[0]![0])).not.toContain('key=')
    expect(JSON.parse(String(forwarded?.body))).toMatchObject({ generationConfig: { maxOutputTokens: 4096, temperature: 0.5 } })
  })

  it.each(['http://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent', 'https://example.com/collect', 'https://generativelanguage.googleapis.com/v1beta/files', 'https://registry.npmjs.org:8443/package'])('denies destination %s', async (url) => {
    const options = fixture()
    const result = await forwardSandboxRequest(new Request(url), options)
    expect(result.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('denies a model outside the configured budget', async () => {
    const options = fixture()
    const result = await forwardSandboxRequest(modelRequest({ contents: [] }, 'expensive-model'), options)
    expect(result.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('blocks hosted tools with separate costs', async () => {
    const options = fixture()
    const result = await forwardSandboxRequest(modelRequest({ tools: [{ googleSearch: {} }] }), options)
    expect(result.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('stops model calls after the job allowance', async () => {
    const options = { ...fixture(), consumeModelCall: async () => false }
    const result = await forwardSandboxRequest(modelRequest({ contents: [] }), options)
    expect(result.status).toBe(429)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('rejects invalid model JSON without forwarding it', async () => {
    const options = fixture()
    const result = await forwardSandboxRequest(new Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent', { method: 'POST', body: '{' }), options)
    expect(result.status).toBe(400)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('reads npm source without forwarding sandbox credentials or following redirects', async () => {
    const options = fixture()
    await forwardSandboxRequest(new Request('https://registry.npmjs.org/nuxt-ai-ready', { headers: { authorization: 'Bearer stolen' } }), options)
    const [, forwarded] = options.fetch.mock.calls[0]!
    expect(forwarded?.redirect).toBe('manual')
    expect(new Headers(forwarded?.headers).get('authorization')).toBeNull()
    expect(options.consumeModelCall).not.toHaveBeenCalled()
  })
})
