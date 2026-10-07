import { describe, expect, it, vi } from 'vitest'
import { forwardSandboxRequest } from '../src/gateway'

function fixture() {
  return {
    provider: 'google' as const,
    model: 'gemini-3.8-flash',
    apiKey: 'worker-only-secret',
    consumeModelCall: vi.fn(async () => true),
    fetch: vi.fn<typeof fetch>(async () => new Response('model output')),
  }
}

function modelRequest(body: unknown, model = 'gemini-3.8-flash') {
  return new Request(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=untrusted`, {
    method: 'POST',
    headers: { 'x-goog-api-key': 'sandbox-placeholder', 'cookie': 'private=cookie' },
    body: JSON.stringify(body),
  })
}

function openCodeGo() {
  return { ...fixture(), provider: 'opencode-go' as const, model: 'glm-5.3' }
}

function openCodeGoRequest(body: unknown, url = 'https://opencode.ai/zen/go/v1/chat/completions?key=untrusted') {
  return new Request(url, {
    method: 'POST',
    headers: { 'authorization': 'Bearer sandbox-placeholder', 'content-type': 'application/json', 'x-opencode-session': 'untrusted', 'cookie': 'private=cookie' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('sandbox credential gateway', () => {
  it('routes OpenCode Go with Worker credentials and enforced model limits', async () => {
    const options = openCodeGo()
    const response = await forwardSandboxRequest(openCodeGoRequest({
      model: 'expensive-model',
      max_tokens: 32000,
      max_completion_tokens: 131072,
      n: 4,
      service_tier: 'priority',
      stream: true,
      messages: [],
      tools: [{ type: 'function', function: { name: 'read', parameters: {} } }],
    }), options)
    expect(response.status).toBe(200)
    const [url, forwarded] = options.fetch.mock.calls[0]!
    expect(String(url)).toBe('https://opencode.ai/zen/go/v1/chat/completions')
    expect(forwarded?.redirect).toBe('manual')
    expect([...new Headers(forwarded?.headers).entries()]).toEqual([['authorization', 'Bearer worker-only-secret'], ['content-type', 'application/json']])
    const body = JSON.parse(String(forwarded?.body))
    expect(body).toMatchObject({ model: 'glm-5.3', max_tokens: 8192, max_completion_tokens: 8192, stream: true, tools: [{ type: 'function' }] })
    expect(body).not.toHaveProperty('n')
    expect(body).not.toHaveProperty('service_tier')
    expect(options.consumeModelCall).toHaveBeenCalledOnce()
  })

  it.each([
    [{ max_tokens: 1000 }, { max_tokens: 1000 }],
    [{}, { max_tokens: 8192 }],
    [{ max_tokens: 'unbounded' }, { max_tokens: 8192 }],
    [{ max_completion_tokens: 500 }, { max_tokens: 8192, max_completion_tokens: 500 }],
  ])('bounds OpenCode Go output for %j', async (limits, expected) => {
    const options = openCodeGo()
    await forwardSandboxRequest(openCodeGoRequest({ messages: [], ...limits }), options)
    const [, forwarded] = options.fetch.mock.calls[0]!
    expect(JSON.parse(String(forwarded?.body))).toMatchObject(expected)
  })

  it.each([
    { tools: [{ type: 'web_search', web_search: { enable: true } }] },
    { tools: [{ type: 'retrieval', retrieval: {} }] },
    { tools: [{ function: { name: 'read' } }] },
    { tools: 'read' },
    { web_search_options: {} },
    { plugins: [{ id: 'web' }] },
    { search_parameters: { mode: 'on' } },
    { mcp_servers: [{ url: 'https://external.example' }] },
  ])('blocks OpenCode Go hosted execution %j', async (body) => {
    const options = openCodeGo()
    const response = await forwardSandboxRequest(openCodeGoRequest({ messages: [], ...body }), options)
    expect(response.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
    expect(options.consumeModelCall).not.toHaveBeenCalled()
  })

  it.each(['https://opencode.ai/zen/go/v1/responses', 'https://opencode.ai/zen/v1/chat/completions', 'https://opencode.ai/zen/go/v1/models'])('denies OpenCode route %s', async (url) => {
    const options = openCodeGo()
    const response = await forwardSandboxRequest(openCodeGoRequest({ messages: [] }, url), options)
    expect(response.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('denies OpenCode Go while another provider is configured', async () => {
    const options = { ...fixture(), provider: 'anthropic' as const }
    const response = await forwardSandboxRequest(openCodeGoRequest({ messages: [] }), options)
    expect(response.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('stops OpenCode Go calls after the job allowance', async () => {
    const options = { ...openCodeGo(), consumeModelCall: vi.fn(async () => false) }
    const response = await forwardSandboxRequest(openCodeGoRequest({ messages: [] }), options)
    expect(response.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it.each(['{', '[]'])('rejects invalid OpenCode Go JSON %s', async (body) => {
    const options = openCodeGo()
    const response = await forwardSandboxRequest(openCodeGoRequest(body), options)
    expect(response.status).toBe(400)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('routes Anthropic with Worker credentials and enforced model limits', async () => {
    const options = { ...fixture(), provider: 'anthropic' as const, model: 'claude-sonnet-4-6' }
    const response = await forwardSandboxRequest(new Request('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': 'container-key', 'anthropic-beta': 'untrusted-beta' },
      body: JSON.stringify({ model: 'expensive-model', max_tokens: 32000, service_tier: 'priority', speed: 'fast', messages: [], thinking: { type: 'enabled', budget_tokens: 16000 } }),
    }), options)
    expect(response.status).toBe(200)
    const [, forwarded] = options.fetch.mock.calls[0]!
    expect(new Headers(forwarded?.headers).get('x-api-key')).toBe('worker-only-secret')
    expect(new Headers(forwarded?.headers).get('anthropic-beta')).toBeNull()
    expect(JSON.parse(String(forwarded?.body))).not.toHaveProperty('speed')
    expect(JSON.parse(String(forwarded?.body))).toMatchObject({ model: 'claude-sonnet-4-6', max_tokens: 8192, service_tier: 'standard_only', thinking: { type: 'enabled', budget_tokens: 2048 } })
  })

  it.each([{ tools: [{ type: 'web_search_20250305' }] }, { mcp_servers: [{ url: 'https://external.example' }] }])('blocks Anthropic hosted execution %j', async (body) => {
    const options = { ...fixture(), provider: 'anthropic' as const }
    const response = await forwardSandboxRequest(new Request('https://api.anthropic.com/v1/messages', { method: 'POST', body: JSON.stringify(body) }), options)
    expect(response.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

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

  it.each(['http://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent', 'https://example.com/collect', 'https://generativelanguage.googleapis.com/v1beta/files', 'https://registry.npmjs.org:8443/package'])('denies destination %s', async (url) => {
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
    expect(result.status).toBe(403)
    expect(options.fetch).not.toHaveBeenCalled()
  })

  it('rejects invalid model JSON without forwarding it', async () => {
    const options = fixture()
    const result = await forwardSandboxRequest(new Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:streamGenerateContent', { method: 'POST', body: '{' }), options)
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
